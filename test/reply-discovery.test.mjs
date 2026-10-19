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
        missing: ["stable-rendered-tail", "bounded-source-window-exhausted"],
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
test("batch owns consecutive exact-query continuation, not repeated top searches", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const d = new ReplyDiscovery(
    async (q) => {
      assert.equal(q.query, "first");
      assert.equal(q.resume, calls > 0);
      calls++;
      return {
        status: "observed",
        evidenceRef: f.proof,
        sources: Array.from({ length: 5 }, (_, i) => post(calls * 10 + i)),
      };
    },
    f.store,
    () => NOW,
  );
  const r = await d.run({ queries: ["first", "second"], target: 10 });
  assert.equal(r.targetReached, true);
  assert.equal(calls, 2);
});

test("finite empty windows are continued and never mistaken for query exhaustion", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const d = new ReplyDiscovery(
    async (q) => {
      calls++;
      assert.equal(q.query, "first");
      return calls === 1
        ? {
            status: "needsDecision",
            missing: ["bounded-source-window-exhausted"],
            sources: [],
          }
        : { status: "observed", evidenceRef: f.proof, sources: [post(1)] };
    },
    f.store,
    () => NOW,
  );
  const r = await d.run({
    queries: ["first", "second"],
    target: 1,
    maxWindows: 2,
  });
  assert.equal(r.targetReached, true);
  assert.equal(calls, 2);
});

test("repeated empty incomplete windows yield to the next query", async (t) => {
  const f = fixture(t),
    requests = [];
  const d = new ReplyDiscovery(
    async (q) => {
      requests.push({ query: q.query, resume: q.resume });
      return q.query === "first"
        ? {
            status: "needsDecision",
            missing: [
              "incomplete-source:blocked",
              "bounded-source-window-exhausted",
            ],
            sources: [],
          }
        : { status: "observed", evidenceRef: f.proof, sources: [post(1)] };
    },
    f.store,
    () => NOW,
  );
  const r = await d.run({ queries: ["first", "second"], target: 1 });
  assert.deepEqual(requests, [
    { query: "first", resume: false },
    { query: "first", resume: true },
    { query: "second", resume: false },
  ]);
  assert.equal(r.targetReached, true);
  assert.equal(r.pageComplete, false);
});

test("repeated already examined cards cannot consume every query window", async (t) => {
  const f = fixture(t),
    queries = [];
  const d = new ReplyDiscovery(
    async (q) => {
      queries.push(q.query);
      return {
        status: "observed",
        evidenceRef: f.proof,
        sources: [post(q.query === "first" ? 1 : 2)],
      };
    },
    f.store,
    () => NOW,
  );
  const r = await d.run({ queries: ["first", "second"], target: 2 });
  assert.deepEqual(queries, ["first", "first", "first", "second"]);
  assert.deepEqual(
    r.candidates.map((c) => c.post.id),
    ["1", "2"],
  );
});

test("new examined cards reset the empty-window allowance even if rejected", async (t) => {
  const f = fixture(t);
  let calls = 0;
  const d = new ReplyDiscovery(
    async (q) => {
      assert.equal(q.query, "first");
      calls++;
      return {
        status: "observed",
        evidenceRef: f.proof,
        sources:
          calls % 2
            ? []
            : [
                post(
                  calls,
                  calls === 2 ? { metrics: ["1 喜欢次数。喜欢"] } : {},
                ),
              ],
      };
    },
    f.store,
    () => NOW,
  );
  const r = await d.run({ queries: ["first", "second"], target: 1 });
  assert.equal(calls, 4);
  assert.equal(r.targetReached, true);
});

test("06h discovery uses only its own valid reply permit and stops at midnight", async (t) => {
  const f = fixture(t);
  let calls = 0,
    now = Date.parse("2026-10-11T06:00:00+08:00");
  const executor = { id: "morning", scopeKinds: ["reply"] };
  const d = new ReplyDiscovery(
    async () => {
      calls++;
      return {
        status: "observed",
        evidenceRef: f.proof,
        sources: [post(9, { datetime: new Date(now - 1000).toISOString() })],
      };
    },
    f.store,
    () => now,
    executor,
  );
  assert.equal(
    (await d.run({ queries: ["互关"], target: 1 })).reason,
    "night-platform-boundary",
  );
  assert.equal(calls, 0);
  await f.store.transaction(({ state }) => {
    state.executions = {
      [executor.id]: {
        windowAuthorization: {
          kind: "reply",
          executorId: executor.id,
          userAuthorized: true,
          evidenceRef: f.proof,
          startsAt: "2026-10-11T06:00:00+08:00",
          expiresAt: "2026-10-12T00:00:00+08:00",
        },
      },
    };
    return state;
  });
  assert.equal(
    (await d.run({ queries: ["互关"], target: 1 })).targetReached,
    true,
  );
  assert.equal(calls, 1);
  now = Date.parse("2026-10-12T00:00:00+08:00");
  assert.equal(
    (await d.run({ queries: ["互关"], target: 1 })).reason,
    "night-platform-boundary",
  );
  assert.equal(calls, 1);
});

test("received history excludes the exact target but not a different root by its author", async (t) => {
  const f = fixture(t);
  await f.store.transaction(({ state }) => {
    state.actions = [
      {
        id: "received",
        kind: "reply",
        status: "unknown",
        postId: "1",
        author: "peer1",
        sourceCategory: "incoming",
      },
    ];
    state.replyAuthorHistory = {
      entries: [
        {
          id: "received",
          kind: "reply",
          status: "unknown",
          postId: "1",
          author: "peer1",
        },
        {
          id: "received-two",
          kind: "reply",
          status: "verified",
          author: "@PEER2",
          sourceCategory: "incoming-reply",
        },
        { id: "active", kind: "reply", status: "unknown", author: "peer3" },
      ],
    };
    return state;
  });
  const d = new ReplyDiscovery(
    async (q) => {
      assert.ok(q.processedIds.includes("1"));
      return {
        status: "observed",
        evidenceRef: f.proof,
        sources: [
          post(1),
          post(11, { author: "peer1" }),
          post(22, { author: "peer2" }),
          post(33, { author: "peer3" }),
        ],
      };
    },
    f.store,
    () => NOW,
  );
  const r = await d.run({ queries: ["mutual"], target: 5, maxWindows: 1 });
  assert.deepEqual(
    r.candidates.map((c) => c.post.id),
    ["11", "22"],
  );
});

test("anonymous received records remain separate and caller author exclusions still apply", async (t) => {
  const f = fixture(t);
  await f.store.transaction(({ state }) => {
    state.replyAuthorHistory = {
      entries: [
        {
          kind: "reply",
          status: "verified",
          author: "peer1",
          sourceCategory: "incoming",
        },
        { kind: "reply", status: "unknown", author: "@PEER2" },
      ],
    };
    return state;
  });
  const d = new ReplyDiscovery(
    async () => ({
      status: "observed",
      evidenceRef: f.proof,
      sources: [post(1), post(2)],
    }),
    f.store,
    () => NOW,
  );
  assert.deepEqual(
    (
      await d.run({ queries: ["mutual"], target: 5, maxWindows: 1 })
    ).candidates.map((c) => c.post.id),
    ["1"],
  );
  assert.deepEqual(
    (
      await d.run({
        queries: ["mutual"],
        target: 5,
        maxWindows: 1,
        excludedHandles: ["@peer1"],
      })
    ).candidates,
    [],
  );
});
