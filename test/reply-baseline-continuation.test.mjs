import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness, createXPlatform } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

async function run(t, mode, kind = "reply") {
  const f = fixture(t, {
    planned: kind === "reply" ? [0, 0, 1] : [0, 1, 0],
    actionKinds: [kind],
  });
  const platform = createXPlatform(f.browser, { clock: () => NOW });
  const original = platform.findSubmission;
  let reads = 0;
  platform.findSubmission = async (action, context) => {
    if (context?.phase !== "baseline") return original(action, context);
    reads++;
    assert.equal(f.read().actions[0].status, "prepared");
    assert.equal(f.writes.length, 0);
    if (mode === "unrelated") throw Error("policy denied");
    if (reads === 1 || mode === "repeated")
      throw Error("Timed out waiting for URL https://x.com/author/status/123");
    if (mode === "alert")
      return {
        needsStateCheck: false,
        alerts: ["verification required"],
        posts: [],
      };
    if (mode === "unconfirmed")
      return { needsStateCheck: true, alerts: [], posts: [] };
    return original(action, context);
  };
  const api = createBusinessHarness({
    platform,
    store: f.store,
    clock: () => NOW,
  });
  const action = f.read().actions[0];
  const result =
    kind === "reply"
      ? await api.replyToPost({
          taskId: "round-1",
          postId: action.postId,
          text: action.text,
        })
      : await api.publishPost({ taskId: "round-1", draftPath: f.draft });
  return { f, result, reads };
}

test("prepared reply URL timeout continues one baseline read and submits exactly once", async (t) => {
  const { f, result, reads } = await run(t, "transient");
  assert.equal(reads, 2);
  assert.equal(result.status, "verified");
  assert.equal(f.writes.length, 1);
});
for (const mode of ["repeated", "unrelated", "alert", "unconfirmed"]) {
  test(`reply baseline ${mode} leaves the original action prepared with zero writes`, async (t) => {
    const { f, result, reads } = await run(t, mode);
    assert.equal(reads, mode === "unrelated" ? 1 : 2);
    assert.equal(result.status, "needsDecision");
    assert.equal(f.writes.length, 0);
    assert.equal(f.read().actions[0].status, "prepared");
    assert.equal(f.read().actions[0].intentAt, undefined);
  });
}
test("original-post URL timeout does not inherit reply continuation", async (t) => {
  const { f, reads } = await run(t, "transient", "original");
  assert.equal(reads, 1);
  assert.equal(f.writes.length, 0);
  assert.equal(f.read().actions[0].status, "prepared");
});
