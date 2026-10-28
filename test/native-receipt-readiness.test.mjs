import test from "node:test";
import assert from "node:assert/strict";
import { PlatformWriting } from "../dist/platform-writing.js";
import { PlatformObservation } from "../dist/platform-observation.js";
const action = {
  kind: "original",
  text: "reviewed",
  accountHandle: "sample",
  accountURL: "https://x.com/sample",
  accountEvidenceRef: "proof",
  intentAt: "2026-10-11T02:00:00Z",
  beforeIds: [],
};
const candidate = {
  id: "123",
  author: "sample",
  body: "reviewed",
  datetime: null,
  primary: "https://x.com/sample/status/123",
};
test("relative native timestamp opens the unique actually observed permalink once", async () => {
  let details = 0;
  const writing = new PlatformWriting({
    browser: { capabilities: () => [] },
    open: async () => ({
      page: action.accountURL,
      accountHandle: "sample",
      posts: [candidate],
    }),
    readPost: async (t) => {
      details++;
      assert.equal(t.url, candidate.primary);
      return {
        accountHandle: "sample",
        posts: [{ ...candidate, datetime: "2026-10-11T02:00:01Z" }],
      };
    },
    clock: () => Date.parse("2026-10-11T02:01:00Z"),
  });
  const r = await writing.findSubmission(action);
  assert.equal(r.verified, true);
  assert.equal(details, 1);
});
test("baseline never opens relative timestamp details", async () => {
  let details = 0;
  const writing = new PlatformWriting({
    browser: { capabilities: () => [] },
    open: async () => ({
      page: action.accountURL,
      accountHandle: "sample",
      posts: [candidate],
    }),
    readPost: async () => {
      details++;
      throw Error("must not read details");
    },
    clock: () => Date.parse("2026-10-11T02:01:00Z"),
  });
  await writing.findSubmission(action, { phase: "baseline" });
  assert.equal(details, 0);
});
test("same-route native loading waits for the actual target card without navigation", async () => {
  let reads = 0;
  const actions = [];
  const observation = new PlatformObservation({
    clock: () => 1,
    browser: {
      observe: async () => ({
        page: candidate.primary,
        accountHandle: "sample",
        needsStateCheck: ++reads < 3,
        loading: reads < 3,
        posts: reads < 3 ? [] : [candidate],
      }),
      act: async (c) => actions.push(c),
    },
  });
  const r = await observation.open(
    { url: candidate.primary, evidenceRef: "proof" },
    { view: "posts", targetId: "123" },
  );
  assert.equal(r.posts.length, 1);
  assert.equal(actions.filter((a) => a.operation === "openObserved").length, 0);
  assert.equal(actions[0].targetId, "123");
});
