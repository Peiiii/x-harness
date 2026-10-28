import { FollowBatchPacing } from "./follow-batch-pacing.js";
import type { BoundaryRecord } from "./boundary.js";
import type { GrowthDependencies } from "./growth-dependencies.js";

import { followWindows, same } from "./growth-constants.js";
import { followObservationAuthorized } from "./follow-observation-policy.js";
export class FollowBatch {
  #pacing: FollowBatchPacing;
  #prepareActionsForCall!: GrowthDependencies["prepareActionsForCall"];
  #store!: GrowthDependencies["store"];
  #scope!: GrowthDependencies["scope"];
  #stamp!: GrowthDependencies["stamp"];
  #clock!: GrowthDependencies["clock"];
  #evidenceExists!: GrowthDependencies["evidenceExists"];
  #executor!: GrowthDependencies["executor"];
  #parallelRound!: GrowthDependencies["parallelRound"];
  #round!: GrowthDependencies["round"];
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      | "prepareActionsForCall"
      | "store"
      | "scope"
      | "stamp"
      | "clock"
      | "evidenceExists"
      | "executor"
      | "parallelRound"
      | "round"
    >,
  ) {
    this.#pacing = new FollowBatchPacing(
      dependencies.store,
      dependencies.clock,
    );
    this.followBatch = this.followBatch.bind(this);
    const {
      prepareActionsForCall,
      store,
      scope,
      stamp,
      clock,
      evidenceExists,
      executor,
      parallelRound,
      round,
    } = dependencies;
    this.#prepareActionsForCall = prepareActionsForCall;
    this.#store = store;
    this.#scope = scope;
    this.#stamp = stamp;
    this.#clock = clock;
    this.#evidenceExists = evidenceExists;
    this.#executor = executor;
    this.#parallelRound = parallelRound;
    this.#round = round;
  }
  private eligibleAt(
    original: any,
    preparedCount: number,
    handles: string[],
    resumedBatch: boolean,
  ) {
    const executor = this.#executor;
    let eligibleAt = this.#clock();
    const observationAuthorized = followObservationAuthorized(
      original.state,
      executor,
      this.#clock(),
      this.#evidenceExists,
    );
    const previousGroup = original.state.execution?.followGroup;
    const lastAttempt = (original.state.attempts ?? [])
      .filter((a: any) => a.kind === "follow")
      .sort((a: any, b: any) => Date.parse(a.at) - Date.parse(b.at))
      .at(-1);
    const lastAction = original.state.actions.find(
      (a: any) => a.id === lastAttempt?.actionId,
    );
    const sameBatchRecovery =
      resumedBatch &&
      lastAction?.status === "verified" &&
      this.#evidenceExists(lastAction.resultEvidence) &&
      handles.some((h: any) => same(h, lastAction.handle));
    if (
      preparedCount &&
      previousGroup?.attempts &&
      !sameBatchRecovery &&
      !observationAuthorized
    )
      eligibleAt = Math.max(
        eligibleAt,
        Date.parse(previousGroup.lastAt) + 180000,
      );
    for (const [duration, limit] of observationAuthorized
      ? []
      : followWindows) {
      const recent = (original.state.attempts ?? [])
        .filter(
          (a: any) =>
            a.kind === "follow" && Date.parse(a.at) > this.#clock() - duration,
        )
        .sort((a: any, b: any) => Date.parse(a.at) - Date.parse(b.at));
      if (preparedCount > limit - recent.length)
        eligibleAt = Math.max(
          eligibleAt,
          Date.parse(recent[recent.length - limit + preparedCount - 1].at) +
            duration,
        );
    }
    return eligibleAt;
  }
  public async followBatch({
    taskId,
    handles,
    preparedActions,
    pacing,
    timeBudgetMs,
  }: any = {}) {
    if (
      timeBudgetMs !== undefined &&
      (!Number.isFinite(timeBudgetMs) || timeBudgetMs <= 0)
    )
      throw Error("follow-call-time-budget-invalid");
    const deadline =
      timeBudgetMs === undefined ? Infinity : Date.now() + timeBudgetMs;
    const executor = this.#executor;
    FollowBatchPacing.validate(pacing);
    if (
      !Array.isArray(handles) ||
      handles.length < 5 ||
      handles.length > 10 ||
      handles.some((h: any) => !/^[A-Za-z0-9_]{1,15}$/.test(h)) ||
      new Set(handles.map((h: any) => h.toLowerCase())).size !== handles.length
    )
      throw new Error("正常关注子批需5～10位不同的已准备对象");
    if (
      preparedActions?.some(
        (a: any) =>
          a.kind !== "follow" ||
          !handles.some((h: string) => same(h, a.handle)),
      )
    )
      throw new Error("batch-action-target-mismatch");
    await this.#prepareActionsForCall(taskId, preparedActions);
    let batchId: any,
      resumedBatch = false;
    const original = await this.#store.transaction(async (snapshot: any) => {
      if (!this.#scope(snapshot.state).includes("follow"))
        throw new Error("kind-outside-round-scope");
      if (
        snapshot.state.batchId !== taskId ||
        handles.some(
          (h: any) =>
            !snapshot.state.actions?.some(
              (a: any) => a.kind === "follow" && same(a.handle, h),
            ),
        )
      )
        throw new Error("子批名单必须归原任务队列");
      const next = structuredClone(snapshot.state);
      next.followBatches ??= [];
      const previous = next.followBatches.findLast(
        (b: any) =>
          b.status !== "SETTLED" &&
          b.handles.length === handles.length &&
          b.handles.every((h: any, i: any) => same(h, handles[i])),
      );
      pacing ??=
        previous?.pacing ??
        next.executions?.[executor?.id]?.followCadence?.intentPacing ??
        next.followCadence?.intentPacing;
      FollowBatchPacing.validate(pacing);
      resumedBatch = Boolean(previous);
      batchId = previous?.id ?? `${taskId}-FOLLOW-${this.#stamp()}`;
      if (previous)
        Object.assign(previous, {
          status: "RUNNING",
          lastResumedAt: this.#stamp(),
        });
      else
        next.followBatches.push({
          id: batchId,
          handles,
          planned: handles.length,
          startedAt: this.#stamp(),
          status: "RUNNING",
        });
      next.updatedAt = this.#stamp();
      return next;
    });
    const preparedCount = original.state.actions.filter(
      (a: any) =>
        a.kind === "follow" &&
        a.status === "prepared" &&
        handles.some((h: any) => same(h, a.handle)),
    ).length;
    const eligibleAt = this.eligibleAt(
      original,
      preparedCount,
      handles,
      resumedBatch,
    );
    if (eligibleAt > this.#clock()) {
      const resumeAt = new Date(eligibleAt).toISOString();
      await this.#store.transaction((snapshot: any) => {
        const next = structuredClone(snapshot.state);
        Object.assign(
          next.followBatches.find((b: any) => b.id === batchId),
          { status: "WAITING", remaining: preparedCount, resumeAt },
        );
        next.updatedAt = this.#stamp();
        return next;
      });
      return {
        taskId,
        batchId,
        planned: handles.length,
        attempted: 0,
        verifiedThisCall: 0,
        unknownInBatch: original.state.actions.filter(
          (a: any) =>
            handles.some((h: any) => same(h, a.handle)) &&
            ["unknown", "intent"].includes(a.status),
        ).length,
        remaining: preparedCount,
        mayEnd: false,
        decision: [
          {
            kind: "follow",
            status: "waiting",
            reason: "normal-batch-capacity-or-cooldown",
            resumeAt,
          },
        ],
        evidenceRef: this.#store.path,
      };
    }
    let result: any,
      exhausted = false;
    const exceptional: any[] = [];
    for (const handle of handles) {
      if (Date.now() >= deadline) {
        exhausted = true;
        break;
      }
      // A resumed batch submits only its remaining prepared members. Recovery
      // stays in the read-only API; a frozen member must not disturb that path.
      if (
        !original.state.actions.some(
          (a: any) =>
            a.kind === "follow" &&
            same(a.handle, handle) &&
            a.status === "prepared",
        )
      )
        continue;
      if (
        (await this.#pacing.before(batchId, handle, pacing, deadline)) === false
      ) {
        exhausted = true;
        break;
      }
      if (Date.now() >= deadline) {
        exhausted = true;
        break;
      }
      result = await (executor ? this.#parallelRound : this.#round)({
        taskId,
        requestedKind: "follow",
        selector: (a: any) => a.kind === "follow" && same(a.handle, handle),
      });
      const relevant = (result.decision ?? []).filter(
        (d: any) =>
          d.kind === "follow" ||
          ["harness-boundary-error", "original-ledger-conflict"].includes(
            d.reason,
          ) ||
          original.state.actions.some(
            (a: any) => a.id === d.actionId && a.kind === "follow",
          ),
      );
      exceptional.push(...relevant);
      // A new unconfirmed submission is a diagnostic boundary, not permission
      // to consume the rest of the batch on the same failing write path.
      if (relevant.length) break;
    }
    const after = await this.#store.load();
    const summary: BoundaryRecord = summarizeFollowBatch(
      taskId,
      batchId,
      handles,
      after,
      original,
      result,
      exceptional,
      this.#store.path,
    );
    if (exhausted)
      Object.assign(summary, {
        status: "checkpoint",
        yieldReason: "time-budget-exhausted",
        timeBudgetMs,
        mayEnd: false,
      });
    await this.#store.transaction((snapshot: any) => {
      const next = structuredClone(snapshot.state),
        batch = next.followBatches.find((b: any) => b.id === batchId);
      Object.assign(batch, {
        attempted: Number.isFinite(Date.parse(batch.startedAt))
          ? new Set(
              (next.attempts ?? [])
                .filter(
                  (attempt: any) =>
                    attempt.kind === "follow" &&
                    Date.parse(attempt.at) >= Date.parse(batch.startedAt) &&
                    next.actions.some(
                      (action: any) =>
                        action.id === attempt.actionId &&
                        action.kind === "follow" &&
                        handles.some((handle: string) =>
                          same(handle, action.handle),
                        ),
                    ),
                )
                .map((attempt: any) => attempt.actionId),
            ).size
          : (batch.attempted ?? 0) + summary.attempted,
        verifiedTotal: next.actions.filter(
          (action: any) =>
            action.kind === "follow" &&
            action.status === "verified" &&
            handles.some((handle: string) => same(handle, action.handle)),
        ).length,
        verifiedThisCall: summary.verifiedThisCall,
        unknown: summary.unknownInBatch,
        remaining: summary.remaining,
        finishedAt: this.#stamp(),
        status:
          summary.remaining || summary.unknownInBatch ? "PARTIAL" : "SETTLED",
      });
      next.updatedAt = this.#stamp();
      return next;
    });
    return summary;
  }
}
export function createFollowBatch(
  ...args: ConstructorParameters<typeof FollowBatch>
) {
  return new FollowBatch(...args);
}

