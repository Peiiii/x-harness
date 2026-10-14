import { sameHandle, samePublishedText } from "./platform-rules.js";
import { FollowbackAudit } from "./followback-audit.js";
import { IncomingReactions } from "./incoming-reactions.js";
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
  #reactions!: IncomingReactions;
  #followbackAudit: FollowbackAudit;
  #platform!: BusinessDependencies["platform"];
  #store!: BusinessDependencies["store"];
  #core!: ReturnType<typeof createGrowthHarness>;
  #readCache!: Map<string, string>;
  #clock!: () => number;
  constructor(dependencies: BusinessDependencies) {
    this.readFollowbackAudit = this.readFollowbackAudit.bind(this);
    this.replyBatch = this.replyBatch.bind(this);
    this.likeIncomingBatch = this.likeIncomingBatch.bind(this);
    this.#reactions = new IncomingReactions(dependencies);
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
    this.readPeople = this.readPeople.bind(this);
    this.readPost = this.readPost.bind(this);
    this.readIncomingConversations = this.readIncomingConversations.bind(this);
    this.readIncomingReplies = this.readIncomingReplies.bind(this);
    this.searchSources = this.searchSources.bind(this);
    this.readExploreRecommendations =
      this.readExploreRecommendations.bind(this);
    this.readBookmarks = this.readBookmarks.bind(this);
    this.readCreator = this.readCreator.bind(this);
    const { store, platform } = dependencies;
    this.#clock = dependencies.clock ?? Date.now;
    this.#platform = platform;
    this.#store = store;
    this.#core = createGrowthHarness(dependencies);
    this.#followbackAudit = new FollowbackAudit(
      (args) => this.#core.readPeople(args),
      (value) => store.recordProof(value),
      this.#clock,
      (ref) => store.evidenceExists(ref),
    );
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
      output.people ??
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
    if (output.people) output.people = changed as PersonEvidence[];
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
  public async replyBatch(args: {
    taskId: string;
    actions: import("./types.js").PreparedAction[];
  }) {
    if (
      !Array.isArray(args.actions) ||
      args.actions.length < 1 ||
      args.actions.length > 5 ||
      args.actions.some((a) => a.kind !== "reply")
    )
      return {
        status: "needsDecision" as const,
        results: [],
        reason: "reply-batch-invalid",
      };
    const results: ActionResult[] = [];
    for (const action of args.actions) {
      if (action.kind !== "reply") continue;
      let result = await this.replyToPost({
        taskId: args.taskId,
        postId: action.postId,
        text: action.text,
        preparedAction: action,
      });
      if (
        result.status === "waiting" &&
        result.reason === "incoming-interaction-pacing" &&
        result.resumeAt
      ) {
        const delay = Date.parse(result.resumeAt) - this.#clock();
        if (Number.isFinite(delay) && delay <= 30000) {
          if (delay > 0)
            await new Promise((resolve) => setTimeout(resolve, delay));
          result = await this.replyToPost({
            taskId: args.taskId,
            postId: action.postId,
            text: action.text,
            preparedAction: action,
          });
        }
      }
      if (result.status === "unknown") {
        const current = (await this.#store.load()).state.actions.find(
          (a: BoundaryRecord) => a.id === action.id,
        );
        if (current?.observedPublicURL && current?.observedPublicEvidenceRef)
          result = await this.verifySubmission({
            taskId: args.taskId,
            actionId: action.id,
          });
      }
      results.push(result);
      if (
        ["waiting", "needsCapability", "needsDecision"].includes(result.status)
      )
        break;
    }
    await this.recoverBatchReplyLinks(args.taskId, results);
    return {
      status:
        results.length === args.actions.length &&
        results.every((r) => ["verified", "preexisting"].includes(r.status))
          ? ("verified" as const)
          : ("needsDecision" as const),
      results,
    };
  }
  private async recoverBatchReplyLinks(
    taskId: string,
    results: ActionResult[],
  ) {
    const snapshot = await this.#store.load();
    if (snapshot.state.batchId !== taskId) return;
    const pending = results
      .filter((r) => r.status === "unknown")
      .map((r) =>
        snapshot.state.actions.find((a: BoundaryRecord) => a.id === r.actionId),
      )
      .filter(
        (a: BoundaryRecord | undefined) =>
          a?.kind === "reply" &&
          ["unknown", "intent"].includes(a.status) &&
          !a.observedPublicURL &&
          typeof a.text === "string" &&
          a.text.trim() &&
          /^[A-Za-z0-9_]{1,15}$/.test(a.accountHandle ?? "") &&
          Number.isFinite(Date.parse(a.intentAt)),
      ) as BoundaryRecord[];
    if (
      !pending.length ||
      !pending.every((a) =>
        sameHandle(a.accountHandle, pending[0].accountHandle),
      )
    )
      return;
    const phrases = pending
      .map((a) => '"' + a.text.slice(0, 80).replace(/["\\]/g, " ") + '"')
      .join(" OR ");
    const query = `from:${pending[0].accountHandle} (${phrases}) since:${new Date(Math.min(...pending.map((a) => Date.parse(a.intentAt)))).toISOString().slice(0, 10)}`;
    let found = await this.searchSources({
      query,
      limit: 5,
      maxPages: 1,
      mode: "decision",
    });
    if (
      !found.sources?.length &&
      found.missing?.includes("source-page-unconfirmed")
    )
      found = await this.searchSources({
        query,
        limit: 5,
        maxPages: 1,
        mode: "decision",
      });
    if (!found.fresh || !found.evidenceRef) return;
    for (const action of pending) {
      const matches = (found.sources ?? []).filter(
        (p) =>
          sameHandle(p.author, action.accountHandle) &&
          samePublishedText(p.body, action.text) &&
          /^\d+$/.test(p.id ?? "") &&
          !p.needsExpansion &&
          p.url?.toLowerCase() ===
            `https://x.com/${action.accountHandle}/status/${p.id}`.toLowerCase() &&
          !(action.beforeIds ?? []).includes(p.id) &&
          Date.parse(p.datetime ?? "") >= Date.parse(action.intentAt) &&
          Date.parse(p.datetime ?? "") <= this.#clock() + 5000,
      );
      if (matches.length !== 1) continue;
      let bound = false;
      await this.#store.transaction(({ state }) => {
        const current = state.actions.find(
          (a: BoundaryRecord) => a.id === action.id,
        );
        if (
          state.batchId === taskId &&
          current?.status === "unknown" &&
          current.intentAt === action.intentAt &&
          current.postId === action.postId &&
          current.text === action.text &&
          !current.observedPublicURL &&
          !current.claim
        ) {
          current.observedPublicURL = matches[0].url;
          current.observedPublicEvidenceRef = found.evidenceRef;
          bound = true;
        }
        return state;
      });
      if (bound) {
        const recovered = await this.verifySubmission({
          taskId,
          actionId: action.id,
        });
        const index = results.findIndex((r) => r.actionId === action.id);
        if (index >= 0) results[index] = recovered;
      }
    }
  }
  public likeIncomingBatch(args: import("./types.js").IncomingLikeOptions) {
    return this.#reactions.run(args);
  }
  public readCreator(args: import("./types.js").CreatorOptions) {
    return this.read("readCreator", args, args.mode);
  }
  public readBookmarks(args: import("./types.js").BookmarkOptions) {
    return this.read("readBookmarks", args, args.mode);
  }
  public async readIncomingReplies(
    args: import("./types.js").IncomingReplyOptions = {},
  ) {
    const snapshot = await this.#store.load();
    const handle = snapshot.state.accountHandle;
    if (!/^[A-Za-z0-9_]{1,15}$/.test(handle ?? ""))
      return {
        status: "needsDecision" as const,
        complete: false,
        reason: "account-identity-required",
      };
    const processedIds = new Set(args.processedIds ?? []);
    for (const action of snapshot.state.actions ?? []) {
      if (
        action.kind === "reply" &&
        ["verified", "preexisting", "intent", "unknown"].includes(action.status)
      )
        processedIds.add(action.postId);
    }
    return this.read(
      "searchSources",
      {
        query: `to:${handle} filter:replies -from:${handle}`,
        limit: args.limit ?? 5,
        maxPages: args.maxPages ?? 3,
        processedIds: [...processedIds],
      },
      args.mode,
    );
  }
  public async readIncomingConversations(
    args: import("./types.js").IncomingConversationOptions = {},
  ) {
    // Check the entire deterministic read path before any navigation.
    const operations = args.targets
      ? ["readPost"]
      : ["searchSources", "readPost"];
    const capabilities = operations.map((operation) => {
      const cap = this.#platform.preflight({
        operation: operation === "readPost" ? "read" : operation,
      });
      return {
        ...cap,
        covered: cap.covered && typeof this.#platform[operation] === "function",
        missing: [
          ...(cap.missing ?? []),
          ...(typeof this.#platform[operation] === "function"
            ? []
            : [`platform.${operation}`]),
        ],
      };
    });
    const missing = [
      ...new Set(capabilities.flatMap((c) => c.missing ?? [])),
    ] as string[];
    if (capabilities.some((c) => !c.covered))
      return {
        status: "needsCapability" as const,
        reason: "incoming-capability-missing",
        missing,
        conversations: [],
        pageComplete: false as const,
      };
    const inbox = args.targets
      ? undefined
      : await this.readIncomingReplies({ ...args, mode: "decision" });
    if (
      inbox &&
      (inbox.status === "needsCapability" ||
        inbox.diagnostic ||
        !inbox.sources?.length ||
        inbox.missing?.some((m) =>
          [
            "platform-alert",
            "search-query-unconfirmed",
            "source-page-unconfirmed",
          ].includes(m),
        ))
    )
      return {
        status:
          inbox.status === "needsCapability"
            ? ("needsCapability" as const)
            : ("needsDecision" as const),
        reason: inbox.reason ?? "incoming-source-incomplete",
        missing: inbox.missing,
        evidenceRef: inbox.evidenceRef,
        diagnostic: inbox.diagnostic,
        conversations: [],
        pageComplete: false as const,
      };
    const targets =
      args.targets ??
      inbox?.sources?.map((p) => ({
        postId: p.id!,
        url: p.url!,
        expand: true,
        evidenceRef: inbox.evidenceRef!,
      }));
    if (!targets || !targets.length || targets.length > 5)
      return {
        status: "needsDecision" as const,
        reason: "incoming-target-window-required",
        conversations: [],
        pageComplete: false as const,
      };
    const snapshot = await this.#store.load();
    const conversations = [];
    for (const target of targets) {
      const readArgs = {
        target: { ...target, ancestorHandle: snapshot.state.accountHandle },
        includeContext: true,
        includeThread: true,
        mode: "decision" as const,
      };
      let read = await this.readPost(readArgs);
      const hasOwnedAncestor = () =>
        (read.context ?? []).some(
          (p) =>
            p.id !== target.postId &&
            p.author?.toLowerCase() ===
              snapshot.state.accountHandle?.toLowerCase(),
        );
      // A cold reply page can render the target before its ancestors. Reobserve
      // once through the same business read; never approve a target-only chain.
      if (
        read.complete === true &&
        !hasOwnedAncestor() &&
        !read.missing?.includes("platform-alert") &&
        !read.missing?.includes("incoming-ancestor-wait-exhausted")
      )
        read = await this.readPost(readArgs);
      if (!hasOwnedAncestor()) {
        read.complete = false;
        read.missing = [
          ...new Set([...(read.missing ?? []), "incoming-ancestor-missing"]),
        ];
      }
      const nodes = read.threadPosts ?? read.context ?? [];
      const rootCandidateId = read.context?.[0]?.id ?? null;
      const attempts = (snapshot.state.actions ?? [])
        .filter(
          (a: BoundaryRecord) =>
            a.kind === "reply" &&
            (a.postId === target.postId ||
              (a.conversation?.rootId === rootCandidateId &&
                a.conversation?.recipientHandle?.toLowerCase() ===
                  read.post?.author?.toLowerCase())),
        )
        .map((a: BoundaryRecord) => ({
          id: a.id,
          status: a.status,
          postId: a.postId,
          publicId: a.publicId,
          round: a.conversation?.round,
        }));
      conversations.push({
        targetId: target.postId,
        post: read.post,
        ancestorPath: read.context ?? [],
        nodes,
        edges: nodes
          .filter((p) => p.id && p.replyToId)
          .map((p) => ({ parentId: p.replyToId!, childId: p.id! })),
        unconfirmedParentIds: nodes
          .filter((p) => p.id !== rootCandidateId && !p.replyToId)
          .map((p) => p.id!),
        rootCandidateId,
        attempts,
        evidenceRef: read.evidenceRef,
        complete: read.complete === true,
        missing: read.missing ?? [],
        pageComplete: false as const,
      });
      if (
        read.missing?.includes("platform-alert") ||
        read.status === "needsCapability"
      )
        break;
    }
    return {
      status:
        conversations.length === targets.length &&
        conversations.every((c) => c.complete)
          ? ("observed" as const)
          : ("needsDecision" as const),
      conversations,
      ...(inbox
        ? { sourceComplete: inbox.complete === true, missing: inbox.missing }
        : {}),
      pageComplete: false as const,
    };
  }
  public searchSources(args: import("./types.js").SearchOptions) {
    return this.read("searchSources", args, args.mode);
  }
  public readExploreRecommendations(
    args: import("./types.js").ExploreRecommendationOptions = {},
  ) {
    return this.read("readExploreRecommendations", args, args.mode);
  }
  public readPost({
    target,
    mode,
    includeContext,
    includeThread,
    resolveQuote,
  }: {
    includeContext?: boolean;
    includeThread?: boolean;
    resolveQuote?: boolean;
    target: import("./types.js").PostTarget;
    mode?: ReadMode;
  }) {
    return this.read(
      "readPost",
      { ...target, includeContext, includeThread, resolveQuote },
      mode,
    );
  }
  public readFollowbackAudit(
    args: import("./types.js").FollowbackAuditOptions,
  ) {
    return this.#followbackAudit.run(args);
  }
  public readPeople(args: import("./types.js").PeopleOptions) {
    return this.read("readPeople", args, args.mode);
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
    sourceLinks?: import("./types.js").SourceLinkEvidence[];
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
