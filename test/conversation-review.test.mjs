import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformTargets } from "../dist/platform-targets.js";
import { GrowthPolicy } from "../dist/growth-policy.js";
import { fixture, NOW } from "./fixtures.mjs";

test("context read returns visible ancestors and fails on incomplete context", async () => {
  const posts = [
    {
      id: "1",
      author: "Owner",
      datetime: "2026-01-01T00:00:00Z",
      body: "Root",
    },
    {
      id: "2",
      author: "Reader",
      datetime: "2026-01-01T00:01:00Z",
      body: "Hello",
    },
  ];
  const platform = createPlatformTargets({
    open: async () => ({
      page: "https://x.com/Reader/status/2",
      posts: [posts[1]],
    }),
    observed: async () => ({ page: "https://x.com/Reader/status/2", posts }),
    browser: {},
    ready: async () => ({}),
  });
  const out = await platform.readPost({
    postId: "2",
    url: "https://x.com/Reader/status/2",
    expand: true,
    includeContext: true,
  });
  assert.equal(out.complete, true);
  assert.deepEqual(out.context, posts);
  posts[0].needsExpansion = true;
  const incomplete = await platform.readPost({
    postId: "2",
    url: "https://x.com/Reader/status/2",
    expand: true,
    includeContext: true,
  });
  assert.equal(incomplete.complete, false);
  assert.ok(incomplete.missing.includes("conversation-context-incomplete"));
});
test("conversation cap counts intent and unknown without blocking other recipients", async (t) => {
  const f = fixture(t);
  const state = (await f.store.load()).state;
  const action = state.actions.find((a) => a.kind === "reply");
  action.conversation = { recipientHandle: "Reader", rootId: "1", round: 3 };
  const policy = new GrowthPolicy({
    clock: () => NOW,
    evidenceExists: (p) => f.store.evidenceExists(p),
    platform: {},
    store: f.store,
  });
  assert.equal(policy.guardInput(state, action), null);
  for (const [i, status] of ["verified", "intent", "unknown"].entries())
    state.actions.push({ ...action, id: "used-" + i, status });
  assert.equal(policy.guardInput(state, action), "reply-conversation-limit");
  action.conversation = { recipientHandle: "Other", rootId: "1", round: 1 };
  assert.equal(policy.guardInput(state, action), null);
  action.conversation.automatedLoop = true;
  assert.equal(policy.guardInput(state, action), "reply-automated-loop");
});
