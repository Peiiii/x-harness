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
      index = 0;
      assert.equal(args.url, url);
      return { ...view(), ...(options.badView ?? {}) };
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
      if (options.beforeIntent) await options.beforeIntent(args, f);
      await args.beforeSubmit();
      clicks.push({ id: args.postId, at: now });
      if (options.throwAfterIntent) throw Error("connection interrupted");
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
