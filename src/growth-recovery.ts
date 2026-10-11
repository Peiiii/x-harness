import type { GrowthDependencies } from "./growth-dependencies.js";

import { xURL } from "./platform-rules.js";
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
  public async verifyPublishedPost({
    taskId,
    draftPath,
    publicURL,
    evidenceRef,
    sourceLink,
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
    const observation = await this.#platform.readPost({
      postId,
      url: publicURL,
      evidenceRef,
    });
    const trailing = action.text.match(/\n\n(https:\/\/\S+)$/);
    const matches = (observation.posts ?? []).filter((p: any) => {
      const exact = p.body === action.text;
      const card =
        trailing &&
        sourceLink &&
        this.#evidenceExists(sourceLink.evidenceRef) &&
        sourceLink.resolvedURL === trailing[1] &&
        p.links?.includes(sourceLink.href) &&
        p.body === action.text.slice(0, -trailing[0].length);
      let renderedSource = false;
      if (
        trailing &&
        sourceLink?.renderedText &&
        this.#evidenceExists(sourceLink.evidenceRef) &&
        sourceLink.resolvedURL === trailing[1] &&
        p.links?.includes(sourceLink.href)
      ) {
        try {
          renderedSource =
            new URL(sourceLink.renderedText.replace(/\s/g, "")).href ===
              sourceLink.resolvedURL &&
            p.body?.endsWith(sourceLink.renderedText) &&
            p.body.slice(0, -sourceLink.renderedText.length).trimEnd() ===
              action.text.slice(0, -trailing[0].length);
        } catch {
          /* Invalid rendered URL cannot verify publication. */
        }
      }
      return (
        p.id === postId &&
        same(p.author, action.accountHandle) &&
        (exact || card || renderedSource) &&
        !p.needsExpansion &&
        !(action.beforeIds ?? []).includes(p.id) &&
        Date.parse(p.datetime) >= Date.parse(action.intentAt) &&
        Date.parse(p.datetime) <= this.#clock() + 5000 &&
        (!action.assets?.length ||
          action.assets.every((a: any) =>
            p.images?.some((i: any) => i.alt === a.alt),
          ))
      );
    });
    Object.assign(observation, {
      verified:
        !observation.needsStateCheck &&
        !observation.alerts?.length &&
        matches.length === 1,
      publicId: matches.length === 1 ? postId : null,
      sourceLink,
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
