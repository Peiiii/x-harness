import { createGrowthHarness } from "./growth.js";
import { readResult, decisions, diagnostic, stableReason } from "./results.js";
import type {
  ActionResult,
  ReadMode,
  ReadResult,
  RoundResult,
  XGrowthHarness,
  BatchResult,
  PostEvidence,
  PersonEvidence,
  FeedbackEvidence,
} from "./types.js";
import type { BoundaryRecord } from "./boundary.js";

/** Internal dependencies; only the normal X factory is exported from the root. */
export interface BusinessDependencies {
  platform: BoundaryRecord;
  store: import("./store.js").RoundStore;
  clock?: () => number;
  executor?: BoundaryRecord;
}

export class BusinessHarness implements XGrowthHarness {
  #store!: BusinessDependencies["store"];
  #core!: ReturnType<typeof createGrowthHarness>;
  #readCache!: Map<string, string>;
  constructor(dependencies: BusinessDependencies) {
    this.verifyFollow = this.verifyFollow.bind(this);
    this.followBatch = this.followBatch.bind(this);
    this.verifyPublishedPost = this.verifyPublishedPost.bind(this);
    this.verifySubmission = this.verifySubmission.bind(this);
    this.followOne = this.followOne.bind(this);
    this.replyToPost = this.replyToPost.bind(this);
    this.publishPost = this.publishPost.bind(this);
    this.runGrowthRound = this.runGrowthRound.bind(this);
    this.inspectRound = this.inspectRound.bind(this);
    this.inspectAccount = this.inspectAccount.bind(this);
    this.readFeedback = this.readFeedback.bind(this);
    this.readPerson = this.readPerson.bind(this);
    this.readPost = this.readPost.bind(this);
    this.searchSources = this.searchSources.bind(this);
    this.readBookmarks = this.readBookmarks.bind(this);
    this.readCreator = this.readCreator.bind(this);
    const { store } = dependencies;
    this.#store = store;
    this.#core = createGrowthHarness(dependencies);
    this.#readCache = new Map<string, string>();
  }
  private async invoke(
    operation: string,
    args: BoundaryRecord,
  ): Promise<BoundaryRecord> {
    try {
      const raw = await this.#core[operation](args);
      // Legacy core decisions can contain a human error without a diagnostic proof.
      // Expose a bounded recovery route; consumers never need implementation source.
      const errors = [
        raw.reason,
        ...(raw.decision ?? []).flatMap((d: BoundaryRecord) => [
          d.reason,
          d.error,
        ]),
      ].filter(
        (reason) =>
          typeof reason === "string" && stableReason(reason) !== reason,
      );
      if (errors.length) {
        const evidenceRef = await this.#store.recordProof({
          operation,
          error: errors[0],
          ...(errors.length > 1 ? { errors } : {}),
        });
        return {
          ...raw,
          ...(raw.reason ? { reason: stableReason(raw.reason) } : {}),
          evidenceRef,
          ...(raw.decision
            ? {
                decision: raw.decision.map((d: BoundaryRecord) => ({
                  ...d,
                  reason: stableReason(d.reason),
                })),
              }
            : {}),
          diagnostic: {
            operation,
            category: "boundary",
            code: "harness-boundary-error",
            next: "inspect-local-proof",
            evidenceRef,
          },
        };
      }
      return raw;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      let evidenceRef: string | undefined;
      try {
        evidenceRef = await this.#store.recordProof({
          operation,
          error: message,
        });
      } catch {
        /* Evidence failure is explicit below. */
      }
      return {
        status: "needsDecision",
        boundaryFailed: true,
        fresh: false,
        complete: false,
        reason: evidenceRef
          ? stableReason(message)
          : "evidence-store-unavailable",
        ...(evidenceRef
          ? { evidenceRef }
          : { missing: ["local-proof-unavailable"] }),
        diagnostic: {
          operation,
          category: "boundary",
          code: evidenceRef
            ? "harness-boundary-error"
            : "evidence-store-unavailable",
          next: evidenceRef ? "inspect-local-proof" : "restore-proof-store",
          ...(evidenceRef ? { evidenceRef } : {}),
        },
      };
    }
  }
  private async read(
    operation: string,
    args: BoundaryRecord = {},
    mode: ReadMode = "receipt",
  ): Promise<ReadResult> {
    if (!["receipt", "decision", "delta"].includes(mode))
      return {
        status: "needsDecision",
        complete: false,
        reason: "read-mode-invalid",
      };
    // Always collect fresh evidence once. Projection, not a second browser call, chooses output.
    const raw = await this.invoke(operation, { ...args, mode: "decision" });
    const output = readResult(operation, raw, mode);
    if (mode === "receipt") return output;
    const collection =
      output.sources ??
      output.feedback ??
      (output.post ? [output.post] : output.person ? [output.person] : []);
    const changed: (PostEvidence | PersonEvidence | FeedbackEvidence)[] = [],
      unchangedIds: string[] = [];
    for (const entry of collection) {
      const id =
        "id" in entry ? entry.id : "handle" in entry ? entry.handle : null;
      if (!id) {
        changed.push(entry);
        continue;
      }
      const key = JSON.stringify([operation, id]),
        value = JSON.stringify(entry);
      if (this.#readCache.get(key) === value) unchangedIds.push(id);
      else changed.push(entry);
      this.#readCache.set(key, value);
    }
    // Creator metadata changes independently from the post collection.
    if (operation === "readCreator") {
      for (const name of ["person", "creator"] as const) {
        if (!output[name]) continue;
        const key = JSON.stringify([operation, name, args.handle]);
        const value = JSON.stringify(output[name], (k, v) =>
          k === "observedAt" ? undefined : v,
        );
        if (mode === "delta" && this.#readCache.get(key) === value)
          delete output[name];
        this.#readCache.set(key, value);
      }
    }
    // A decision has delivered complete evidence and seeds the next delta.
    if (mode === "decision") return output;
    if (output.sources)
      output.sources = changed as NonNullable<ReadResult["sources"]>;
    if (output.feedback)
      output.feedback = changed as NonNullable<ReadResult["feedback"]>;
    if (output.post && !changed.length) delete output.post;
    if (operation !== "readCreator" && output.person && !changed.length)
      delete output.person;
    output.unchangedIds = unchangedIds;
    return output;
  }
  private async compactRound(
    operation: "runGrowthRound" | "inspectRound",
    args: BoundaryRecord,
  ): Promise<RoundResult> {
    const raw = await this.invoke(operation, args);
    const out: RoundResult = {
      status: raw.status,
      taskId: args.taskId,
      mayEnd: raw.mayEnd === true,
    };
    if (raw.scopeKinds) out.scopeKinds = raw.scopeKinds;
    if (raw.actual)
      out.actual = Object.fromEntries(
        Object.entries(raw.actual).map(([kind, v]) => {
          const counts = v as BoundaryRecord;
          return [kind, { verified: counts.verified, unknown: counts.unknown }];
        }),
      );
    if (raw.gaps)
      out.gaps = raw.gaps.map((v: BoundaryRecord) => ({
        kind: v.kind,
        remaining: v.remaining,
        unknown: v.unknown,
      }));
    const issues = decisions(raw.decision);
    if (issues.length) out.decision = issues;
    if (raw.evidenceRef) out.evidenceRef = raw.evidenceRef;
    const d = diagnostic(raw.diagnostic);
    if (d) out.diagnostic = d;
    if (Array.isArray(raw.settlementErrors))
      out.settlementErrors = raw.settlementErrors
        .map(stableReason)
        .filter((v: string | undefined): v is string => v !== undefined);
    if (raw.reason)
      out.decision = [
        ...(out.decision ?? []),
        { reason: stableReason(raw.reason), status: "needsDecision" },
      ];
    if (raw.missing)
      out.decision = [...(out.decision ?? []), { missing: raw.missing }];
    if (raw.checkpoint)
      out.checkpoint = {
        taskId: args.taskId,
        executorId: raw.checkpoint.executorId,
        completed: raw.checkpoint.completed,
        resume: "runGrowthRound",
      };
    return out;
  }
  private async single(
    operation: string,
    args: BoundaryRecord,
    selector: (action: BoundaryRecord) => boolean,
  ): Promise<ActionResult> {
    const raw = await this.invoke(operation, args);
    let snapshot: BoundaryRecord;
    try {
      snapshot = await this.#store.load();
    } catch {
      return {
        status: "needsDecision",
        taskId: args.taskId,
        reason: "original-ledger-unavailable",
        evidenceRef: raw.evidenceRef,
      };
    }
    if (snapshot.state.batchId !== args.taskId)
      return {
        status: "needsDecision",
        taskId: args.taskId,
        reason: "original-task-id-required",
        evidenceRef: raw.evidenceRef,
      };
    const action = snapshot.state.actions?.find(selector) as
      BoundaryRecord | undefined;
    const issues = decisions(raw.decision);
    const issue =
      issues.find((d) => d.actionId === action?.id) ??
      issues.find((d) => !d.actionId);
    const unresolved = action && ["intent", "unknown"].includes(action.status);
    const status: ActionResult["status"] = unresolved
      ? "unknown"
      : raw.boundaryFailed
        ? "needsDecision"
        : issue?.status === "waiting" || raw.status === "waiting"
          ? "waiting"
          : raw.status === "needsCapability"
            ? "needsCapability"
            : action &&
                ["verified", "preexisting", "skipped"].includes(action.status)
              ? action.status
              : "needsDecision";
    const out: ActionResult = { status, taskId: args.taskId };
    if (action?.id) out.actionId = action.id;
    if (action?.publicId) {
      out.publicId = action.publicId;
      out.publicURL = `https://x.com/${action.accountHandle}/status/${action.publicId}`;
    }
    const evidenceRef = action?.resultEvidence ?? raw.evidenceRef;
    if (evidenceRef) out.evidenceRef = evidenceRef;
    const reason = stableReason(issue?.reason ?? raw.reason);
    if (reason) out.reason = reason;
    if (issue?.resumeAt) out.resumeAt = issue.resumeAt;
    const missing = issue?.missing ?? raw.missing;
    if (Array.isArray(missing) && missing.length) out.missing = missing;
    if (unresolved && !evidenceRef)
      out.missing = [
        ...new Set([...(out.missing ?? []), "result-proof-unavailable"]),
      ];
    const d = diagnostic(raw.diagnostic);
    if (d) out.diagnostic = d;
    return out;
  }
  public readCreator(args: import("./types.js").CreatorOptions) {
    return this.read("readCreator", args, args.mode);
  }
  public readBookmarks(args: import("./types.js").BookmarkOptions) {
    return this.read("readBookmarks", args, args.mode);
  }
  public searchSources(args: import("./types.js").SearchOptions) {
    return this.read("searchSources", args, args.mode);
  }
  public readPost({
    target,
    mode,
  }: {
    target: import("./types.js").PostTarget;
    mode?: ReadMode;
  }) {
    return this.read("readPost", target, mode);
  }
  public readPerson({
    target,
    mode,
  }: {
    target: import("./types.js").PersonTarget;
    mode?: ReadMode;
  }) {
    return this.read("readPerson", target, mode);
  }
  public readFeedback(args: import("./types.js").FeedbackOptions) {
    return this.read("readFeedback", args, args.mode);
  }
  public inspectAccount(args: { mode?: ReadMode } | undefined = {}) {
    return this.read("inspectAccount", args, args.mode);
  }
  public inspectRound(args: { taskId: string }) {
    return this.compactRound("inspectRound", args);
  }
  public runGrowthRound(args: import("./types.js").RoundOptions) {
    return this.compactRound("runGrowthRound", args);
  }
  public publishPost(args: import("./types.js").PublishOptions) {
    return this.single(
      "publishPost",
      args,
      (a) => a.kind === "original" && a.draftPath === args.draftPath,
    );
  }
  public replyToPost(args: import("./types.js").ReplyOptions) {
    return this.single(
      "replyToPost",
      args,
      (a) =>
        a.kind === "reply" && a.postId === args.postId && a.text === args.text,
    );
  }
  public followOne(args: { taskId: string; handle: string }) {
    return this.single(
      "followOne",
      args,
      (a) =>
        a.kind === "follow" &&
        a.handle?.toLowerCase() === args.handle.toLowerCase(),
    );
  }
  public verifySubmission(args: { taskId: string; actionId: string }) {
    return this.single("verifySubmission", args, (a) => a.id === args.actionId);
  }
  public verifyPublishedPost(args: {
    taskId: string;
    draftPath: string;
    publicURL: string;
    evidenceRef: import("./types.js").EvidenceRef;
    sourceLink?: import("./types.js").SourceLinkEvidence;
  }) {
    return this.single(
      "verifyPublishedPost",
      args,
      (a) => a.kind === "original" && a.draftPath === args.draftPath,
    );
  }
  public async followBatch(args: import("./types.js").FollowOptions) {
    const raw = await this.invoke("followBatch", args);
    const output: BatchResult = {
      status: raw.status ?? (raw.mayEnd ? "verified" : "needsDecision"),
      taskId: args.taskId,
      planned: raw.planned ?? args.handles.length,
      attempted: raw.attempted ?? 0,
      verified: raw.verifiedThisCall ?? 0,
      unknown: raw.unknownInBatch ?? 0,
      remaining: raw.remaining ?? args.handles.length,
      mayEnd: raw.mayEnd === true,
    };
    if (raw.batchId) output.batchId = raw.batchId;
    if (raw.evidenceRef) output.evidenceRef = raw.evidenceRef;
    const d = diagnostic(raw.diagnostic);
    if (d) output.diagnostic = d;
    const issues = decisions(raw.decision);
    if (raw.reason)
      issues.push({ reason: raw.reason, status: "needsDecision" });
    if (raw.missing) issues.push({ missing: raw.missing });
    if (issues.length) output.decision = issues;
    return output;
  }
  public async verifyFollow(args: {
    handle: string;
    url?: string;
    evidenceRef?: import("./types.js").EvidenceRef;
    mode?: "receipt" | "decision";
  }) {
    const raw = await this.invoke("verifyFollow", {
      ...args,
      mode: args.mode ?? "receipt",
    });
    const out = readResult("verifyFollow", raw, "receipt") as ReadResult & {
      handle: string;
      verified: boolean;
    };
    out.handle = args.handle;
    out.verified = raw.verified === true;
    if (args.mode === "decision" && raw.observation)
      out.person = readResult("readPerson", raw.observation, "decision").person;
    return out;
  }
}
export function createBusinessHarness(
  ...args: ConstructorParameters<typeof BusinessHarness>
): XGrowthHarness {
  return new BusinessHarness(...args);
}
