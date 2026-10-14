import type { RoundStore } from "./store.js";
import type {
  PostEvidence,
  ReadResult,
  ReplyDiscoveryOptions,
  ReplyDiscoveryResult,
  SearchOptions,
} from "./types.js";
import type { BoundaryRecord } from "./boundary.js";

/** Read-only discovery; shortlisted evidence still requires semantic review. */
export class ReplyDiscovery {
  constructor(
    private search: (args: SearchOptions) => Promise<ReadResult>,
    private store: RoundStore,
    private clock: () => number,
  ) {}
  private exclusion(state: BoundaryRecord, handles: string[]) {
    const authors = new Set(
      handles.map((h) => h.replace(/^@/, "").toLowerCase()),
    );
    const ids = new Set<string>();
    if (state.accountHandle) authors.add(state.accountHandle.toLowerCase());
    for (const a of [
      ...(state.actions ?? []),
      ...(state.replyAuthorHistory?.entries ?? []),
    ]) {
      if (a.kind !== "reply" || a.status === "skipped") continue;
      const author = a.author ?? a.conversation?.recipientHandle;
      if (author) authors.add(author.toLowerCase());
      if (a.postId) ids.add(a.postId);
    }
    return { authors, ids };
  }
  private rejection(
    p: PostEvidence,
    args: ReplyDiscoveryOptions,
    now: number,
  ): string | undefined {
    if (
      !p.id ||
      !p.author ||
      !p.url ||
      !p.body?.trim() ||
      p.needsExpansion ||
      p.missing?.length
    )
      return "incomplete-source";
    const time = Date.parse(p.datetime ?? "");
    if (
      !Number.isFinite(time) ||
      time > now ||
      now - time > (args.maxAgeHours ?? 12) * 3600000
    )
      return "source-time";
    if ((args.chineseOnly ?? true) && !/[\u3400-\u9fff]/u.test(p.body))
      return "source-language";
    const raw = p.metrics?.find((m) => /喜欢|点赞|likes?\b/i.test(m));
    const match = raw?.match(/([\d,]+(?:\.\d+)?)\s*([万千KM])?/i);
    const multiplier: Record<string, number> = {
      万: 10000,
      千: 1000,
      K: 1000,
      M: 1000000,
    };
    const likes = match
      ? Number(match[1].replaceAll(",", "")) *
        (multiplier[(match[2] ?? "").toUpperCase()] ?? 1)
      : NaN;
    if (!Number.isFinite(likes) || likes < (args.minLikes ?? 20))
      return "source-likes";
  }
  async run(args: ReplyDiscoveryOptions): Promise<ReplyDiscoveryResult> {
    const target = args.target ?? 20,
      maxWindows = args.maxWindows ?? 12;
    if (
      !args.queries?.length ||
      args.queries.length > 10 ||
      args.queries.some((q) => !q.trim()) ||
      !Number.isInteger(target) ||
      target < 1 ||
      target > 50 ||
      !Number.isInteger(maxWindows) ||
      maxWindows < 1 ||
      maxWindows > 30 ||
      !Number.isFinite(args.minLikes ?? 20) ||
      (args.minLikes ?? 20) < 0 ||
      !Number.isFinite(args.maxAgeHours ?? 12) ||
      (args.maxAgeHours ?? 12) <= 0
    ) {
      return {
        status: "needsDecision",
        reason: "discovery-options-invalid",
        candidates: [],
        examinedIds: [],
        windows: [],
        rejections: {},
        targetReached: false,
        pageComplete: false,
      };
    }
    const examined = new Set(args.processedIds ?? []),
      authors = new Set<string>();
    const candidates: ReplyDiscoveryResult["candidates"] = [],
      windows: ReplyDiscoveryResult["windows"] = [],
      rejections: Record<string, number> = {};
    const exhausted = new Set<string>();
    let reason: string | undefined;
    for (let i = 0; i < maxWindows && candidates.length < target; i++) {
      const now = this.clock(),
        hour = new Date(now + 8 * 3600000).getUTCHours();
      if (hour < 7) {
        reason = "night-platform-boundary";
        break;
      }
      const excluded = this.exclusion(
        (await this.store.load()).state,
        args.excludedHandles ?? [],
      );
      const available = args.queries.filter((q) => !exhausted.has(q));
      if (!available.length) break;
      const query = available[i % available.length];
      const request = {
        query,
        processedIds: [...examined, ...excluded.ids],
        limit: 5,
        maxPages: 10,
        mode: "decision" as const,
      };
      let read = await this.search(request);
      if (
        (read.reason === "source-page-unconfirmed" ||
          read.missing?.includes("source-page-unconfirmed")) &&
        new Date(this.clock() + 8 * 3600000).getUTCHours() >= 7
      )
        read = await this.search(request);
      windows.push({
        query,
        evidenceRef: read.evidenceRef,
        status: read.status,
        missing: read.missing ?? [],
        observed: read.sources?.length ?? 0,
      });
      if (
        read.status === "needsCapability" ||
        read.missing?.includes("platform-alert") ||
        read.reason === "night-platform-boundary"
      ) {
        reason = read.reason ?? "platform-alert";
        break;
      }
      if (
        !read.sources?.length &&
        read.missing?.includes("bounded-source-window-exhausted")
      )
        exhausted.add(query);
      for (const post of read.sources ?? []) {
        if (post.id && examined.has(post.id)) continue;
        if (post.id) examined.add(post.id);
        const author = post.author?.toLowerCase();
        const rejection =
          author && (excluded.authors.has(author) || authors.has(author))
            ? "author-history-or-duplicate"
            : post.id && excluded.ids.has(post.id)
              ? "target-history"
              : this.rejection(post, args, this.clock());
        if (rejection || !read.evidenceRef) {
          const key = rejection ?? "source-proof-missing";
          rejections[key] = (rejections[key] ?? 0) + 1;
          continue;
        }
        candidates.push({
          post,
          evidenceRef: read.evidenceRef,
          query,
          requiresReview: true,
        });
        authors.add(author!);
        if (candidates.length === target) break;
      }
    }
    const result: ReplyDiscoveryResult = {
      status: candidates.length >= target ? "observed" : "needsDecision",
      reason:
        reason ??
        (candidates.length < target ? "bounded-candidate-shortage" : undefined),
      candidates,
      examinedIds: [...examined],
      windows,
      rejections,
      targetReached: candidates.length >= target,
      pageComplete: false,
    };
    result.evidenceRef = await this.store.recordProof({
      operation: "discoverReplyCandidates",
      capturedAt: new Date(this.clock()).toISOString(),
      result,
    });
    return result;
  }
}
