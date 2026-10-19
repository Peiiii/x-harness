import { FollowPriority } from "./follow-priority.js";
import { threadLikeConfig } from "./thread-like-policy.js";
import type { BusinessDependencies } from "./api.js";
import type {
  ReplyBatchOptions,
  ReplyBatchResult,
  XGrowthHarness,
} from "./types.js";

/** Composition only: original reply/reaction stores and guards remain authoritative. */
export class ReplyThreadBatch {
  constructor(
    private deps: BusinessDependencies,
    private api: Pick<XGrowthHarness, "replyBatch" | "likePostAndComments">,
  ) {}
  async priority(args: ReplyBatchOptions) {
    return args.followPriorityExecutorId
      ? new FollowPriority(
          this.deps.store,
          this.deps.clock ?? Date.now,
        ).inspect(args.taskId, args.followPriorityExecutorId)
      : undefined;
  }
  async existingStatus(
    args: ReplyBatchOptions,
    action: import("./types.js").PreparedAction,
  ) {
    if (!args.followPriorityExecutorId && !args.beforeReply) return;
    return (await this.deps.store.load()).state.actions.find(
      (a: any) => a.id === action.id,
    )?.status;
  }
  async admit(
    args: ReplyBatchOptions,
    action: import("./types.js").PreparedAction,
    status?: string,
  ): Promise<import("./types.js").ActionResult | undefined> {
    if (!args.beforeReply || (status && status !== "prepared")) return;
    try {
      const decision = await args.beforeReply(action);
      if (decision?.allowed === true) return;
    } catch {
      /* An admission failure cannot allow a new write. */
    }
    return {
      status: "needsDecision",
      taskId: args.taskId,
      actionId: action.id,
      reason: "reply-project-admission-denied",
    };
  }
  private durable(
    action: import("./types.js").PreparedAction,
    state: any,
    taskId: string,
  ) {
    if (action.kind !== "reply" || state.batchId !== taskId) return;
    const original = state.actions.find((a: any) => a.id === action.id);
    const refs =
      typeof original?.resultEvidence === "string"
        ? [original.resultEvidence]
        : original?.resultEvidence;
    if (
      typeof state.accountHandle === "string" &&
      state.accountHandle.length > 0 &&
      typeof action.accountHandle === "string" &&
      action.accountHandle.length > 0 &&
      original?.kind === "reply" &&
      original.status === "verified" &&
      original.publicId &&
      original.postId === action.postId &&
      original.url === action.url &&
      original.text === action.text &&
      original.accountHandle?.toLowerCase() ===
        state.accountHandle?.toLowerCase() &&
      original.accountHandle?.toLowerCase() ===
        action.accountHandle?.toLowerCase() &&
      original.accountURL === action.accountURL &&
      this.deps.store.evidenceExists(original.accountEvidenceRef) &&
      original.quality?.approved === true &&
      original.quality.approvedText === action.text &&
      this.deps.store.evidenceExists(original.quality.evidenceRef) &&
      this.deps.store.evidenceExists(original.evidenceRef) &&
      Array.isArray(refs) &&
      refs.length &&
      refs.every(
        (ref) => typeof ref === "string" && this.deps.store.evidenceExists(ref),
      )
    )
      return original;
  }
  private async replies(args: ReplyBatchOptions): Promise<ReplyBatchResult> {
    const { state } = await this.deps.store.load();
    const settled = new Map(
      args.actions.map((action) => [
        action.id,
        this.durable(action, state, args.taskId),
      ]),
    );
    const todo = args.actions.filter((action) => !settled.get(action.id));
    const current = todo.length
      ? await this.api.replyBatch({
          ...args,
          actions: todo,
          threadLikes: undefined,
        })
      : { status: "verified", results: [] };
    const results = args.actions.flatMap((action) => {
      const old = settled.get(action.id);
      const result = old
        ? {
            status: "verified" as const,
            taskId: args.taskId,
            actionId: action.id,
            publicId: old.publicId,
            ...(old.observedPublicURL
              ? { publicURL: old.observedPublicURL }
              : {}),
            evidenceRef: Array.isArray(old.resultEvidence)
              ? old.resultEvidence[0]
              : old.resultEvidence,
          }
        : current.results.find((r) => r.actionId === action.id);
      return result ? [result] : [];
    });
    return {
      status:
        results.length === args.actions.length &&
        results.every((r) => ["verified", "preexisting"].includes(r.status))
          ? "verified"
          : "needsDecision",
      results,
    };
  }
  replyResult(
    args: ReplyBatchOptions,
    results: import("./types.js").ActionResult[],
    targetLikes: NonNullable<ReplyBatchResult["targetLikes"]> = [],
  ): ReplyBatchResult {
    return {
      status:
        results.length === args.actions.length &&
        results.every((r) => ["verified", "preexisting"].includes(r.status))
          ? "verified"
          : "needsDecision",
      results,
      ...(args.likeTargetAfterVerified ? { targetLikes } : {}),
    };
  }
  private configs(args: ReplyBatchOptions) {
    if (
      !args.threadLikes ||
      typeof args.threadLikes !== "object" ||
      Array.isArray(args.threadLikes) ||
      args.likeTargetAfterVerified
    )
      throw Error("reply-thread-like-config-invalid");
    return args.actions.map((action) => {
      if (action.kind !== "reply") throw Error("reply-batch-invalid");
      const config = threadLikeConfig({
        sampleRate: 0.6,
        maxLikes: 20,
        maxPages: 10,
        timeBudgetMs: 30000,
        reuseCurrentPage: true,
        ...args.threadLikes,
        url: action.url!,
        batchId: `reply-thread-likes-${action.postId}`,
      });
      if (config.rootId !== action.postId)
        throw Error("reply-thread-parent-mismatch");
      return config;
    });
  }
  private async finish(
    args: ReplyBatchOptions,
    results: import("./types.js").ActionResult[],
    likes: NonNullable<ReplyBatchResult["threadLikes"]>,
    pending: string[],
    reason?: string,
  ): Promise<ReplyBatchResult> {
    const replies = this.replyResult(args, results);
    const interactionStatus = likes.some(
      (l) => l.result.status === "needsDecision",
    )
      ? "needsDecision"
      : likes.some((l) => l.result.status === "waiting") ||
          results.some((r) => r.status === "waiting")
        ? "waiting"
        : likes.some((l) => l.result.status === "unknown")
          ? "unknown"
          : reason
            ? "needsDecision"
            : pending.length &&
                likes.some((l) => l.result.status === "checkpoint")
              ? "checkpoint"
              : replies.status === "verified" && !pending.length
                ? "verified"
                : "needsDecision";
    const output: ReplyBatchResult = {
      ...replies,
      threadLikes: likes,
      interactionStatus,
      pendingLikeActionIds: [...new Set(pending)],
      pendingReplyActionIds: args.actions
        .filter(
          (a) =>
            !results.some(
              (r) =>
                r.actionId === a.id &&
                ["verified", "preexisting", "unknown"].includes(r.status),
            ),
        )
        .map((a) => a.id),
      ...(reason ? { interactionReason: reason } : {}),
    };
    output.interactionEvidenceRef = await this.deps.store.recordProof({
      operation: "replyBatch.threadLikes",
      observedAt: new Date((this.deps.clock ?? Date.now)()).toISOString(),
      taskId: args.taskId,
      actionIds: args.actions.map((a) => a.id),
      scopeComplete: false,
      ...output,
    });
    return output;
  }
  async run(args: ReplyBatchOptions): Promise<ReplyBatchResult> {
    if ((await this.deps.store.load()).state.batchId !== args.taskId)
      return {
        status: "needsDecision",
        results: [],
        reason: "reply-batch-task-mismatch",
      };
    let configs: ReturnType<typeof threadLikeConfig>[];
    try {
      configs = this.configs(args);
    } catch {
      return {
        status: "needsDecision",
        results: [],
        reason: "reply-thread-like-config-invalid",
      };
    }
    const results: import("./types.js").ActionResult[] = [],
      likes: NonNullable<ReplyBatchResult["threadLikes"]> = [],
      pending: string[] = [];
    const seen = new Set<string>();
    let reason: string | undefined;
    for (let index = 0; index < args.actions.length; index++) {
      const action = args.actions[index],
        config = configs[index];
      if (action.kind !== "reply") continue;
      const batch = await this.replies({ ...args, actions: [action] });
      results.push(...batch.results);
      const result = batch.results.find((r) => r.actionId === action.id);
      if (!result || !["verified", "preexisting"].includes(result.status)) {
        if (
          result?.status === "unknown" ||
          result?.reason === "publication-baseline-unconfirmed"
        )
          continue;
        reason = result?.reason ?? "reply-batch-result-unconfirmed";
        break;
      }
      if (seen.has(config.rootId)) continue;
      const { state } = await this.deps.store.load();
      if (!this.durable(action, state, args.taskId)) {
        pending.push(action.id);
        reason = "reply-thread-durable-parent-unconfirmed";
        continue;
      }
      seen.add(config.rootId);
      const priority = await this.priority(args);
      if (priority?.ready || priority?.blocked) {
        pending.push(action.id);
        reason = priority.ready ? "follow-priority-ready" : priority.reason;
        break;
      }
      try {
        const liked = await this.api.likePostAndComments({
          ...config,
          batchId: `reply-thread-likes-${action.postId}`,
        });
        likes.push({
          actionId: action.id,
          rootPostId: action.postId,
          result: liked,
        });
        if (liked.status !== "verified") pending.push(action.id);
        if (liked.status === "needsDecision")
          reason = liked.reason ?? "thread-like-needs-decision";
        const localTarget =
          liked.status === "needsDecision" &&
          /^(?:Error: )?thread-like-target-unconfirmed$/.test(
            liked.reason ?? "",
          );
        if (
          liked.status === "waiting" ||
          (liked.status === "needsDecision" && !localTarget)
        ) {
          reason = liked.reason;
          break;
        }
      } catch (error) {
        await this.deps.store.recordProof({
          operation: "replyBatch.threadLikes",
          actionId: action.id,
          error: String(error),
        });
        pending.push(action.id);
        reason = "reply-thread-like-call-unconfirmed";
        break;
      }
    }
    return this.finish(args, results, likes, pending, reason);
  }
}
