import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness } from "../dist/api.js";
const targets = {
  following: {
    url: "https://x.com/fixture_self/following",
    evidenceRef: "fixture:profile",
    expectedCount: 3,
  },
  followers: {
    url: "https://x.com/fixture_self/followers",
    evidenceRef: "fixture:profile",
    expectedCount: 2,
  },
};
function fixture({
  pages = {
    following: [
      ["alpha", "beta"],
      ["BETA", "gamma"],
    ],
    followers: [["beta", "delta"]],
  },
  clock = () => Date.parse("2026-10-14T00:00:00Z"),
  fail,
} = {}) {
  const calls = [],
    proofs = [];
  const position = { following: -1, followers: -1 };
  const platform = {
    preflight: () => ({ covered: true, missing: [] }),
    captureProof: async (x) => x,
    readPeople: async (q) => {
      calls.push(q);
      const kind = new URL(q.target.url).pathname.endsWith("/following")
        ? "following"
        : "followers";
      if (position[kind] < 0 || q.advance) position[kind]++;
      if (fail?.(q, calls.length))
        return { complete: false, alerts: ["fixture refusal"], people: [] };
      const page =
        pages[kind][Math.min(position[kind], pages[kind].length - 1)] ?? [];
      return {
        complete: true,
        accountHandle: "fixture_self",
        offset: q.offset ?? 0,
        moreInDOM: (q.offset ?? 0) + q.limit < page.length,
        people: page
          .slice(q.offset ?? 0, (q.offset ?? 0) + q.limit)
          .map((handle) => ({
            handle,
            url: "https://x.com/" + handle,
            relationship:
              kind === "followers" && handle === "delta"
                ? "follows-you"
                : "following",
            followsYou: true,
          })),
        page: q.target.url,
      };
    },
  };
  const store = {
    evidenceExists: () => true,
    recordProof: async (p) => {
      proofs.push(structuredClone(p));
      return "fixture:proof-" + proofs.length;
    },
  };
  return {
    x: createBusinessHarness({ platform, store, clock }),
    calls,
    proofs,
    platform,
    store,
  };
}
test("root bulk audit deduplicates virtual overlaps and stores the complete difference without profile calls", async () => {
  const f = fixture();
  const r = await f.x.readFollowbackAudit(targets);
  assert.equal(r.complete, true);
  assert.equal(r.nonFollowerCount, 2);
  assert.equal(r.mutualCount, 1);
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every((c) => c.limit === 1000 && c.bulk === true));
  assert.deepEqual(
    f.proofs.at(-1).nonFollowers.map((p) => p.handle),
    ["alpha", "gamma"],
  );
});
test("incomplete follower coverage is provisional; same-instance resume reaches the original counts", async () => {
  const f = fixture({
    pages: {
      following: [["alpha", "beta", "gamma"]],
      followers: [["beta"], ["delta"]],
    },
  });
  const r = await f.x.readFollowbackAudit({ ...targets, maxWindows: 1 });
  assert.equal(r.complete, false);
  assert.equal(r.nonFollowerCount, 0);
  assert.equal(r.provisionalCount, 2);
  const next = await f.x.readFollowbackAudit({
    ...targets,
    maxWindows: 2,
    scanId: r.scanId,
  });
  assert.equal(next.complete, true);
  assert.equal(next.nonFollowerCount, 2);
});
test("night has zero platform calls; explicit task-scoped read proof permits it and expires", async () => {
  const f = fixture({ clock: () => Date.parse("2026-10-13T16:10:00Z") });
  let r = await f.x.readFollowbackAudit(targets);
  assert.equal(r.status, "waiting");
  assert.equal(f.calls.length, 0);
  r = await f.x.readFollowbackAudit({
    ...targets,
    nightReadAuthorization: {
      userAuthorized: true,
      evidenceRef: "fixture:user",
      expiresAt: "2026-10-13T17:00:00Z",
    },
  });
  assert.equal(r.complete, true);
  const g = fixture({ clock: () => Date.parse("2026-10-13T17:00:00Z") });
  r = await g.x.readFollowbackAudit({
    ...targets,
    nightReadAuthorization: {
      userAuthorized: true,
      evidenceRef: "fixture:user",
      expiresAt: "2026-10-13T17:00:00Z",
    },
  });
  assert.equal(r.status, "waiting");
  assert.equal(g.calls.length, 0);
});
test("crossing midnight stops at next window and checkpoints collected following", async () => {
  let n = 0;
  const f = fixture({
    clock: () =>
      Date.parse(n++ < 3 ? "2026-10-13T15:59:59Z" : "2026-10-13T16:00:00Z"),
  });
  const r = await f.x.readFollowbackAudit(targets);
  assert.equal(r.reason, "night-window");
  assert.equal(r.complete, false);
  assert.ok(f.calls.length <= 1);
});
test("alerts stop, never produce negatives and retain the read proof", async () => {
  const f = fixture({ fail: (q) => q.target.url.endsWith("/followers") });
  const r = await f.x.readFollowbackAudit(targets);
  assert.equal(r.nonFollowerCount, 0);
  assert.equal(r.provisionalCount, 3);
  assert.equal(r.complete, false);
  assert.ok(r.evidenceRef);
});
test("stalled or count-less lists remain incomplete; no invented end-of-list", async () => {
  const f = fixture();
  const r = await f.x.readFollowbackAudit({
    following: { ...targets.following, expectedCount: undefined },
    followers: targets.followers,
  });
  assert.equal(r.complete, false);
  assert.equal(r.followersComplete, false);
  assert.equal(r.followingCount, 3);
  assert.ok(f.calls.length <= 6);
});
test("rejects verified followers subset, other-account targets, fractional counts and resume mismatch before reads", async () => {
  const f = fixture();
  for (const followers of [
    { ...targets.followers, url: "https://x.com/fixture_other/followers" },
    {
      ...targets.followers,
      url: "https://x.com/fixture_self/verified_followers",
    },
    { ...targets.followers, expectedCount: 2.3 },
  ])
    await assert.rejects(() =>
      f.x.readFollowbackAudit({ ...targets, followers }),
    );
  assert.equal(f.calls.length, 0);
  const r = await f.x.readFollowbackAudit({ ...targets, maxWindows: 1 });
  await assert.rejects(() =>
    f.x.readFollowbackAudit({
      ...targets,
      scanId: r.scanId,
      following: { ...targets.following, expectedCount: 4 },
    }),
  );
});
test("zero expected counts do not hide unexpected visible accounts", async () => {
  const f = fixture();
  const r = await f.x.readFollowbackAudit({
    following: { ...targets.following, expectedCount: 0 },
    followers: { ...targets.followers, expectedCount: 0 },
  });
  assert.equal(r.complete, false);
  assert.equal(r.reason, "observed-count-changed");
});

