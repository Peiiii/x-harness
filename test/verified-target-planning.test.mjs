import test from "node:test";
import assert from "node:assert/strict";
import { VerifiedTargetPlanning } from "../dist/verified-target-planning.js";
import { fixture, NOW } from "./fixtures.mjs";
const options = (f) => ({
  taskId: "round-1",
  kind: "reply",
  target: 200,
  sourceCategories: ["mutual", "casual"],
  userAuthorized: true,
  evidenceRef: f.proof,
});
const planner = (f) =>
  new VerifiedTargetPlanning(
    f.store,
    { id: "worker", scopeKinds: ["reply"], evidenceRef: f.proof },
    () => NOW,
  );
test("authorized qualified success target maps raw reservations without erasing facts", async (t) => {
  const f = fixture(t, { actionKinds: [] });
  await f.store.transaction(({ state }) => {
    Object.assign(state.items[2], { planned: 200, verified: 177, unknown: 23 });
    state.actions = Array.from({ length: 177 }, (_, i) => ({
      id: "a" + i,
      kind: "reply",
      status: "verified",
      sourceCategory: i < 160 ? "mutual" : "incoming",
    }));
    state.executions = { other: { status: "VERIFYING" } };
    state.attempts = [{ kind: "reply", at: "original" }];
    return state;
  });
  const r = await planner(f).run(options(f));
  assert.equal(r.capacity, 240);
  assert.equal(r.remaining, 40);
  const s = (await f.store.load()).state;
  assert.equal(s.items[2].unknown, 23);
  assert.equal(s.items[2].verified, 177);
  assert.equal(s.executions.other.status, "VERIFYING");
  assert.deepEqual(s.attempts, [{ kind: "reply", at: "original" }]);
  assert.equal(s.actions.length, 177);
  assert.ok(f.store.evidenceExists(r.evidenceRef));
});
test("missing permission, proof, scope and task do not mutate original plan", async (t) => {
  const f = fixture(t);
  const before = (await f.store.load()).revision;
  for (const change of [
    { userAuthorized: false },
    { userAuthorized: "yes" },
    { sourceCategories: "mutual" },
    { excludedActionIds: "old" },
    { excludedActionIds: [""] },
    { evidenceRef: "/missing" },
    { kind: "follow" },
    { taskId: "other" },
  ])
    assert.equal(
      (await planner(f).run({ ...options(f), ...change })).status,
      "needsDecision",
    );
  assert.equal((await f.store.load()).revision, before);
});
test("audited exclusions preserve real successes and unknowns while keeping the qualified target", async (t) => {
  const f = fixture(t, { actionKinds: [] });
  await f.store.transaction(({ state }) => {
    Object.assign(state.items[2], { planned: 3, verified: 2, unknown: 1 });
    state.actions = ["qualified", "audited-duplicate"].map((id) => ({
      id,
      kind: "reply",
      status: "verified",
      sourceCategory: "mutual",
    }));
    return state;
  });
  const r = await planner(f).run({
    ...options(f),
    target: 2,
    excludedActionIds: ["audited-duplicate"],
  });
  assert.equal(r.matchedVerified, 1);
  assert.equal(r.remaining, 1);
  assert.equal(r.capacity, 4);
  const s = (await f.store.load()).state;
  assert.equal(s.items[2].verified, 2);
  assert.equal(s.items[2].unknown, 1);
  assert.equal(s.actions[1].status, "verified");
  assert.deepEqual(s.planAdjustments.at(-1).excludedActionIds, [
    "audited-duplicate",
  ]);
});
test("an existing larger plan never shrinks and zero remaining never claims completion", async (t) => {
  const f = fixture(t, { actionKinds: [] });
  await f.store.transaction(({ state }) => {
    state.items[2].planned = 300;
    state.items[2].verified = 200;
    state.actions = Array.from({ length: 200 }, (_, i) => ({
      id: "a" + i,
      kind: "reply",
      status: "verified",
      sourceCategory: "mutual",
    }));
    return state;
  });
  const r = await planner(f).run(options(f));
  assert.equal(r.capacity, 300);
  assert.equal(r.remaining, 0);
  assert.equal(r.status, "planned");
});
test("root batch plans each original action and stops new writes at the authorized verified target", async (t) => {
  const { createBusinessHarness } = await import("../dist/diagnostics.js");
  const f = fixture(t, { actionKinds: [], planned: [0, 0, 3] });
  await f.store.transaction(({ state }) => {
    state.items[2].verified = 1;
    state.items[2].unknown = 2;
    state.actions = [
      {
        id: "old",
        kind: "reply",
        status: "verified",
        sourceCategory: "incoming",
      },
      {
        id: "a",
        kind: "reply",
        status: "prepared",
        postId: "1",
        text: "hello",
        sourceCategory: "mutual",
      },
      {
        id: "b",
        kind: "reply",
        status: "prepared",
        postId: "2",
        text: "hello2",
        sourceCategory: "mutual",
      },
    ];
    return state;
  });
  const api = createBusinessHarness({
    platform: {},
    store: f.store,
    clock: () => NOW,
    executor: {
      id: "worker",
      tabId: "synthetic-tab",
      scopeKinds: ["reply"],
      evidenceRef: f.proof,
    },
  });
  let writes = 0;
  api.replyToPost = async (q) => {
    writes++;
    await f.store.transaction(({ state }) => {
      state.actions.find((a) => a.postId === q.postId).status = "verified";
      state.items[2].verified++;
      return state;
    });
    return { status: "verified", actionId: "a" };
  };
  const r = await api.replyBatch({
    taskId: "round-1",
    actions: (await f.store.load()).state.actions.filter(
      (a) => a.status === "prepared",
    ),
    verifiedTarget: {
      target: 1,
      sourceCategories: ["mutual"],
      userAuthorized: true,
      evidenceRef: f.proof,
    },
  });
  assert.equal(writes, 1);
  assert.equal(r.results[1].reason, "verified-target-reached");
  assert.equal((await f.store.load()).state.items[2].unknown, 2);
});
