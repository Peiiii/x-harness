import type { RoundStore } from "./store.js";
import type {
  Executor,
  VerifiedTargetPlanOptions,
  VerifiedTargetPlanResult,
} from "./types.js";
export class VerifiedTargetPlanning {
  constructor(
    private store: RoundStore,
    private executor: Executor | undefined,
    private clock: () => number,
  ) {}
  async run(
    args: VerifiedTargetPlanOptions,
  ): Promise<VerifiedTargetPlanResult> {
    if (
      args.userAuthorized !== true ||
      !this.executor ||
      !Array.isArray(this.executor.scopeKinds) ||
      !this.executor.scopeKinds.includes(args.kind) ||
      !this.store.evidenceExists(this.executor.evidenceRef) ||
      !this.store.evidenceExists(args.evidenceRef) ||
      !Number.isInteger(args.target) ||
      args.target < 1 ||
      args.target > 10000 ||
      (args.excludedActionIds &&
        (!Array.isArray(args.excludedActionIds) ||
          args.excludedActionIds.length > 10000 ||
          args.excludedActionIds.some(
            (id) => typeof id !== "string" || !id.trim(),
          ))) ||
      (args.sourceCategories &&
        (!Array.isArray(args.sourceCategories) ||
          !args.sourceCategories.length ||
          args.sourceCategories.length > 10 ||
          args.sourceCategories.some(
            (s) => typeof s !== "string" || !s.trim(),
          )))
    )
      return {
        status: "needsDecision",
        reason: "verified-target-authorization-or-options-invalid",
      };
    let result: VerifiedTargetPlanResult = {
      status: "needsDecision",
      reason: "original-task-or-item-unavailable",
    };
    await this.store.transaction(({ state }) => {
      const item = state.items?.find((i: any) => i.kind === args.kind);
      if (state.batchId !== args.taskId || !item) return undefined;
      const matched = (state.actions ?? []).filter(
        (a: any) =>
          a.kind === args.kind &&
          a.status === "verified" &&
          !args.excludedActionIds?.includes(a.id) &&
          (!args.sourceCategories ||
            args.sourceCategories.includes(a.sourceCategory)),
      ).length;
      const remaining = Math.max(0, args.target - matched),
        used = item.verified + item.unknown,
        capacity = Math.max(item.planned, used + remaining);
      if (
        ![item.planned, item.verified, item.unknown].every(
          (n) => Number.isInteger(n) && n >= 0,
        )
      )
        return undefined;
      if (capacity !== item.planned) {
        state.planAdjustments ??= [];
        state.planAdjustments.push({
          type: "verified-target-reservation-capacity",
          kind: args.kind,
          executorId: this.executor!.id,
          target: args.target,
          sourceCategories: args.sourceCategories,
          excludedActionIds: args.excludedActionIds,
          matchedVerified: matched,
          totalVerified: item.verified,
          preservedUnknown: item.unknown,
          previousCapacity: item.planned,
          capacity,
          userAuthorized: true,
          evidenceRef: args.evidenceRef,
          at: new Date(this.clock()).toISOString(),
        });
        item.planned = capacity;
      }
      result = {
        status: "planned",
        kind: args.kind,
        target: args.target,
        matchedVerified: matched,
        remaining,
        capacity,
        preservedUnknown: item.unknown,
        goalEvidenceRef: args.evidenceRef,
      };
      return state;
    });
    if (result.status === "planned")
      result.evidenceRef = await this.store.recordProof({
        operation: "planVerifiedTarget",
        capturedAt: new Date(this.clock()).toISOString(),
        result,
      });
    return result;
  }
}
