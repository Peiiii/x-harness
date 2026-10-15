import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";
import { threadLikeFraction } from "../dist/thread-like-policy.js";

const url = "https://x.com/Author/status/100";
function scenario(t, options = {}) {
  const f = fixture(t);
  let now = options.now ?? NOW,
    index = 0,
    clicks = [],
    waits = [],
    reads = 0;
  const liked = new Set(options.preexisting ?? []);
  const windows = options.windows ?? [
    ["100", "101", "102"],
    ["103", "104"],
  ];
  const view = () => ({
    page: url,
    accountHandle: "Pei",
    needsStateCheck: false,
    alerts: [],
    threadConfirmed: true,
    threadRootPresent: index === 0,
    threadIds: windows[index],
    threadExpandControls: [],
    atRenderedTail: true,
    loading: false,
    viewportScrollTop: index,
    posts: windows[index].map((id) => ({
      id,
      author: "Author",
      primary: `/Author/status/${id}`,
      buttons: [{ label: liked.has(id) ? "1 Likes. Liked" : "0 Likes. Like" }],
    })),
  });
  const platform = {
    preflight: () => ({ covered: true }),
    readThreadLikeWindow: async (args) => {
      reads++;
      if (args.reset !== false) index = 0;
      if (reads > 1 && options.recoveryNow) now = options.recoveryNow;
      if (reads > 1 && options.onRecovery) await options.onRecovery(f);
      assert.equal(args.url, url);
      return {
        ...view(),
        ...(options.badView ?? {}),
        ...(reads > 1 ? (options.badRecovery ?? {}) : {}),
      };
    },
    advanceThreadLikes: async () => {
      if (index + 1 < windows.length) {
        index++;
        return view();
      }
      return { ...view(), stableTail: true };
    },
    likeThreadPost: async (args) => {
      const post = view().posts.find((p) => p.id === args.postId);
      assert.ok(post);
      if (liked.has(args.postId))
        return { ...view(), posts: [post], preexisting: true };
      if (options.nativeBeforeIntentIds?.includes(args.postId))
        throw Error("like-native-target-unconfirmed");
      if (options.beforeIntent) await options.beforeIntent(args, f);
      await args.beforeSubmit();
      clicks.push({ id: args.postId, at: now });
      if (options.throwAfterIntent) throw Error("connection interrupted");
      if (options.nativeUnknownIds?.includes(args.postId))
        throw Error("like-native-target-unconfirmed");
      const unconfirmed =
        options.unknown || options.unknownIds?.includes(args.postId);
      if (!unconfirmed) liked.add(args.postId);
      return {
        ...view(),
        posts: [view().posts.find((p) => p.id === args.postId)],
        liked: !unconfirmed,
        ...(options.afterClick ?? {}),
      };
    },
  };
  const api = createBusinessHarness({
    store: f.store,
    platform,
    executor: options.executor
      ? { ...options.executor, tabId: "thread-test-tab", evidenceRef: f.proof }
      : undefined,
    clock: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  });
  return {
    f,
    api,
    clicks,
    waits,
    liked,
    setTime(value) {
      now = value;
    },
    get reads() {
      return reads;
    },
  };
}

test("URL-only task traverses windows in one call, likes root, never toggles and resumes", async (t) => {
  const s = scenario(t, { preexisting: ["101"] });
  const out = await s.api.likePostAndComments({ url, sampleRate: 1 });
  assert.equal(out.status, "verified");
  assert.equal(out.scopeComplete, false);
  assert.deepEqual(
    s.clicks.map((c) => c.id),
    ["100", "102", "103", "104"],
  );
  assert.equal(out.counts.preexisting, 1);
  assert.equal(out.counts.newLikesThisCall, 4);
  for (let i = 1; i < s.clicks.length; i++)
    assert.ok(
      s.clicks[i].at - s.clicks[i - 1].at >= 1000 &&
        s.clicks[i].at - s.clicks[i - 1].at <= 2000,
    );
  const resumed = await s.api.likePostAndComments({ url, sampleRate: 1 });
  assert.equal(resumed.status, "verified");
  assert.equal(resumed.counts.newLikesThisCall, 0);
  assert.equal(s.clicks.length, 4);
});

