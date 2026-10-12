import test from "node:test";
import assert from "node:assert/strict";
import { resolveQuotedSource } from "../dist/platform-quote.js";
import { GrowthRecovery } from "../dist/growth-recovery.js";
import { source } from "../dist/results.js";
const card = {
  text: "Name\n@source\nDate\nSpecific source body.",
  datetime: "2026-10-10T00:00:00Z",
};
const quote = {
  id: "20",
  primary: "/source/status/20",
  author: "source",
  body: "Specific source body.",
  datetime: card.datetime,
  needsExpansion: false,
};
const parent = {
  id: "10",
  author: "owner",
  body: "Specific reviewed content.",
  quoteCards: [card],
  datetime: "2026-10-12T02:00:01Z",
  needsExpansion: false,
};
async function resolve(change = {}) {
  const initial = { posts: [structuredClone(parent)] };
  return resolveQuotedSource(
    { postId: "10", url: "https://x.com/owner/status/10" },
    initial,
    {
      browser: {
        act: async (c) => {
          assert.equal(c.operation, "openQuote");
          return { url: "https://x.com/source/status/20" };
        },
      },
      ready: async () => ({ posts: [{ ...quote, ...change }] }),
      open: async () => ({ posts: [structuredClone(parent)] }),
    },
  );
}
test("quoted source requires observed navigation plus exact author date and body then fresh parent card", async () => {
  const result = await resolve();
  assert.equal(result.posts[0].quoteSource.id, "20");
  assert.equal(
    source(result.posts[0]).quoteSource.url,
    "https://x.com/source/status/20",
  );
  for (const c of [
    { body: "Changed" },
    { author: "other" },
    { datetime: "2026-10-11T00:00:00Z" },
    { needsExpansion: true },
  ])
    assert.equal((await resolve(c)).posts[0].quoteSource, undefined);
});
async function recover(change = {}) {
  const resolved = (await resolve()).posts[0];
  Object.assign(resolved, change);
  const action = {
    id: "a",
    kind: "original",
    status: "unknown",
    draftPath: "draft.post.md",
    accountHandle: "owner",
    text: "Specific reviewed content.\n\nhttps://x.com/source/status/20",
    intentAt: "2026-10-12T02:00:00Z",
    beforeIds: [],
  };
  const recovery = new GrowthRecovery({
    capability: () => ({ covered: true }),
    platform: {
      readPost: async (target) => {
        assert.equal(target.resolveQuote, true);
        return { posts: [resolved], alerts: [] };
      },
    },
    load: async () => ({ state: { actions: [action] } }),
    evidenceExists: () => true,
    clock: () => Date.parse("2026-10-12T02:01:00Z"),
    store: { withLock: async (f) => f() },
    settleProof: async () => {},
  });
  return recovery.verifyPublishedPost({
    taskId: "t",
    draftPath: action.draftPath,
    publicURL: "https://x.com/owner/status/10",
    evidenceRef: "proof",
  });
}
test("recovery never accepts same author different source ID or wrong parent, body, time or media", async () => {
  assert.equal((await recover()).status, "verified");
  for (const change of [
    { quoteSource: undefined },
    {
      quoteSource: {
        id: "21",
        url: "https://x.com/source/status/21",
        parentId: "10",
      },
    },
    {
      quoteSource: {
        id: "20",
        url: "https://x.com/source/status/20",
        parentId: "11",
      },
    },
    { body: "Changed" },
    { author: "other" },
    { datetime: "2026-10-12T01:59:00Z" },
    { needsExpansion: true },
  ])
    assert.equal((await recover(change)).status, "unknown");
});
