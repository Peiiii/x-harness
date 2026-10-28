import test from "node:test";
import assert from "node:assert/strict";
import { ActionTrace } from "../dist/action-trace.js";

test("stage start is durable before a pending operation returns", async () => {
  const events = [];
  let finish;
  const trace = new ActionTrace(
    {
      recordProof: async (e) => {
        events.push(e);
        return `proof-${events.length}`;
      },
    },
    () => 100,
    { id: "synthetic-original", kind: "original" },
  );
  const pending = trace.run(
    "activate.dom-click",
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  await new Promise(setImmediate);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "started");
  finish({
    body: "not logged",
    headers: { authorization: "secret" },
    verified: true,
  });
  await pending;
  assert.equal(events[1].status, "returned");
  assert.deepEqual(events[1].summary, { verified: true });
  assert.equal(JSON.stringify(events).includes("secret"), false);
  assert.equal(JSON.stringify(events).includes("not logged"), false);
});

test("error logs original diagnostic and never retries the operation", async () => {
  const events = [];
  let calls = 0;
  const trace = new ActionTrace(
    {
      recordProof: async (e) => {
        events.push(e);
        return "proof";
      },
    },
    () => 100,
    { id: "synthetic-reply", kind: "reply" },
  );
  const error = Object.assign(Error("timeout"), {
    submissionDiagnostic: { editorState: "retained" },
  });
  await assert.rejects(
    trace.run("editor.clear", async () => {
      calls++;
      throw error;
    }),
    (e) => e === error,
  );
  assert.equal(calls, 1);
  assert.equal(events[1].status, "error");
  assert.equal(events[1].submissionDiagnostic.editorState, "retained");
});

test("diagnostic storage failure cannot repeat or change a successful business call", async () => {
  let calls = 0;
  const trace = new ActionTrace(
    {
      recordProof: async () => {
        throw Error("unavailable");
      },
    },
    () => 100,
    { id: "synthetic-original", kind: "original" },
  );
  assert.equal(
    await trace.run("submit", async () => {
      calls++;
      return 7;
    }),
    7,
  );
  assert.equal(calls, 1);
});

import { fixture, NOW } from "./fixtures.mjs";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { readFileSync } from "node:fs";
test("root publication keeps durable stages and submits once", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => NOW,
  });
  const result = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
  });
  assert.equal(result.status, "verified");
  assert.equal(f.writes.length, 1);
  const a = f.read().actions[0];
  const resultProof = JSON.parse(readFileSync(a.resultEvidence, "utf8"));
  const refs = resultProof.observation.actionTrace.evidenceRefs;
  const stages = refs.map((r) => JSON.parse(readFileSync(r, "utf8")));
  for (const stage of ["baseline-read", "submit", "verify-public"]) {
    assert.ok(stages.some((s) => s.stage === stage && s.status === "started"));
    assert.ok(stages.some((s) => s.stage === stage && s.status === "returned"));
  }
  await api.publishPost({ taskId: "round-1", draftPath: f.draft });
  assert.equal(f.writes.length, 1);
});

test("read-only recovery retains the failed submission trace in the same action history", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  f.browser.failAfter = "submitPost";
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => NOW,
  });
  const first = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
  });
  assert.equal(first.status, "unknown");
  const old = f.read().actions[0].resultEvidence;
  f.browser.failAfter = undefined;
  const recovered = await api.verifySubmission({
    taskId: "round-1",
    actionId: f.read().actions[0].id,
  });
  assert.equal(recovered.status, "verified");
  assert.equal(f.writes.length, 1);
  assert.ok(f.read().actions[0].resultEvidenceHistory.includes(old));
  assert.equal(
    JSON.parse(readFileSync(old, "utf8")).observation.actionTrace.evidenceRefs
      .length > 0,
    true,
  );
});
