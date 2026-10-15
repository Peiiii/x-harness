import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness, createXPlatform } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

test("cold incoming page reobserves once and never approves a target-only conversation", async (t) => {
  for (const recover of [true, false]) {
    const f = fixture(t);
    let reads = 0;
    const api = createBusinessHarness({
      store: f.store,
      platform: {
        preflight: () => ({ covered: true }),
        captureProof: ({ observation }) => ({ observation }),
        readPost: async () => {
          reads++;
          const comment = {
            id: "2",
            author: "Reader",
            body: "Next reply",
            datetime: new Date(NOW).toISOString(),
          };
          const context =
            recover && reads === 2
              ? [
                  {
                    id: "1",
                    author: "Pei",
                    body: "Our previous reply",
                    datetime: new Date(NOW).toISOString(),
                  },
                  comment,
                ]
              : [comment];
          return {
            complete: true,
            context,
            threadPosts: context,
            posts: [comment],
            page: "https://x.com/Reader/status/2",
            missing: [],
          };
        },
      },
    });
    const out = await api.readIncomingConversations({
      targets: [
        {
          postId: "2",
          url: "https://x.com/Reader/status/2",
          evidenceRef: f.proof,
        },
      ],
    });
    assert.equal(reads, 2);
    assert.equal(out.conversations[0].complete, recover);
    assert.equal(out.status, recover ? "observed" : "needsDecision");
    assert.equal(
      out.conversations[0].missing.includes("incoming-ancestor-missing"),
      !recover,
    );
  }
});

test("batch preserves full observed chains, marks unknown edges and continues incomplete objects", async (t) => {
  const f = fixture(t);
  let reads = 0;
  const api = createBusinessHarness({
    store: f.store,
    platform: {
      preflight: () => ({ covered: true }),
      captureProof: ({ observation }) => ({ observation }),
      readPost: async (a) => {
        reads++;
        assert.equal(a.includeThread, true);
        const context = [
          {
            id: "1",
            author: "Pei",
            body: "Root",
            datetime: new Date(NOW).toISOString(),
          },
          {
            id: a.postId,
            author: "Reader",
            body: "The entire received comment",
            datetime: new Date(NOW).toISOString(),
            replyToId: "1",
          },
        ];
        return {
          complete: a.postId !== "2",
          context,
          threadPosts: [...context, { id: "4", body: "Unconfirmed branch" }],
          posts: [context[1]],
          page: "https://x.com/Reader/status/" + a.postId,
          missing: a.postId === "2" ? ["conversation-context-incomplete"] : [],
        };
      },
    },
  });
  const out = await api.readIncomingConversations({
    targets: ["2", "3"].map((postId) => ({
      postId,
      url: "https://x.com/Reader/status/" + postId,
      evidenceRef: f.proof,
      expand: true,
    })),
  });
  assert.equal(reads, 2);
  assert.equal(out.status, "needsDecision");
  assert.equal(out.conversations[1].post.body, "The entire received comment");
  assert.deepEqual(out.conversations[1].edges, [
    { parentId: "1", childId: "3" },
  ]);
  assert.deepEqual(out.conversations[1].unconfirmedParentIds, ["4"]);
  assert.equal(out.pageComplete, false);
});

test("likes persist a single intent, freeze uncertain click, enforce pacing and never toggle existing likes", async (t) => {
  const f = fixture(t);
  await f.store.transaction((s) => {
    s.state.actions.find((a) => a.kind === "reply").intentAt = new Date(
      NOW,
    ).toISOString();
    return s.state;
  });
  let now = NOW,
    clicks = 0,
    preexisting = false;
  const api = createBusinessHarness({
    store: f.store,
    clock: () => now,
    platform: {
      preflight: () => ({ covered: true }),
      captureProof: ({ observation }) => ({ observation }),
      readAccount: async () => ({ accountHandle: "Pei" }),
      readPost: async () => ({ complete: true, context: [{ author: "Pei" }] }),
      likePost: async (a) => {
        if (preexisting) return { preexisting: true };
        await a.beforeSubmit();
        clicks++;
        return { liked: false };
      },
    },
  });
  const target = (n) => ({
    postId: String(n),
    author: "Reader",
    url: "https://x.com/Reader/status/" + n,
    evidenceRef: f.proof,
    incomingEvidenceRef: f.proof,
  });
  const first = await api.likeIncomingBatch({
    batchId: "a",
    targets: [target(2)],
    sampleRate: 1,
  });
  assert.equal(first.status, "unknown");
  await api.likeIncomingBatch({
    batchId: "a",
    targets: [target(2)],
    sampleRate: 1,
  });
  assert.equal(clicks, 1);
  const waiting = await api.likeIncomingBatch({
    batchId: "b",
    targets: [target(3)],
    sampleRate: 1,
  });
  assert.equal(waiting.status, "waiting");
  assert.equal(clicks, 1);
  now += 30001;
  preexisting = true;
  const existing = await api.likeIncomingBatch({
    batchId: "b",
    targets: [target(3)],
    sampleRate: 1,
  });
  assert.equal(existing.results[0].status, "preexisting");
  assert.equal(clicks, 1);
  const state = (await f.store.load()).state;
  assert.equal(state.items.find((i) => i.kind === "reply").verified, 0);
  assert.equal(state.reactionSamples.length, 2);
});

