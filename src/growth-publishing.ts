import { DraftSchedule } from "./draft-schedule.js";
import type { GrowthDependencies } from "./growth-dependencies.js";

import { kinds, same } from "./growth-constants.js";
export class IndependentPublishing {
  #clock!: GrowthDependencies["clock"];
  #evidenceExists!: GrowthDependencies["evidenceExists"];
  #capability!: GrowthDependencies["capability"];
  #store!: GrowthDependencies["store"];
  #load!: GrowthDependencies["load"];
  #guardInput!: GrowthDependencies["guardInput"];
  #save!: GrowthDependencies["save"];
  #platform!: GrowthDependencies["platform"];
  #stamp!: GrowthDependencies["stamp"];
  #settleProof!: GrowthDependencies["settleProof"];
  publishIndependent!: ({
    taskId,
    draftPath,
    preparedAction,
    independentExecution,
  }: any) => Promise<any>;
  prepareActionsForCall!: (taskId: string, actions?: any[]) => Promise<void>;
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      | "clock"
      | "evidenceExists"
      | "capability"
      | "store"
      | "load"
      | "guardInput"
      | "save"
      | "platform"
      | "stamp"
      | "settleProof"
    >,
  ) {
    const {
      clock,
      evidenceExists,
      capability,
      store,
      load,
      guardInput,
      save,
      platform,
      stamp,
      settleProof,
    } = dependencies;
    this.#clock = clock;
    this.#evidenceExists = evidenceExists;
    this.#capability = capability;
    this.#store = store;
    this.#load = load;
    this.#guardInput = guardInput;
    this.#save = save;
    this.#platform = platform;
    this.#stamp = stamp;
    this.#settleProof = settleProof;
    this.publishIndependent = this.handlePublishIndependent.bind(this);
    this.prepareActionsForCall = this.handlePrepareActionsForCall.bind(this);
  }
  private async handlePublishIndependent({
    taskId,
    draftPath,
    preparedAction,
    independentExecution,
  }: any): Promise<any> {
    let action: any,
      token: any,
      submissionStarted = false;
    const inWindow = () => {
      const hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Shanghai",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(this.#clock()),
      );
      const permit = independentExecution?.windowAuthorization;
      return (
        (hour >= 7 && hour < 22) ||
        Boolean(
          permit?.userAuthorized === true &&
          permit.actionId === (action?.id ?? preparedAction?.id) &&
          this.#evidenceExists(permit.evidenceRef) &&
          this.#clock() < Date.parse(permit.expiresAt),
        )
      );
    };
    try {
      const caps = this.#capability("submitPost", preparedAction ?? {});
      if (!caps.covered) return { status: "needsCapability", ...caps };
      if (!inWindow()) throw new Error("outside-contract-write-window");
      await this.#store.withLock(async () => {
        const snapshot = await this.#load(taskId),
          state = structuredClone(snapshot.state);
        state.actions ??= [];
        action = state.actions.find(
          (a: any) => a.kind === "original" && a.draftPath === draftPath,
        );
        if (!action) {
          if (
            !preparedAction?.id ||
            preparedAction.kind !== "original" ||
            preparedAction.status !== "prepared" ||
            preparedAction.draftPath !== draftPath ||
            state.actions.some((a: any) => a.id === preparedAction.id)
          )
            throw new Error("unique-prepared-original-required");
          const error = this.#guardInput(
            state,
            preparedAction,
            independentExecution,
          );
          if (error) throw new Error(error);
          action = structuredClone(preparedAction);
          state.actions.push(action);
          await this.#save(snapshot, state);
        }
        if (action.status !== "prepared")
          throw new Error("existing-submission-do-not-resubmit");
        if (action.claim && this.#store.ownerAlive(action.claim.pid))
          throw new Error("same-action-claimed");
        const error = this.#guardInput(state, action, independentExecution);
        if (error) throw new Error(error);
      });
      const own = await this.#platform.readAccount();
      if (
        own.needsStateCheck ||
        own.alerts?.length ||
        !same(own.accountHandle, action.accountHandle)
      )
        throw new Error("fresh-account-unconfirmed");
      const baseline = await this.#platform.findSubmission({
        ...action,
        intentAt: this.#stamp(),
      });
      if (baseline.needsStateCheck || baseline.alerts?.length)
        throw new Error("publication-baseline-unconfirmed");
      token = `${action.id}:${this.#stamp()}:${Math.random()}`;
      await this.#store.withLock(async () => {
        const snapshot = await this.#load(taskId),
          state = structuredClone(snapshot.state);
        const target = state.actions.find((a: any) => a.id === action.id),
          item = state.items.find((i: any) => i.kind === "original");
        if (
          target?.status !== "prepared" ||
          (target.claim && this.#store.ownerAlive(target.claim.pid))
        )
          throw new Error("action-already-claimed-do-not-resubmit");
        const error = this.#guardInput(state, target, independentExecution);
        if (error) throw new Error(error);
        if (!inWindow() || item.verified + item.unknown >= item.planned)
          throw new Error("window-or-original-capacity-unavailable");
        Object.assign(target, {
          status: "intent",
          intentAt: this.#stamp(),
          beforeIds: (baseline.posts ?? [])
            .map((p: any) => p.id)
            .filter(Boolean),
          claimToken: token,
          independentExecution,
          claim: {
            actionId: target.id,
            token,
            pid: this.#store.processId,
            tabId: independentExecution.tabId,
            acquiredAt: this.#stamp(),
          },
        });
        item.unknown += 1;
        state.attempts ??= [];
        state.attempts.push({
          actionId: target.id,
          kind: "original",
          at: target.intentAt,
        });
        await this.#save(snapshot, state);
        action = structuredClone(target);
      });
      let observation: any;
      try {
        await this.#platform.submitPost({
          ...action,
          beforeSubmit: async () => {
            const latest = await this.#load(taskId),
              target = latest.state.actions.find(
                (a: any) => a.id === action.id,
              );
            if (
              target?.status !== "intent" ||
              target.claimToken !== token ||
              !inWindow()
            )
              throw new Error("action-claim-or-window-changed");
            const error = this.#guardInput(
              latest.state,
              target,
              independentExecution,
            );
            if (error) throw new Error(error);
            submissionStarted = true;
          },
        });
        observation = await this.#platform.findSubmission(action);
      } catch (error: any) {
        if (!submissionStarted) throw error;
        observation = {
          verified: false,
          missing: ["submission-or-verification-failed"],
          error: error.message.slice(0, 240),
        };
      }
      return await this.#store.withLock(async () => {
        const snapshot = await this.#load(taskId),
          target = snapshot.state.actions.find((a: any) => a.id === action.id);
        if (target?.claimToken !== token || target.status !== "intent")
          throw new Error("action-settlement-conflict");
        await this.#settleProof(snapshot, target, observation, {
          preserveStatus: true,
        });
        return {
          status: observation.verified ? "verified" : "unknown",
          taskId,
          actionId: action.id,
          publicId: observation.publicId,
          evidenceRef: this.#store.path,
          mayEnd: false,
        };
      });
    } catch (error: any) {
      if (token && !submissionStarted)
        await this.#store.withLock(async () => {
          const snapshot = await this.#load(taskId),
            state = structuredClone(snapshot.state),
            target = state.actions.find((a: any) => a.id === action.id);
          if (target?.claimToken !== token || target.status !== "intent")
            return;
          target.status = "prepared";
          target.preparationEvidence = await this.#store.recordProof({
            observedAt: this.#stamp(),
            submissionStarted: false,
            error: error.message.slice(0, 240),
          });
          state.items.find((i: any) => i.kind === "original").unknown -= 1;
          await this.#save(snapshot, state);
        });
      if (error.message === "draft-not-before-not-reached")
        return {
          status: "waiting",
          taskId,
          mayEnd: false,
          reason: error.message,
          resumeAt: new DraftSchedule().resolve(action ?? preparedAction).at,
        };
      return {
        status: "needsDecision",
        taskId,
        mayEnd: false,
        decision: [
          {
            reason:
              error.code === "CONFLICT"
                ? "original-ledger-conflict"
                : error.message.slice(0, 240),
          },
        ],
      };
    } finally {
      if (token)
        await this.#store.transaction((snapshot: any) => {
          if (snapshot.state.batchId !== taskId) return null;
          const next = structuredClone(snapshot.state),
            target = next.actions.find((a: any) => a.id === action.id);
          if (target?.claim?.token !== token) return null;
          delete target.claim;
          return next;
        });
    }
  }
  private async handlePrepareActionsForCall(
    taskId: string,
    actions: any[] = [],
  ): Promise<void> {
    if (!actions.length) return;
    await this.#store.transaction(async (snapshot: any) => {
      if (snapshot.state.batchId !== taskId)
        throw new Error("original-task-id-required");
      const next = structuredClone(snapshot.state);
      next.actions ??= [];
      const ids = new Set<string>();
      for (const action of actions) {
        if (
          !action?.id ||
          ids.has(action.id) ||
          action.status !== "prepared" ||
          !kinds.includes(action.kind)
        )
          throw new Error("unique-prepared-action-required");
        ids.add(action.id);
        const inputError = this.#guardInput(next, action);
        if (inputError) throw new Error(inputError);
        const existing = next.actions.find((a: any) => a.id === action.id);
        if (existing) {
          const fields = [
            "kind",
            "accountHandle",
            "handle",
            "postId",
            "text",
            "draftPath",
          ];
          if (fields.some((field) => existing[field] !== action[field]))
            throw new Error("original-action-input-changed");
          continue; // intent/unknown/verified stay untouched and follow their original recovery.
        }
        const duplicate = next.actions.some(
          (a: any) =>
            a.kind === action.kind &&
            (action.kind === "follow"
              ? same(a.handle, action.handle)
              : action.kind === "original"
                ? a.draftPath === action.draftPath
                : a.postId === action.postId && a.text === action.text),
        );
        if (duplicate) throw new Error("business-object-already-prepared");
        const item = next.items.find((i: any) => i.kind === action.kind);
        const queued = next.actions.filter(
          (a: any) =>
            a.kind === action.kind &&
            !["skipped", "preexisting"].includes(a.status),
        ).length;
        if (!item || queued >= item.planned)
          throw new Error("prepared-actions-exceed-original-target");
        next.actions.push(structuredClone(action));
      }
      next.updatedAt = this.#stamp();
      return next;
    });
  }
}
export function createIndependentPublishing(
  ...args: ConstructorParameters<typeof IndependentPublishing>
) {
  return new IndependentPublishing(...args);
}
