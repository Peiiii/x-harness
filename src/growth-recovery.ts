import type { GrowthDependencies } from "./growth-dependencies.js";
import { publicationTime } from "./publication-time.js";

import { xURL, matchesReviewedAssets } from "./platform-rules.js";
import { matchesRenderedLinks } from "./source-link-recovery.js";
import { same } from "./growth-constants.js";
export class GrowthRecovery {
  #capability!: GrowthDependencies["capability"];
  #platform!: GrowthDependencies["platform"];
  #load!: GrowthDependencies["load"];
  #evidenceExists!: GrowthDependencies["evidenceExists"];
  #clock!: GrowthDependencies["clock"];
  #store!: GrowthDependencies["store"];
  #settleProof!: GrowthDependencies["settleProof"];
  #executor!: GrowthDependencies["executor"];
  #parallelRound!: GrowthDependencies["parallelRound"];
  #round!: GrowthDependencies["round"];
  #readTask!: GrowthDependencies["readTask"];
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      | "capability"
      | "platform"
      | "load"
      | "evidenceExists"
      | "clock"
      | "store"
      | "settleProof"
      | "executor"
      | "parallelRound"
      | "round"
      | "readTask"
    >,
  ) {
    this.verifyFollow = this.verifyFollow.bind(this);
    this.verifySubmission = this.verifySubmission.bind(this);
    this.verifyPublishedPost = this.verifyPublishedPost.bind(this);
    const {
      capability,
      platform,
      load,
      evidenceExists,
      clock,
      store,
      settleProof,
      executor,
      parallelRound,
      round,
      readTask,
    } = dependencies;
    this.#capability = capability;
    this.#platform = platform;
    this.#load = load;
    this.#evidenceExists = evidenceExists;
    this.#clock = clock;
    this.#store = store;
    this.#settleProof = settleProof;
    this.#executor = executor;
    this.#parallelRound = parallelRound;
    this.#round = round;
    this.#readTask = readTask;
  }
  private async recoverSourceCardObservation(
    observation: any,
    action: any,
    postId: string,
    sourceLink: any,
    sourceURL: string | null,
    trailing: RegExpMatchArray | null,
  ): Promise<any> {
    const candidates = (observation.posts ?? []).filter(
      (p: any) =>
        p.id === postId &&
        same(p.author, action.accountHandle) &&
        !p.needsExpansion &&
        trailing &&
        p.body === action.text.slice(0, -trailing[0].length),
    );
    if (
      !observation.loading ||
      observation.needsStateCheck ||
      observation.alerts?.length ||
      action.quoteTarget ||
      !sourceLink ||
      !sourceURL ||
      sourceLink.resolvedURL !== sourceURL ||
      !this.#evidenceExists(sourceLink.evidenceRef) ||
      candidates.length !== 1 ||
      candidates[0].links?.includes(sourceLink.href) ||
      typeof this.#platform.readCreator !== "function"
    )
      return observation;
    const startedAt = this.#clock();
    const profile = await this.#platform.readCreator({
      handle: action.accountHandle,
      target: 10,
      maxScrolls: 2,
      expand: true,
    });
    const observedAt = Date.parse(profile.observedAt ?? "");
    let correctRoute = false;
    try {
      correctRoute =
        xURL(profile.page).pathname.toLowerCase() ===
        `/${action.accountHandle}`.toLowerCase();
    } catch {
      /* An unconfirmed route cannot supply publication evidence. */
    }
    if (
      !correctRoute ||
      !profile.complete ||
      profile.missing?.length ||
      profile.needsStateCheck ||
      profile.alerts?.length ||
      profile.profile?.alerts?.length ||
      !same(profile.profile?.handle, action.accountHandle) ||
      !Number.isFinite(observedAt) ||
      observedAt < startedAt - 5000 ||
      observedAt > this.#clock() + 5000
    )
      return observation;
    const posts = (profile.posts ?? []).filter(
      (p: any) =>
        p.id === postId &&
        same(p.author, action.accountHandle) &&
        p.links?.includes(sourceLink.href),
    );
    if (posts.length !== 1) return observation;
    return {
      ...observation,
      page: profile.page,
      posts,
      sourceCardPermalinkRead: observation,
      sourceCardProfileRead: profile,
    };
  }
  private async readPublicRecovery(target: any, action: any) {
    try {
      return await this.#platform.readPost(target);
    } catch (error: any) {
      if (
        !/timed out|timeout|deadline exceeded/i.test(error.message) ||
        typeof this.#platform.searchSources !== "function" ||
        !Array.isArray(action.beforeIds) ||
        !Number.isFinite(Date.parse(action.intentAt)) ||
        action.quoteTarget ||
        action.assets?.length
      )
        throw error;
      const phrase = action.text
        .split(/\n+/)
        .sort((a: string, b: string) => b.length - a.length)[0]
        .replace(/"/g, "")
        .trim()
        .slice(0, 100);
      if (!phrase) throw error;
      const query = `from:${action.accountHandle} "${phrase}" since:${action.intentAt.slice(0, 10)}`;
      const value = await this.#platform.searchSources({
        query,
        limit: 5,
        maxPages: 1,
      });
      let route = false;
      try {
        const url = xURL(value.page);
        route =
          url.pathname === "/search" && url.searchParams.get("q") === query;
      } catch {
        /* Missing search route cannot recover a detail timeout. */
      }
      const valid =
        route &&
        value.query === query &&
        value.fresh === true &&
        same(value.accountHandle, action.accountHandle) &&
        !value.needsStateCheck &&
        !value.alerts?.length;
      return {
        ...value,
        needsStateCheck: !valid,
        posts: valid
          ? (value.sources ?? []).filter(
              (p: any) =>
                p.id === target.postId &&
                p.url === target.url &&
                p.replyToId == null &&
                !p.needsExpansion &&
                !p.missing?.length,
            )
          : [],
        publicRecovery: {
          method: "exact-search-after-detail-timeout",
          detailError: error.message,
        },
      };
    }
  }
  public async verifyPublishedPost({
    taskId,
    draftPath,
    publicURL,
    evidenceRef,
    sourceLink,
    sourceLinks,
  }: any): Promise<any> {
    // Read-only recovery of a single submitted original; never opens a composer.
    const caps = this.#capability("read");
    if (!caps.covered || typeof this.#platform.readPost !== "function")
      return {
        status: "needsCapability",
        missing: ["platform.readPost", ...caps.missing],
      };
    const initial = await this.#load(taskId);
    const action = initial.state.actions.find(
      (a: any) => a.kind === "original" && a.draftPath === draftPath,
    );
    if (
      !action ||
      !["intent", "unknown"].includes(action.status) ||
      !this.#evidenceExists(evidenceRef)
    )
      throw new Error("submitted-original-and-public-proof-required");
    const url = xURL(publicURL),
      postId = url.pathname.match(/\/status\/(\d+)$/)?.[1];
    if (
      !postId ||
      url.pathname.toLowerCase() !==
        `/${action.accountHandle}/status/${postId}`.toLowerCase()
    )
      throw new Error("public-account-mismatch");
    const resolveQuote =
      Boolean(action.quoteTarget) ||
      /\nhttps:\/\/x\.com\/\w{1,15}\/status\/\d+$/.test(action.text);
    const quoteCaps = this.#capability("read", { resolveQuote });
    if (!quoteCaps.covered)
      return { status: "needsCapability", missing: quoteCaps.missing };
    let observation = await this.readPublicRecovery(
      {
        postId,
        url: publicURL,
        evidenceRef,
        resolveQuote,
      },
      action,
    );
    const trailing = action.text.match(
      /(?:\n+)?((?:https:\/\/|(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}\/)\S+)$/,
    );
    let sourceURL: string | null = null;
    if (trailing) {
      try {
        sourceURL = new URL(
          trailing[1].startsWith("https://")
            ? trailing[1]
            : `https://${trailing[1]}`,
        ).href;
      } catch {
        /* Invalid source text cannot authorize link normalization. */
      }
    }
    observation = await this.recoverSourceCardObservation(
      observation,
      action,
      postId,
      sourceLink,
      sourceURL,
      trailing,
    );
    const matches = (observation.posts ?? []).filter((p: any) => {
      const exact = p.body === action.text;
      const quote =
        trailing &&
        p.quoteSource?.parentId === p.id &&
        p.quoteSource.url === sourceURL &&
        p.quoteSource.id ===
          new URL(sourceURL!).pathname.match(/\/status\/(\d+)$/)?.[1] &&
        p.body === action.text.slice(0, -trailing[0].length);
      const card =
        trailing &&
        sourceLink &&
        this.#evidenceExists(sourceLink.evidenceRef) &&
        sourceLink.resolvedURL === sourceURL &&
        p.links?.includes(sourceLink.href) &&
        p.body === action.text.slice(0, -trailing[0].length);
      let renderedSource = false;
      if (
        trailing &&
        sourceLink?.renderedText &&
        this.#evidenceExists(sourceLink.evidenceRef) &&
        sourceLink.resolvedURL === sourceURL &&
        p.links?.includes(sourceLink.href)
      ) {
        try {
          const resolved = new URL(sourceLink.resolvedURL);
          const rawDisplay = sourceLink.renderedText
            .replace(/\s/g, "")
            .replace(/…$/, "");
          const displayed = new URL(
            /^https?:\/\//.test(rawDisplay)
              ? rawDisplay
              : `${resolved.protocol}//${rawDisplay}`,
          );
          // This rendering allowance requires the observed short link's actual
          // destination to equal the reviewed source URL in the guard above.
          if (resolved.hostname === `www.${displayed.hostname}`)
            displayed.hostname = resolved.hostname;
          renderedSource =
            displayed.href === resolved.href &&
            p.body?.endsWith(sourceLink.renderedText) &&
            p.body.slice(0, -sourceLink.renderedText.length).trimEnd() ===
              action.text.slice(0, -trailing[0].length);
        } catch {
          /* Invalid rendered URL cannot verify publication. */
        }
      }
      return (
        p.id === postId &&
        (!action.quoteTarget ||
          (p.quoteSource?.parentId === p.id &&
            p.quoteSource?.id === action.quoteTarget.postId)) &&
        same(p.author, action.accountHandle) &&
        (exact ||
          quote ||
          card ||
          renderedSource ||
          matchesRenderedLinks(
            action.text,
            p,
            sourceLinks,
            this.#evidenceExists,
          )) &&
        !p.needsExpansion &&
        !(action.beforeIds ?? []).includes(p.id) &&
        publicationTime(p) >= Date.parse(action.intentAt) &&
        publicationTime(p) <= this.#clock() + 5000 &&
        matchesReviewedAssets(p, action.assets)
      );
    });
    Object.assign(observation, {
      verified:
        !observation.needsStateCheck &&
        !observation.alerts?.length &&
        matches.length === 1,
      publicId: matches.length === 1 ? postId : null,
      sourceLink,
      sourceLinks,
    });
    return this.#store.withLock(async () => {
      const latest = await this.#load(taskId),
        target = latest.state.actions.find((a: any) => a.id === action.id);
      if (
        !["intent", "unknown"].includes(target?.status) ||
        target.intentAt !== action.intentAt ||
        target.text !== action.text
      )
        throw new Error("recovery-action-changed");
      await this.#settleProof(latest, target, observation, {
        preserveStatus: true,
      });
      return {
        status: observation.verified ? "verified" : "unknown",
        publicId: observation.publicId,
        taskId,
        actionId: action.id,
        mayEnd: false,
      };
    });
  }
  public async verifySubmission({ taskId, actionId }: any) {
    const executor = this.#executor;
    const snapshot = await this.#load(taskId),
      action = snapshot.state.actions?.find((a: any) => a.id === actionId);
    if (!action || !["intent", "unknown"].includes(action.status))
      return {
        status: "needsDecision",
        reason: "verification-requires-original-unknown-or-intent",
        mayEnd: false,
      };
    return (executor ? this.#parallelRound : this.#round)({
      taskId,
      requestedKind: action.kind,
      selector: (a: any) => a.id === actionId,
    });
  }
  public async verifyFollow(target: any) {
    const mode = target.mode ?? "receipt";
    if (!["receipt", "decision"].includes(mode))
      throw new Error("关注核验模式须为receipt/decision");
    const caps = this.#platform.preflight({ operation: "read" });
    if (!caps.covered)
      return {
        handle: target.handle,
        verified: false,
        status: "needsCapability",
        ...caps,
      };
    if (!target.url || !target.evidenceRef) {
      const original = (await this.#store.load()).state.actions?.find(
        (a: any) => a.kind === "follow" && same(a.handle, target.handle),
      );
      if (!original)
        return {
          handle: target.handle,
          verified: false,
          status: "needsDecision",
          reason: "original-person-observation-required",
        };
      target = original;
    }
    const value = await this.#readTask("readPerson", {
      ...target,
      mode: "decision",
    });
    return {
      handle: target.handle,
      status: value.status,
      fresh: value.fresh,
      verified:
        value.status === "observed" &&
        !value.needsStateCheck &&
        !value.alerts?.length &&
        value.relationship === "following" &&
        (!target.accountHandle ||
          same(value.accountHandle, target.accountHandle)),
      ...(value.evidenceRef ? { evidenceRef: value.evidenceRef } : {}),
      ...(value.missing?.length ? { missing: value.missing } : {}),
      ...(value.diagnostic
        ? {
            diagnostic: {
              operation: value.diagnostic.operation,
              category: value.diagnostic.category,
              code: value.diagnostic.code,
            },
          }
        : {}),
      ...(mode === "decision" ? { observation: value } : {}),
    };
  }
}
export function createGrowthRecovery(
  ...args: ConstructorParameters<typeof GrowthRecovery>
) {
  return new GrowthRecovery(...args);
}
