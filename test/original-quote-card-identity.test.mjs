import test from "node:test";
import assert from "node:assert/strict";
import { PlatformWriting } from "../dist/platform-writing.js";
const clock = Date.parse("2026-10-20T04:00:00Z");
const action = {
  kind: "original",
  accountHandle: "owner",
  accountURL: "https://x.com/owner",
  accountEvidenceRef: "own-proof",
  text: "specific thought",
  intentAt: "2026-10-20T03:59:50Z",
  beforeIds: ["8"],
  quoteTarget: {
    postId: "20",
    url: "https://x.com/source/status/20",
    evidenceRef: "complete-reviewed-source",
  },
};
const card = {
  text: "Source\n@source\noriginal source excerpt",
  author: "source",
  datetime: "2026-10-19T01:00:00Z",
  body: "original source excerpt",
  links: ["/source/status/20/photo/1"],
};
async function run(change = {}, changedAction = {}) {
  let hops = 0;
  const value = {
    page: "https://x.com/owner",
    accountHandle: "owner",
    needsStateCheck: false,
    alerts: [],
    posts: [
      {
        id: "10",
        author: "owner",
        body: "specific thought",
        datetime: "2026-10-20T03:59:55Z",
        needsExpansion: false,
        primary: "/owner/status/10",
        quoteCards: [{ ...card, ...change }],
      },
    ],
  };
  const w = new PlatformWriting({
    observed: async () => value,
    browser: { capabilities: () => ["refreshPosts"] },
    followStage: async () => {},
    readPerson: async () => {},
    open: async () => value,
    clock: () => clock,
    readPost: async () => {
      hops++;
      return value;
    },
  });
  return {
    result: await w.findSubmission({ ...action, ...changedAction }),
    hops,
  };
}
test("a unique permalink inside the exact quoted card binds the reviewed source without another document read", async () => {
  const { result, hops } = await run();
  assert.equal(result.verified, true);
  assert.equal(hops, 0);
  assert.equal(result.posts[0].quoteSource.id, "20");
  assert.equal(result.posts[0].quoteSource.parentId, "10");
  assert.equal(result.posts[0].quoteSource.bodyComplete, false);
  assert.equal(
    result.posts[0].quoteSource.body,
    undefined,
    "card excerpt is not fabricated as a full source",
  );
});
for (const change of [
  { author: "other" },
  { author: null },
  { links: ["/other/status/99/photo/1"] },
  { links: ["/source/status/20/photo/1", "/other/status/21"] },
  { links: [] },
  { datetime: "unknown" },
  { links: ["https://other.example/source/status/20"] },
])
  test(`ambiguous or unbound quoted card retains exact-source verification: ${JSON.stringify(change)}`, async () => {
    const { result, hops } = await run(change);
    assert.equal(result.verified, false);
    assert.equal(hops, 1);
  });

test("a fresh exact original receipt card on the evidenced own profile needs no detail navigation", async () => {
  const { result, hops } = await run(
    {},
    {
      observedPublicURL: "https://x.com/owner/status/10",
      observedPublicEvidenceRef: "fresh-profile-observation",
    },
  );
  assert.equal(result.verified, true);
  assert.equal(hops, 0);
});
