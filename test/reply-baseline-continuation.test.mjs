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

for (const mode of ["hinted", "repeated", "unhinted", "missing-proof"]) {
  test(`original unknown reply ${mode} URL recovery stays read-only and bounded`, async (t) => {
    const f = fixture(t, { planned: [0, 0, 1], actionKinds: ["reply"] });
    const platform = createXPlatform(f.browser, { clock: () => NOW });
    const api = createBusinessHarness({
      platform,
      store: f.store,
      clock: () => NOW,
    });
    const action = f.read().actions[0];
    const first = await api.replyToPost({
      taskId: "round-1",
      postId: action.postId,
      text: action.text,
    });
    assert.equal(first.status, "verified");
    f.edit((s) => {
      s.actions[0].status = "unknown";
      s.items[2].verified = 0;
      s.items[2].unknown = 1;
      if (mode !== "unhinted") {
        s.actions[0].observedPublicURL = first.publicURL;
        s.actions[0].observedPublicEvidenceRef =
          mode === "missing-proof" ? "/missing-proof.json" : first.evidenceRef;
      }
    });
    let reads = 0;
    const original = platform.findSubmission;
    platform.findSubmission = async (a, context) => {
      reads++;
      assert.equal(f.writes.length, 1);
      if (reads === 1 || mode === "repeated")
        throw Error("Timed out waiting for URL https://x.com/Pei/status/101");
      return original(a, context);
    };
    const out = await api.verifySubmission({
      taskId: "round-1",
      actionId: action.id,
    });
    assert.equal(reads, ["hinted", "repeated"].includes(mode) ? 2 : 1);
    assert.equal(out.status, mode === "hinted" ? "verified" : "unknown");
    assert.equal(f.writes.length, 1);
  });
}
