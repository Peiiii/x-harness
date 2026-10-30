import test from "node:test";
import assert from "node:assert/strict";
import { GrowthRecovery } from "../dist/growth-recovery.js";
const at = "2026-10-30T08:00:00.000Z";
async function fixture(
  change = {},
  actionChange = {},
  error = "Timed out after 2ms waiting for CDP command Runtime.evaluate.",
) {
  const action = {
    id: "original-1",
    kind: "original",
    status: "unknown",
    draftPath: "draft.post.md",
    accountHandle: "owner",
    text: "A complete original body",
    intentAt: at,
    beforeIds: [],
    ...actionChange,
  };
  let searches = 0,
    settled;
  const post = {
    id: "123",
    author: "owner",
    url: "https://x.com/owner/status/123",
    body: action.text,
    datetime: "2026-10-30T08:00:01Z",
    replyToId: null,
    needsExpansion: false,
    missing: [],
    images: [],
    media: [],
  };
  const platform = {
    readPost: async () => {
      if (error) throw Error(error);
      return { posts: [post], fresh: true, alerts: [] };
    },
    searchSources: async ({ query }) => {
      searches++;
      return {
        fresh: true,
        accountHandle: "owner",
        query,
        page: `https://x.com/search?q=${encodeURIComponent(query)}&f=live`,
        sources: [post],
        complete: false,
        missing: ["bounded-source-window-exhausted"],
        ...change,
      };
    },
  };
  const recovery = new GrowthRecovery({
    capability: () => ({ covered: true }),
    platform,
    load: async () => ({ state: { actions: [action] } }),
    evidenceExists: () => true,
    clock: () => Date.parse(at) + 60000,
    store: { withLock: async (f) => f() },
    settleProof: async (_s, _a, value) => {
      settled = value;
    },
  });
  let result, thrown;
  try {
    result = await recovery.verifyPublishedPost({
      taskId: "day",
      draftPath: action.draftPath,
      publicURL: post.url,
      evidenceRef: "original-public-proof",
    });
  } catch (e) {
    thrown = e;
  }
  return { result, thrown, searches, settled, post };
}
test("detail timeout recovers a unique fresh complete search card without requiring collection completeness", async () => {
  const r = await fixture();
  assert.equal(r.result?.status, "verified");
  assert.equal(r.searches, 1);
  assert.match(r.settled.publicRecovery.detailError, /2ms/);
});
test("ordinary successful detail verification and non-timeout failures never add search", async () => {
  assert.equal((await fixture({}, {}, null)).searches, 0);
  const r = await fixture({}, {}, "connection closed");
  assert.match(r.thrown.message, /connection closed/);
  assert.equal(r.searches, 0);
});
for (const [name, change] of Object.entries({
  account: { accountHandle: "other" },
  stale: { fresh: false },
  alert: { alerts: ["challenge"] },
  state: { needsStateCheck: true },
  route: { page: "https://x.com/home" },
  query: { query: "different" },
}))
  test(`search recovery rejects ${name}`, async () => {
    assert.equal((await fixture(change)).result.status, "unknown");
  });
for (const [name, change] of Object.entries({
  id: { id: "124" },
  author: { author: "other" },
  body: { body: "Different" },
  old: { datetime: "2026-10-30T07:59:59Z" },
  future: { datetime: "2026-10-30T09:00:00Z" },
  reply: { replyToId: "999" },
  truncated: { needsExpansion: true },
  incomplete: { missing: ["body"] },
  url: { url: "https://x.com/other/status/123" },
}))
  test(`search card rejects ${name}`, async () => {
    const base = (await fixture()).post;
    assert.equal(
      (await fixture({ sources: [{ ...base, ...change }] })).result.status,
      "unknown",
    );
  });
test("ambiguous cards and prior public IDs remain unknown", async () => {
  const base = (await fixture()).post;
  assert.equal(
    (await fixture({ sources: [base, base] })).result.status,
    "unknown",
  );
  assert.equal(
    (await fixture({}, { beforeIds: ["123"] })).result.status,
    "unknown",
  );
});
test("media, quote and missing original before-ID baseline never enter text search recovery", async () => {
  for (const a of [
    { assets: [{ kind: "image" }] },
    { quoteTarget: { postId: "456" } },
    { beforeIds: undefined },
  ]) {
    const r = await fixture({}, a);
    assert.ok(r.thrown);
    assert.equal(r.searches, 0);
  }
});
