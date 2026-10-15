import { executorWindowAllowed } from "./growth-policy.js";
import { randomUUID } from "node:crypto";
import type { BusinessDependencies } from "./api.js";
import type { ThreadLikeOptions, ThreadLikeResult } from "./types.js";
import {
  threadLikeConfig,
  threadLikeFraction,
  latestReactionTime,
  likeState,
} from "./thread-like-policy.js";
import { sameHandle } from "./platform-rules.js";

/** Sampling/scanning live in the original ledger; click intent reuses reactions. */
export class ThreadReactions {
  #deps: BusinessDependencies;
  #clock: () => number;
  #sleep: (ms: number) => Promise<void>;
  constructor(deps: BusinessDependencies) {
    this.#deps = deps;
    this.#clock = deps.clock ?? Date.now;
    this.#sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }
  public async run(args: ThreadLikeOptions): Promise<ThreadLikeResult> {
    let config: ReturnType<typeof threadLikeConfig>;
    try {
      config = threadLikeConfig(args);
    } catch (error) {
      return this.empty(args, String(error));
    }
    const batchId = args.batchId ?? `thread-likes-${config.rootId}`;
    const { platform, store } = this.#deps;
    if (!(await this.inWindow()))
      return this.empty(
        { ...args, batchId },
        "outside-authorized-window",
        "waiting",
      );
    const caps = platform.preflight({ operation: "likePostAndComments" });
    if (
      !caps.covered ||
      ["readThreadLikeWindow", "advanceThreadLikes", "likeThreadPost"].some(
        (name) => typeof platform[name] !== "function",
      )
    )
      return this.empty(
        { ...args, batchId },
        "thread-like-capability-required",
      );
    const start = this.#clock(),
      deadline = start + config.timeBudgetMs;
    let newLikes = 0,
      pages = 0,
      stable = 0;
    try {
      let batch = await this.prepare(batchId, config);
      const evidenceRef = await store.recordProof({
        operation: "likePostAndComments",
        url: config.url,
        source: "caller-selected-url",
      });
      const request = { ...config, evidenceRef };
      let view = await platform.readThreadLikeWindow({
        ...request,
        reset: true,
      });
      while (true) {
        if (!(await this.inWindow()))
          return this.receipt(
            batchId,
            newLikes,
            "waiting",
            "outside-authorized-window",
          );
        if (
          view.needsStateCheck ||
          view.alerts?.length ||
          !sameHandle(view.accountHandle, batch.accountHandle)
        )
          return this.receipt(
            batchId,
            newLikes,
            "needsDecision",
            "thread-like-page-or-account-unconfirmed",
          );
        batch = await this.observe(batchId, view);
        const candidates = (view.posts ?? []).filter(
          (p: any) =>
            batch.entries[p.id]?.selected &&
            ["prepared", "intent", "unknown"].includes(
              batch.entries[p.id].status,
            ),
        );
        for (const post of candidates) {
          if (newLikes >= config.maxLikes || this.#clock() >= deadline)
            return this.receipt(
              batchId,
              newLikes,
              "checkpoint",
              "thread-like-call-budget",
            );
          const result = await this.one(batchId, post, request, deadline);
          if (result.newLike) newLikes++;
          if (
            result.halt ||
            (result.status &&
              !["verified", "preexisting", "unknown", "skipped"].includes(
                result.status,
              ))
          )
            return this.receipt(
              batchId,
              newLikes,
              result.status,
              result.reason,
              result.resumeAt,
            );
        }
        if (view.stableTail || stable >= 2) {
          if (view.needsStateCheck || view.alerts?.length) continue;
          return this.receipt(
            batchId,
            newLikes,
            "verified",
            "loaded-thread-boundary",
          );
        }
        if (this.#clock() >= deadline || ++pages >= config.maxPages)
          return this.receipt(
            batchId,
            newLikes,
            "checkpoint",
            "thread-like-call-budget",
          );
        const before =
          (view.threadIds ?? []).join(",") +
          JSON.stringify(view.threadExpandControls ?? []);
        const previousTop = view.viewportScrollTop;
        view = await platform.advanceThreadLikes({
          ...request,
          remainingMs: deadline - this.#clock(),
        });
        const after =
          (view.threadIds ?? []).join(",") +
          JSON.stringify(view.threadExpandControls ?? []);
        stable =
          before === after &&
          view.atRenderedTail &&
          !view.loading &&
          previousTop === view.viewportScrollTop
            ? stable + 1
            : 0;
      }
    } catch (error) {
      const evidenceRef = await store.recordProof({
        operation: "likePostAndComments",
        error: String(error),
        batchId,
      });
      const receipt = await this.receipt(
        batchId,
        newLikes,
        "needsDecision",
        String(error),
      );
      return { ...receipt, evidenceRef };
    }
  }
  private async inWindow() {
    const now = this.#clock();
    if (new Date(now + 8 * 3600000).getUTCHours() >= 7) return true;
    const { state } = await this.#deps.store.load();
    const executor = this.#deps.executor;
    return ["reply", "follow"].some((kind) =>
      executorWindowAllowed(state, executor, kind, now, (ref) =>
        this.#deps.store.evidenceExists(ref),
      ),
    );
  }
  private async prepare(
    id: string,
    config: ReturnType<typeof threadLikeConfig>,
  ) {
    const snapshot = await this.#deps.store.transaction((s) => {
      s.state.threadLikeBatches ??= [];
      const old = s.state.threadLikeBatches.find((b: any) => b.id === id);
      if (
        old &&
        (old.url !== config.url ||
          old.sampleRate !== config.sampleRate ||
          !sameHandle(old.accountHandle, s.state.accountHandle))
      )
        throw Error("thread-like-batch-conflict");
      if (!s.state.accountHandle) throw Error("thread-like-account-required");
      if (!old)
        s.state.threadLikeBatches.push({
          id,
          url: config.url,
          rootId: config.rootId,
          sampleRate: config.sampleRate,
          accountHandle: s.state.accountHandle,
          seed: randomUUID(),
          entries: {},
        });
      return s.state;
    });
    return snapshot.state.threadLikeBatches.find((b: any) => b.id === id);
  }
  private async observe(id: string, view: any) {
    const evidenceRef = await this.#deps.store.recordProof({
      operation: "thread-like-window",
      observation: view,
    });
    const snapshot = await this.#deps.store.transaction((s) => {
      const batch = s.state.threadLikeBatches.find((b: any) => b.id === id);
      batch.evidenceRef = evidenceRef;
      for (const post of view.posts ?? []) {
        if (
          !post.id ||
          batch.entries[post.id] ||
          !view.threadIds?.includes(post.id)
        )
          continue;
        const selected =
          post.id === batch.rootId ||
          threadLikeFraction(batch.seed, post.id, "sample") < batch.sampleRate;
        const old = (s.state.reactions ?? []).find(
          (r: any) => r.postId === post.id,
        );
        batch.entries[post.id] = {
          postId: post.id,
          author: post.author,
          selected,
          status: !selected
            ? "skipped"
            : (old?.status ??
              (likeState(post) === "liked"
                ? "preexisting"
                : selected
                  ? "prepared"
                  : "skipped")),
        };
      }
      return s.state;
    });
    return snapshot.state.threadLikeBatches.find((b: any) => b.id === id);
  }
  private async one(
    id: string,
    post: any,
    request: any,
    deadline: number,
  ): Promise<any> {
    const { store, platform } = this.#deps;
    let snapshot = await store.load();
    const batch = snapshot.state.threadLikeBatches.find(
      (b: any) => b.id === id,
    );
    const old = (snapshot.state.reactions ?? []).find(
      (r: any) => r.postId === post.id,
    );
    if (old && ["intent", "unknown"].includes(old.status)) {
      if (likeState(post) !== "liked")
        return { status: "unknown", reason: "thread-like-intent-unconfirmed" };
      await this.settle(id, post.id, "verified", batch.evidenceRef);
      return { status: "verified" };
    }
    if (old || likeState(post) === "liked") {
      await this.settle(id, post.id, "preexisting", batch.evidenceRef);
      return { status: "preexisting" };
    }
    const gap =
      1000 +
      Math.floor(threadLikeFraction(batch.seed, post.id, "spacing") * 1001);
    let resumeAt = latestReactionTime(snapshot.state) + gap;
    while (resumeAt > this.#clock()) {
      if (resumeAt >= deadline)
        return {
          status: "waiting",
          reason: "thread-like-pacing",
          resumeAt: new Date(resumeAt).toISOString(),
        };
      await this.#sleep(Math.min(45000, resumeAt - this.#clock()));
      if (!(await this.inWindow()))
        return { status: "waiting", reason: "outside-authorized-window" };
      snapshot = await store.load();
      resumeAt = latestReactionTime(snapshot.state) + gap;
    }
    let intent = false;
    try {
      const observation = await platform.likeThreadPost({
        ...request,
        postId: post.id,
        author: post.author,
        accountHandle: batch.accountHandle,
        beforeSubmit: async () => {
          if (!(await this.inWindow()) || this.#clock() >= deadline)
            throw Error("thread-like-window-or-budget");
          await store.transaction((s) => {
            s.state.reactions ??= [];
            if (
              !sameHandle(s.state.accountHandle, batch.accountHandle) ||
              s.state.reactions.some((r: any) => r.postId === post.id)
            )
              throw Error("thread-like-intent-conflict");
            if (this.#clock() < latestReactionTime(s.state) + gap)
              throw Error("thread-like-pacing-conflict");
            s.state.reactions.push({
              postId: post.id,
              status: "intent",
              intentAt: new Date(this.#clock()).toISOString(),
              threadBatchId: id,
            });
            const entry = s.state.threadLikeBatches.find(
              (b: any) => b.id === id,
            ).entries[post.id];
            entry.status = "intent";
            return s.state;
          });
          intent = true;
        },
      });
      const evidenceRef = await store.recordProof({
        operation: "thread-like-result",
        observation,
      });
      const state = observation.preexisting
        ? "preexisting"
        : observation.liked &&
            observation.page === request.url &&
            observation.posts?.[0]?.id === post.id &&
            (observation.threadIds?.includes(post.id) ||
              (post.id === request.rootId &&
                observation.threadRootPresent &&
                observation.threadConfirmed &&
                likeState(observation.posts[0]) === "liked")) &&
            !observation.needsStateCheck &&
            !observation.alerts?.length &&
            sameHandle(observation.accountHandle, batch.accountHandle)
          ? "verified"
          : "unknown";
      await this.settle(id, post.id, state, evidenceRef);
      return {
        status: observation.alerts?.length ? "needsDecision" : state,
        reason: observation.alerts?.length
          ? "thread-like-platform-alert"
          : state === "unknown"
            ? "thread-like-public-state-unconfirmed"
            : undefined,
        newLike: intent && state === "verified",
        halt: Boolean(
          observation.alerts?.length ||
          observation.page !== request.url ||
          observation.needsStateCheck ||
          !sameHandle(observation.accountHandle, batch.accountHandle),
        ),
      };
    } catch (error) {
      const evidenceRef = await store.recordProof({
        operation: "thread-like-result",
        postId: post.id,
        error: String(error),
      });
      if (intent) await this.settle(id, post.id, "unknown", evidenceRef);
      const scopedNativeFailure =
        error instanceof Error &&
        error.message === "like-native-target-unconfirmed" &&
        (await this.confirmLocalContinuation(
          id,
          post.id,
          request,
          batch.accountHandle,
          deadline,
        ));
      const skipped =
        !intent &&
        scopedNativeFailure &&
        (await this.skipUnsubmittedNativeTarget(
          id,
          post.id,
          batch.accountHandle,
          evidenceRef,
        ));
      return {
        status: intent ? "unknown" : skipped ? "skipped" : "needsDecision",
        halt: !(scopedNativeFailure && (intent || skipped)),
        reason: String(error),
      };
    }
  }
  private async confirmLocalContinuation(
    id: string,
    postId: string,
    request: any,
    accountHandle: string,
    deadline: number,
  ) {
    if (!(await this.inWindow()) || this.#clock() >= deadline) return false;
    let view: any;
    try {
      view = await this.#deps.platform.readThreadLikeWindow({
        ...request,
        reset: false,
      });
    } catch (error) {
      await this.#deps.store.recordProof({
        operation: "thread-like-local-unknown-recovery",
        postId,
        error: String(error),
      });
      return false;
    }
    const evidenceRef = await this.#deps.store.recordProof({
      operation: "thread-like-local-unknown-recovery",
      postId,
      observation: view,
    });
    await this.#deps.store.transaction(({ state }) => {
      const entry = state.threadLikeBatches.find(
        (batch: any) => batch.id === id,
      )?.entries[postId];
      if (entry && ["prepared", "unknown"].includes(entry.status))
        entry.recoveryEvidenceRef = evidenceRef;
      return state;
    });
    return (
      (await this.inWindow()) &&
      this.#clock() < deadline &&
      view.page === request.url &&
      view.threadConfirmed === true &&
      !view.needsStateCheck &&
      !view.alerts?.length &&
      sameHandle(view.accountHandle, accountHandle)
    );
  }
  private async skipUnsubmittedNativeTarget(
    id: string,
    postId: string,
    accountHandle: string,
    evidenceRef: string,
  ) {
    let skipped = false;
    await this.#deps.store.transaction(({ state }) => {
      const entry = state.threadLikeBatches.find(
        (batch: any) => batch.id === id,
      )?.entries[postId];
      if (
        entry?.status === "prepared" &&
        sameHandle(state.accountHandle, accountHandle) &&
        !(state.reactions ?? []).some(
          (reaction: any) => reaction.postId === postId,
        )
      ) {
        Object.assign(entry, {
          status: "skipped",
          reason: "native-target-unconfirmed-before-intent",
          evidenceRef,
        });
        skipped = true;
      }
      return state;
    });
    return skipped;
  }
  private async settle(
    id: string,
    postId: string,
    status: string,
    evidenceRef: string,
  ) {
    await this.#deps.store.transaction((s) => {
      const entry = s.state.threadLikeBatches.find((b: any) => b.id === id)
        .entries[postId];
      Object.assign(entry, { status, evidenceRef });
      s.state.reactions ??= [];
      let reaction = s.state.reactions.find((r: any) => r.postId === postId);
      if (!reaction) {
        reaction = { postId };
        s.state.reactions.push(reaction);
      }
      Object.assign(reaction, { status, evidenceRef });
      return s.state;
    });
  }
  private async receipt(
    id: string,
    newLikes: number,
    status: ThreadLikeResult["status"],
    reason?: string,
    resumeAt?: string,
  ): Promise<ThreadLikeResult> {
    const snapshot = await this.#deps.store.load();
    const batch = snapshot.state.threadLikeBatches?.find(
      (b: any) => b.id === id,
    );
    const entries: any[] = Object.values(batch?.entries ?? {});
    const count = (states: string[]) =>
      entries.filter((e) => states.includes(e.status)).length;
    if (status === "verified" && count(["intent", "unknown"])) {
      status = "unknown";
      reason = "thread-like-intent-unconfirmed";
    } else if (
      status === "verified" &&
      entries.some(
        (entry) =>
          entry.selected &&
          entry.reason === "native-target-unconfirmed-before-intent",
      )
    ) {
      status = "needsDecision";
      reason = "thread-like-selected-target-unconfirmed";
    } else if (status === "verified" && count(["prepared"])) {
      status = "checkpoint";
      reason = "thread-like-pending-not-rendered";
    }
    return {
      status,
      batchId: id,
      url: batch?.url ?? "",
      scopeComplete: false,
      reason,
      ...(resumeAt ? { resumeAt } : {}),
      evidenceRef: batch?.evidenceRef,
      counts: {
        observed: entries.length,
        selected: entries.filter((e) => e.selected).length,
        verified: count(["verified"]),
        preexisting: count(["preexisting"]),
        skipped: count(["skipped"]),
        unknown: count(["intent", "unknown"]),
        pending: count(["prepared"]),
        newLikesThisCall: newLikes,
      },
    };
  }
  private empty(
    args: ThreadLikeOptions,
    reason: string,
    status: ThreadLikeResult["status"] = "needsDecision",
  ): ThreadLikeResult {
    return {
      status,
      batchId: args.batchId ?? "",
      url: args.url,
      scopeComplete: false,
      reason,
      counts: {
        observed: 0,
        selected: 0,
        verified: 0,
        preexisting: 0,
        skipped: 0,
        unknown: 0,
        pending: 0,
        newLikesThisCall: 0,
      },
    };
  }
}
