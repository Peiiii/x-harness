import { executorWindowAllowed } from "./growth-policy.js";
import type { RoundStore } from "./store.js";
import type { Executor } from "./types.js";
import type {
  FollowProfileBatchOptions,
  FollowProfileBatchResult,
  PersonTarget,
  ReadResult,
} from "./types.js";

export function followReadWindow(
  store: RoundStore,
  executor: Executor | undefined,
  clock: () => number,
) {
  return {
    clock,
    authorizedEarlyRead: async () =>
      executorWindowAllowed(
        (await store.load()).state,
        executor,
        "follow",
        clock(),
        (ref) => store.evidenceExists(ref),
      ),
  };
}

/** Read-only enrichment. A returned row is evidence, never follow approval. */
export class FollowProfileBatch {
  constructor(
    private read: (target: PersonTarget) => Promise<ReadResult>,
    private window: {
      clock: () => number;
      authorizedEarlyRead?: () => Promise<boolean>;
    } = { clock: Date.now },
  ) {}

  async run(
    args: FollowProfileBatchOptions,
  ): Promise<FollowProfileBatchResult> {
    if (
      !Array.isArray(args.targets) ||
      args.targets.length < 1 ||
      args.targets.length > 20
    )
      throw new Error("follow-profile-batch-target-count-invalid");
    for (const p of args.targets) {
      const url = new URL(p.url);
      if (
        !/^[A-Za-z0-9_]{1,15}$/.test(p.handle) ||
        !["x.com", "www.x.com"].includes(url.hostname) ||
        url.protocol !== "https:" ||
        url.pathname.toLowerCase() !== `/${p.handle.toLowerCase()}` ||
        url.search ||
        url.hash ||
        typeof p.evidenceRef !== "string" ||
        !p.evidenceRef
      )
        throw new Error("follow-profile-batch-target-invalid");
    }
    const stopAt =
      args.stopAt === undefined ? undefined : Date.parse(args.stopAt);
    if (stopAt !== undefined && !Number.isFinite(stopAt))
      throw new Error("follow-profile-batch-deadline-invalid");
    const excluded = new Set(
      (args.excludedHandles ?? []).map((h) => h.toLowerCase()),
    );
    const seen = new Set<string>();
    const results: FollowProfileBatchResult["candidates"] = [];
    const skipped: FollowProfileBatchResult["skipped"] = [];
    let next = 0;
    let failure: ReadResult | undefined;
    let reason: string | undefined;
    for (; next < args.targets.length; next++) {
      const p = args.targets[next],
        key = p.handle.toLowerCase();
      if (seen.has(key) || excluded.has(key)) {
        skipped.push({
          handle: p.handle,
          reason: seen.has(key) ? "duplicate" : "excluded",
        });
        continue;
      }
      seen.add(key);
      if (stopAt !== undefined && this.window.clock() >= stopAt) {
        reason = "caller-deadline";
        break;
      }
      if (
        new Date(this.window.clock() + 8 * 3600000).getUTCHours() < 7 &&
        !(await this.window.authorizedEarlyRead?.())
      ) {
        reason = "night-read-boundary";
        break;
      }
      let r: ReadResult;
      try {
        r = await this.read(p);
      } catch {
        reason = "profile-read-failed";
        break;
      }
      if (r.status !== "observed" || !r.fresh || !r.evidenceRef) {
        failure = r;
        reason = r.reason ?? "profile-unconfirmed";
        break;
      }
      const person = r.person;
      const skipReason =
        !person || person.handle?.toLowerCase() !== key
          ? "identity-unconfirmed"
          : person.relationship === "following"
            ? "already-following"
            : !["not-following", "follows-you"].includes(
                  person.relationship ?? "",
                )
              ? "relationship-unconfirmed"
              : args.requireBlue && person.blue !== true
                ? "blue-unconfirmed"
                : undefined;
      if (skipReason || !person) {
        skipped.push({
          handle: p.handle,
          reason: skipReason ?? "identity-unconfirmed",
          evidenceRef: r.evidenceRef,
        });
        continue;
      }
      if (
        ![person.following?.value, person.followers?.value].every(
          (v) => typeof v === "number" && Number.isFinite(v) && v >= 0,
        )
      ) {
        skipped.push({
          handle: p.handle,
          reason: "counts-unconfirmed",
          evidenceRef: r.evidenceRef,
        });
        continue;
      }
      results.push({ ...person, evidenceRef: r.evidenceRef });
    }
    return {
      status: failure || reason ? "needsDecision" : "observed",
      candidates: results,
      skipped,
      remaining: args.targets.slice(next),
      reason,
      diagnostic: failure?.diagnostic,
      failureEvidenceRef: failure?.evidenceRef,
      requiresReview: true,
    };
  }
}
