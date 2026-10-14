import test from "node:test";
import assert from "node:assert/strict";
import { ReplyDiscovery } from "../dist/reply-discovery.js";
import { fixture, NOW } from "./fixtures.mjs";
const post = (id, extra = {}) => ({
  id: String(id),
  author: `peer${id}`,
  url: `https://x.com/peer${id}/status/${id}`,
  datetime: new Date(NOW - 1000).toISOString(),
  body: "朋友们来串门，互关交朋友",
  metrics: ["25 喜欢次数。喜欢"],
  ...extra,
});
test("one call discovers ten authors across windows and retains full proof", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const d = new ReplyDiscovery(
    async (q) => {
      calls++;
      assert.equal(q.mode, "decision");
      return {
        status: "observed",
        evidenceRef: f.proof,
        sources: Array.from({ length: 5 }, (_, i) => post(calls * 10 + i)),
      };
    },
    f.store,
    () => NOW,
  );
  const r = await d.run({ queries: ["互关", "串门"], target: 10 });
  assert.equal(r.targetReached, true);
  assert.equal(calls, 2);
  assert.equal(r.candidates.length, 10);
  assert.ok(f.store.evidenceExists(r.evidenceRef));
  assert.equal(r.candidates[0].requiresReview, true);
});
test("original history, unknown targets, duplicate authors and incomplete gates", async (t) => {
  const f = fixture(t);
  await f.store.transaction(({ state }) => {
    state.actions.push({
      kind: "reply",
      status: "unknown",
      author: "peer1",
      postId: "1",
    });
    state.replyAuthorHistory = {
      entries: [{ kind: "reply", status: "verified", author: "peer2" }],
    };
    return state;
  });
  const sources = [
    post(1),
    post(2),
    post(3),
    post(4, { author: "peer3" }),
    post(5, { metrics: [] }),
    post(6, { datetime: null }),
    post(7, { needsExpansion: true }),
    post(8, { body: "hello" }),
    post(9, { datetime: new Date(NOW - 13 * 3600000).toISOString() }),
  ];
  const d = new ReplyDiscovery(
    async () => ({ status: "observed", evidenceRef: f.proof, sources }),
    f.store,
    () => NOW,
  );
  const r = await d.run({ queries: ["互关"], target: 10, maxWindows: 1 });
  assert.deepEqual(
    r.candidates.map((c) => c.post.id),
    ["3"],
  );
  assert.equal(r.reason, "bounded-candidate-shortage");
  assert.equal(r.rejections["author-history-or-duplicate"], 3);
  assert.equal(r.pageComplete, false);
});
test("cross-midnight stops before the next read and preserves partial proof", async (t) => {
  const f = fixture(t);
  let now = Date.parse("2026-10-14T15:59:59Z"),
    calls = 0;
  const d = new ReplyDiscovery(
    async () => {
      calls++;
      now += 2000;
      return { status: "observed", evidenceRef: f.proof, sources: [] };
    },
    f.store,
    () => now,
  );
  const r = await d.run({ queries: ["互关"], maxWindows: 3 });
  assert.equal(calls, 1);
  assert.equal(r.reason, "night-platform-boundary");
});
test("capability and alerts terminate without further probes", async (t) => {
  const f = fixture(t);
  for (const read of [
    { status: "needsCapability", reason: "unsupported" },
    { status: "needsDecision", missing: ["platform-alert"] },
  ]) {
    let calls = 0;
    const d = new ReplyDiscovery(
      async () => {
        calls++;
        return read;
      },
      f.store,
      () => NOW,
    );
    await d.run({ queries: ["互关"], maxWindows: 3 });
    assert.equal(calls, 1);
  }
});
test("invalid options do not touch the platform", async (t) => {
  const f = fixture(t);
  const d = new ReplyDiscovery(
    () => {
      throw Error("must not read");
    },
    f.store,
    () => NOW,
  );
  assert.equal(
    (await d.run({ queries: ["互关"], target: 100 })).reason,
    "discovery-options-invalid",
  );
});
test("missing readiness warning gets exactly one read-only retry", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const d = new ReplyDiscovery(
    async () =>
      ++calls === 1
        ? { status: "needsDecision", missing: ["source-page-unconfirmed"] }
        : { status: "observed", evidenceRef: f.proof, sources: [post(1)] },
    f.store,
    () => NOW,
  );
  const r = await d.run({ queries: ["互关"], target: 1, maxWindows: 1 });
  assert.equal(calls, 2);
  assert.equal(r.targetReached, true);
});

test("deep source windows and exhausted queries are owned by one batch call", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const d = new ReplyDiscovery(
    async (q) => {
      calls++;
      assert.equal(q.maxPages, 10);
      return {
        status: "needsDecision",
        missing: ["bounded-source-window-exhausted"],
        sources: [],
      };
    },
    f.store,
    () => NOW,
  );
  const r = await d.run({ queries: ["互关", "串门"], maxWindows: 9 });
  assert.equal(calls, 2);
  assert.equal(r.targetReached, false);
});
