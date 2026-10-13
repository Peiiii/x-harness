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

test("one lookup recovers unique own-account permalinks for the whole unknown batch", async (t) => {
  const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 2] });
  const snap = await f.store.load();
  const a = snap.state.actions[0];
  a.id = "a";
  a.status = "unknown";
  a.intentAt = new Date(NOW).toISOString();
  a.text = "first";
  a.beforeIds = [];
  const b = { ...a, id: "b", text: "second", postId: "456" };
  snap.state.actions.push(b);
  await f.store.transaction(() => snap.state);
  const api = createBusinessHarness({
    store: f.store,
    platform: {},
    clock: () => NOW,
  });
  let lookups = 0,
    writes = 0;
  api.replyToPost = async (q) => {
    writes++;
    return { status: "unknown", actionId: q.postId === "123" ? "a" : "b" };
  };
  api.verifySubmission = async (q) => {
    const a = (await f.store.load()).state.actions.find(
      (a) => a.id === q.actionId,
    );
    return {
      status: a.observedPublicURL ? "verified" : "unknown",
      actionId: q.actionId,
    };
  };
  api.searchSources = async (q) => {
    lookups++;
    assert.match(q.query, /from:Pei/);
    assert.match(q.query, /first.*OR.*second/);
    return {
      fresh: true,
      evidenceRef: f.proof,
      sources: [
        {
          id: "11",
          author: "Pei",
          body: "first",
          datetime: new Date(NOW + 1000).toISOString(),
          url: "https://x.com/Pei/status/11",
        },
        {
          id: "12",
          author: "Pei",
          body: "second",
          datetime: new Date(NOW + 1000).toISOString(),
          url: "https://x.com/Pei/status/12",
        },
      ],
    };
  };
  const r = await api.replyBatch({ taskId: "round-1", actions: [a, b] });
  assert.equal(r.status, "verified");
  assert.equal(lookups, 1);
  assert.equal(writes, 2);
  const s = (await f.store.load()).state;
  assert.equal(s.actions[0].observedPublicURL, "https://x.com/Pei/status/11");
  assert.equal(s.actions[1].observedPublicURL, "https://x.com/Pei/status/12");
});

test("ambiguous, changed, old or foreign lookup rows never bind an unknown receipt", async (t) => {
  const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 1] });
  await f.store.transaction(({ state }) => {
    Object.assign(state.actions[0], {
      status: "unknown",
      intentAt: new Date(NOW).toISOString(),
      beforeIds: ["9"],
    });
    return state;
  });
  const action = (await f.store.load()).state.actions[0];
  const row = {
    id: "11",
    author: "Pei",
    body: action.text,
    datetime: new Date(NOW + 1000).toISOString(),
    url: "https://x.com/Pei/status/11",
  };
  const api = createBusinessHarness({
    store: f.store,
    platform: {},
    clock: () => NOW,
  });
  api.replyToPost = async () => ({ status: "unknown", actionId: action.id });
  api.verifySubmission = async () => ({
    status: "unknown",
    actionId: action.id,
  });
  for (const rows of [
    [row, { ...row, id: "12", url: "https://x.com/Pei/status/12" }],
    [{ ...row, author: "other" }],
    [{ ...row, body: "changed" }],
    [{ ...row, id: "9", url: "https://x.com/Pei/status/9" }],
    [{ ...row, datetime: new Date(NOW - 1000).toISOString() }],
    [{ ...row, datetime: new Date(NOW + 6000).toISOString() }],
    [{ ...row, url: "https://other.example/status/11" }],
  ]) {
    api.searchSources = async () => ({
      fresh: true,
      evidenceRef: f.proof,
      sources: rows,
    });
    const r = await api.replyBatch({ taskId: "round-1", actions: [action] });
    assert.equal(r.results[0].status, "unknown");
    assert.equal(
      (await f.store.load()).state.actions[0].observedPublicURL,
      undefined,
    );
  }
});

test("conditional reply end-check accounts only for its original action IDs without changing daily goals", async (t) => {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync } = await import("node:fs");
  const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 200] });
  const now = new Date().toISOString();
  await f.store.transaction(({ state }) => {
    const first = state.actions[0];
    first.status = "verified";
    first.resultEvidence = f.proof;
    const second = { ...first, id: "gap-second", status: "unknown" };
    state.actions.push(second);
    const i = state.items.find((i) => i.kind === "reply");
    Object.assign(i, { verified: 50, unknown: 10 });
    state.executions = {
      gap: {
        scopeKinds: ["reply"],
        evidenceRef: f.proof,
        status: "WAITING",
        currentWork: "Original conditional submissions await public evidence",
        followGapCondition: {
          sourceExecutor: "follow",
          authorizationEvidenceRef: f.proof,
          planned: 2,
          actionIds: [first.id, second.id],
        },
        stop: {
          independentActionsHandled: true,
          evidenceRef: f.proof,
          nextEligibleCheckAt: new Date(Date.now() + 60000).toISOString(),
          nextScheduledCheckAt: new Date(Date.now() + 60000).toISOString(),
          replyExit: {
            reason: "pending-results",
            observedAt: now,
            evidenceRef: f.proof,
            independentEvidenceRef: f.proof,
          },
        },
      },
    };
    return state;
  });
  const before = readFileSync(f.ledger, "utf8");
  const cli = new URL("../dist/round-state.js", import.meta.url).pathname;
  const out = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {runRoundCLI} from ${JSON.stringify("file://" + cli)};process.argv.splice(1,0,'cli');runRoundCLI();`,
      "--",
      f.ledger,
      "--execution=gap",
      "--check-end",
    ],
    { encoding: "utf8" },
  );
  const r = JSON.parse(out);
  assert.equal(r.mayEnd, true);
  assert.deepEqual(r.pending, [{ kind: "reply", remaining: 1, unknown: 1 }]);
  assert.equal(readFileSync(f.ledger, "utf8"), before);
});

test("serialized shared metric aliases do not discard the visible button counts", () => {
  const post = {
    id: "1",
    body: "hello",
    primary: "/peer/status/1",
    buttons: [{ label: "25 喜欢次数。喜欢" }],
    metrics: ["[Circular]", { label: "1002 次查看。查看帖子分析" }],
  };
  assert.deepEqual(publicSource(source(post, "https://x.com/search")).metrics, [
    "25 喜欢次数。喜欢",
    "1002 次查看。查看帖子分析",
  ]);
});
