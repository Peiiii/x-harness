import type { PeopleOptions, PersonEvidence, ReadResult } from "./types.js";

function matchesTerm(biography: string, term: string) {
  const text = biography.toLowerCase();
  const word = term.toLowerCase().trim();
  if (!word) return false;
  if (!/^[a-z]+$/.test(word)) return text.includes(word);
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "i").test(text);
}

/** Bounded, read-only list discovery; returned rows require business review. */
export class FollowDiscovery {
  constructor(private read: (args: PeopleOptions) => Promise<ReadResult>) {}

  async run(args: {
    target: PeopleOptions["target"];
    maxWindows?: number;
    terms?: string[];
    requireBlue?: boolean;
    excludedHandles?: string[];
  }) {
    const max = args.maxWindows ?? 20;
    if (!Number.isInteger(max) || max < 1 || max > 100)
      throw new Error("follow-discovery-window-budget-invalid");
    const excluded = new Set(
      (args.excludedHandles ?? []).map((h) => h.toLowerCase()),
    );
    const seen = new Set<string>();
    const candidates: Array<PersonEvidence & { evidenceRef: string }> = [];
    const refs: string[] = [];
    let offset = 0,
      advance = false,
      stalled = 0,
      reason = "window-budget-exhausted";
    let failed: ReadResult | undefined;
    for (let i = 0; i < max; i++) {
      if (new Date(Date.now() + 8 * 3600000).getUTCHours() < 7) {
        reason = "night-read-boundary";
        break;
      }
      const r = await this.read({
        target: args.target,
        bulk: true,
        limit: 1000,
        reset: i === 0,
        advance,
        offset,
        mode: "decision",
      });
      if (r.status !== "observed" || !r.fresh || !r.evidenceRef) {
        reason = r.reason ?? "window-unconfirmed";
        failed = r;
        break;
      }
      refs.push(r.evidenceRef);
      let added = 0;
      for (const p of r.people ?? []) {
        const key = p.handle?.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        added++;
        if (
          p.relationship !== "not-following" ||
          excluded.has(key) ||
          (args.requireBlue && p.blue !== true) ||
          (args.terms?.length &&
            !args.terms.some((t) => matchesTerm(p.biography ?? "", t)))
        )
          continue;
        candidates.push({ ...p, evidenceRef: r.evidenceRef });
      }
      stalled = added ? 0 : stalled + 1;
      if (stalled >= 2) {
        reason = "list-progress-stalled";
        break;
      }
      offset = r.moreInDOM ? (r.offset ?? offset) + (r.people?.length ?? 0) : 0;
      advance = !r.moreInDOM;
    }
    return {
      status:
        failed || refs.length === 0
          ? ("needsDecision" as const)
          : ("observed" as const),
      diagnostic: failed?.diagnostic,
      failureEvidenceRef: failed?.evidenceRef,
      complete: false as const,
      reason,
      candidates,
      evidenceRefs: refs,
      observedPeople: seen.size,
      requiresReview: true as const,
    };
  }
}