test("default 60% uses stable sampling; root selected independently; resumption does not redraw", async (t) => {
  const ids = Array.from({ length: 60 }, (_, i) => String(101 + i));
  const s = scenario(t, { windows: [["100", ...ids]] });
  const first = await s.api.likePostAndComments({ url, maxLikes: 1 });
  assert.equal(first.status, "checkpoint");
  const b = (await s.f.store.load()).state.threadLikeBatches[0];
  assert.equal(b.sampleRate, 0.6);
  assert.equal(b.entries["100"].selected, true);
  for (const id of ids)
    assert.equal(
      b.entries[id].selected,
      threadLikeFraction(b.seed, id, "sample") < 0.6,
    );
  const old = Object.fromEntries(
    Object.entries(b.entries).map(([id, e]) => [id, e.selected]),
  );
  const next = await s.api.likePostAndComments({
    url,
    maxLikes: 100,
    timeBudgetMs: 600000,
  });
  assert.equal(next.status, "verified");
  const after = (await s.f.store.load()).state.threadLikeBatches[0];
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(after.entries).map(([id, e]) => [id, e.selected]),
    ),
    old,
  );
  assert.ok(next.counts.skipped > 0);
  assert.equal(
    (await s.api.likePostAndComments({ url, sampleRate: 1 })).status,
    "needsDecision",
  );
});

test("sample zero likes root only; existing unknown freezes exact object and never reclicks", async (t) => {
  const s = scenario(t, { unknown: true });
  const a = await s.api.likePostAndComments({ url, sampleRate: 0 });
  assert.equal(a.status, "unknown");
  assert.equal(s.clicks.length, 1);
  const b = await s.api.likePostAndComments({ url, sampleRate: 0 });
  assert.equal(b.status, "unknown");
  assert.equal(s.clicks.length, 1);
  s.liked.add("100");
  const c = await s.api.likePostAndComments({ url, sampleRate: 0 });
  assert.equal(c.status, "verified");
  assert.equal(s.clicks.length, 1);
  assert.equal(c.counts.skipped, 4);
});

test("budget returns original resumeAt without sleeping; subsequent call resumes remaining work", async (t) => {
  const s = scenario(t);
  const a = await s.api.likePostAndComments({
    url,
    sampleRate: 1,
    timeBudgetMs: 500,
  });
  assert.equal(a.status, "waiting");
  assert.equal(s.clicks.length, 1);
  assert.equal(s.waits.length, 0);
  s.setTime(Date.parse(a.resumeAt));
  const b = await s.api.likePostAndComments({ url, sampleRate: 1 });
  assert.equal(b.status, "verified");
  assert.equal(s.clicks.length, 5);
});

test("night, wrong identity, page alerts, invalid input and unknown post-click state do not continue", async (t) => {
  for (const options of [
    { now: Date.parse("2026-10-14T01:00:00+08:00") },
    { badView: { accountHandle: "Other" } },
    { badView: { alerts: ["rate limited"] } },
  ]) {
    const s = scenario(t, options);
    assert.notEqual(
      (await s.api.likePostAndComments({ url })).status,
      "verified",
    );
    assert.equal(s.clicks.length, 0);
  }
  for (const invalid of [
    { url: "https://other.example/a/status/100" },
    { url, sampleRate: 2 },
    { url, maxLikes: 101 },
  ]) {
    const s = scenario(t);
    assert.equal(
      (await s.api.likePostAndComments(invalid)).status,
      "needsDecision",
    );
    assert.equal(s.reads, 0);
  }
  for (const options of [
    { throwAfterIntent: true },
    { afterClick: { alerts: ["challenge"] } },
    { afterClick: { page: "https://x.com/home" } },
  ]) {
    const s = scenario(t, options);
    assert.notEqual(
      (await s.api.likePostAndComments({ url, sampleRate: 1 })).status,
      "verified",
    );
    assert.equal(s.clicks.length, 1);
    assert.equal((await s.f.store.load()).state.reactions[0].status, "unknown");
  }
});

