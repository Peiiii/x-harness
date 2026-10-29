import type { BoundaryRecord } from "./boundary.js";
import type { RoundSnapshot, RoundStore } from "./store.js";
import type { OriginalCadenceOptions } from "./types.js";

/** One account's cadence lives in its original ledger; this is not a queue. */
export class OriginalPostCadence {
  constructor(
    private store: RoundStore,
    private clock: () => number,
    private executor?: BoundaryRecord,
  ) {
    this.configure = this.configure.bind(this);
  }
  private validGap(value: unknown): value is number {
    return (
      Number.isInteger(value) &&
      Number(value) >= 1000 &&
      Number(value) <= 900000
    );
  }
  async configure(options: OriginalCadenceOptions): Promise<BoundaryRecord> {
    if (
      !options.userAuthorized ||
      !this.store.evidenceExists(options.evidenceRef) ||
      !this.validGap(options.minGapMs) ||
      (this.executor && !this.executor.scopeKinds?.includes("original"))
    )
      return {
        status: "needsDecision",
        reason: "original-cadence-authorization-or-policy-invalid",
      };
    let matches = false;
    const snapshot = await this.store.transaction((current) => {
      matches = false;
      if (current.state.batchId !== options.taskId) return;
      matches = true;
      current.state.execution ??= {};
      current.state.execution.originalCadence = {
        minGapMs: options.minGapMs,
        evidenceRef: options.evidenceRef,
      };
      return current.state;
    });
    if (!matches)
      return { status: "needsDecision", reason: "original-task-id-required" };
    return {
      status: "configured",
      taskId: options.taskId,
      ...snapshot.state.execution.originalCadence,
    };
  }
  check(state: BoundaryRecord, action: BoundaryRecord): BoundaryRecord | null {
    const policy = state.execution?.originalCadence;
    if (action.kind !== "original" || !policy) return null;
    if (
      !this.validGap(policy.minGapMs) ||
      !this.store.evidenceExists(policy.evidenceRef)
    )
      return {
        status: "needsDecision",
        actionId: action.id,
        reason: "original-cadence-policy-invalid",
      };
    const timestamps = (state.actions ?? [])
      .filter(
        (other: BoundaryRecord) =>
          other.id !== action.id &&
          other.kind === "original" &&
          (["verified", "unknown"].includes(other.status) ||
            (other.status === "intent" && other.activatedAt)),
      )
      .map((other: BoundaryRecord) =>
        Date.parse(other.activatedAt ?? other.intentAt),
      )
      .filter(Number.isFinite);
    if (!timestamps.length) return null;
    const next = Math.max(...timestamps) + policy.minGapMs;
    if (this.clock() >= next) return null;
    return {
      status:
        Number.isFinite(Date.parse(action.notAfter)) &&
        next >= Date.parse(action.notAfter)
          ? "needsDecision"
          : "waiting",
      actionId: action.id,
      reason:
        Number.isFinite(Date.parse(action.notAfter)) &&
        next >= Date.parse(action.notAfter)
          ? "original-cadence-outside-draft-window"
          : "original-post-cadence",
      resumeAt: new Date(next).toISOString(),
    };
  }
  async reserve(
    expected: BoundaryRecord,
    heldLock = false,
  ): Promise<{
    snapshot: RoundSnapshot;
    need: BoundaryRecord | null;
  }> {
    let need: BoundaryRecord | null = null;
    const apply = (current: RoundSnapshot) => {
      const target = current.state.actions?.find(
        (a: BoundaryRecord) => a.id === expected.id,
      );
      if (
        !target ||
        target.status !== "intent" ||
        JSON.stringify(target) !== JSON.stringify(expected)
      )
        throw Error("original-cadence-action-changed");
      need = this.check(current.state, target);
      if (need || !current.state.execution?.originalCadence) return;
      target.activatedAt = new Date(this.clock()).toISOString();
      return current.state;
    };
    // The compatibility edit session no longer owns a physical account lock.
    // Always revalidate this invariant in the short serializable transaction.
    const snapshot = await this.store.transaction(apply);
    return { snapshot, need };
  }
}
