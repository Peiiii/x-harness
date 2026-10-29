import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync } from "node:fs";
import { fixture, NOW } from "./fixtures.mjs";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { OriginalPostCadence } from "../dist/original-post-cadence.js";

function prepared(t) {
  const f = fixture(t, {
    planned: [0, 2, 0],
    actionKinds: ["original", "original"],
  });
  copyFileSync(f.draft, f.draft + "-2.post.md");
  f.edit((s) => {
    s.actions[1].draftPath = f.draft + "-2.post.md";
  });
  let now = NOW;
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => now,
  });
  return {
    ...f,
    api,
    tick(value) {
      now = value;
      f.setNow(value);
    },
  };
}
async function enable(f) {
  const result = await f.api.configureOriginalCadence({
    taskId: "round-1",
    minGapMs: 120000,
    userAuthorized: true,
    evidenceRef: f.proof,
  });
  assert.equal(result.status, "configured");
}

test("root originals share an opt-in gap and resume at the exact boundary without extra intent", async (t) => {
  const f = prepared(t);
  await enable(f);
  assert.equal(
    (await f.api.publishPost({ taskId: "round-1", draftPath: f.draft })).status,
    "verified",
  );
  const second = await f.api.publishPost({
    taskId: "round-1",
    draftPath: f.draft + "-2.post.md",
  });
  assert.equal(second.status, "waiting");
  assert.equal(second.reason, "original-post-cadence");
  assert.equal(second.resumeAt, new Date(NOW + 120000).toISOString());
  assert.equal(f.read().actions[1].status, "prepared");
  assert.equal(f.read().attempts.length, 1);
  f.tick(NOW + 120000);
  assert.equal(
    (
      await f.api.publishPost({
        taskId: "round-1",
        draftPath: f.draft + "-2.post.md",
      })
    ).status,
    "verified",
  );
  assert.equal(f.read().attempts.length, 2);
  assert.equal(
    Date.parse(f.read().actions[1].activatedAt) -
      Date.parse(f.read().actions[0].activatedAt),
    120000,
  );
});

test("unconfigured behavior is unchanged and invalid or unproved policy is rejected", async (t) => {
  const f = prepared(t);
  assert.equal(
    (
      await f.api.configureOriginalCadence({
        taskId: "round-1",
        minGapMs: -1,
        userAuthorized: true,
        evidenceRef: f.proof,
      })
    ).status,
    "needsDecision",
  );
  assert.equal(
    (
      await f.api.configureOriginalCadence({
        taskId: "round-1",
        minGapMs: 120000,
        userAuthorized: false,
        evidenceRef: f.proof,
      })
    ).status,
    "needsDecision",
  );
  assert.equal(
    (await f.api.publishPost({ taskId: "round-1", draftPath: f.draft })).status,
    "verified",
  );
  assert.equal(
    (
      await f.api.publishPost({
        taskId: "round-1",
        draftPath: f.draft + "-2.post.md",
      })
    ).status,
    "verified",
  );
  assert.equal(
    f.read().actions.some((a) => a.activatedAt),
    false,
  );
});

test("shared atomic click reservations permit only one simultaneous original", async (t) => {
  const f = prepared(t);
  await enable(f);
  f.edit((s) => {
    for (const a of s.actions) {
      a.status = "intent";
      a.intentAt = new Date(NOW).toISOString();
    }
    s.items[1].unknown = 2;
  });
  const other = f.newExecutor("other-original", ["original"]);
  const first = new OriginalPostCadence(f.store, () => NOW);
  const second = new OriginalPostCadence(other.store, () => NOW);
  const actions = f.read().actions;
  const results = await Promise.all([
    f.store.withLock(() => first.reserve(actions[0], true)),
    other.store.withLock(() => second.reserve(actions[1], true)),
  ]);
  assert.equal(results.filter((r) => !r.need).length, 1);
  assert.equal(results.filter((r) => r.need?.status === "waiting").length, 1);
  assert.equal(f.read().actions.filter((a) => a.activatedAt).length, 1);
});