test("bulk reads remaining DOM offsets before advancing rather than repeating the first window", async () => {
  const names = Array.from({ length: 1100 }, (_, i) => "fixture" + i);
  const f = fixture({
    pages: { following: [names], followers: [["fixture0", "other"]] },
  });
  const r = await f.x.readFollowbackAudit({
    ...targets,
    following: { ...targets.following, expectedCount: 1100 },
  });
  assert.equal(r.complete, true);
  assert.equal(r.followingCount, 1100);
  assert.equal(f.calls[0].limit, 1000);
  assert.equal(f.calls[1].offset, 1000);
  assert.equal(f.calls[1].advance, false);
  assert.equal(r.nonFollowerCount, 1099);
});

test("new runtime resumes the saved immutable checkpoint on the retained list binding", async (t) => {
  const f = fixture({
    pages: {
      following: [["alpha", "beta", "gamma"]],
      followers: [["beta"], ["delta"]],
    },
  });
  const r = await f.x.readFollowbackAudit({ ...targets, maxWindows: 1 });
  const dir = mkdtempSync(join(tmpdir(), "followback-checkpoint-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "proof.json");
  writeFileSync(path, JSON.stringify(f.proofs.at(-1)));
  const next = createBusinessHarness({
    platform: f.platform,
    store: f.store,
    clock: () => Date.parse("2026-10-14T00:00:00Z"),
  });
  const resumed = await next.readFollowbackAudit({
    ...targets,
    scanId: r.scanId,
    resumeEvidenceRef: path,
    maxWindows: 2,
  });
  assert.equal(resumed.complete, true);
  assert.equal(resumed.nonFollowerCount, 2);
});

test("unchanged cells before the real document tail do not prematurely end the scan", async () => {
  const f = fixture({
    pages: {
      following: [["alpha"], ["alpha"], ["alpha"], ["beta"], ["gamma"]],
      followers: [["beta", "delta"]],
    },
  });
  const read = f.platform.readPeople;
  f.platform.readPeople = async (q) => ({
    ...(await read(q)),
    atDocumentEnd: false,
  });
  const r = await f.x.readFollowbackAudit(targets);
  assert.equal(r.complete, true);
  assert.equal(r.followingCount, 3);
});
test("recommendation cells without reciprocal evidence do not complete the follower count", async () => {
  const f = fixture({
    pages: {
      following: [["alpha", "beta", "gamma"]],
      followers: [["beta", "delta"]],
    },
  });
  const read = f.platform.readPeople;
  f.platform.readPeople = async (q) => {
    const r = await read(q);
    if (q.target.url.endsWith("/followers"))
      r.people = r.people.map((p) =>
        p.handle === "delta"
          ? { ...p, relationship: "not-following", followsYou: false }
          : p,
      );
    return r;
  };
  const r = await f.x.readFollowbackAudit(targets);
  assert.equal(r.complete, false);
  assert.equal(r.followersCount, 1);
  assert.equal(r.nonFollowerCount, 0);
  assert.equal(r.provisionalCount, 2);
});

test("positive followback candidates use exact controls without scanning the following list first", async () => {
  const f = fixture();
  const r = await f.x.readFollowbackAudit({
    ...targets,
    direction: "followback",
  });
  assert.equal(r.complete, true);
  assert.equal(r.direction, "followback");
  assert.equal(r.followingComplete, false);
  assert.equal(r.notFollowedBackCount, 1);
  assert.ok(f.calls.every((c) => c.target.url.endsWith("/followers")));
  assert.equal(f.proofs.at(-1).notFollowedBack[0].handle, "delta");
});

test("unfiltered scoped follower membership can prove the positive direction without a displayed badge", async () => {
  const f = fixture();
  const read = f.platform.readPeople;
  f.platform.readPeople = async (q) => {
    const r = await read(q);
    r.listBound = true;
    if (q.target.url.endsWith("/followers"))
      r.people = r.people.map((p) =>
        p.handle === "delta"
          ? { ...p, relationship: "not-following", followsYou: false }
          : p,
      );
    return r;
  };
  const r = await f.x.readFollowbackAudit({
    ...targets,
    direction: "followback",
  });
  assert.equal(r.complete, true);
  assert.equal(r.notFollowedBackCount, 1);
});

test("revised observed counters need new proof and retain the same audit history", async () => {
  const f = fixture({
    pages: {
      following: [["alpha", "beta", "gamma"]],
      followers: [["beta", "delta"]],
    },
  });
  const initial = await f.x.readFollowbackAudit({
    ...targets,
    followers: { ...targets.followers, expectedCount: 3 },
  });
  await assert.rejects(() =>
    f.x.readFollowbackAudit({ ...targets, scanId: initial.scanId }),
  );
  const r = await f.x.readFollowbackAudit({
    ...targets,
    scanId: initial.scanId,
    followers: {
      ...targets.followers,
      evidenceRef: "fixture:new-profile-counter",
    },
  });
  assert.equal(r.complete, true);
  assert.equal(f.proofs.at(-1).counterRevisions.length, 1);
});
