import { GrowthPolicy, executorWindowAllowed } from "./growth-policy.js";
import { sameHandle } from "./platform-rules.js";
import type {
  FollowPriorityOptions,
  FollowPriorityResult,
  XGrowthHarness,
} from "./types.js";
import type { BoundaryRecord } from "./boundary.js";
import type { RoundStore } from "./store.js";

/** Selection uses real shared state; expiry alone never clears an arbitrary block. */
export class FollowPriority {
  constructor(
    private store: RoundStore,
    private clock: () => number,
  ) {}

  private evaluate(state: BoundaryRecord, taskId: string, executorId: string) {
    const now = this.clock();
    const hour = new Date(now + 8 * 3600000).getUTCHours();
    const executor = state.executions?.[executorId];
    const authorityReady =
      state.batchId === taskId &&
      executor?.scopeKinds?.includes("follow") &&
      Boolean(executor.tabId) &&
      this.store.evidenceExists(executor.evidenceRef);
    if (
      hour < 7 &&
      !executorWindowAllowed(state, executor, "follow", now, (ref) =>
        this.store.evidenceExists(ref),
      )
    ) {
      if (
        authorityReady &&
        executorWindowAllowed(state, executor, "reply", now, (ref) =>
          this.store.evidenceExists(ref),
        )
      )
        return { ready: false, reason: "follow-window-not-open" };
      return { ready: false, blocked: true, reason: "night-platform-window" };
    }
    if (!authorityReady)
      return {
        ready: false,
        blocked: true,
        reason: "follow-priority-authority-missing",
      };
    const item = state.items.find((i: BoundaryRecord) => i.kind === "follow");
    if (!item || item.verified >= item.planned)
      return { ready: false, reason: "follow-target-reached" };
    const recovery = executor.currentRecovery;
    const unresolved = state.actions.find(
      (a: BoundaryRecord) =>
        a.kind === "follow" &&
        a.id === recovery?.originalUnknownActionId &&
        ["intent", "submitted", "unknown"].includes(a.status),
    );
    if (
      recovery?.firstRecoveryFailed === true &&
      recovery.writeResumeRequiresNewActualEvidence === true &&
      unresolved &&
      executor.followBackoff?.actionId === unresolved.id &&
      executor.followBackoff?.originalRefusalEvidenceRef ===
        recovery.evidenceRef &&
      this.store.evidenceExists(recovery.evidenceRef)
    )
      return { ready: false, reason: "follow-recovery-unconfirmed" };
    const backoffs = Object.values(state.executions ?? {})
      .map((e: any) => e.followBackoff)
      .filter(
        (b: any) => b && Number.isFinite(Date.parse(b.nextEligibleCheckAt)),
      );
    const latest = Math.max(
      0,
      ...backoffs.map((b: any) => Date.parse(b.nextEligibleCheckAt)),
    );
    const next = Math.max(latest, Date.parse(item.resumeAt ?? "") || 0);
    if (next > now)
      return {
        ready: false,
        reason: "follow-backoff",
        resumeAt: new Date(next).toISOString(),
      };
    const wait = this.followWait(state, executor);
    if (wait)
      return { ready: false, reason: wait.reason, resumeAt: wait.resumeAt };
    if (item.actionable === true) return { ready: true, recoveryDue: false };
    const matching = backoffs.find(
      (b: any) =>
        b.reason === item.reason &&
        Date.parse(b.nextEligibleCheckAt) === Date.parse(item.resumeAt ?? "") &&
        item.blockEvidence?.includes(b.evidenceRef) &&
        this.store.evidenceExists(b.evidenceRef),
    );
    if (!matching || !item.resumeWhen)
      return { ready: false, reason: "follow-block-not-recoverable" };
    return { ready: true, recoveryDue: true };
  }

