import test from "node:test";
import assert from "node:assert/strict";
import { GrowthRecovery } from "../dist/growth-recovery.js";

async function recover(change = {}, sourceChange = {}, actionChange = {}) {
  const action = {
    id: "source-card",
    kind: "original",
    status: "unknown",
    draftPath: "draft.post.md",
    accountHandle: "owner",
    text: "Specific reviewed content.\n\ngithub.com/example/tool",
    intentAt: "2026-10-12T02:00:00Z",
    beforeIds: ["9"],
    ...actionChange,
  };
  const post = {
    id: "10",
    author: "owner",
    body: "Specific reviewed content.",
    links: ["https://t.co/observed"],
    needsExpansion: false,
    datetime: "2026-10-12T02:00:01Z",
    ...change,
  };
  let settled;
  const recovery = new GrowthRecovery({
    capability: () => ({ covered: true, missing: [] }),
    platform: { readPost: async () => ({ posts: [post], alerts: [] }) },
    load: async () => ({ state: { actions: [action] } }),
    evidenceExists: (p) => ["public-proof", "redirect-proof"].includes(p),
    clock: () => Date.parse("2026-10-12T02:00:02Z"),
    store: { withLock: async (f) => f() },
    settleProof: async (_snapshot, _action, observation) => {
      settled = observation;
    },
  });
  const result = await recovery.verifyPublishedPost({
    taskId: "original",
    draftPath: action.draftPath,
    publicURL: "https://x.com/owner/status/10",
    evidenceRef: "public-proof",
    sourceLink: {
      href: "https://t.co/observed",
      resolvedURL: "https://github.com/example/tool",
      evidenceRef: "redirect-proof",
      ...sourceChange,
    },
  });
  return { result, settled };
}

test("bare reviewed domain becoming a source card verifies only with observed redirect and exact body", async () => {
  assert.equal((await recover()).result.status, "verified");
});
test("bare source allowance preserves destination, body, identity, baseline and time guards", async () => {
  for (const [post, source] of [
    [{}, { resolvedURL: "https://github.com/example/other" }],
    [{}, { evidenceRef: "missing" }],
    [{ links: ["https://t.co/other"] }, {}],
    [{ body: "Different content." }, {}],
    [{ author: "other" }, {}],
    [{ id: "9" }, {}],
    [{ needsExpansion: true }, {}],
    [{ datetime: "2026-10-12T01:59:59Z" }, {}],
  ])
    assert.equal((await recover(post, source)).result.status, "unknown");
});

test("a labeled trailing URL card preserves the exact label and requires its observed destination", async () => {
  const action = {
    text: "Specific reviewed content.\n\n仓库：https://github.com/example/tool",
  };
  const post = { body: "Specific reviewed content.\n\n仓库：" };
  assert.equal((await recover(post, {}, action)).result.status, "verified");
  assert.equal(
    (
      await recover(
        { body: "Specific reviewed content.\n\n链接：" },
        {},
        action,
      )
    ).result.status,
    "unknown",
  );
  assert.equal(
    (
      await recover(
        post,
        { resolvedURL: "https://github.com/example/other" },
        action,
      )
    ).result.status,
    "unknown",
  );
});

test("reviewed quote cannot verify as a plain post or a different quote", async () => {
  const action = {
    text: "Specific reviewed content.",
    quoteTarget: {
      postId: "123",
      url: "https://x.com/source/status/123",
      evidenceRef: "source-proof",
    },
  };
  assert.equal((await recover({}, {}, action)).result.status, "unknown");
  assert.equal(
    (await recover({ quoteSource: { parentId: "10", id: "456" } }, {}, action))
      .result.status,
    "unknown",
  );
  assert.equal(
    (await recover({ quoteSource: { parentId: "9", id: "123" } }, {}, action))
      .result.status,
    "unknown",
  );
  assert.equal(
    (await recover({ quoteSource: { parentId: "10", id: "123" } }, {}, action))
      .result.status,
    "verified",
  );
});