test("composed incoming read preflights the whole path before navigation", async (t) => {
  const f = fixture(t);
  let navigations = 0;
  const api = createBusinessHarness({
    store: f.store,
    platform: {
      preflight: ({ operation }) => ({
        covered: operation !== "searchSources",
        missing: operation === "searchSources" ? ["native.searchSources"] : [],
      }),
      searchSources: async () => {
        navigations++;
      },
      readPost: async () => {
        navigations++;
      },
    },
  });
  const out = await api.readIncomingConversations();
  assert.equal(out.status, "needsCapability");
  assert.deepEqual(out.missing, ["native.searchSources"]);
  assert.equal(navigations, 0);
  assert.notEqual(out.reason, "incoming-target-window-required");
});

test("composed incoming read preserves an incomplete source diagnostic", async (t) => {
  const f = fixture(t);
  const api = createBusinessHarness({
    store: f.store,
    platform: {
      preflight: () => ({ covered: true }),
      captureProof: ({ observation }) => ({ observation }),
      readPost: async () => {
        throw Error("source failure must stop before reading posts");
      },
      searchSources: async () => ({
        complete: false,
        missing: ["platform-alert"],
        sources: [],
        alerts: ["challenge"],
      }),
    },
  });
  const out = await api.readIncomingConversations();
  assert.equal(out.status, "needsDecision");
  assert.notEqual(out.reason, "incoming-target-window-required");
  assert.ok(out.evidenceRef);
  assert.equal(out.pageComplete, false);
});

test("bounded source window with fewer valid candidates still reads them once", async (t) => {
  const f = fixture(t);
  let searches = 0,
    reads = 0;
  const root = {
    id: "1",
    author: "Pei",
    body: "Root",
    datetime: new Date(NOW).toISOString(),
  };
  const comment = {
    id: "2",
    author: "Reader",
    body: "Full comment",
    datetime: new Date(NOW).toISOString(),
    url: "https://x.com/Reader/status/2",
    replyToId: "1",
  };
  const api = createBusinessHarness({
    store: f.store,
    platform: {
      preflight: () => ({ covered: true }),
      captureProof: ({ observation }) => ({ observation }),
      searchSources: async () => {
        searches++;
        return {
          sources: [comment],
          complete: false,
          missing: ["bounded-source-window-exhausted"],
        };
      },
      readPost: async () => {
        reads++;
        return { complete: true, context: [root, comment], posts: [comment] };
      },
    },
  });
  const out = await api.readIncomingConversations({ limit: 5 });
  assert.equal(searches, 1);
  assert.equal(reads, 1);
  assert.equal(out.conversations.length, 1);
  assert.equal(out.conversations[0].complete, true);
  assert.equal(out.sourceComplete, false);
  assert.ok(out.missing.includes("bounded-source-window-exhausted"));
  assert.equal(out.pageComplete, false);
});

test("one reviewed replyBatch call submits once and settles the original action", async (t) => {
  const f = fixture(t, { planned: [0, 0, 1], actionKinds: ["reply"] });
  const api = createBusinessHarness({
    store: f.store,
    platform: createXPlatform(f.browser, { clock: () => NOW }),
    clock: () => NOW,
  });
  const action = f.read().actions[0];
  f.edit((s) => {
    s.actions = [];
  });
  const out = await api.replyBatch({
    taskId: "round-1",
    actions: [action],
  });
  assert.equal(out.status, "verified");
  assert.equal(out.results[0].status, "verified");
  assert.equal(f.writes.length, 1);
  const settled = (await f.store.load()).state;
  assert.equal(
    settled.actions.find((a) => a.id === action.id).status,
    "verified",
  );
  assert.equal(settled.items.find((a) => a.kind === "reply").verified, 1);
});