test("concurrent same-object intent and other reply pacing are checked again immediately before click", async (t) => {
  const s = scenario(t, {
    beforeIntent: async (args, f) =>
      f.store.transaction((snapshot) => {
        snapshot.state.reactions = [
          {
            postId: args.postId,
            status: "intent",
            intentAt: new Date(NOW).toISOString(),
          },
        ];
        return snapshot.state;
      }),
  });
  const a = await s.api.likePostAndComments({ url });
  assert.equal(a.status, "needsDecision");
  assert.equal(s.clicks.length, 0);
  const paced = scenario(t);
  await paced.f.store.transaction((s) => {
    s.state.actions.push({
      kind: "reply",
      status: "verified",
      intentAt: new Date(NOW).toISOString(),
    });
    return s.state;
  });
  await paced.api.likePostAndComments({ url, sampleRate: 0 });
  assert.ok(paced.clicks[0].at >= NOW + 1000);
});

test("one unknown like freezes only that post; other selected comments continue and totals stay unknown", async (t) => {
  const s = scenario(t, { unknownIds: ["100"] });
  const out = await s.api.likePostAndComments({ url, sampleRate: 1 });
  assert.equal(out.status, "unknown");
  assert.equal(out.counts.unknown, 1);
  assert.equal(out.counts.verified, 4);
  assert.equal(out.counts.newLikesThisCall, 4);
  assert.equal(s.clicks.length, 5);
  await s.api.likePostAndComments({ url, sampleRate: 1 });
  assert.equal(s.clicks.length, 5);
});

test("a scoped native post-click read failure freezes only that original intent and continues independent selected posts", async (t) => {
  const s = scenario(t, { nativeUnknownIds: ["100"] });
  const out = await s.api.likePostAndComments({ url, sampleRate: 1 });
  assert.equal(out.status, "unknown");
  assert.equal(out.counts.unknown, 1);
  assert.equal(out.counts.verified, 4);
  assert.equal(out.counts.newLikesThisCall, 4);
  assert.deepEqual(
    s.clicks.map((c) => c.id),
    ["100", "101", "102", "103", "104"],
  );
  const state = (await s.f.store.load()).state;
  const original = state.reactions.find((r) => r.postId === "100");
  assert.equal(original.status, "unknown");
  const entry = state.threadLikeBatches[0].entries["100"];
  assert.ok(entry.recoveryEvidenceRef);
  await s.api.likePostAndComments({ url, sampleRate: 1 });
  assert.equal(s.clicks.length, 5);
});
for (const badRecovery of [
  { page: "https://x.com/home" },
  { accountHandle: "Other" },
  { alerts: ["challenge"] },
  { needsStateCheck: true },
  { threadConfirmed: false },
]) {
  test(`native unknown recovery keeps the batch stopped on ${JSON.stringify(badRecovery)}`, async (t) => {
    const s = scenario(t, { nativeUnknownIds: ["100"], badRecovery });
    const out = await s.api.likePostAndComments({ url, sampleRate: 1 });
    assert.equal(s.clicks.length, 1);
    assert.equal(out.counts.unknown, 1);
    assert.equal(out.counts.verified, 0);
  });
}
test("native target failure before intent skips only that original batch entry after fresh scope, without creating a reaction", async (t) => {
  const s = scenario(t, { nativeBeforeIntentIds: ["100"] });
  const out = await s.api.likePostAndComments({ url, sampleRate: 1 });
  assert.deepEqual(
    s.clicks.map((c) => c.id),
    ["101", "102", "103", "104"],
  );
  assert.equal(out.status, "needsDecision");
  assert.equal(out.counts.verified, 4);
  assert.equal(out.counts.unknown, 0);
  assert.equal(out.counts.skipped, 1);
  const state = (await s.f.store.load()).state;
  assert.ok(!state.reactions.some((r) => r.postId === "100"));
  assert.equal(
    state.threadLikeBatches[0].entries["100"].reason,
    "native-target-unconfirmed-before-intent",
  );
  await s.api.likePostAndComments({ url, sampleRate: 1 });
  assert.equal(s.clicks.length, 4);
});
for (const badRecovery of [
  { alerts: ["challenge"] },
  { accountHandle: "Other" },
  { threadConfirmed: false },
]) {
  test(`native pre-intent skip requires fresh valid original scope ${JSON.stringify(badRecovery)}`, async (t) => {
    const s = scenario(t, { nativeBeforeIntentIds: ["100"], badRecovery });
    const out = await s.api.likePostAndComments({ url, sampleRate: 1 });
    assert.equal(s.clicks.length, 0);
    assert.equal(out.status, "needsDecision");
    assert.equal(out.counts.skipped, 0);
  });
}

