import test from "node:test";
import assert from "node:assert/strict";
import { FollowProfileBatch } from "../dist/follow-profile-batch.js";

const target = (h) => ({
  handle: h,
  url: `https://x.com/${h}`,
  evidenceRef: `source:${h}`,
});
const profile = (h, relationship, blue = true, counts = true) => ({
  status: "observed",
  fresh: true,
  evidenceRef: `profile:${h}`,
  person: {
    handle: h,
    relationship,
    blue,
    following: counts ? { value: 100 } : null,
    followers: { value: 90 },
  },
});
const window = { clock: () => Date.parse("2026-10-29T12:00:00+08:00") };

test("reads a bounded batch, skips already followed and duplicates, and retains individual evidence", async () => {
  const calls = [];
  const batch = new FollowProfileBatch(async (t) => {
    calls.push(t.handle);
    return profile(
      t.handle,
      t.handle === "Old"
        ? "following"
        : t.handle === "Back"
          ? "follows-you"
          : "not-following",
    );
  }, window);
  const r = await batch.run({
    targets: [
      target("New"),
      target("Old"),
      target("Back"),
      target("new"),
      target("Excluded"),
    ],
    requireBlue: true,
    excludedHandles: ["excluded"],
  });
  assert.equal(r.status, "observed");
  assert.deepEqual(calls, ["New", "Old", "Back"]);
  assert.deepEqual(
    r.candidates.map((x) => [x.handle, x.relationship, x.evidenceRef]),
    [
      ["New", "not-following", "profile:New"],
      ["Back", "follows-you", "profile:Back"],
    ],
  );
  assert.deepEqual(
    r.skipped.map((x) => x.reason),
    ["already-following", "duplicate", "excluded"],
  );
  assert.deepEqual(r.remaining, []);
  assert.equal(r.requiresReview, true);
});

test("a refused or unconfirmed read stops without consuming the failed target or later targets", async () => {
  const calls = [];
  const batch = new FollowProfileBatch(async (t) => {
    calls.push(t.handle);
    return t.handle === "B"
      ? {
          status: "needsDecision",
          fresh: false,
          evidenceRef: "failure:B",
          reason: "http429",
        }
      : profile(t.handle, "not-following");
  }, window);
  const r = await batch.run({
    targets: [target("A"), target("B"), target("C")],
  });
  assert.equal(r.status, "needsDecision");
  assert.equal(r.reason, "http429");
  assert.equal(r.failureEvidenceRef, "failure:B");
  assert.deepEqual(calls, ["A", "B"]);
  assert.deepEqual(
    r.remaining.map((t) => t.handle),
    ["B", "C"],
  );
  assert.deepEqual(
    r.candidates.map((x) => x.handle),
    ["A"],
  );
});

test("unconfirmed numbers and blue status never qualify", async () => {
  const batch = new FollowProfileBatch(
    async (t) =>
      profile(
        t.handle,
        "not-following",
        t.handle !== "NoBlue",
        t.handle !== "NoCount",
      ),
    window,
  );
  const r = await batch.run({
    targets: [target("NoBlue"), target("NoCount"), target("Yes")],
    requireBlue: true,
  });
  assert.deepEqual(
    r.candidates.map((x) => x.handle),
    ["Yes"],
  );
  assert.deepEqual(
    r.skipped.map((x) => x.reason),
    ["blue-unconfirmed", "counts-unconfirmed"],
  );
});

test("night boundary stops before a read unless the original executor authorizes it", async () => {
  let calls = 0;
  const early = { clock: () => Date.parse("2026-10-29T06:20:00+08:00") };
  let b = new FollowProfileBatch(async (t) => {
    calls++;
    return profile(t.handle, "not-following");
  }, early);
  let r = await b.run({ targets: [target("A")] });
  assert.equal(r.reason, "night-read-boundary");
  assert.equal(calls, 0);
  b = new FollowProfileBatch(
    async (t) => {
      calls++;
      return profile(t.handle, "not-following");
    },
    { ...early, authorizedEarlyRead: async () => true },
  );
  r = await b.run({ targets: [target("A")] });
  assert.equal(r.status, "observed");
  assert.equal(calls, 1);
});

test("invalid targets are rejected before any read", async () => {
  let calls = 0;
  const b = new FollowProfileBatch(async () => {
    calls++;
    return {};
  }, window);
  await assert.rejects(() =>
    b.run({
      targets: [
        { handle: "A", url: "https://example.com/A", evidenceRef: "source" },
      ],
    }),
  );
  assert.equal(calls, 0);
});

test("a thrown read preserves completed results and does not call later targets", async () => {
  const calls = [];
  const batch = new FollowProfileBatch(async (t) => {
    calls.push(t.handle);
    if (t.handle === "B") throw new Error("host failed");
    return profile(t.handle, "not-following");
  }, window);
  const r = await batch.run({
    targets: [target("A"), target("B"), target("C")],
  });
  assert.equal(r.status, "needsDecision");
  assert.equal(r.reason, "profile-read-failed");
  assert.deepEqual(calls, ["A", "B"]);
  assert.deepEqual(
    r.remaining.map((t) => t.handle),
    ["B", "C"],
  );
  assert.deepEqual(
    r.candidates.map((x) => x.handle),
    ["A"],
  );
});

test("root business API uses the injected clock and performs no routine state load", async (t) => {
  const { createBusinessHarness } = await import("../dist/diagnostics.js");
  const { fixture } = await import("./fixtures.mjs");
  const f = fixture(t);
  let loads = 0;
  const load = f.store.load.bind(f.store);
  f.store.load = async () => {
    loads++;
    return load();
  };
  const api = createBusinessHarness({
    platform: f.platform,
    store: f.store,
    clock: window.clock,
  });
  api.readPerson = async ({ target }) =>
    profile(target.handle, "not-following");
  const r = await api.readFollowCandidateProfiles({
    targets: [target("A"), target("B")],
  });
  assert.equal(r.status, "observed");
  assert.deepEqual(
    r.candidates.map((x) => x.handle),
    ["A", "B"],
  );
  assert.equal(loads, 0);
  assert.equal(f.writes.length, 0);
});

test("caller deadline stops before starting another profile read", async () => {
  let now = Date.parse("2026-10-29T22:59:59+08:00");
  const calls = [];
  const batch = new FollowProfileBatch(
    async (t) => {
      calls.push(t.handle);
      now += 2000;
      return profile(t.handle, "not-following");
    },
    { clock: () => now },
  );
  const r = await batch.run({
    targets: [target("A"), target("B")],
    stopAt: "2026-10-29T23:00:00+08:00",
  });
  assert.equal(r.reason, "caller-deadline");
  assert.deepEqual(calls, ["A"]);
  assert.deepEqual(
    r.remaining.map((t) => t.handle),
    ["B"],
  );
});
