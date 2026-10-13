import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness, createXPlatform } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";
import { source } from "../dist/platform-rules.js";
import { source as publicSource } from "../dist/results.js";

test("reply submission baseline never reloads; verification still does", async (t) => {
  const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 1] });
  const platform = createXPlatform(f.browser, { clock: () => NOW });
  const original = platform.findSubmission;
  const phases = [];
  platform.findSubmission = async (a, c) => {
    phases.push(c?.phase ?? "verify");
    return original(a, c);
  };
  const api = createBusinessHarness({
    store: f.store,
    platform,
    clock: () => NOW,
  });
  const r = await api.replyToPost({
    taskId: "round-1",
    postId: "123",
    text: "有具体贡献的回复",
  });
  assert.equal(r.status, "verified");
  assert.equal(phases[0], "baseline");
  assert.equal(f.writes.length, 1);
  assert.equal(f.commands.filter((c) => c === "refreshPosts").length, 1);
});
test("batch owns one due pacing wait and read-only unknown recovery, no resend", async (t) => {
  const f = fixture(t);
  const api = createBusinessHarness({
    store: f.store,
    platform: {},
    clock: () => NOW,
  });
  const calls = [];
  const actions = [
    { id: "a", kind: "reply", postId: "1", text: "first" },
    { id: "b", kind: "reply", postId: "2", text: "second" },
  ];
  let b = 0;
  api.replyToPost = async (q) => {
    calls.push(q.postId);
    if (q.postId === "1") return { status: "unknown", actionId: "a" };
    return ++b === 1
      ? {
          status: "waiting",
          reason: "incoming-interaction-pacing",
          resumeAt: new Date(NOW).toISOString(),
        }
      : { status: "verified", actionId: "b" };
  };
  const recovered = [];
  api.verifySubmission = async (q) => {
    recovered.push(q.actionId);
    return { status: "verified", actionId: q.actionId };
  };
  const r = await api.replyBatch({ taskId: "round-1", actions });
  assert.equal(r.status, "verified");
  assert.deepEqual(calls, ["1", "2", "2"]);
  assert.deepEqual(recovered, ["a"]);
});
test("long waits and refusals leave remaining replies unsubmitted", async (t) => {
  const f = fixture(t);
  const api = createBusinessHarness({
    store: f.store,
    platform: {},
    clock: () => NOW,
  });
  for (const result of [
    {
      status: "waiting",
      reason: "incoming-interaction-pacing",
      resumeAt: new Date(NOW + 60000).toISOString(),
    },
    { status: "needsDecision", reason: "account-alert" },
  ]) {
    let n = 0;
    api.replyToPost = async () => {
      n++;
      return result;
    };
    const r = await api.replyBatch({
      taskId: "round-1",
      actions: [
        { id: "a", kind: "reply" },
        { id: "b", kind: "reply" },
      ],
    });
    assert.equal(n, 1);
    assert.equal(r.results.length, 1);
  }
});
test("batch discovery preserves visible metrics without exposing raw UI or inventing counts", () => {
  const raw = {
    id: "1",
    author: "peer",
    body: "hello",
    primary: "/peer/status/1",
    metrics: [
      { label: "34 喜欢次数。喜欢", hidden: "raw UI" },
      { label: "观看 511 查看" },
      { label: "unrelated menu" },
    ],
  };
  const out = publicSource(source(raw, "https://x.com/search"));
  assert.deepEqual(out.metrics, ["34 喜欢次数。喜欢", "观看 511 查看"]);
  assert.doesNotMatch(JSON.stringify(out), /raw UI|unrelated menu/);
  assert.deepEqual(
    publicSource(
      source({ ...raw, metrics: [], buttons: [] }, "https://x.com/search"),
    ).metrics,
    [],
  );
});
