import { readFileSync } from "node:fs";
import type { RoundStore } from "./store.js";
import type { BoundaryRecord } from "./boundary.js";
import type {
  CreatorHistoryOptions,
  CreatorHistoryResult,
  CreatorOptions,
  ReadResult,
} from "./types.js";

type HistoryCheckpoint = {
  schema: "creator-history/v1";
  handle: string;
  from: string;
  to: string;
  observedAt: string;
  windows: { evidenceRef: string; observedAt: string; count: number }[];
  ids: string[];
  scannedIds: string[];
  tailIds: string[];
  incompleteIds: string[];
  boundaryReached: boolean;
};

/** Profile pagination owns scope; original window proofs own content and times. */
export class CreatorHistory {
  #running = false;
  constructor(
    private read: (args: CreatorOptions) => Promise<ReadResult>,
    private store: RoundStore,
    private clock: () => number,
  ) {}
  private checkpoint(args: CreatorHistoryOptions): HistoryCheckpoint {
    const from = Date.parse(args.from),
      to = Date.parse(args.to ?? new Date(this.clock()).toISOString());
    if (
      !/^[A-Za-z0-9_]{1,15}$/.test(args.handle) ||
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from > to ||
      !Number.isInteger(args.maxWindows ?? 4) ||
      (args.maxWindows ?? 4) < 1 ||
      (args.maxWindows ?? 4) > 100
    )
      throw Error("creator-history-input-invalid");
    if (!args.resumeEvidenceRef)
      return {
        schema: "creator-history/v1",
        handle: args.handle,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        observedAt: new Date(this.clock()).toISOString(),
        windows: [],
        scannedIds: [],
        ids: [] as string[],
        tailIds: [] as string[],
        incompleteIds: [] as string[],
        boundaryReached: false,
      };
    if (!this.store.evidenceExists(args.resumeEvidenceRef))
      throw Error("creator-history-checkpoint-missing");
    const saved = JSON.parse(readFileSync(args.resumeEvidenceRef, "utf8"));
    if (
      saved.schema !== "creator-history/v1" ||
      (typeof saved.handle === "string" ? saved.handle : "").toLowerCase() !==
        args.handle.toLowerCase() ||
      saved.from !== new Date(from).toISOString() ||
      (args.to && saved.to !== new Date(to).toISOString()) ||
      !Array.isArray(saved.windows) ||
      !Array.isArray(saved.ids) ||
      !Array.isArray(saved.scannedIds) ||
      !Array.isArray(saved.tailIds) ||
      !Array.isArray(saved.incompleteIds) ||
      saved.windows.some(
        (w: BoundaryRecord) =>
          typeof w.evidenceRef !== "string" ||
          !this.store.evidenceExists(w.evidenceRef),
      )
    )
      throw Error("creator-history-checkpoint-scope-invalid");
    return saved as HistoryCheckpoint;
  }
  private mergeWindow(
    state: HistoryCheckpoint,
    rows: BoundaryRecord[],
    ids: Set<string>,
    incomplete: Set<string>,
  ) {
    const scanned = new Set(state.scannedIds);
    const before = scanned.size;
    for (const p of rows) {
      if (typeof p.id !== "string") continue;
      scanned.add(p.id);
      const at = Date.parse(p.datetime);
      if (
        !Number.isFinite(at) ||
        at < Date.parse(state.from) ||
        at > Date.parse(state.to)
      )
        continue;
      ids.add(p.id);
      if (p.needsExpansion || !p.body || p.missing?.length)
        incomplete.add(p.id);
      else incomplete.delete(p.id);
    }
    const times = rows.map((p: BoundaryRecord) => Date.parse(p.datetime));
    state.boundaryReached =
      times.length > 0 &&
      times.every(
        (at: number) => Number.isFinite(at) && at < Date.parse(state.from),
      );
    state.ids = [...ids];
    state.scannedIds = [...scanned];
    state.incompleteIds = [...incomplete];
    state.tailIds = rows.map((p: BoundaryRecord) => p.id);
    state.observedAt = new Date(this.clock()).toISOString();
    return scanned.size > before;
  }
  private failureReason(result: ReadResult) {
    return (
      result.diagnostic?.code ||
      result.reason ||
      "creator-history-window-unconfirmed"
    );
  }
  async run(args: CreatorHistoryOptions): Promise<CreatorHistoryResult> {
    if (this.#running)
      return {
        status: "needsDecision",
        complete: false,
        reason: "creator-history-already-running",
        count: 0,
        windowsRead: 0,
        evidenceRefs: [],
        incompleteCount: 0,
      };
    let state;
    try {
      state = this.checkpoint(args);
    } catch (error) {
      return {
        status: "needsDecision",
        complete: false,
        reason:
          error instanceof Error &&
          /^creator-history-[a-z-]+$/.test(error.message)
            ? error.message
            : "creator-history-checkpoint-invalid",
        count: 0,
        windowsRead: 0,
        evidenceRefs: [],
        incompleteCount: 0,
      };
    }
    this.#running = true;
    let evidenceRef = args.resumeEvidenceRef,
      reason = "window-budget",
      windowsRead = 0,
      failureEvidenceRef: string | undefined,
      diagnostic: CreatorHistoryResult["diagnostic"],
      status: CreatorHistoryResult["status"] = "partial";
    const evidenceRefs: string[] = [],
      ids = new Set<string>(state.ids),
      incomplete = new Set<string>(state.incompleteIds);
    try {
      for (
        let n = 0;
        n < (args.maxWindows ?? 4) && !state.boundaryReached;
        n++
      ) {
        const result = await this.read({
          handle: args.handle,
          target: 50,
          maxScrolls: 20,
          navigate: !args.resumeEvidenceRef && n === 0,
          expand: true,
          timeline: "posts",
          mode: "receipt",
        });
        windowsRead++;
        if (!result.evidenceRef || result.fresh === false) {
          reason = this.failureReason(result);
          failureEvidenceRef = result.evidenceRef;
          diagnostic = result.diagnostic;
          status = "needsDecision";
          break;
        }
        const proof = JSON.parse(readFileSync(result.evidenceRef, "utf8")),
          ob = proof.observation;
        if (
          !ob ||
          ob.fresh === false ||
          ob.needsStateCheck ||
          ob.alerts?.length ||
          !Array.isArray(ob.posts)
        ) {
          reason = "creator-history-window-unconfirmed";
          status = "needsDecision";
          break;
        }
        const rows = ob.posts.filter(
          (p: BoundaryRecord) =>
            p.author?.toLowerCase() === args.handle.toLowerCase(),
        );
        if (
          args.resumeEvidenceRef &&
          n === 0 &&
          !rows.some((p: BoundaryRecord) => state.tailIds.includes(p.id))
        ) {
          reason = "creator-history-cursor-moved";
          status = "needsDecision";
          break;
        }
        const advanced = this.mergeWindow(state, rows, ids, incomplete);
        state.windows.push({
          evidenceRef: result.evidenceRef,
          observedAt: ob.observedAt,
          count: rows.length,
        });
        evidenceRef = await this.store.recordProof(state);
        evidenceRefs.push(result.evidenceRef);
        const missing = ob.missing ?? [];
        if (
          result.status !== "observed" &&
          (!missing.length ||
            !missing.every((m: string) =>
              ["post-needs-expansion", "creator-target-not-reached"].includes(
                m,
              ),
            ))
        ) {
          status = "needsDecision";
          reason = "creator-history-window-incomplete";
          break;
        }
        if (!advanced && !state.boundaryReached && n > 0) {
          reason = "creator-history-stagnant";
          break;
        }
      }
      if (state.boundaryReached) {
        status = incomplete.size ? "partial" : "observed";
        reason = incomplete.size
          ? "creator-history-text-incomplete"
          : "date-boundary";
      }
      return {
        status,
        complete: state.boundaryReached && !incomplete.size,
        reason,
        count: ids.size,
        windowsRead,
        evidenceRefs,
        ...(evidenceRef ? { evidenceRef } : {}),
        ...(failureEvidenceRef ? { failureEvidenceRef } : {}),
        ...(diagnostic ? { diagnostic } : {}),
        incompleteCount: incomplete.size,
        boundaryReached: state.boundaryReached,
      };
    } catch {
      return {
        status: "needsDecision",
        complete: false,
        reason: "creator-history-read-interrupted",
        count: ids.size,
        windowsRead,
        evidenceRefs,
        ...(evidenceRef ? { evidenceRef } : {}),
        incompleteCount: incomplete.size,
        boundaryReached: state.boundaryReached,
      };
    } finally {
      this.#running = false;
    }
  }
}