  private followWait(state: BoundaryRecord, executor: BoundaryRecord) {
    const policy = new GrowthPolicy({
      executor,
      clock: this.clock,
      evidenceExists: (ref) => this.store.evidenceExists(ref),
      platform: {},
      store: this.store,
    });
    const wait = policy.waitBudget(state);
    if (wait) return wait;
    const cadence = executor.followCadence;
    if (!cadence) return null;
    const now = this.clock(),
      windowMs = cadence.sharedRollingPlanningWindowMs;
    const limit = cadence.sharedRollingPlanningLimit;
    const times = (state.attempts ?? [])
      .filter((a: BoundaryRecord) => a.kind === "follow")
      .map((a: BoundaryRecord) => Date.parse(a.at))
      .sort((a: number, b: number) => a - b);
    const recent = times.filter((t: number) => t > now - windowMs);
    if (
      Number.isSafeInteger(limit) &&
      limit > 0 &&
      Number.isFinite(windowMs) &&
      windowMs > 0 &&
      recent.length >= limit
    )
      return {
        reason: "follow-cadence-rolling-budget",
        resumeAt: new Date(
          recent[recent.length - limit] + windowMs,
        ).toISOString(),
      };
    const notBefore =
      (times.at(-1) ?? -Infinity) + (cadence.minimumGapFromLastAttemptMs ?? 0);
    if (notBefore > now)
      return {
        reason: "follow-cadence-group-gap",
        resumeAt: new Date(notBefore).toISOString(),
      };
    return null;
  }
  async inspect(taskId: string, executorId: string) {
    return this.evaluate((await this.store.load()).state, taskId, executorId);
  }

  async resume(taskId: string, executorId: string) {
    const proof = await this.store.recordProof({
      operation: "follow-priority-recovery",
      taskId,
      executorId,
      observedAt: new Date(this.clock()).toISOString(),
    });
    let choice: ReturnType<FollowPriority["evaluate"]>;
    await this.store.transaction(({ state }) => {
      choice = this.evaluate(state, taskId, executorId);
      if (choice.ready && choice.recoveryDue) {
        const item = state.items.find(
          (i: BoundaryRecord) => i.kind === "follow",
        );
        item.actionable = true;
        item.priorityRecovery = {
          executorId,
          at: new Date(this.clock()).toISOString(),
          evidenceRef: proof,
        };
      }
      return state;
    });
    return choice!;
  }

  async run(
    args: FollowPriorityOptions,
    operations: {
      reply: (
        options: FollowPriorityOptions["reply"] & {
          taskId: string;
          followPriorityExecutorId: string;
        },
      ) => Promise<NonNullable<FollowPriorityResult["replyResult"]>>;
      follow: (
        executor: FollowPriorityOptions["follow"]["executor"],
      ) => Promise<Pick<XGrowthHarness, "followBatch" | "verifySubmission">>;
    },
  ): Promise<FollowPriorityResult> {
    if (
      !args.follow.executor.scopeKinds.includes("follow") ||
      !this.store.evidenceExists(args.follow.executor.evidenceRef)
    )
      return { selected: "none", reason: "follow-priority-authority-missing" };
    const priority = this;
    let choice = await priority.inspect(args.taskId, args.follow.executor.id);
    if (choice.blocked) return { selected: "none", reason: choice.reason };
    let replyResult: FollowPriorityResult["replyResult"];
    if (!choice.ready) {
      replyResult = await operations.reply({
        ...args.reply,
        taskId: args.taskId,
        followPriorityExecutorId: args.follow.executor.id,
      });
      if (
        !replyResult.results.some((r) => r.reason === "follow-priority-ready")
      )
        return {
          selected: "reply",
          replyResult,
          reason: choice.reason,
          resumeAt: choice.resumeAt,
        };
    }
    choice = await priority.resume(args.taskId, args.follow.executor.id);
    if (!choice.ready)
      return {
        selected: "none",
        replyResult,
        reason: choice.reason,
        resumeAt: choice.resumeAt,
      };
    const follow = await operations.follow(args.follow.executor);
    for (const target of choice.recoveryDue
      ? (args.follow.recoveryTargets ?? [])
      : []) {
      if (
        (await priority.inspect(args.taskId, args.follow.executor.id)).blocked
      )
        return {
          selected: "none",
          replyResult,
          reason: "night-platform-window",
        };
      const pending = (await this.store.load()).state.actions.find(
        (a: BoundaryRecord) =>
          a.kind === "follow" &&
          ["intent", "unknown"].includes(a.status) &&
          sameHandle(a.handle, target.handle),
      );
      if (pending)
        await follow.verifySubmission({
          taskId: args.taskId,
          actionId: pending.id,
        });
    }
    const beforeFollow = await priority.inspect(
      args.taskId,
      args.follow.executor.id,
    );
    if (beforeFollow.blocked || !beforeFollow.ready)
      return {
        selected: "none",
        replyResult,
        reason: beforeFollow.reason,
        resumeAt: beforeFollow.resumeAt,
      };
    const followResult = await follow.followBatch(args.follow);
    return { selected: "follow", replyResult, followResult };
  }
}
