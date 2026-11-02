import test from "node:test";
import assert from "node:assert/strict";
import { OriginalSearchVerification } from "../dist/original-search-verification.js";
const action = {
  kind: "original",
  status: "intent",
  accountHandle: "owner",
  text: "Exact reviewed body",
  intentAt: "2026-10-30T10:00:00Z",
  beforeIds: [],
};
const post = {
  id: "123",
  author: "owner",
  body: action.text,
  url: "https://x.com/owner/status/123",
  datetime: "2026-10-30T10:00:01Z",
  replyToId: null,
  missing: [],
  needsExpansion: false,
};
async function run({
  a = {},
  v = {},
  p = {},
  posts,
  context,
  error = "selector deadline exceeded",
  initial,
} = {}) {
  let searches = 0;
  const x = new OriginalSearchVerification(
    async () => {
      if (error && !initial) throw Error(error);
      return initial;
    },
    async ({ query }) => {
      searches++;
      return {
        fresh: true,
        accountHandle: "owner",
        page: "https://x.com/search?q=" + encodeURIComponent(query),
        query,
        sources: posts ?? [{ ...post, ...p }],
        complete: false,
        ...v,
      };
    },
    () => Date.parse("2026-10-30T10:01:00Z"),
  );
  try {
    return { result: await x.verify({ ...action, ...a }, context), searches };
  } catch (error) {
    return { error, searches };
  }
}
test("normal root verification uses one exact public search after timeout", async () => {
  let r = await run();
  assert.equal(r.result.verified, true);
  assert.equal(r.result.publicId, "123");
  assert.equal(r.searches, 1);
  assert.match(r.result.publicRecovery.originalError, /deadline/);
});
test("readable unmatched timeline and load errors recover; verified result does not search", async () => {
  for (const initial of [
    { verified: false, missing: ["unique-public-submission-unconfirmed"] },
    { needsStateCheck: true, loadError: { code: "timeline-load-error" } },
  ])
    assert.equal((await run({ initial })).result.verified, true);
  assert.equal((await run({ initial: { verified: true } })).searches, 0);
});
for (const [name, change] of Object.entries({
  baseline: { context: { phase: "baseline" } },
  reply: { a: { kind: "reply" } },
  follow: { a: { kind: "follow" } },
  prepared: { a: { status: "prepared" } },
  missingBefore: { a: { beforeIds: undefined } },
  quote: { a: { quoteTarget: { postId: "1" } } },
  media: { a: { assets: [{ kind: "image" }] } },
  network: { error: "connection closed" },
  rejection: { error: "user took control" },
}))
  test("no search for " + name, async () => {
    assert.equal((await run(change)).searches, 0);
  });
for (const [name, change] of Object.entries({
  wrongAccount: { v: { accountHandle: "other" } },
  stale: { v: { fresh: false } },
  alert: { v: { alerts: ["challenge"] } },
  state: { v: { needsStateCheck: true } },
  route: { v: { page: "https://x.com/home" } },
  query: { v: { query: "other" } },
  author: { p: { author: "other" } },
  body: { p: { body: "different" } },
  truncated: { p: { needsExpansion: true } },
  missing: { p: { missing: ["body"] } },
  before: { a: { beforeIds: ["123"] } },
  old: { p: { datetime: "2026-10-30T09:59:59Z" } },
  future: { p: { datetime: "2026-10-30T11:00:00Z" } },
  replyCard: { p: { replyToId: "99" } },
  permalink: { p: { url: "https://x.com/other/status/123" } },
  ambiguous: { posts: [post, post] },
}))
  test("refuses " + name, async () => {
    assert.equal((await run(change)).result.verified, false);
  });
test("search exception remains unverified and preserves both errors", async () => {
  const x = new OriginalSearchVerification(
    async () => {
      throw Error("timeout detail");
    },
    async () => {
      throw Error("timeout search");
    },
    Date.now,
  );
  let r = await x.verify(action);
  assert.equal(r.verified, false);
  assert.equal(r.publicRecovery.originalError, "timeout detail");
  assert.equal(r.publicRecovery.searchError, "timeout search");
});
