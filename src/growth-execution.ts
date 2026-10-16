import { latestNormalInteractionTime } from "./growth-policy.js";
import { OriginalPostCadence } from "./original-post-cadence.js";
import { actionableForExecutor } from "./executor-actionability.js";
import type { BoundaryRecord } from "./boundary.js";
import type { RoundSnapshot } from "./store.js";
interface ExecutionStep {
  snapshot: RoundSnapshot;
  need: BoundaryRecord | null;
}
type ActionAdmission = { beforeIds: string[] } | ExecutionStep;
import type { GrowthDependencies } from "./growth-dependencies.js";

import { operations, same } from "./growth-constants.js";
export class GrowthExecution {
  #cadence!: OriginalPostCadence;
  #capability!: GrowthDependencies["capability"];
  #platform!: GrowthDependencies["platform"];
  #settleProof!: GrowthDependencies["settleProof"];
  #clock!: GrowthDependencies["clock"];
  #save!: GrowthDependencies["save"];
  #guardInput!: GrowthDependencies["guardInput"];
  #waitBudget!: GrowthDependencies["waitBudget"];
  #authorizedWindow!: GrowthDependencies["authorizedWindow"];
  #stamp!: GrowthDependencies["stamp"];
  #store!: GrowthDependencies["store"];
  #evidenceExists!: GrowthDependencies["evidenceExists"];
  #executor!: GrowthDependencies["executor"];
  #session!: GrowthDependencies["session"];
  execute!: (snapshot: any, action: any) => Promise<ExecutionStep>;
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      | "capability"
      | "platform"
      | "settleProof"
      | "clock"
      | "save"
      | "guardInput"
      | "waitBudget"
      | "authorizedWindow"
      | "stamp"
      | "store"
      | "evidenceExists"
      | "executor"
      | "session"
    >,
  ) {
    const {
      capability,
      platform,
      settleProof,
      clock,
      save,
      guardInput,
      waitBudget,
      authorizedWindow,
      stamp,
      store,
      executor,
      evidenceExists,
      session,
    } = dependencies;
    this.#capability = capability;
    this.#platform = platform;
    this.#settleProof = settleProof;
    this.#clock = clock;
    this.#save = save;
    this.#guardInput = guardInput;
    this.#waitBudget = waitBudget;
    this.#authorizedWindow = authorizedWindow;
    this.#stamp = stamp;
    this.#store = store;
    this.#cadence = new OriginalPostCadence(store, clock);
    this.#executor = executor;
    this.#evidenceExists = evidenceExists;
    this.#session = session;
    this.execute = this.handleExecute.bind(this);
  }
  private async checkExecutionIdentity(
    snapshot: any,
    action: any,
  ): Promise<ExecutionStep | null> {
    const state = snapshot.state;
    let own: any;
    try {
      own = await this.#platform.readAccount();
    } catch (error: any) {
      return {
        snapshot,
        need: {
          status: "needsDecision",
          actionId: action.id,
          reason: "account-read-failed",
          error: error.message.slice(0, 240),
        },
      };
    }
    if (
      own.needsStateCheck ||
      own.alerts?.length ||
      !same(own.accountHandle, state.accountHandle)
    )
      return {
        snapshot,
        need: {
          status: "needsDecision",
          actionId: action.id,
          reason: "fresh-account-unconfirmed",
        },
      };
    return null;
  }
  private actionIsActionable(state: any, kind: string): boolean {
    return actionableForExecutor(
      state,
      kind,
      this.#executor,
      this.#evidenceExists,
    );
  }
  private async admitAction(
    snapshot: any,
    action: any,
  ): Promise<ActionAdmission> {
    const state = snapshot.state;
    const item = state.items.find((i: any) => i.kind === action.kind);
    if (!this.actionIsActionable(state, action.kind))
      return {
        snapshot,
        need: {
          status: "needsDecision",
          actionId: action.id,
          reason: item.reason ?? "original-kind-not-actionable",
        },
      };
    const inputError = this.#guardInput(state, action);
    if (inputError)
      return {
        snapshot,
        need: {
          status: "needsDecision",
          actionId: action.id,
          reason: inputError,
        },
      };
    const cadence = this.#cadence.check(state, action);
    if (cadence) return { snapshot, need: cadence };
    if (action.kind === "reply" && action.conversation) {
      const recent = latestNormalInteractionTime(state);
      if (recent && this.#clock() < recent + 30000)
        return {
          snapshot,
          need: {
            status: "waiting",
            actionId: action.id,
            reason: "incoming-interaction-pacing",
            resumeAt: new Date(recent + 30000).toISOString(),
          },
        };
    }
    const identity = await this.checkExecutionIdentity(snapshot, action);
    if (identity) return identity;
    if (action.kind === "follow") {
      const budget = this.#waitBudget(state);
      if (budget) return { snapshot, need: { ...budget, actionId: action.id } };
      let value: any;
      try {
        value = await this.#platform.readPerson(action);
      } catch (error: any) {
        return {
          snapshot,
          need: {
            status: "needsDecision",
            actionId: action.id,
            reason: "person-read-failed",
            error: error.message.slice(0, 240),
          },
        };
      }
      if (
        value.needsStateCheck ||
        value.alerts?.length ||
        value.relationship === "unknown" ||
        !same(value.accountHandle, state.accountHandle)
      )
        return {
          snapshot,
          need: {
            status: "needsDecision",
            actionId: action.id,
            reason: "fresh-person-unconfirmed",
          },
        };
      if (value.blue === false)
        return {
          snapshot,
          need: {
            status: "needsDecision",
            actionId: action.id,
            reason: "fresh-blue-qualification-contradicts-review",
          },
        };
      if (value.relationship === "following") {
        const next = structuredClone(state);
        next.actions.find((a: any) => a.id === action.id).status =
          "preexisting";
        return { snapshot: await this.#save(snapshot, next), need: null };
      }
    } else {
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Shanghai",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(this.#clock()),
      );
      if (
        (hour < 7 || hour >= (action.kind === "reply" ? 24 : 22)) &&
        !this.#authorizedWindow(state, action.kind)
      )
        return {
          snapshot,
          need: {
            status: "needsDecision",
            actionId: action.id,
            reason: "outside-contract-write-window",
          },
        };
    }
    let beforeIds: any[] = [];
    if (action.kind !== "follow") {
      let baseline: any;
      try {
        baseline = await this.readSubmissionWithURLContinuation(
          { ...action, intentAt: this.#stamp() },
          { phase: "baseline" },
        );
      } catch (error: any) {
        return {
          snapshot,
          need: {
            status: "needsDecision",
            actionId: action.id,
            reason: "publication-baseline-read-failed",
            error: error.message.slice(0, 240),
          },
        };
      }
      if (baseline.needsStateCheck || baseline.alerts?.length)
        return {
          snapshot,
          need: {
            status: "needsDecision",
            actionId: action.id,
            reason: "publication-baseline-unconfirmed",
          },
        };
      beforeIds = (baseline.posts ?? []).map((p: any) => p.id).filter(Boolean);
    }
    return { beforeIds };
  }
  private async readSubmissionWithURLContinuation(
    action: any,
    context?: any,
  ): Promise<any> {
    try {
      return await this.#platform.findSubmission(action, context);
    } catch (error: any) {
      const preparedBaseline = context?.phase === "baseline";
      const observedReceipt =
        !context &&
        action.observedPublicURL &&
        this.#evidenceExists(action.observedPublicEvidenceRef);
      const message = String(error?.message ?? "");
      const parentPath = action.url?.match(
        /^https:\/\/(?:x\.com|twitter\.com)(\/[^?#]+)(?:[?#].*)?$/i,
      )?.[1];
      const hrefs = [
        ...message.replaceAll("\\", "").matchAll(/a\[href="([^"]+)"\]/g),
      ].map((m) => m[1]);
      const preparedArticleTimeout =
        preparedBaseline &&
        action.status === "prepared" &&
        /locator\.waitFor\(visible\) timed out/.test(message) &&
        /internal:role=article/.test(message) &&
        parentPath &&
        hrefs.some((h) => h === parentPath || h === parentPath + "/history");
      if (
        action.kind !== "reply" ||
        !(preparedBaseline || observedReceipt) ||
        !(/Timed out waiting for URL/.test(message) || preparedArticleTimeout)
      )
        throw error;
      // Continue only this read; the existing admission and receipt gates stay intact.
      return this.#platform.findSubmission(action, context);
    }
  }
  private async handleExecute(
    snapshot: any,
    action: any,
  ): Promise<ExecutionStep> {
    const executor = this.#executor;
    const recovering = ["intent", "unknown"].includes(action.status);
    const caps = this.#capability(
      recovering ? "read" : operations[action.kind],
      action,
    );
    if (!caps.covered)
      return {
        snapshot,
        need: { status: "needsCapability", actionId: action.id, ...caps },
      };
    // Recovery is read-only even outside the write window. Never retry an intent.
    if (recovering) {
      let observation: any;
      try {
        observation = await this.readSubmissionWithURLContinuation(action);
      } catch (error: any) {
        observation = {
          verified: false,
          missing: ["dedup-read-failed"],
          error: error.message.slice(0, 240),
        };
      }
      snapshot = await this.#settleProof(snapshot, action, observation);
      return {
        snapshot,
        need: observation.verified
          ? null
          : {
              status: "needsDecision",
              actionId: action.id,
              reason: "submission-unknown-do-not-resubmit",
              accountAlert: Boolean(observation.alerts?.length),
            },
      };
    }
    if (
      snapshot.state.items
        .find((i: any) => i.kind === action.kind)
        .reason?.startsWith("harness:") &&
      Date.parse(
        snapshot.state.items.find((i: any) => i.kind === action.kind).resumeAt,
      ) <= this.#clock()
    ) {
      const next = structuredClone(snapshot.state),
        pending = next.items.find((i: any) => i.kind === action.kind);
      pending.actionable = true;
      delete pending.reason;
      delete pending.resumeAt;
      delete pending.resumeWhen;
      delete pending.blockEvidence;
      next.status = "RUNNING";
      snapshot = await this.#save(snapshot, next);
    }
    const admission = await this.admitAction(snapshot, action);
    if ("snapshot" in admission) return admission;
    const { beforeIds } = admission;
    const state = snapshot.state;
    // Persist intent BEFORE any externally visible submission. Even a failed attempt consumes budget.
    const next = structuredClone(state);
    const entry = next.actions.find((a: any) => a.id === action.id);
    entry.status = "intent";
    entry.intentAt = this.#stamp();
    entry.beforeIds = beforeIds;
    next.items.find((i: any) => i.kind === action.kind).unknown += 1;
    next.attempts ??= [];
    next.attempts.push({
      actionId: action.id,
      kind: action.kind,
      at: entry.intentAt,
    });
    if (action.kind === "follow") {
      next.execution ??= {};
      const old = next.execution.followGroup;
      next.execution.followGroup = {
        attempts:
          old?.attempts < 10 && this.#clock() < Date.parse(old.lastAt) + 180000
            ? old.attempts + 1
            : 1,
        lastAt: entry.intentAt,
      };
    }
    snapshot = await this.#save(snapshot, next);
    let observation: any,
      submissionMayHaveStarted = false;
    try {
      await this.#platform[operations[action.kind]]({
        ...entry,
        beforeSubmit: async () => {
          const latest = await this.#store.load();
          if (executor) {
            const current = latest.state.actions.find(
              (a: any) => a.id === entry.id,
            );
            if (
              latest.state.batchId !== snapshot.state.batchId ||
              current?.claim?.token !== this.#session.claim.token ||
              JSON.stringify(current) !==
                JSON.stringify(
                  snapshot.state.actions.find((a: any) => a.id === entry.id),
                )
            )
              throw new Error("提交前本动作或claim变化");
          } else if (latest.revision !== snapshot.revision)
            throw new Error("提交前原台账变化，保留intent并重核执行权");
          const inputError = this.#guardInput(
            latest.state,
            latest.state.actions.find((a: any) => a.id === entry.id),
          );
          if (inputError) throw new Error(inputError);
          const hour = Number(
            new Intl.DateTimeFormat("en-GB", {
              timeZone: "Asia/Shanghai",
              hour: "2-digit",
              hourCycle: "h23",
            }).format(this.#clock()),
          );
          if (
            (hour < 7 || hour >= (action.kind === "reply" ? 24 : 22)) &&
            !this.#authorizedWindow(latest.state, action.kind)
          )
            throw new Error("实际提交时已越过运营窗口");
          if (action.kind === "follow") {
            const check = structuredClone(latest.state);
            check.attempts = check.attempts.filter(
              (a: any) => a.actionId !== entry.id,
            );
            if (check.execution.followGroup)
              check.execution.followGroup.attempts -= 1;
            if (this.#waitBudget(check))
              throw new Error("实际提交前关注预算不再可用");
          }
          if (
            action.kind === "original" &&
            latest.state.execution?.originalCadence
          ) {
            const reservation = await this.#cadence.reserve(
              latest.state.actions.find((a: any) => a.id === entry.id),
              !executor,
            );
            snapshot = reservation.snapshot;
            if (reservation.need)
              throw Object.assign(new Error(reservation.need.reason), {
                cadence: reservation.need,
              });
          }
          submissionMayHaveStarted = true;
        },
      });
      observation = await this.#platform.findSubmission(entry);
    } catch (error: any) {
      if (!submissionMayHaveStarted) {
        const proof = await this.#store.recordProof({
          capturedAt: this.#stamp(),
          submissionStarted: false,
          error: error.message.slice(0, 240),
        });
        const unsubmitted = structuredClone(snapshot.state),
          target = unsubmitted.actions.find((a: any) => a.id === entry.id);
        target.status = "prepared";
        target.preparationEvidence = proof;
        unsubmitted.items.find((i: any) => i.kind === action.kind).unknown -= 1;
        snapshot = await this.#save(snapshot, unsubmitted);
        return {
          snapshot,
          need: {
            ...(error.cadence ?? {
              status: "needsDecision",
              reason: "pre-submit-preparation-failed",
            }),
            actionId: action.id,
            evidenceRef: proof,
          },
        };
      }
      // A transport error does not distinguish a rejected write from a successful write.
      observation = {
        verified: false,
        missing: ["submission-or-verification-failed"],
        ...(error.submissionDiagnostic
          ? { submissionDiagnostic: error.submissionDiagnostic }
          : {}),
        error: error.message.slice(0, 240),
      };
    }
    snapshot = await this.#settleProof(snapshot, entry, observation);
    return {
      snapshot,
      need: observation.verified
        ? null
        : {
            status: "needsDecision",
            actionId: action.id,
            reason: "submission-unknown-do-not-resubmit",
            accountAlert: Boolean(observation.alerts?.length),
          },
    };
  }
}
export function createGrowthExecution(
  ...args: ConstructorParameters<typeof GrowthExecution>
) {
  return new GrowthExecution(...args);
}
