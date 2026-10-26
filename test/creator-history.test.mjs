import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CreatorHistory } from "../dist/creator-history.js";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";
const at = (h) => new Date(NOW + h * 3600000).toISOString();
const row = (id, h, extra = {}) => ({
  id,
  author: "source",
  datetime: at(h),
  primary: `/source/status/${id}`,
  body: `post ${id}`,
  needsExpansion: false,
  missing: [],
  ...extra,
});
async function setup(t, windows) {
  const f = fixture(t),
    calls = [];
  const reader = async (args) => {
    calls.push(args);
    const next = windows.shift();
    if (next instanceof Error) throw next;
    const ob = {
      observedAt: at(calls.length),
      posts: next,
      missing: next.some((p) => p.needsExpansion)
        ? ["post-needs-expansion"]
        : [],
    };
    return {
      status: ob.missing.length ? "needsDecision" : "observed",
      fresh: true,
      complete: !ob.missing.length,
      evidenceRef: await f.store.recordProof({ observation: ob }),
    };
  };
  return { f, calls, history: new CreatorHistory(reader, f.store, () => NOW) };
}
test("one call traverses overlapping windows, deduplicates and retains exact per-window observation times", async (t) => {
  const { history, calls } = await setup(t, [
    [row("1", -1), row("2", -2)],
    [row("2", -2), row("3", -3)],
    [row("4", -10)],
  ]);
  const r = await history.run({
    handle: "source",
    from: at(-5),
    maxWindows: 4,
  });
  assert.equal(r.status, "observed");
  assert.equal(r.count, 3);
  assert.equal(r.complete, true);
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((c) => c.navigate),
    [true, false, false],
  );
  const saved = JSON.parse(readFileSync(r.evidenceRef));
  assert.deepEqual(saved.ids, ["1", "2", "3"]);
  assert.deepEqual(
    saved.windows.map((w) => w.observedAt),
    [at(1), at(2), at(3)],
  );
  assert.equal("sources" in r, false);
});
test("budget checkpoint resumes same live cursor and counts only new IDs", async (t) => {
  const { history } = await setup(t, [
    [row("1", -1), row("2", -2)],
    [row("2", -2), row("3", -3)],
    [row("4", -10)],
  ]);
  const first = await history.run({
    handle: "source",
    from: at(-5),
    maxWindows: 1,
  });
  assert.equal(first.reason, "window-budget");
  const second = await history.run({
    handle: "source",
    from: at(-5),
    maxWindows: 2,
    resumeEvidenceRef: first.evidenceRef,
  });
  assert.equal(second.count, 3);
  assert.equal(second.complete, true);
});
test("moved viewport and mismatched range refuse continuation without losing saved result", async (t) => {
  const { history, calls } = await setup(t, [[row("1", -1)], [row("9", -3)]]);
  const first = await history.run({
    handle: "source",
    from: at(-5),
    maxWindows: 1,
  });
  const bad = await history.run({
    handle: "source",
    from: at(-6),
    resumeEvidenceRef: first.evidenceRef,
  });
  assert.equal(bad.status, "needsDecision");
  assert.equal(calls.length, 1);
  const moved = await history.run({
    handle: "source",
    from: at(-5),
    resumeEvidenceRef: first.evidenceRef,
  });
  assert.equal(moved.reason, "creator-history-cursor-moved");
  assert.equal(moved.evidenceRef, first.evidenceRef);
  assert.equal(moved.count, 1);
});
test("a text expansion gap preserves other complete rows and date coverage without claiming completeness", async (t) => {
  const { history } = await setup(t, [
    [row("1", -1, { needsExpansion: true }), row("2", -2)],
    [row("3", -10)],
  ]);
  const r = await history.run({ handle: "source", from: at(-5) });
  assert.equal(r.boundaryReached, true);
  assert.equal(r.complete, false);
  assert.equal(r.incompleteCount, 1);
  assert.equal(r.count, 2);
  assert.equal(r.evidenceRefs.length, 2);
});
test("a historical upper bound does not mistake newer out-of-range posts for stagnation", async (t) => {
  const { history } = await setup(t, [
    [row("1", -1)],
    [row("2", -2)],
    [row("3", -4)],
    [row("4", -10)],
  ]);
  const r = await history.run({
    handle: "source",
    from: at(-5),
    to: at(-3),
    maxWindows: 4,
  });
  assert.equal(r.count, 1);
  assert.equal(r.complete, true);
});
test("transport interruption preserves the last durable checkpoint and completed proof references", async (t) => {
  const { history } = await setup(t, [
    [row("1", -1)],
    new Error("host timeout"),
  ]);
  const r = await history.run({ handle: "source", from: at(-5) });
  assert.equal(r.status, "needsDecision");
  assert.equal(r.count, 1);
  assert.ok(r.evidenceRef);
  assert.equal(r.evidenceRefs.length, 1);
  assert.equal(JSON.parse(readFileSync(r.evidenceRef)).windows.length, 1);
});
test("public root exposes the bounded capability and validates before browser IO", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const api = createBusinessHarness({
    store: f.store,
    platform: {
      preflight: () => {
        calls++;
        return { covered: true };
      },
    },
    clock: () => NOW,
  });
  assert.equal(typeof api.readCreatorHistory, "function");
  const r = await api.readCreatorHistory({ handle: "source", from: "invalid" });
  assert.equal(r.status, "needsDecision");
  assert.equal(calls, 0);
});