test("replyBatch recovers an observed detail URL timeout with one submission", async (t) => {
  for (const parent of ["123", "999"]) {
    const f = fixture(t, { planned: [0, 0, 1], actionKinds: ["reply"] });
    const observe = f.browser.observe.bind(f.browser);
    const act = f.browser.act.bind(f.browser);
    let timedOut = false;
    f.browser.observe = async (q) => {
      const v = await observe(q);
      if (
        q.view === "posts" &&
        f.posts.some((p) => p.body === "有具体贡献的回复")
      )
        v.posts = f.posts.map((p) => ({
          ...p,
          primary: `/Pei/status/${p.id}`,
          replyToId:
            p.body === "有具体贡献的回复"
              ? timedOut
                ? parent
                : null
              : p.replyToId,
        }));
      return v;
    };
    f.browser.act = async (c) => {
      await act(c);
      if (
        !timedOut &&
        c.operation === "openObserved" &&
        /\/Pei\/status\//.test(c.url ?? "")
      ) {
        timedOut = true;
        throw Error(`Timed out waiting for URL ${c.url}`);
      }
    };
    const api = createBusinessHarness({
      store: f.store,
      platform: createXPlatform(f.browser, { clock: () => NOW }),
      clock: () => NOW,
    });
    const action = f.read().actions[0];
    f.edit((s) => {
      s.actions = [];
    });
    const out = await api.replyBatch({ taskId: "round-1", actions: [action] });
    assert.equal(timedOut, true);
    assert.equal(
      out.results[0].status,
      parent === "123" ? "verified" : "unknown",
    );
    assert.equal(f.writes.length, 1);
    const saved = (await f.store.load()).state.actions.find(
      (a) => a.id === action.id,
    );
    assert.match(
      saved.observedPublicURL,
      /^https:\/\/x.com\/Pei\/status\/\d+$/,
    );
  }
});

test("received likes respect evidenced 06h executor permit and recheck expiry before intent", async (t) => {
  for (const mode of ["allowed", "missing", "expired-at-submit"]) {
    const f = fixture(t);
    let now = Date.parse("2026-10-11T06:00:00+08:00"),
      clicks = 0;
    const executor = {
      id: "incoming-morning",
      tabId: "incoming-test-tab",
      scopeKinds: ["reply"],
      evidenceRef: f.proof,
    };
    const permit = {
      kind: "reply",
      executorId: executor.id,
      userAuthorized: true,
      evidenceRef: f.proof,
      startsAt: "2026-10-11T06:00:00+08:00",
      expiresAt: "2026-10-12T00:00:00+08:00",
    };
    const api = createBusinessHarness({
      store: f.store,
      executor,
      clock: () => now,
      platform: {
        preflight: () => ({ covered: true }),
        captureProof: ({ observation }) => ({ observation }),
        readPost: async () => ({
          complete: true,
          context: [{ author: "Pei" }],
        }),
        likePost: async (a) => {
          if (mode === "expired-at-submit") now = Date.parse(permit.expiresAt);
          await a.beforeSubmit();
          clicks++;
          return { liked: true };
        },
      },
    });
    if (mode !== "missing")
      await f.store.transaction(({ state }) => {
        state.executions ??= {};
        state.executions[executor.id] = {
          scopeKinds: ["reply"],
          windowAuthorization: permit,
        };
        return state;
      });
    const r = await api.likeIncomingBatch({
      batchId: "morning-likes",
      sampleRate: 1,
      targets: [
        {
          postId: "100",
          author: "Reader",
          url: "https://x.com/Reader/status/100",
          evidenceRef: f.proof,
          incomingEvidenceRef: f.proof,
        },
      ],
    });
    assert.equal(clicks, mode === "allowed" ? 1 : 0);
    assert.equal(
      r.status,
      mode === "allowed"
        ? "verified"
        : mode === "missing"
          ? "waiting"
          : "needsDecision",
    );
  }
});

for (const thread of [true, false]) {
  test(`normal incoming like retains its interval without thread starvation: ${thread}`, async (t) => {
    const f = fixture(t);
    let clicks = 0;
    await f.store.transaction(({ state }) => {
      state.reactions = [
        {
          postId: "999",
          status: "unknown",
          intentAt: new Date(NOW - 1000).toISOString(),
          ...(thread ? { threadBatchId: "thread-other-executor" } : {}),
        },
      ];
      return state;
    });
    const api = createBusinessHarness({
      store: f.store,
      clock: () => NOW,
      platform: {
        preflight: () => ({ covered: true }),
        captureProof: ({ observation }) => ({ observation }),
        readPost: async () => ({
          complete: true,
          context: [{ author: "Pei" }],
        }),
        likePost: async (a) => {
          await a.beforeSubmit();
          clicks++;
          return { liked: true };
        },
      },
    });
    const r = await api.likeIncomingBatch({
      batchId: "normal-likes",
      sampleRate: 1,
      targets: [
        {
          postId: "100",
          author: "Reader",
          url: "https://x.com/Reader/status/100",
          evidenceRef: f.proof,
          incomingEvidenceRef: f.proof,
        },
      ],
    });
    assert.equal(clicks, thread ? 1 : 0);
    assert.equal(r.status, thread ? "verified" : "waiting");
    if (!thread) assert.equal(r.resumeAt, new Date(NOW + 29000).toISOString());
  });
}
