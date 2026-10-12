import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformWriting } from "../dist/platform-writing.js";
const action = {
  kind: "reply",
  accountHandle: "owner",
  accountURL: "https://x.com/owner",
  accountEvidenceRef: "account-proof",
  postId: "10",
  url: "https://x.com/peer/status/10",
  evidenceRef: "parent-proof",
  text: "Reply",
  intentAt: "2026-10-12T08:00:00Z",
  beforeIds: ["10"],
  observedPublicURL: "https://x.com/owner/status/11",
  observedPublicEvidenceRef: "public-proof",
};
const candidate = {
  id: "11",
  author: "owner",
  body: "Reply",
  datetime: "2026-10-12T08:00:02Z",
  primary: "/owner/status/11",
  replyToId: null,
  needsExpansion: false,
};
async function replay(last) {
  let reads = 0,
    opens = 0;
  const snapshot = (posts, alerts = []) => ({
    page: action.observedPublicURL,
    accountHandle: "owner",
    alerts,
    needsStateCheck: false,
    posts,
  });
  const writing = createPlatformWriting({
    open: async () => {
      opens++;
      return snapshot([candidate]);
    },
    observed: async (q) => {
      reads++;
      assert.equal(q.targetId, "11");
      assert.equal(q.replyTargetId, "10");
      return last(snapshot);
    },
    browser: {
      capabilities: () => ["refreshPosts"],
      act: () => {
        throw Error("Recovery must not write or refresh");
      },
    },
    clock: () => Date.parse("2026-10-12T08:01:00Z"),
    followStage: () => {
      throw Error("No follow");
    },
    readPerson: () => {
      throw Error("No person");
    },
    readPost: () => {
      throw Error("No parent navigation");
    },
  });
  const result = await writing.findSubmission(action);
  assert.equal(opens, 2);
  assert.equal(reads, 1);
  return result;
}
test("detail loading gets one bounded fresh parent observation without resubmitting", async () => {
  const r = await replay((s) => s([{ ...candidate, replyToId: "10" }]));
  assert.equal(r.verified, true);
  assert.equal(r.publicId, "11");
});
test("missing or wrong parent remains unknown after the bounded read", async () => {
  for (const parent of [null, "99"]) {
    const r = await replay((s) => s([{ ...candidate, replyToId: parent }]));
    assert.equal(r.verified, false);
  }
});
test("late body change, duplicate match or platform alert cannot verify", async () => {
  for (const last of [
    (s) => s([{ ...candidate, body: "different", replyToId: "10" }]),
    (s) =>
      s([
        { ...candidate, replyToId: "10" },
        { ...candidate, id: "12", replyToId: "10" },
      ]),
    (s) => s([{ ...candidate, replyToId: "10" }], ["challenge"]),
  ])
    assert.equal((await replay(last)).verified, false);
});