for (const recoveryNow of [
  NOW + 300000,
  Date.parse("2026-10-12T00:00:00+08:00"),
]) {
  test(`local native unknown recovery cannot cross budget or night: ${recoveryNow}`, async (t) => {
    const s = scenario(t, {
      now:
        recoveryNow === NOW + 300000
          ? NOW
          : Date.parse("2026-10-11T23:59:58+08:00"),
      nativeUnknownIds: ["100"],
      recoveryNow,
    });
    const out = await s.api.likePostAndComments({ url, sampleRate: 1 });
    assert.equal(s.clicks.length, 1);
    assert.equal(out.counts.unknown, 1);
    assert.equal(out.counts.verified, 0);
  });
}

for (const change of ["reaction", "account"]) {
  test(`native pre-intent skip CAS preserves concurrent ${change}`, async (t) => {
    const s = scenario(t, {
      nativeBeforeIntentIds: ["100"],
      onRecovery: async (f) =>
        f.store.transaction(({ state }) => {
          if (change === "reaction")
            state.reactions = [
              {
                postId: "100",
                status: "intent",
                intentAt: new Date(NOW).toISOString(),
              },
            ];
          else state.accountHandle = "Other";
          return state;
        }),
    });
    const out = await s.api.likePostAndComments({ url, sampleRate: 1 });
    assert.equal(s.clicks.length, 0);
    assert.equal(out.status, "needsDecision");
    assert.equal(out.counts.skipped, 0);
    const state = (await s.f.store.load()).state;
    if (change === "reaction")
      assert.equal(state.reactions[0].status, "intent");
    else assert.equal(state.accountHandle, "Other");
  });
}
// The thread member list can contain replies only, while the exact root is visible.
test("root like settles from exact root proof when reply IDs exclude the root", async (t) => {
  const s = scenario(t, { afterClick: { threadIds: ["101"] } });
  const result = await s.api.likePostAndComments({ url, sampleRate: 0 });
  assert.equal(result.status, "verified");
  assert.equal(result.counts.newLikesThisCall, 1);
  assert.equal((await s.f.store.load()).state.reactions[0].status, "verified");
  const resumed = await s.api.likePostAndComments({ url, sampleRate: 0 });
  assert.equal(resumed.counts.newLikesThisCall, 0);
  assert.equal(s.clicks.length, 1);
});

