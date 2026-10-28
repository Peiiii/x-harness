import { randomInt } from "node:crypto";
import type { RoundStore } from "./store.js";
import type { FollowPacing } from "./types.js";

/** Waits from the latest actual account attempt; chosen gaps survive batch resume. */
export class FollowBatchPacing {
  constructor(
    private store: RoundStore,
    private clock: () => number,
    private wait: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}
  static validate(pacing?: FollowPacing) {
    if (
      pacing &&
      (!Number.isSafeInteger(pacing.minGapMs) ||
        !Number.isSafeInteger(pacing.maxGapMs) ||
        pacing.minGapMs < 5000 ||
        pacing.maxGapMs > 30000 ||
        pacing.maxGapMs < pacing.minGapMs)
    )
      throw new Error("follow-pacing-range-invalid");
  }
  public async before(
    batchId: string,
    handle: string,
    pacing?: FollowPacing,
    deadline = Infinity,
  ) {
    if (!pacing) return;
    const snapshot = await this.store.transaction(({ state }) => {
      const next = structuredClone(state),
        batch = next.followBatches.find((b: any) => b.id === batchId);
      if (!batch) throw new Error("follow-pacing-batch-missing");
      if (
        batch.pacing &&
        JSON.stringify(batch.pacing) !== JSON.stringify(pacing)
      )
        throw new Error("follow-pacing-resume-mismatch");
      batch.pacing ??= pacing;
      batch.gaps ??= {};
      batch.gaps[handle.toLowerCase()] ??= {
        gapMs: randomInt(pacing.minGapMs, pacing.maxGapMs + 1),
      };
      return next;
    });
    const attempts = (snapshot.state.attempts ?? []).filter(
      (a: any) => a.kind === "follow" && Number.isFinite(Date.parse(a.at)),
    );
    const lastAt = Math.max(...attempts.map((a: any) => Date.parse(a.at)));
    if (!Number.isFinite(lastAt)) return;
    const batch = snapshot.state.followBatches.find(
      (b: any) => b.id === batchId,
    );
    const notBefore = lastAt + batch.gaps[handle.toLowerCase()].gapMs;
    const remaining = notBefore - this.clock();
    if (remaining > 0 && Date.now() + remaining > deadline) return false;
    if (remaining > 0) await this.wait(remaining);
    // The round owns fresh guards/claims/authorization after this wait, before intent.
  }
}