function summarizeFollowBatch(
  taskId: any,
  batchId: any,
  handles: any,
  after: any,
  original: any,
  result: any,
  exceptional: any,
  evidenceRef: string,
): BoundaryRecord {
  return {
    taskId,
    batchId,
    planned: handles.length,
    attempted: (after.state.attempts ?? [])
      .slice(original.state.attempts?.length ?? 0)
      .filter(
        (a: any) =>
          a.kind === "follow" &&
          handles.some((h: any) =>
            same(
              after.state.actions.find((x: any) => x.id === a.actionId)?.handle,
              h,
            ),
          ),
      ).length,
    verifiedThisCall: after.state.actions.filter(
      (a: any) =>
        a.kind === "follow" &&
        a.status === "verified" &&
        handles.some((h: any) => same(h, a.handle)) &&
        original.state.actions.find((old: any) => old.id === a.id)?.status !==
          "verified",
    ).length,
    unknownInBatch: after.state.actions.filter(
      (a: any) =>
        a.kind === "follow" &&
        handles.some((h: any) => same(a.handle, h)) &&
        ["unknown", "intent"].includes(a.status),
    ).length,
    remaining: after.state.actions.filter(
      (a: any) =>
        a.kind === "follow" &&
        handles.some((h: any) => same(a.handle, h)) &&
        a.status === "prepared",
    ).length,
    actual: result?.actual,
    decision: exceptional,
    mayEnd: result?.mayEnd ?? false,
    evidenceRef,
  };
}
