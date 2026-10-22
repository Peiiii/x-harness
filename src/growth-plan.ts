import type { GrowthDependencies } from "./growth-dependencies.js";

import { kinds, same } from "./growth-constants.js";
export class PlannedRound {
  #store!: GrowthDependencies["store"];
  #load!: GrowthDependencies["load"];
  #result!: GrowthDependencies["result"];
  #evidenceExists!: GrowthDependencies["evidenceExists"];
  #save!: GrowthDependencies["save"];
  #execute!: GrowthDependencies["execute"];
  #clock!: GrowthDependencies["clock"];
  #stamp!: GrowthDependencies["stamp"];
  round!: ({ taskId, decision, selector, requestedKind }?: any) => Promise<any>;
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      | "store"
      | "load"
      | "result"
      | "evidenceExists"
      | "save"
      | "execute"
      | "clock"
      | "stamp"
    >,
  ) {
    const { store, load, result, evidenceExists, save, execute, clock, stamp } =
      dependencies;
    this.#store = store;
    this.#load = load;
    this.#result = result;
    this.#evidenceExists = evidenceExists;
    this.#save = save;
    this.#execute = execute;
    this.#clock = clock;
    this.#stamp = stamp;
    this.round = this.handleRound.bind(this);
  }
  private async applyRoundDecision(
    snapshot: any,
    decision: any,
    activeKinds: any,
  ): Promise<any> {
    if (decision?.type === "prepareActions") {
      if (
        !Array.isArray(decision.actions) ||
        !/^[A-Za-z0-9_]{1,15}$/.test(decision.accountHandle ?? "") ||
        !this.#evidenceExists(decision.ownershipEvidenceRef) ||
        (snapshot.state.execution?.owner &&
          snapshot.state.execution.owner !== "harness")
      )
        throw new Error("需原账号执行权核验和完整动作队列；不接管已有执行者");
      if (
        snapshot.state.accountHandle &&
        !same(snapshot.state.accountHandle, decision.accountHandle)
      )
        throw new Error("不能变更原账号");
      const next = structuredClone(snapshot.state);
      next.actions ??= [];
      for (const action of decision.actions) {
        if (
          !action.id ||
          !activeKinds.includes(action.kind) ||
          action.status !== "prepared" ||
          next.actions.some((a: any) => a.id === action.id)
        )
          throw new Error("仅添加职责范围内唯一ID的prepared原动作");
        next.actions.push(structuredClone(action));
      }
      if (
        next.items.some(
          (item: any) =>
            next.actions.filter(
              (a: any) => a.kind === item.kind && a.status === "prepared",
            ).length >
            item.planned - item.verified - item.unknown,
        )
      )
        throw new Error("prepared队列不能越过原批次未决目标");
      next.accountHandle = decision.accountHandle;
      next.execution = {
        ...next.execution,
        owner: "harness",
        exclusive: true,
        ownershipEvidenceRef: decision.ownershipEvidenceRef,
        ...(decision.nextScheduledCheckAt
          ? { nextScheduledCheckAt: decision.nextScheduledCheckAt }
          : {}),
      };
      if (decision.attemptsCoverage) {
        if (
          !decision.attemptsCoverage.complete ||
          !this.#evidenceExists(decision.attemptsCoverage.evidenceRef)
        )
          throw new Error("共享历史须完整取证；不能默认为零");
        next.attemptsCoverage = structuredClone(decision.attemptsCoverage);
      }
      if (decision.sharedAttempts) {
        if (!Array.isArray(decision.sharedAttempts))
          throw new Error("共享尝试记录必须为数组");
        next.attempts = [
          ...(next.attempts ?? []),
          ...structuredClone(decision.sharedAttempts),
        ];
      }
      snapshot = await this.#save(snapshot, next);
    } else if (decision) {
      const action = snapshot.state.actions?.find(
        (a: any) => a.id === decision.actionId,
      );
      if (action && !activeKinds.includes(action.kind))
        throw new Error("kind-outside-round-scope");
      if (
        !action ||
        action.status !== "prepared" ||
        typeof decision.approved !== "boolean" ||
        !this.#evidenceExists(decision.evidenceRef)
      )
        throw new Error("决策仅能绑定原prepared动作及真实审查证据");
      const next = structuredClone(snapshot.state),
        target = next.actions.find((a: any) => a.id === action.id);
      if (!decision.approved) target.status = "skipped";
      else
        target.quality = {
          approved: true,
          evidenceRef: decision.evidenceRef,
          ...(action.kind === "follow"
            ? {
                handle: action.handle,
                blue: decision.blue === null ? null : decision.blue === true,
                chinese: decision.chinese === true,
                ...(decision.blueCheckException
                  ? { blueCheckException: decision.blueCheckException }
                  : {}),
              }
            : {
                approvedText: decision.approvedText,
                ...(action.kind === "original"
                  ? { draftFingerprint: decision.draftFingerprint }
                  : {}),
              }),
        };
      snapshot = await this.#save(snapshot, next);
    }
    return snapshot;
  }
  private async handleRound({
    taskId,
    decision,
    selector,
    requestedKind,
    maxActions,
  }: any = {}): Promise<any> {
    try {
      if (maxActions === 0 && decision?.type !== "prepareActions")
        throw new Error("maxActions:0仅用于prepareActions（只准备）");
      return await this.#store.withLock(async () => {
        let snapshot = await this.#load(taskId);
        const activeKinds = snapshot.state.scopeKinds ?? kinds;
        if (requestedKind && !activeKinds.includes(requestedKind))
          return {
            ...this.#result(snapshot),
            status: "needsDecision",
            mayEnd: false,
            decision: [
              { kind: requestedKind, reason: "kind-outside-round-scope" },
            ],
          };
        snapshot = await this.applyRoundDecision(
          snapshot,
          decision,
          activeKinds,
        );
        if (maxActions === 0)
          return {
            ...this.#result(snapshot),
            status: "checkpoint",
            mayEnd: false,
          };
        const needs: any[] = [];
        for (const kind of activeKinds) {
          const queue = (snapshot.state.actions ?? [])
            .filter((a: any) => a.kind === kind && (!selector || selector(a)))
            .sort(
              (a: any, b: any) =>
                Number(["intent", "unknown"].includes(b.status)) -
                Number(["intent", "unknown"].includes(a.status)),
            );
          // A selector narrows this invocation, not the original unresolved ledger.
          const unresolved = (snapshot.state.actions ?? []).filter(
            (a: any) =>
              a.kind === kind && ["intent", "unknown"].includes(a.status),
          ).length;
          if (
            snapshot.state.items.find((i: any) => i.kind === kind).unknown >
            unresolved
          ) {
            needs.push({
              status: "needsDecision",
              reason: "original-unmapped-unknown-needs-dedup",
              kind,
            });
            continue;
          }
          for (const original of queue) {
            const item = snapshot.state.items.find((i: any) => i.kind === kind);
            const action = snapshot.state.actions.find(
              (a: any) => a.id === original.id,
            );
            if (["verified", "preexisting", "skipped"].includes(action.status))
              continue;
            if (item.verified >= item.planned && action.status === "prepared")
              continue;
            const outcome = await this.#execute(snapshot, action);
            snapshot = outcome.snapshot;
            if (outcome.need) {
              needs.push(outcome.need);
              break;
            } // Stop only this kind; continue independent kinds.
          }
        }
        if (
          snapshot.state.items
            .filter((i: any) => activeKinds.includes(i.kind))
            .every((i: any) => i.verified === i.planned && i.unknown === 0)
        ) {
          const next = structuredClone(snapshot.state);
          next.status = "COMPLETE";
          snapshot = await this.#save(snapshot, next);
        } else {
          const pending = snapshot.state.items.filter(
            (i: any) =>
              activeKinds.includes(i.kind) &&
              (i.verified < i.planned || i.unknown > 0),
          );
          const waits = pending.map((item: any) =>
            needs.find(
              (n: any) =>
                n.status === "waiting" &&
                snapshot.state.actions.find((a: any) => a.id === n.actionId)
                  ?.kind === item.kind,
            ),
          );
          const scheduled =
            snapshot.state.execution?.nextScheduledCheckAt ??
            snapshot.state.stop?.nextScheduledCheckAt;
          const covered = pending.every(
            (item: any) =>
              item.unknown === 0 &&
              (snapshot.state.actions ?? []).filter(
                (a: any) => a.kind === item.kind && a.status === "prepared",
              ).length >=
                item.planned - item.verified,
          );
          if (
            covered &&
            waits.every(
              (w: any) => w && Date.parse(w.resumeAt) > this.#clock(),
            ) &&
            Date.parse(scheduled) > this.#clock()
          ) {
            const next = structuredClone(snapshot.state);
            for (let i = 0; i < pending.length; i++) {
              const item = next.items.find(
                  (a: any) => a.kind === pending[i].kind,
                ),
                wait = waits[i];
              const proof = await this.#store.recordProof({
                observedAt: this.#stamp(),
                reason: wait.reason,
                resumeAt: wait.resumeAt,
                attempts: next.attempts,
              });
              Object.assign(item, {
                actionable: false,
                reason: `harness:${wait.reason}`,
                resumeAt: wait.resumeAt,
                resumeWhen: `不早于${wait.resumeAt}重核预算及fresh状态`,
                blockEvidence: [proof],
              });
            }
            next.status = "WAITING";
            next.stop = {
              independentActionsHandled: true,
              nextScheduledCheckAt: scheduled,
              nextEligibleCheckAt: waits.map((w: any) => w.resumeAt).sort()[0],
            };
            snapshot = await this.#save(snapshot, next);
          } else if (!needs.length)
            needs.push({
              status: "needsDecision",
              reason: "prepared-queue-does-not-cover-original-targets",
            });
        }
        return this.#result(snapshot, needs);
      });
    } catch (error: any) {
      return {
        status: "needsDecision",
        mayEnd: false,
        taskId,
        evidenceRef: this.#store.path,
        decision: [
          {
            reason:
              error.code === "CONFLICT"
                ? "original-ledger-conflict"
                : "harness-boundary-error",
            error: error.message.slice(0, 240),
          },
        ],
      };
    }
  }
}
export function createPlannedRound(
  ...args: ConstructorParameters<typeof PlannedRound>
) {
  return new PlannedRound(...args);
}
