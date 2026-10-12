import type { GrowthDependencies } from "./growth-dependencies.js";

import { checkRound } from "./round-state.js";

import { kinds } from "./growth-constants.js";
export class GrowthState {
  #store!: GrowthDependencies["store"];
  #project!: GrowthDependencies["project"];
  #clock!: GrowthDependencies["clock"];
  #evidenceExists!: GrowthDependencies["evidenceExists"];
  #stamp!: GrowthDependencies["stamp"];
  #executor!: GrowthDependencies["executor"];
  #waitBudget!: GrowthDependencies["waitBudget"];
  #platform!: GrowthDependencies["platform"];
  #runtimeId!: GrowthDependencies["runtimeId"];
  #session!: GrowthDependencies["session"];
  load!: (taskId: any) => Promise<any>;
  save!: (snapshot: any, state: any) => Promise<any>;
  result!: (snapshot: any, needs?: any) => any;
  settleProof!: (
    snapshot: any,
    action: any,
    observation: any,
    { preserveStatus }?: any,
  ) => Promise<any>;
  releaseSession!: (taskId?: any) => Promise<any>;
  constructor(
    dependencies: Pick<
      GrowthDependencies,
      | "store"
      | "project"
      | "clock"
      | "evidenceExists"
      | "stamp"
      | "executor"
      | "waitBudget"
      | "platform"
      | "runtimeId"
      | "session"
    >,
  ) {
    const {
      store,
      project,
      clock,
      evidenceExists,
      stamp,
      executor,
      waitBudget,
      platform,
      runtimeId,
      session,
    } = dependencies;
    this.#store = store;
    this.#project = project;
    this.#clock = clock;
    this.#evidenceExists = evidenceExists;
    this.#stamp = stamp;
    this.#executor = executor;
    this.#waitBudget = waitBudget;
    this.#platform = platform;
    this.#runtimeId = runtimeId;
    this.#session = session;
    this.load = this.handleLoad.bind(this);
    this.save = this.handleSave.bind(this);
    this.result = this.handleResult.bind(this);
    this.settleProof = this.handleSettleProof.bind(this);
    this.releaseSession = this.handleReleaseSession.bind(this);
  }
  private async handleLoad(taskId: any): Promise<any> {
    const snapshot = await this.#store.load();
    if (snapshot.state.batchId !== taskId)
      throw new Error("任务ID不是原台账当前批次");
    // Expired WAITING is actionable, not a malformed ledger. Validate structure separately from stopping.
    const gate = checkRound(
      { ...this.#project(snapshot.state), status: "RUNNING" },
      { now: this.#clock(), evidenceExists: this.#evidenceExists },
    );
    if (!gate.valid)
      throw new Error(`原轮次标记无效：${gate.errors.join("；")}`);
    const actions = snapshot.state.actions ?? [];
    if (new Set(actions.map((a: any) => a.id)).size !== actions.length)
      throw new Error("原队列动作ID重复");
    for (const a of actions) {
      if (
        !a.id ||
        !kinds.includes(a.kind) ||
        ![
          "prepared",
          "intent",
          "unknown",
          "verified",
          "preexisting",
          "skipped",
        ].includes(a.status)
      )
        throw new Error("原队列动作结构无效");
    }
    return snapshot;
  }
  private async handleSave(snapshot: any, state: any): Promise<any> {
    const executor = this.#executor;
    state.updatedAt = this.#stamp();
    if (!executor) return this.#store.save(snapshot, state);
    // Batch metadata still uses a short withLock transaction; it never contains browser I/O.
    if (!this.#session.claim) return this.#store.save(snapshot, state);
    return this.#store.transaction((latest: any) => {
      const next = structuredClone(latest.state),
        before = snapshot.state.actions.find(
          (a: any) => a.id === this.#session.claim.actionId,
        );
      const entry = next.actions.find(
          (a: any) => a.id === this.#session.claim.actionId,
        ),
        after = state.actions.find(
          (a: any) => a.id === this.#session.claim.actionId,
        );
      if (
        next.batchId !== snapshot.state.batchId ||
        entry?.claim?.token !== this.#session.claim.token ||
        JSON.stringify({ ...entry, claim: undefined }) !==
          JSON.stringify({ ...before, claim: undefined })
      )
        throw new Error("action-claim-or-version-conflict");
      const oldItem = snapshot.state.items.find(
          (i: any) => i.kind === entry.kind,
        ),
        newItem = state.items.find((i: any) => i.kind === entry.kind);
      const item = next.items.find((i: any) => i.kind === entry.kind);
      const reservation =
        before.status === "prepared" && after.status === "intent";
      if (reservation) {
        if (!item.actionable || item.verified + item.unknown >= item.planned)
          throw new Error("shared-target-capacity-exhausted");
        if (entry.kind === "follow" && this.#waitBudget(next))
          throw new Error("shared-follow-budget-exhausted");
      }
      if (
        after.status === "verified" &&
        entry.kind !== "follow" &&
        next.actions.some(
          (a: any) =>
            a.id !== entry.id &&
            a.status === "verified" &&
            a.publicId === after.publicId,
        )
      )
        throw new Error("同一公开结果不能重复结算");
      Object.assign(entry, after, { claim: entry.claim });
      item.verified += newItem.verified - oldItem.verified;
      item.unknown += newItem.unknown - oldItem.unknown;
      if (item.unknown < 0 || item.verified + item.unknown > item.planned)
        throw new Error("并行结算越界");
      item.resultEvidence = [
        ...new Set([
          ...(item.resultEvidence ?? []),
          ...(newItem.resultEvidence ?? []),
        ]),
      ];
      for (const key of [
        "actionable",
        "reason",
        "resumeAt",
        "resumeWhen",
        "blockEvidence",
      ]) {
        if (JSON.stringify(oldItem[key]) !== JSON.stringify(newItem[key])) {
          if (key in newItem) item[key] = newItem[key];
          else delete item[key];
        }
      }
      if (reservation) {
        const attempt = state.attempts.at(-1);
        next.attempts ??= [];
        next.attempts.push(attempt);
        if (entry.kind === "follow") {
          next.execution ??= {};
          const old = next.execution.followGroup;
          next.execution.followGroup = {
            attempts:
              old?.attempts < 10 &&
              this.#clock() < Date.parse(old.lastAt) + 180000
                ? old.attempts + 1
                : 1,
            lastAt: attempt.at,
          };
        }
      }
      next.status = "RUNNING";
      next.updatedAt = this.#stamp();
      return next;
    });
  }
  private handleResult(snapshot: any, needs: any = []): any {
    const gate = checkRound(this.#project(snapshot.state), {
      now: this.#clock(),
      evidenceExists: this.#evidenceExists,
    });
    return {
      status: gate.mayEnd
        ? gate.status === "COMPLETE"
          ? "complete"
          : "waiting"
        : needs.some((n: any) => n.status === "needsCapability")
          ? "needsCapability"
          : "needsDecision",
      taskId: snapshot.state.batchId,
      mayEnd: gate.mayEnd,
      scopeKinds: gate.scopeKinds,
      actual: Object.fromEntries(
        snapshot.state.items.map((i: any) => [
          i.kind,
          { verified: i.verified, unknown: i.unknown },
        ]),
      ),
      gaps: gate.pending,
      ...(needs.length ? { decision: needs } : {}),
      evidenceRef: snapshot.path ?? this.#store.path,
      ...(gate.errors.length ? { settlementErrors: gate.errors } : {}),
    };
  }
  private async handleSettleProof(
    snapshot: any,
    action: any,
    observation: any,
    { preserveStatus = false }: any = {},
  ): Promise<any> {
    const proof = await this.#store.recordProof(
      await this.#platform.captureProof({ observation }),
    );
    const state = structuredClone(snapshot.state);
    const entry = state.actions.find((a: any) => a.id === action.id);
    const item = state.items.find((i: any) => i.kind === action.kind);
    if (
      action.kind === "reply" &&
      observation.receiptCandidate?.id &&
      observation.receiptCandidate?.url?.toLowerCase() ===
        `https://x.com/${action.accountHandle}/status/${observation.receiptCandidate.id}`.toLowerCase()
    ) {
      entry.observedPublicURL = observation.receiptCandidate.url;
      entry.observedPublicEvidenceRef = proof;
    }
    if (observation.verified) {
      if (
        action.kind !== "follow" &&
        (!/^\d+$/.test(observation.publicId ?? "") ||
          state.actions.some(
            (a: any) =>
              a.id !== action.id &&
              a.status === "verified" &&
              a.publicId === observation.publicId,
          ))
      )
        throw new Error("同一公开结果不能重复结算");
      if (["intent", "unknown"].includes(entry.status)) item.unknown -= 1;
      if (entry.status !== "verified") item.verified += 1;
      entry.status = "verified";
      entry.publicId = observation.publicId;
      entry.resultEvidence = proof;
      item.resultEvidence = [
        ...new Set([...(item.resultEvidence ?? []), proof]),
      ];
    } else {
      if (!["intent", "unknown"].includes(entry.status)) item.unknown += 1;
      entry.status = "unknown";
      entry.resultEvidence = proof;
    }
    if (item.verified > item.planned || item.unknown < 0)
      throw new Error("结算越界：不覆盖原目标或重复计数");
    if (!preserveStatus) state.status = "RUNNING";
    return this.handleSave(snapshot, state);
  }
  private async handleReleaseSession(taskId: any = undefined): Promise<any> {
    const executor = this.#executor;
    if (!executor) return;
    await this.#store.transaction((latest: any) => {
      const own = latest.state.executions?.[executor.id];
      if (
        (taskId && latest.state.batchId !== taskId) ||
        own?.runtimeId !== this.#runtimeId ||
        !own.activity
      )
        return null;
      const next = structuredClone(latest.state);
      delete next.executions[executor.id].activity;
      next.updatedAt = this.#stamp();
      return next;
    });
  }
}
export function createGrowthState(
  ...args: ConstructorParameters<typeof GrowthState>
) {
  return new GrowthState(...args);
}
