import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

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