test("a competing activation during composition returns prepared waiting without clicking", async (t) => {
  const f = prepared(t);
  await enable(f);
  const originalSubmit = f.platform.submitPost;
  let clicks = 0;
  f.platform.submitPost = async (a) => {
    f.edit((s) => {
      s.actions[1].status = "verified";
      s.actions[1].activatedAt = new Date(NOW).toISOString();
      s.actions[1].intentAt = new Date(NOW).toISOString();
      s.items[1].verified = 1;
    });
    await a.beforeSubmit();
    clicks++;
    return originalSubmit(a);
  };
  const actor = f.newExecutor("composing-original", ["original"]);
  const api = createBusinessHarness({
    store: actor.store,
    platform: f.platform,
    clock: () => NOW,
    executor: {
      id: "composing-original",
      scopeKinds: ["original"],
      tabId: "composing-original",
      evidenceRef: f.proof,
    },
  });
  const result = await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
  });
  assert.equal(clicks, 0);
  assert.equal(result.status, "waiting");
  assert.equal(f.read().actions[0].status, "prepared");
  assert.equal(f.read().items[1].unknown, 0);
});

test("a cadence resume outside the exclusive draft end cannot extend the window", async (t) => {
  const f = prepared(t);
  await enable(f);
  await f.api.publishPost({ taskId: "round-1", draftPath: f.draft });
  f.edit((s) => {
    s.actions[1].notAfter = new Date(NOW + 120000).toISOString();
  });
  const result = await f.api.publishPost({
    taskId: "round-1",
    draftPath: f.draft + "-2.post.md",
  });
  assert.equal(result.status, "needsDecision");
  assert.equal(result.reason, "original-cadence-outside-draft-window");
  assert.equal(f.read().actions[1].status, "prepared");
  assert.equal(f.read().attempts.length, 1);
});

test("unknown submission verification remains read-only despite cadence", async (t) => {
  const f = prepared(t);
  await enable(f);
  await f.api.publishPost({ taskId: "round-1", draftPath: f.draft });
  f.edit((s) => {
    s.actions[0].status = "unknown";
    s.items[1].verified = 0;
    s.items[1].unknown = 1;
  });
  const count = f.writes.length;
  const result = await f.api.verifySubmission({
    taskId: "round-1",
    actionId: "original-0",
  });
  assert.equal(result.status, "verified");
  assert.equal(f.writes.length, count);
});

test("independent publishing applies the same shared original gate", async (t) => {
  const f = prepared(t);
  await enable(f);
  await f.api.publishPost({ taskId: "round-1", draftPath: f.draft });
  const result = await f.api.publishPost({
    taskId: "round-1",
    draftPath: f.draft + "-2.post.md",
    independentExecution: {
      tabId: "independent",
      evidenceRef: f.proof,
      scopeEvidenceRef: f.proof,
    },
  });
  assert.equal(result.status, "waiting");
  assert.equal(f.read().attempts.length, 1);
});

test("original-scoped root retains activation and blocks the next same-account post", async (t) => {
  const f = prepared(t);
  const actor = f.newExecutor("original-cadence", ["original"]);
  const api = createBusinessHarness({
    store: actor.store,
    platform: f.platform,
    clock: () => NOW,
    executor: {
      id: "original-cadence",
      scopeKinds: ["original"],
      tabId: "original-cadence",
      evidenceRef: f.proof,
    },
  });
  assert.equal(
    (
      await api.configureOriginalCadence({
        taskId: "round-1",
        minGapMs: 120000,
        userAuthorized: true,
        evidenceRef: f.proof,
      })
    ).status,
    "configured",
  );
  assert.equal(
    (await api.publishPost({ taskId: "round-1", draftPath: f.draft })).status,
    "verified",
  );
  assert.equal(f.read().actions[0].activatedAt, new Date(NOW).toISOString());
  assert.equal(
    (
      await api.publishPost({
        taskId: "round-1",
        draftPath: f.draft + "-2.post.md",
      })
    ).status,
    "waiting",
  );
});

test("unchanged authorized cadence is read without rewriting the shared ledger", async (t) => {
  const f = prepared(t);
  await enable(f);
  const save = f.store.save.bind(f.store);
  let writes = 0;
  f.store.save = async (...args) => {
    writes++;
    return save(...args);
  };
  const same = await f.api.configureOriginalCadence({
    taskId: "round-1",
    minGapMs: 120000,
    userAuthorized: true,
    evidenceRef: f.proof,
  });
  assert.equal(same.status, "configured");
  assert.equal(writes, 0);
  const changed = await f.api.configureOriginalCadence({
    taskId: "round-1",
    minGapMs: 180000,
    userAuthorized: true,
    evidenceRef: f.proof,
  });
  assert.equal(changed.status, "configured");
  assert.equal(writes, 1);
  assert.equal(f.read().execution.originalCadence.minGapMs, 180000);
});
