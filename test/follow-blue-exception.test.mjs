import test from "node:test";
import assert from "node:assert/strict";
import { fixture, NOW } from "./fixtures.mjs";

function permit(f, action = f.read().actions[0]) {
  return {
    kind: "follow-blue-check",
    userAuthorized: true,
    actionId: action.id,
    handle: action.handle,
    accountHandle: action.accountHandle,
    evidenceRef: f.proof,
    scopeEvidenceRef: f.proof,
    expiresAt: new Date(NOW + 60000).toISOString(),
  };
}

function configure(f, mutate = () => {}) {
  f.edit((s) => {
    const a = s.actions[0];
    a.quality.blue = null;
    a.quality.blueCheckException = permit(f, a);
    mutate(a, s);
  });
}

function personObservation(f, transform) {
  const observe = f.browser.observe.bind(f.browser);
  f.browser.observe = async (query) => {
    const value = await observe(query);
    return query.view === "person" ? transform(value, query) : value;
  };
}

for (const blue of [null, false]) {
  test(`authorized original follow preserves badge ${blue}`, async (t) => {
    const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
    configure(f);
    personObservation(f, (value) => ({ ...value, blue }));
    const r = await f.harness.followOne({
      taskId: "round-1",
      handle: "reader",
    });
    assert.equal(f.read().actions[0].status, "verified", JSON.stringify(r));
    assert.equal(f.writes.length, 1);
    assert.equal(f.read().actions[0].quality.blue, null);
    await f.harness.followOne({ taskId: "round-1", handle: "reader" });
    assert.equal(f.writes.length, 1, "verified original ID never resubmits");
  });
}

for (const mode of [
  "absent",
  "unsigned",
  "kind",
  "action",
  "handle",
  "account",
  "expired",
  "invalid-time",
  "policy-proof",
  "scope-proof",
  "chinese",
  "review",
]) {
  test(`invalid qualification exception fails before intent: ${mode}`, async (t) => {
    const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
    configure(f, (a) => {
      const p = a.quality.blueCheckException;
      if (mode === "absent") delete a.quality.blueCheckException;
      if (mode === "unsigned") p.userAuthorized = false;
      if (mode === "kind") p.kind = "reply";
      if (mode === "action") p.actionId = "other";
      if (mode === "handle") p.handle = "other";
      if (mode === "account") p.accountHandle = "other";
      if (mode === "expired") p.expiresAt = new Date(NOW).toISOString();
      if (mode === "invalid-time") p.expiresAt = "invalid";
      if (mode === "policy-proof") p.evidenceRef = "/missing";
      if (mode === "scope-proof") p.scopeEvidenceRef = "/missing";
      if (mode === "chinese") a.quality.chinese = false;
      if (mode === "review") a.quality.approved = false;
    });
    await f.harness.followOne({ taskId: "round-1", handle: "reader" });
    assert.equal(f.writes.length, 0);
    assert.equal(f.read().attempts.length, 0);
  });
}

test("ordinary approved blue cannot ignore a fresh contradictory badge", async (t) => {
  const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
  personObservation(f, (value) => ({ ...value, blue: false }));
  await f.harness.followOne({ taskId: "round-1", handle: "reader" });
  assert.equal(f.writes.length, 0);
});

for (const mode of [
  "identity",
  "alerts",
  "relationship",
  "expiry-during-read",
]) {
  test(`exception retains fresh-person boundary: ${mode}`, async (t) => {
    const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
    configure(f);
    personObservation(f, (value) => {
      if (mode === "expiry-during-read") f.setNow(NOW + 60000);
      return {
        ...value,
        blue: null,
        ...(mode === "identity" ? { accountHandle: "other" } : {}),
        ...(mode === "alerts" ? { alerts: ["stop"] } : {}),
        ...(mode === "relationship" ? { relationship: "unknown" } : {}),
      };
    });
    await f.harness.followOne({ taskId: "round-1", handle: "reader" });
    assert.equal(f.writes.length, 0);
    assert.equal(f.read().attempts.length, 0);
  });
}

