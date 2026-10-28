import { DraftSchedule } from "./draft-schedule.js";
import type { GrowthDependencies } from "./growth-dependencies.js";

import { xURL } from "./platform-rules.js";
import { replyAuthorReason } from "./reply-author-policy.js";
import { replyRootAgeReason } from "./reply-root-policy.js";
import { kinds, followWindows, operations, same } from "./growth-constants.js";
import { followObservationAuthorized } from "./follow-observation-policy.js";
import { followBlueCheckAllowed } from "./follow-qualification-policy.js";
export class GrowthPolicy {
  #originalContentGuard?: import("./types.js").OriginalContentGuard;
  #executor!: GrowthDependencies["executor"];
  #clock!: GrowthDependencies["clock"];
  #evidenceExists!: GrowthDependencies["evidenceExists"];
  #platform!: GrowthDependencies["platform"];
  #store!: GrowthDependencies["store"];
  authorizedWindow!: (state: any, kind: string) => boolean;
  scope!: (state: any) => any;
  project!: (state: any) => any;
  capability!: (operation: any, input?: any) => any;
  waitBudget!: (state: any) => any;
  guardInput!: (state: any, action: any, independentExecution?: any) => any;
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      "executor" | "clock" | "evidenceExists" | "platform" | "store"
    > & { originalContentGuard?: import("./types.js").OriginalContentGuard },
  ) {
    const { executor, clock, evidenceExists, platform, store } = dependencies;
    this.#originalContentGuard = dependencies.originalContentGuard;
    this.#executor = executor;
    this.#clock = clock;
    this.#evidenceExists = evidenceExists;
    this.#platform = platform;
    this.#store = store;
    this.authorizedWindow = this.handleAuthorizedWindow.bind(this);
    this.scope = this.handleScope.bind(this);
    this.project = this.handleProject.bind(this);
    this.capability = this.handleCapability.bind(this);
    this.waitBudget = this.handleWaitBudget.bind(this);
    this.guardInput = this.handleGuardInput.bind(this);
  }
  private handleCapability(operation: any, input: any = {}): any {
    const kind =
      input.kind ??
      (
        {
          followOne: "follow",
          followBatch: "follow",
          submitFollow: "follow",
          publishPost: "original",
          submitPost: "original",
          replyToPost: "reply",
          submitReply: "reply",
        } as Record<string, string>
      )[operation];
    const required = [
      "preflight",
      "findSubmission",
      "captureProof",
      ...(operation === "read" ? [] : [operations[kind]]),
    ];
    if (kind === "follow") required.push("readPerson");
    const missing = required.filter(
      (name: any) => typeof this.#platform?.[name] !== "function",
    );
    const storage = ["load", "save", "withLock", "recordProof"].filter(
      (name: any) =>
        typeof (this.#store as unknown as Record<string, unknown>)?.[name] !==
        "function",
    );
    if (
      operation === "followBatch" &&
      typeof this.#store?.transaction !== "function"
    )
      storage.push("transaction");
    if (
      kind === "original" &&
      operation !== "read" &&
      typeof this.#store?.fingerprint !== "function"
    )
      storage.push("fingerprint");
    const lower =
      typeof this.#platform?.preflight === "function"
        ? this.#platform.preflight({
            operation: operation === "read" ? "read" : operations[kind],
            input,
          })
        : { covered: false, missing: [] };
    return {
      covered: !missing.length && !storage.length && lower.covered,
      missing: [
        ...missing.map((n: any) => `platform.${n}`),
        ...storage.map((n: any) => `store.${n}`),
        ...(lower.missing ?? []),
      ],
      owner: missing.length
        ? "scripts/x-harness-platform.mjs"
        : storage.length
          ? "scripts/x-harness-store.mjs"
          : lower.owner,
    };
  }
  private handleWaitBudget(state: any): any {
    const now = this.#clock();
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Shanghai",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(now),
    );
    if ((hour < 7 || hour >= 22) && !this.authorizedWindow(state, "follow"))
      return {
        status: "needsDecision",
        reason: "outside-contract-write-window",
      };
    const coverage = state.attemptsCoverage;
    if (
      !coverage?.complete ||
      !Number.isFinite(Date.parse(coverage.since)) ||
      Date.parse(coverage.since) > now - 3600000 ||
      !this.#evidenceExists(coverage.evidenceRef)
    )
      return {
        status: "needsDecision",
        reason: "shared-attempt-history-incomplete",
      };
    const attempts = state.attempts ?? [];
    if (
      attempts.some(
        (a: any) =>
          !kinds.includes(a.kind) || !Number.isFinite(Date.parse(a.at)),
      )
    )
      return { status: "needsDecision", reason: "attempt-history-invalid" };
    if (
      followObservationAuthorized(
        state,
        this.#executor,
        now,
        this.#evidenceExists,
      )
    )
      return null;
    const follows = attempts.filter((a: any) => a.kind === "follow");
    for (const [duration, limit] of followWindows) {
      const recent = follows
        .filter((a: any) => Date.parse(a.at) > now - duration)
        .sort((a: any, b: any) => Date.parse(a.at) - Date.parse(b.at));
      if (recent.length >= limit)
        return {
          status: "waiting",
          reason: "follow-rolling-budget",
          resumeAt: new Date(
            Date.parse(recent[recent.length - limit].at) + duration,
          ).toISOString(),
        };
    }
    const group = state.execution?.followGroup;
    if (group?.attempts >= 10 && now < Date.parse(group.lastAt) + 180000)
      return {
        status: "waiting",
        reason: "follow-group-cooldown",
        resumeAt: new Date(Date.parse(group.lastAt) + 180000).toISOString(),
      };
    return null;
  }
  private handleGuardInput(
    state: any,
    action: any,
    independentExecution: any = undefined,
  ): any {
    const executor = this.#executor;
    if (!independentExecution && !this.handleScope(state).includes(action.kind))
      return "kind-outside-round-scope";
    if (action.kind === "reply") {
      const authorReason = replyAuthorReason(
        state,
        action,
        this.#evidenceExists,
      );
      if (authorReason) return authorReason;
      const reason = replyRootAgeReason(
        action,
        executor?.replyMaxRootAgeHours,
        this.#clock(),
      );
      if (reason) return reason;
    }
    if (independentExecution) {
      if (
        action.kind !== "original" ||
        !independentExecution.tabId ||
        !this.#evidenceExists(independentExecution.evidenceRef) ||
        !this.#evidenceExists(independentExecution.scopeEvidenceRef)
      )
        return "independent-execution-proof-missing";
    } else if (
      !executor &&
      (!state.execution?.exclusive || state.execution.owner !== "harness")
    )
      return "exclusive-account-execution-unconfirmed";
    if (!same(state.accountHandle, action.accountHandle))
      return "account-identity-mismatch";
    if (
      !this.#evidenceExists(action.accountEvidenceRef) ||
      xURL(action.accountURL).pathname.toLowerCase() !==
        `/${state.accountHandle}`.toLowerCase()
    )
      return "own-profile-proof-missing";
    if (
      !action.quality?.approved ||
      !this.#evidenceExists(action.quality.evidenceRef)
    )
      return "quality-review-required";
    if (action.kind === "follow") {
      if (
        !same(action.quality.handle, action.handle) ||
        !followBlueCheckAllowed(action, this.#clock(), this.#evidenceExists) ||
        action.quality.chinese !== true
      )
        return "follow-qualification-required";
      if (!this.#evidenceExists(action.evidenceRef))
        return "person-observation-proof-missing";
    } else {
      if (!action.text || action.quality.approvedText !== action.text)
        return "exact-text-quality-review-required";
      if (
        action.kind === "original" &&
        (!action.draftPath || !this.#evidenceExists(action.draftPath))
      )
        return "draft-source-missing";
      if (
        action.kind === "original" &&
        (!action.draftPath.endsWith(".post.md") ||
          action.quality.draftFingerprint !==
            this.#store.fingerprint(action.draftPath))
      )
        return "draft-changed-since-quality-review";
      if (action.kind === "original") {
        if (state.execution?.originalContentHold === true)
          return "original-content-on-hold";
        if (
          state.execution?.originalContentGuardRequired === true &&
          !this.#originalContentGuard
        )
          return "original-content-guard-required";
        if (this.#originalContentGuard) {
          try {
            const reason = this.#originalContentGuard({
              draftPath: action.draftPath,
              text: action.text,
            });
            if (reason !== null)
              return typeof reason === "string" &&
                /^[a-z][a-z0-9.-]{0,95}$/.test(reason)
                ? reason
                : "original-content-guard-invalid";
          } catch {
            return "original-content-guard-failed";
          }
        }
      }
      if (
        action.quoteTarget &&
        (!/^\d+$/.test(action.quoteTarget.postId ?? "") ||
          !this.#evidenceExists(action.quoteTarget.evidenceRef) ||
          xURL(action.quoteTarget.url).pathname.match(
            /\/status\/(\d+)$/,
          )?.[1] !== action.quoteTarget.postId)
      )
        return "quote-target-proof-missing";
      const scheduleReason = new DraftSchedule().reason(action, this.#clock());
      if (scheduleReason) return scheduleReason;
      if (
        action.kind === "original" &&
        (!this.#evidenceExists(action.composeEvidenceRef) ||
          !["/compose/post", "/home"].includes(
            xURL(action.composeURL).pathname,
          ))
      )
        return "observed-composer-proof-missing";
      if (
        action.kind === "reply" &&
        (!/^\d+$/.test(action.postId ?? "") ||
          !this.#evidenceExists(action.evidenceRef))
      )
        return "reply-target-proof-missing";
      if (action.kind === "reply" && action.conversation) {
        const c = action.conversation;
        if (
          !/^[A-Za-z0-9_]{1,15}$/.test(c.recipientHandle ?? "") ||
          !/^\d+$/.test(c.rootId ?? "") ||
          !Number.isInteger(c.round) ||
          c.round < 1
        )
          return "reply-conversation-review-required";
        if (c.automatedLoop === true) return "reply-automated-loop";
        const used = (state.actions ?? []).filter(
          (a: any) =>
            a.id !== action.id &&
            a.kind === "reply" &&
            ["verified", "intent", "unknown"].includes(a.status) &&
            same(a.conversation?.recipientHandle, c.recipientHandle) &&
            a.conversation?.rootId === c.rootId,
        ).length;
        if (c.round > 3 || used >= 3) return "reply-conversation-limit";
      }
    }
    return null;
  }
  private handleAuthorizedWindow(state: any, kind: string) {
    const executor = this.#executor;
    return executorWindowAllowed(
      state,
      executor,
      kind,
      this.#clock(),
      this.#evidenceExists,
    );
  }
  private handleScope(state: any) {
    const executor = this.#executor;
    return executor?.scopeKinds ?? state.scopeKinds ?? kinds;
  }
  private handleProject(state: any) {
    const executor = this.#executor;
    return executor
      ? {
          ...state,
          scopeKinds: executor.scopeKinds,
          scopeEvidenceRef: executor.evidenceRef,
          status: state.executions?.[executor.id]?.status ?? "RUNNING",
          stop: state.executions?.[executor.id]?.stop,
        }
      : state;
  }
}
export function createGrowthPolicy(
  ...args: ConstructorParameters<typeof GrowthPolicy>
) {
  return new GrowthPolicy(...args);
}

/** Shared executor permit; every caller still checks its own actual boundary. */
export function executorWindowAllowed(
  state: any,
  executor: any,
  kind: string,
  now: number,
  evidenceExists: (ref: string) => boolean,
) {
  const permit = state.executions?.[executor?.id]?.windowAuthorization;
  return Boolean(
    permit &&
    executor?.scopeKinds?.includes(kind) &&
    permit.kind === kind &&
    permit.executorId === executor?.id &&
    permit.userAuthorized === true &&
    evidenceExists(permit.evidenceRef) &&
    Date.parse(permit.startsAt) <= now &&
    now < Date.parse(permit.expiresAt),
  );
}

/** Ordinary replies/received likes retain their own pacing anchor. */
export function latestNormalInteractionTime(state: any): number {
  const intents = [
    ...(state.actions ?? []).filter(
      (a: any) =>
        a.kind === "reply" &&
        ["intent", "unknown", "verified"].includes(a.status),
    ),
    ...(state.reactions ?? []).filter((a: any) => !a.threadBatchId),
  ];
  return intents.reduce(
    (latest: number, action: any) =>
      Math.max(latest, Date.parse(action.intentAt) || 0),
    0,
  );
}

/** Shared policy; absent/expired configuration preserves the original cadence. */
export function normalInteractionIntervalMs(
  state: any,
  now: number,
  evidenceExists: (ref: string) => boolean,
): number {
  const pacing = state.interactionPacing;
  if (!pacing) return 30000;
  if (
    !Number.isInteger(pacing.minimumIntervalMs) ||
    pacing.minimumIntervalMs < 0 ||
    !Number.isFinite(Date.parse(pacing.notBefore)) ||
    !Number.isFinite(Date.parse(pacing.notAfter)) ||
    Date.parse(pacing.notAfter) <= Date.parse(pacing.notBefore) ||
    typeof pacing.evidenceRef !== "string" ||
    !evidenceExists(pacing.evidenceRef)
  )
    throw new Error("normal-interaction-pacing-invalid");
  return now >= Date.parse(pacing.notBefore) &&
    now < Date.parse(pacing.notAfter)
    ? pacing.minimumIntervalMs
    : 30000;
}
