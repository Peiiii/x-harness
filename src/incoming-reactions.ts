import {
  executorWindowAllowed,
  latestNormalInteractionTime,
  normalInteractionIntervalMs,
} from "./growth-policy.js";
import type { BusinessDependencies } from "./api.js";
import type { IncomingLikeOptions, IncomingLikeResult } from "./types.js";
import type { BoundaryRecord } from "./boundary.js";

/** Optional incoming reactions share the original ledger; no reply-goal credit. */
export class IncomingReactions {
  #deps: BusinessDependencies;
  #clock: () => number;
  constructor(deps: BusinessDependencies) {
    this.#deps = deps;
    this.#clock = deps.clock ?? Date.now;
  }
  public async run(args: IncomingLikeOptions): Promise<IncomingLikeResult> {
    const out: IncomingLikeResult = { status: "verified", results: [] };
    const rate = args.sampleRate ?? 0.3;
    if (
      !args.batchId ||
      !Array.isArray(args.targets) ||
      args.targets.length < 1 ||
      args.targets.length > 5 ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > 1
    )
      return { ...out, status: "needsDecision", reason: "like-sample-invalid" };
    const { store, platform } = this.#deps;
    const caps = platform.preflight({ operation: "likePost" });
    if (!caps.covered || typeof platform.likePost !== "function")
      return {
        ...out,
        status: "needsDecision",
        reason: "like-capability-required",
      };
    const snapshot = await store.transaction((s) => {
      s.state.reactionSamples ??= [];
      const existing = s.state.reactionSamples.find(
        (b: BoundaryRecord) => b.id === args.batchId,
      );
      const ids = args.targets.map((t) => t.postId);
      if (existing && JSON.stringify(existing.ids) !== JSON.stringify(ids))
        throw Error("like-sample-conflict");
      if (!existing)
        s.state.reactionSamples.push({
          id: args.batchId,
          ids,
          selectedIds: ids.filter(() => Math.random() < rate),
        });
      return s.state;
    });
    const selected = snapshot.state.reactionSamples.find(
      (b: BoundaryRecord) => b.id === args.batchId,
    ).selectedIds;
    for (const target of args.targets.filter((t) =>
      selected.includes(t.postId),
    )) {
      const result = await this.one(target);
      out.results.push({
        postId: target.postId,
        status: result.status,
        ...(result.evidenceRef ? { evidenceRef: result.evidenceRef } : {}),
      });
      if (result.reason === "incoming-like-context-unconfirmed") {
        out.status = "needsDecision";
        out.reason = result.reason;
        continue;
      }
      if (
        ["waiting", "needsDecision"].includes(result.status) ||
        result.reason === "like-platform-alert"
      )
        return {
          ...out,
          status: result.status,
          ...(result.resumeAt ? { resumeAt: result.resumeAt } : {}),
          ...(result.reason ? { reason: result.reason } : {}),
        };
    }
    if (
      out.status === "verified" &&
      out.results.some((r) => r.status === "unknown")
    )
      out.status = "unknown";
    return out;
  }
  private async one(
    target: IncomingLikeOptions["targets"][number],
  ): Promise<BoundaryRecord> {
    const { store, platform } = this.#deps;
    const now = this.#clock();
    const snapshot = await store.load();
    if (!this.inWindow(snapshot.state))
      return { status: "waiting", reason: "outside-authorized-window" };
    if (
      !store.evidenceExists(target.evidenceRef) ||
      !store.evidenceExists(target.incomingEvidenceRef)
    )
      return {
        status: "needsDecision",
        reason: "incoming-like-proof-required",
      };
    const handle = snapshot.state.accountHandle;
    const old = (snapshot.state.reactions ?? []).find(
      (a: BoundaryRecord) => a.postId === target.postId,
    );
    if (old && !["intent", "unknown"].includes(old.status))
      return { status: "preexisting", evidenceRef: old.evidenceRef };
    if (old) {
      const view = await platform.readPost({ ...target, expand: true });
      const post = view.posts?.find(
        (p: BoundaryRecord) => p.id === target.postId,
      );
      if (
        !view.needsStateCheck &&
        view.accountHandle?.toLowerCase() === handle?.toLowerCase() &&
        view.complete &&
        !view.alerts?.length &&
        post?.author?.toLowerCase() === target.author.toLowerCase() &&
        post.buttons?.filter((b: BoundaryRecord) =>
          /喜欢了|取消喜欢|Unlike|Liked/i.test(b.label),
        ).length === 1
      ) {
        const evidenceRef = await store.recordProof(
          await platform.captureProof({
            observation: view,
          }),
        );
        await this.settle(target.postId, "verified", evidenceRef, true);
        return { status: "verified", evidenceRef };
      }
      return { status: "unknown", evidenceRef: old.evidenceRef };
    }
    const context = await platform.readPost({
      ...target,
      expand: true,
      includeContext: true,
    });
    if (
      context.alerts?.length ||
      !context.complete ||
      !context.context?.some(
        (p: BoundaryRecord) =>
          p.author?.toLowerCase() === handle?.toLowerCase(),
      ) ||
      target.author.toLowerCase() === handle?.toLowerCase()
    )
      return {
        status: "needsDecision",
        reason: context.alerts?.length
          ? "like-platform-alert"
          : "incoming-like-context-unconfirmed",
        evidenceRef: await store.recordProof({
          operation: "likeIncomingBatch",
          postId: target.postId,
          observation: context,
        }),
      };
    const latest = latestNormalInteractionTime(snapshot.state);
    const interval = normalInteractionIntervalMs(snapshot.state, now, (ref) =>
      store.evidenceExists(ref),
    );
    if (latest && now - latest < interval)
      return {
        status: "waiting",
        reason: "like-pacing",
        resumeAt: new Date(latest + interval).toISOString(),
      };
    let intent = false;
    try {
      const observation = await platform.likePost({
        ...target,
        accountHandle: handle,
        beforeSubmit: async () => {
          await store.transaction((s) => {
            if (!this.inWindow(s.state))
              throw Error("outside-authorized-window");
            s.state.reactions ??= [];
            if (
              s.state.reactions.some(
                (a: BoundaryRecord) => a.postId === target.postId,
              )
            )
              throw Error("like-intent-conflict");
            const latest = latestNormalInteractionTime(s.state);
            const recent =
              latest &&
              this.#clock() - latest <
                normalInteractionIntervalMs(s.state, this.#clock(), (ref) =>
                  store.evidenceExists(ref),
                );
            if (recent) throw Error("like-pacing");
            s.state.reactions.push({
              postId: target.postId,
              status: "intent",
              intentAt: new Date(this.#clock()).toISOString(),
              incomingEvidenceRef: target.incomingEvidenceRef,
            });
            return s.state;
          });
          intent = true;
        },
      });
      const evidenceRef = await store.recordProof(
        await platform.captureProof({ observation }),
      );
      const status = observation.preexisting
        ? "preexisting"
        : observation.liked
          ? "verified"
          : "unknown";
      await this.settle(target.postId, status, evidenceRef, intent);
      return {
        status,
        evidenceRef,
        ...(observation.alerts?.length
          ? { reason: "like-platform-alert" }
          : {}),
      };
    } catch (error) {
      const evidenceRef = await store.recordProof({
        operation: "likePost",
        error: String(error),
        postId: target.postId,
      });
      if (intent)
        await this.settle(target.postId, "unknown", evidenceRef, true);
      return {
        status: intent ? "unknown" : "needsDecision",
        evidenceRef,
        reason: "like-public-state-unconfirmed",
      };
    }
  }
  private inWindow(state: any) {
    const now = this.#clock();
    const permit =
      state.executions?.[this.#deps.executor?.id]?.windowAuthorization;
    if (permit == null) return new Date(now + 8 * 3600000).getUTCHours() >= 7;
    return ["reply", "follow"].some((kind) =>
      executorWindowAllowed(state, this.#deps.executor, kind, now, (ref) =>
        this.#deps.store.evidenceExists(ref),
      ),
    );
  }
  private async settle(
    postId: string,
    status: string,
    evidenceRef: string,
    intent: boolean,
  ) {
    await this.#deps.store.transaction((s) => {
      s.state.reactions ??= [];
      const action = s.state.reactions.find(
        (a: BoundaryRecord) => a.postId === postId,
      );
      if (action) {
        action.status = status;
        action.evidenceRef = evidenceRef;
      } else if (!intent)
        s.state.reactions.push({ postId, status, evidenceRef });
      return s.state;
    });
  }
}