test("preexisting and unknown keep original no-new-intent semantics", async (t) => {
  for (const status of ["preexisting", "unknown"]) {
    const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
    configure(f, (a, s) => {
      if (status === "unknown") {
        a.status = "unknown";
        a.intentAt = new Date(NOW - 1000).toISOString();
        s.items.find((item) => item.kind === "follow").unknown = 1;
        s.attempts.push({ actionId: a.id, kind: "follow", at: a.intentAt });
      }
    });
    if (status === "preexisting") f.following.add("reader");
    await f.harness.followOne({ taskId: "round-1", handle: "reader" });
    await f.harness.followOne({ taskId: "round-1", handle: "reader" });
    assert.equal(f.writes.length, 0);
    assert.equal(f.read().attempts.length, status === "unknown" ? 1 : 0);
  }
});

for (const scoped of [false, true]) {
  test(`review persists explicit authorization, scoped=${scoped}`, async (t) => {
    const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
    const a = f.read().actions[0],
      exception = permit(f, a);
    let api = f.harness;
    if (scoped) {
      f.edit((s) => {
        s.executions = {
          follow: {
            id: "follow",
            tabId: "follow",
            scopeKinds: ["follow"],
            status: "RUNNING",
            evidenceRef: f.proof,
          },
        };
      });
      api = f.newExecutor("follow", ["follow"]).api;
    }
    await api.runGrowthRound({
      taskId: "round-1",
      maxActions: 1,
      decision: {
        actionId: a.id,
        approved: true,
        evidenceRef: f.proof,
        blue: null,
        chinese: true,
        blueCheckException: exception,
      },
    });
    assert.deepEqual(f.read().actions[0].quality.blueCheckException, exception);
    assert.equal(f.read().actions[0].quality.blue, null);
    assert.equal(f.writes.length, 1);
  });
}

test("qualification exception adds no browser observations", async (t) => {
  const ordinary = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
  const exceptional = fixture(t, {
    planned: [1, 0, 0],
    actionKinds: ["follow"],
  });
  configure(exceptional);
  await ordinary.harness.followOne({ taskId: "round-1", handle: "reader" });
  await exceptional.harness.followOne({ taskId: "round-1", handle: "reader" });
  assert.deepEqual(exceptional.observations, ordinary.observations);
  assert.equal(exceptional.writes.length, ordinary.writes.length);
});

test("expired exception still allows read-only recovery of the original unknown", async (t) => {
  const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
  configure(f, (a, s) => {
    a.status = "unknown";
    a.intentAt = new Date(NOW - 2000).toISOString();
    s.items.find((item) => item.kind === "follow").unknown = 1;
    a.quality.blueCheckException.expiresAt = new Date(NOW - 1).toISOString();
    s.attempts.push({ actionId: a.id, kind: "follow", at: a.intentAt });
  });
  f.following.add("reader");
  const result = await f.harness.verifySubmission({
    taskId: "round-1",
    actionId: "follow-0",
  });
  assert.equal(f.read().actions[0].status, "verified", JSON.stringify(result));
  assert.equal(f.writes.length, 0);
  assert.equal(f.read().attempts.length, 1);
});

test("mixed prepared batch shares normal serial execution and durable verification", async (t) => {
  const f = fixture(t, {
    planned: [5, 0, 0],
    actionKinds: Array(5).fill("follow"),
  });
  f.edit((s) => {
    s.actions.forEach((a, i) => {
      a.handle = `reader${i}`;
      a.url = `https://x.com/reader${i}`;
      a.quality.handle = a.handle;
      if (i === 0) {
        a.quality.blue = null;
        a.quality.blueCheckException = permit(f, a);
      }
    });
  });
  personObservation(f, (value, query) => ({
    ...value,
    blue: query.handle === "reader0" ? null : true,
  }));
  const handles = f.read().actions.map((a) => a.handle);
  const r = await f.harness.followBatch({ taskId: "round-1", handles });
  assert.equal(r.verifiedThisCall, 5, JSON.stringify(r));
  assert.equal(f.writes.length, 5);
  await f.harness.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 5);
});