for (const afterClick of [
  { threadIds: [], threadRootPresent: false },
  { threadIds: [], threadConfirmed: false },
  { threadIds: [], page: "https://x.com/Other/status/999" },
  { threadIds: [], accountHandle: "Other" },
]) {
  test(`root like with incomplete or changed root proof stays unknown: ${JSON.stringify(afterClick)}`, async (t) => {
    const s = scenario(t, { afterClick });
    const result = await s.api.likePostAndComments({ url, sampleRate: 0 });
    assert.equal(result.status, "unknown");
    assert.equal((await s.f.store.load()).state.reactions[0].status, "unknown");
    assert.equal(s.clicks.length, 1);
  });
}

test("reply outside the thread IDs does not inherit the root exception", async (t) => {
  const s = scenario(t, {
    windows: [["100", "101"]],
    preexisting: ["100"],
    afterClick: { threadIds: [] },
  });
  const result = await s.api.likePostAndComments({
    url,
    sampleRate: 1,
    maxPages: 1,
  });
  assert.equal(result.counts.unknown, 1);
  assert.equal(
    (await s.f.store.load()).state.reactions.find((r) => r.postId === "101")
      .status,
    "unknown",
  );
});

test("root like boolean without the exact liked button stays unknown", async (t) => {
  const s = scenario(t, {
    afterClick: {
      threadIds: [],
      posts: [
        {
          id: "100",
          author: "Author",
          primary: "/Author/status/100",
          buttons: [{ label: "0 Likes. Like" }],
        },
      ],
    },
  });
  const result = await s.api.likePostAndComments({
    url,
    sampleRate: 0,
    maxPages: 1,
  });
  assert.equal(result.counts.unknown, 1);
  assert.equal((await s.f.store.load()).state.reactions[0].status, "unknown");
});

test("early thread likes require a matching evidenced executor permit and stop at expiry", async (t) => {
  const executor = {
    id: "morning-replies",
    scopeKinds: ["reply"],
    evidenceRef: "scope",
  };
  const now = Date.parse("2026-10-11T06:00:00+08:00");
  const s = scenario(t, { now, executor, windows: [["100"]] });
  assert.equal((await s.api.likePostAndComments({ url })).status, "waiting");
  const permit = {
    kind: "reply",
    executorId: executor.id,
    userAuthorized: true,
    evidenceRef: s.f.proof,
    startsAt: "2026-10-11T06:00:00+08:00",
    expiresAt: "2026-10-12T00:00:00+08:00",
  };
  await s.f.store.transaction(({ state }) => {
    state.executions = {
      [executor.id]: { scopeKinds: ["reply"], windowAuthorization: permit },
    };
    return state;
  });
  assert.equal(
    (await s.api.likePostAndComments({ url, sampleRate: 1 })).counts
      .newLikesThisCall,
    1,
  );
  s.setTime(Date.parse(permit.expiresAt));
  assert.equal((await s.api.likePostAndComments({ url })).status, "waiting");
});

test("early thread permit rejects wrong owner, kind, missing evidence and future start without reads", async (t) => {
  for (const invalid of [
    { executorId: "other" },
    { kind: "original" },
    { evidenceRef: "missing" },
    { startsAt: "2026-10-11T07:00:00+08:00" },
  ]) {
    const executor = {
      id: "morning",
      scopeKinds: ["reply"],
      evidenceRef: "scope",
    };
    const s = scenario(t, {
      now: Date.parse("2026-10-11T06:05:00+08:00"),
      executor,
    });
    await s.f.store.transaction(({ state }) => {
      state.executions = {
        [executor.id]: {
          windowAuthorization: {
            kind: "reply",
            executorId: executor.id,
            userAuthorized: true,
            evidenceRef: s.f.proof,
            startsAt: "2026-10-11T06:00:00+08:00",
            expiresAt: "2026-10-12T00:00:00+08:00",
            ...invalid,
          },
        },
      };
      return state;
    });
    assert.equal((await s.api.likePostAndComments({ url })).status, "waiting");
    assert.equal(s.reads, 0);
    assert.equal(s.clicks.length, 0);
  }
});
