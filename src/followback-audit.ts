import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { BoundaryRecord } from "./boundary.js";
import type { FollowbackAuditOptions, FollowbackAuditResult } from "./types.js";

/** Owns a read-only two-list observation, not an unfollow plan or account ledger. */
export class FollowbackAudit {
  #read: (args: BoundaryRecord) => Promise<BoundaryRecord>;
  #proof: (value: unknown) => Promise<string>;
  #clock: () => number;
  #evidenceExists: (ref: string) => boolean;
  #jobs = new Map<string, BoundaryRecord>();
  #running = false;
  constructor(
    read: (args: BoundaryRecord) => Promise<BoundaryRecord>,
    proof: (value: unknown) => Promise<string>,
    clock: () => number,
    evidenceExists: (ref: string) => boolean,
  ) {
    this.#read = read;
    this.#proof = proof;
    this.#clock = clock;
    this.#evidenceExists = evidenceExists;
  }
  private allowed(args: FollowbackAuditOptions) {
    const hour = new Date(this.#clock() + 8 * 3600000).getUTCHours();
    return (
      hour >= 7 ||
      (args.nightReadAuthorization?.userAuthorized === true &&
        this.#evidenceExists(args.nightReadAuthorization.evidenceRef) &&
        Number.isFinite(Date.parse(args.nightReadAuthorization.expiresAt)) &&
        this.#clock() < Date.parse(args.nightReadAuthorization.expiresAt))
    );
  }
  private validate(args: FollowbackAuditOptions) {
    const a = new URL(args.following.url),
      b = new URL(args.followers.url);
    const match = a.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/following\/?$/);
    if (
      !match ||
      !["x.com", "www.x.com"].includes(a.hostname) ||
      a.protocol !== "https:" ||
      b.origin !== a.origin ||
      b.pathname.toLowerCase().replace(/\/$/, "") !==
        `/${match[1].toLowerCase()}/followers` ||
      a.search ||
      b.search ||
      a.hash ||
      b.hash ||
      !args.following.evidenceRef ||
      !args.followers.evidenceRef
    )
      throw new Error("followback-own-unfiltered-list-targets-required");
    for (const target of [args.following, args.followers])
      if (
        target.expectedCount !== undefined &&
        (!Number.isSafeInteger(target.expectedCount) ||
          target.expectedCount < 0)
      )
        throw new Error("followback-exact-count-required");
    if (
      !Number.isInteger(args.maxWindows ?? 100) ||
      (args.maxWindows ?? 100) < 1 ||
      (args.maxWindows ?? 100) > 1000
    )
      throw new Error("followback-window-budget-invalid");
  }
  private job(args: FollowbackAuditOptions): BoundaryRecord {
    this.validate(args);
    const targets = { following: args.following, followers: args.followers };
    if (args.scanId) {
      let prior = this.#jobs.get(args.scanId);
      if (
        !prior &&
        args.resumeEvidenceRef &&
        this.#evidenceExists(args.resumeEvidenceRef)
      ) {
        const checkpoint = JSON.parse(
          readFileSync(args.resumeEvidenceRef, "utf8"),
        );
        if (
          checkpoint.schema !== "followback-audit/v1" ||
          checkpoint.scanId !== args.scanId
        )
          throw new Error("followback-checkpoint-invalid");
        for (const kind of ["following", "followers"]) {
          if (
            !checkpoint[kind]?.entries ||
            Object.values(checkpoint[kind].entries).some(
              (p: any) =>
                !/^[A-Za-z0-9_]{1,15}$/.test(p.handle ?? "") ||
                p.url?.toLowerCase() !==
                  `https://x.com/${p.handle.toLowerCase()}`,
            )
          )
            throw new Error("followback-checkpoint-invalid");
        }
        prior = checkpoint;
      }
      if (!prior || JSON.stringify(prior.targets) !== JSON.stringify(targets))
        throw new Error("followback-resume-mismatch");
      this.#jobs.set(args.scanId, prior);
      return prior;
    }
    const job: BoundaryRecord = {
      scanId: randomUUID(),
      targets,
      startedAt: new Date(this.#clock()).toISOString(),
      following: {
        entries: {},
        complete: false,
        advance: false,
        stalled: 0,
        gaps: [],
      },
      followers: {
        entries: {},
        complete: false,
        advance: false,
        stalled: 0,
        gaps: [],
      },
      windows: [],
    };
    this.#jobs.set(job.scanId, job);
    return job;
  }
  private async window(job: BoundaryRecord, kind: string) {
    const state = job[kind],
      target = job.targets[kind];
    const value = await this.#read({
      target,
      limit: 1000,
      offset: state.offset ?? 0,
      bulk: true,
      advance: state.advance,
      mode: "decision",
    });
    job.windows.push({
      kind,
      at: new Date(this.#clock()).toISOString(),
      evidenceRef: value.evidenceRef,
      status: value.status,
    });
    if (value.status !== "observed" || !value.complete || value.alerts?.length)
      return value.reason ?? value.status;
    const owner = new URL(target.url).pathname.split("/")[1];
    if (value.accountHandle?.toLowerCase() !== owner.toLowerCase())
      return "account-identity-unconfirmed";
    const before = Object.keys(state.entries).length;
    for (const person of value.people ?? []) {
      if (!person.handle || person.relationship === "unknown") {
        state.gaps.push({
          reason: "following-control-or-identity-unconfirmed",
          evidenceRef: value.evidenceRef,
        });
        continue;
      }
      if (kind === "following" && person.relationship !== "following") continue;
      if (
        kind === "followers" &&
        person.relationship !== "follows-you" &&
        !person.followsYou
      )
        continue;
      state.entries[person.handle.toLowerCase()] = {
        handle: person.handle,
        url: person.url,
        evidenceRef: value.evidenceRef,
      };
    }
    const count = Object.keys(state.entries).length;
    state.complete =
      target.expectedCount !== undefined &&
      count === target.expectedCount &&
      !state.gaps.length;
    state.stalled =
      count > before ? 0 : value.moreInDOM ? state.stalled : state.stalled + 1;
    state.offset = value.moreInDOM
      ? (value.offset ?? state.offset ?? 0) + (value.people?.length ?? 0)
      : 0;
    state.advance = !value.moreInDOM;
    if (state.complete) return null;
    if (target.expectedCount !== undefined && count > target.expectedCount)
      return "observed-count-changed";
    return state.stalled >= 2 && value.atDocumentEnd !== false
      ? "list-progress-stalled"
      : null;
  }
  private async result(
    job: BoundaryRecord,
    reason: string | null,
  ): Promise<FollowbackAuditResult> {
    const following = Object.values(job.following.entries) as BoundaryRecord[];
    const mutual = following.filter(
      (p) => job.followers.entries[p.handle.toLowerCase()],
    );
    const absent = following.filter(
      (p) => !job.followers.entries[p.handle.toLowerCase()],
    );
    const complete = job.following.complete && job.followers.complete;
    const nonFollowers = job.followers.complete ? absent : [];
    const provisional = job.followers.complete ? [] : absent;
    const notFollowedBack = job.following.complete
      ? Object.values(job.followers.entries).filter(
          (p: any) => !job.following.entries[p.handle.toLowerCase()],
        )
      : [];
    const observedAt = new Date(this.#clock()).toISOString();
    const evidenceRef = await this.#proof({
      schema: "followback-audit/v1",
      ...job,
      observedAt,
      complete,
      reason,
      mutual,
      nonFollowers,
      provisional,
      notFollowedBack,
    });
    return {
      status:
        reason === "night-window"
          ? "waiting"
          : complete
            ? "observed"
            : "needsDecision",
      scanId: job.scanId,
      complete,
      followingComplete: job.following.complete,
      followersComplete: job.followers.complete,
      followingCount: following.length,
      followersCount: Object.keys(job.followers.entries).length,
      mutualCount: mutual.length,
      notFollowedBackCount: notFollowedBack.length,
      nonFollowerCount: nonFollowers.length,
      provisionalCount: provisional.length,
      evidenceRef,
      startedAt: job.startedAt,
      observedAt,
      ...(reason ? { reason } : {}),
    };
  }
  public async run(
    args: FollowbackAuditOptions,
  ): Promise<FollowbackAuditResult> {
    if (this.#running) throw new Error("followback-audit-running");
    const job = this.job(args);
    this.#running = true;
    let reason: string | null = null;
    try {
      for (const kind of ["following", "followers"]) {
        job[kind].stalled = 0;
        for (
          let n = 0;
          n < (args.maxWindows ?? 100) && !job[kind].complete;
          n++
        ) {
          if (!this.allowed(args)) {
            reason = "night-window";
            break;
          }
          reason = await this.window(job, kind);
          if (reason) break;
        }
        if (reason || !job[kind].complete) {
          reason ??= "window-budget-exhausted";
          break;
        }
      }
      return await this.result(job, reason);
    } finally {
      this.#running = false;
    }
  }
}
