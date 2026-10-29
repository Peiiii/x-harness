import { executionHoldsPage } from "./executor-actionability.js";
import type { GrowthDependencies } from "./growth-dependencies.js";
import { randomUUID } from "node:crypto";

import { same } from "./growth-constants.js";
export class ParallelRound {
  #load!: GrowthDependencies["load"];
  #scope!: GrowthDependencies["scope"];
  #result!: GrowthDependencies["result"];
  #store!: GrowthDependencies["store"];
  #executor!: GrowthDependencies["executor"];
  #runtimeId!: GrowthDependencies["runtimeId"];
  #stamp!: GrowthDependencies["stamp"];
  #evidenceExists!: GrowthDependencies["evidenceExists"];
  #execute!: GrowthDependencies["execute"];
  #clock!: GrowthDependencies["clock"];
  #releaseSession!: GrowthDependencies["releaseSession"];
  #session!: GrowthDependencies["session"];
  parallelRound!: ({
    taskId,
    decision,
    selector,
    requestedKind,
    maxActions,
  }?: any) => Promise<any>;
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      | "load"
      | "scope"
      | "result"
      | "store"
      | "executor"
      | "runtimeId"
      | "stamp"
      | "evidenceExists"
      | "execute"
      | "clock"
      | "releaseSession"
      | "session"
    >,
  ) {
    const {
      load,
      scope,
      result,
      store,
      executor,
      runtimeId,
      stamp,
      evidenceExists,
      execute,
      clock,
      releaseSession,
      session,
    } = dependencies;
    this.#load = load;
    this.#scope = scope;
    this.#result = result;
    this.#store = store;
    this.#executor = executor;
    this.#runtimeId = runtimeId;
    this.#stamp = stamp;
    this.#evidenceExists = evidenceExists;
    this.#execute = execute;
    this.#clock = clock;
    this.#releaseSession = releaseSession;
    this.#session = session;
    this.parallelRound = this.handleParallelRound.bind(this);
  }
  private async handleParallelRound({
    taskId,
    decision,
    selector,
    requestedKind,
    maxActions = 10,
  }: any = {}): Promise<any> {
    const executor = this.#executor;
    if (!executor) throw new Error("parallel-executor-required");
    if (this.#session.running)
      return {
        status: "needsDecision",
        mayEnd: false,
        taskId,
        decision: [{ reason: "same-tab-operation-running" }],
      };
    this.#session.running = true;
    let completed = 0;
    const needs: any[] = [];
    try {
      // An earlier cleanup may have failed after its action settled. Only the
      // original token may be released, before this session claims another.
      if (this.#session.claim) await this.#releaseSession(taskId);
      if (
        !Number.isInteger(maxActions) ||
        maxActions < 0 ||
        maxActions > 100 ||
        (maxActions === 0 && decision?.type !== "prepareActions")
      )
        throw new Error("maxActions须为1–100；仅prepareActions允许0（只准备）");
      let snapshot = await this.#load(taskId);
      const activeKinds = this.#scope(snapshot.state);
      if (requestedKind && !activeKinds.includes(requestedKind))
        return {
          ...this.#result(snapshot),
          status: "needsDecision",
          decision: [{ reason: "kind-outside-round-scope" }],
        };
      snapshot = await this.#store.transaction((latest: any) => {
        if (latest.state.batchId !== taskId)
          throw new Error("original-task-changed");
        const next = structuredClone(latest.state);
        next.executions ??= {};
        if (
          Object.values(next.executions).some(
            (e: any) =>
              e.tabId === executor.tabId &&
              e.runtimeId !== this.#runtimeId &&
              executionHoldsPage(e) &&
              this.#store.ownerAlive(e.pid),
          )
        )
          throw new Error("same-tab-or-executor-claimed");
        next.executions[executor.id] = {
          ...next.executions[executor.id],
          ...executor,
          runtimeId: this.#runtimeId,
          pid: this.#store.processId,
          activity: "round",
          status: "RUNNING",
          updatedAt: this.#stamp(),
        };
        if (decision?.type === "prepareActions") {
          if (
            !Array.isArray(decision.actions) ||
            !same(next.accountHandle, decision.accountHandle) ||
            !this.#evidenceExists(decision.ownershipEvidenceRef)
          )
            throw new Error("需原账号核验和完整动作队列");
          next.actions ??= [];
          for (const action of decision.actions) {
            if (
              !action.id ||
              !activeKinds.includes(action.kind) ||
              action.status !== "prepared" ||
              next.actions.some((a: any) => a.id === action.id)
            )
              throw new Error("原prepared动作ID无效");
            next.actions.push(structuredClone(action));
          }
          if (
            next.items.some(
              (i: any) =>
                next.actions.filter(
                  (a: any) => a.kind === i.kind && a.status === "prepared",
                ).length >
                i.planned - i.verified - i.unknown,
            )
          )
            throw new Error("队列超过原目标");
          if (decision.sharedAttempts) {
            if (!Array.isArray(decision.sharedAttempts))
              throw new Error("共享尝试须为数组");
            next.attempts = [
              ...(next.attempts ?? []),
              ...structuredClone(decision.sharedAttempts),
            ];
          }
          if (decision.attemptsCoverage) {
            if (
              !decision.attemptsCoverage.complete ||
              !this.#evidenceExists(decision.attemptsCoverage.evidenceRef)
            )
              throw new Error("共享历史缺证据");
            next.attemptsCoverage = structuredClone(decision.attemptsCoverage);
          }
          if (decision.nextScheduledCheckAt)
            next.executions[executor.id].nextScheduledCheckAt =
              decision.nextScheduledCheckAt;
        } else if (decision) {
          const action = next.actions?.find(
            (a: any) => a.id === decision.actionId,
          );
          if (
            !action ||
            !activeKinds.includes(action.kind) ||
            action.status !== "prepared" ||
            action.claim ||
            typeof decision.approved !== "boolean" ||
            !this.#evidenceExists(decision.evidenceRef)
          )
            throw new Error("审查只绑定职责内未领取的原prepared动作");
          if (!decision.approved) action.status = "skipped";
          else
            action.quality = {
              approved: true,
              evidenceRef: decision.evidenceRef,
              ...(action.kind === "follow"
                ? {
                    handle: action.handle,
                    blue:
                      decision.blue === null ? null : decision.blue === true,
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
        }
        next.updatedAt = this.#stamp();
        return next;
      });
      if (maxActions === 0)
        return {
          ...this.#result(snapshot),
          status: "checkpoint",
          mayEnd: false,
        };
      for (const kind of activeKinds) {
        const queue = (snapshot.state.actions ?? [])
          .filter((a: any) => a.kind === kind && (!selector || selector(a)))
          .sort(
            (a: any, b: any) =>
              Number(["intent", "unknown"].includes(b.status)) -
              Number(["intent", "unknown"].includes(a.status)),
          );
        if (
          snapshot.state.items.find((i: any) => i.kind === kind).unknown >
          snapshot.state.actions.filter(
            (a: any) =>
              a.kind === kind && ["intent", "unknown"].includes(a.status),
          ).length
        ) {
          needs.push({
            status: "needsDecision",
            reason: "original-unmapped-unknown-needs-dedup",
            kind,
          });
          continue;
        }
        for (const original of queue) {
          if (completed >= maxActions) break;
          if (["verified", "preexisting", "skipped"].includes(original.status))
            continue;
          try {
            snapshot = await this.#store.transaction((latest: any) => {
              this.#session.claim = null;
              const next = structuredClone(latest.state),
                action = next.actions.find((a: any) => a.id === original.id);
              if (next.batchId !== taskId)
                throw new Error("original-task-changed");
              if (
                ["verified", "preexisting", "skipped"].includes(action.status)
              )
                return null;
              const sameTarget = (other: any) =>
                other.kind === action.kind &&
                (kind === "follow"
                  ? same(other.handle, action.handle)
                  : kind === "original"
                    ? other.draftPath === action.draftPath
                    : other.postId === action.postId &&
                      other.text === action.text);
              if (
                next.actions.some(
                  (a: any) =>
                    a.id !== action.id &&
                    sameTarget(a) &&
                    (a.claim ||
                      ["intent", "unknown", "verified"].includes(a.status)),
                )
              )
                throw new Error("same-target-already-claimed-or-submitted");
              if (action.claim && this.#store.ownerAlive(action.claim.pid))
                throw new Error("same-action-claimed");
              if (
                Object.values(next.executions).some(
                  (e: any) =>
                    e.tabId === executor.tabId &&
                    e.actionId &&
                    e.runtimeId !== this.#runtimeId &&
                    this.#store.ownerAlive(e.pid),
                )
              )
                throw new Error("same-tab-claimed");
              this.#session.claim = {
                actionId: action.id,
                token: randomUUID(),
                executorId: executor.id,
                runtimeId: this.#runtimeId,
                pid: this.#store.processId,
                acquiredAt: this.#stamp(),
              };
              action.claim = this.#session.claim;
              next.executions[executor.id].actionId = action.id;
              next.updatedAt = this.#stamp();
              return next;
            });
            if (!this.#session.claim) continue;
            const outcome = await this.#execute(
              snapshot,
              snapshot.state.actions.find((a: any) => a.id === original.id),
            );
            snapshot = outcome.snapshot;
            completed++;
            if (outcome.need) {
              needs.push(outcome.need);
              break;
            }
          } catch (error: any) {
            needs.push({
              status: "needsDecision",
              kind,
              actionId: original.id,
              reason: /claimed|same-target/.test(error.message)
                ? "action-or-tab-claimed"
                : /budget|capacity/.test(error.message)
                  ? "shared-reservation-unavailable"
                  : "harness-boundary-error",
              error: error.message.slice(0, 240),
            });
            break;
          } finally {
            if (this.#session.claim) {
              const owned = this.#session.claim;
              snapshot = await this.#store.transaction((latest: any) => {
                const next = structuredClone(latest.state),
                  action = next.actions?.find(
                    (a: any) => a.id === owned.actionId,
                  );
                if (action?.claim?.token !== owned.token) return null;
                delete action.claim;
                if (next.executions[executor.id]?.runtimeId === this.#runtimeId)
                  delete next.executions[executor.id].actionId;
                next.updatedAt = this.#stamp();
                return next;
              });
              this.#session.claim = null;
            }
          }
        }
      }
      snapshot = await this.#store.transaction(async (latest: any) => {
        const next = structuredClone(latest.state),
          own = next.executions[executor.id];
        const pending = next.items.filter(
          (i: any) =>
            activeKinds.includes(i.kind) &&
            (i.verified < i.planned || i.unknown),
        );
        own.status = pending.length ? "RUNNING" : "COMPLETE";
        const scheduled =
          own.nextScheduledCheckAt ??
          next.execution?.nextScheduledCheckAt ??
          next.stop?.nextScheduledCheckAt;
        const waits = pending.map((i: any) =>
          needs.find(
            (n: any) =>
              n.status === "waiting" &&
              next.actions.find((a: any) => a.id === n.actionId)?.kind ===
                i.kind,
          ),
        );
        if (
          pending.length &&
          pending.every(
            (i: any) =>
              !i.unknown &&
              next.actions.filter(
                (a: any) => a.kind === i.kind && a.status === "prepared",
              ).length >=
                i.planned - i.verified,
          ) &&
          waits.every(
            (w: any) => w && Date.parse(w.resumeAt) > this.#clock(),
          ) &&
          Date.parse(scheduled) > this.#clock()
        ) {
          for (let i = 0; i < pending.length; i++) {
            const proof = await this.#store.recordProof({
              observedAt: this.#stamp(),
              ...waits[i],
              attempts: next.attempts,
            });
            Object.assign(pending[i], {
              actionable: false,
              reason: `harness:${waits[i].reason}`,
              resumeAt: waits[i].resumeAt,
              resumeWhen: `不早于${waits[i].resumeAt}重核`,
              blockEvidence: [proof],
            });
          }
          own.status = "WAITING";
          own.stop = {
            independentActionsHandled: true,
            nextScheduledCheckAt: scheduled,
            nextEligibleCheckAt: waits.map((w: any) => w.resumeAt).sort()[0],
          };
        }
        next.status = next.items.every(
          (i: any) => i.verified === i.planned && !i.unknown,
        )
          ? "COMPLETE"
          : "RUNNING";
        own.updatedAt = next.updatedAt = this.#stamp();
        return next;
      });
      const out = this.#result(snapshot, needs);
      if (!out.mayEnd && !needs.length && completed >= maxActions)
        return {
          ...out,
          status: "checkpoint",
          checkpoint: {
            taskId,
            executorId: executor.id,
            completed,
            resume: "resumeGrowthRound",
          },
        };
      if (!out.mayEnd && !needs.length)
        out.decision = [
          { reason: "prepared-queue-does-not-cover-original-targets" },
        ];
      return out;
    } catch (error: any) {
      return {
        status: "needsDecision",
        mayEnd: false,
        taskId,
        evidenceRef: this.#store.path,
        decision: [
          {
            reason: "harness-boundary-error",
            error: error.message.slice(0, 240),
          },
        ],
      };
    } finally {
      try {
        await this.#releaseSession(taskId);
      } finally {
        this.#session.running = false;
      }
    }
  }
}
export function createParallelRound(
  ...args: ConstructorParameters<typeof ParallelRound>
) {
  return new ParallelRound(...args);
}
