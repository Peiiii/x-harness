import test from "node:test";
import assert from "node:assert/strict";
import { FollowPriority } from "../dist/follow-priority.js";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";
async function setup(t) {
  const f = fixture(t);
  const due = NOW + 1000;
  let clock = NOW;
  await f.store.transaction(({ state }) => {
    state.executions = {
      follow: {
        scopeKinds: ["follow"],
        tabId: "follow-tab",
        evidenceRef: f.proof,
        status: "WAITING",
        followBackoff: {
          reason: "relation-reverted",
          nextEligibleCheckAt: new Date(due).toISOString(),
          evidenceRef: f.proof,
        },
      },
      foreign: { status: "VERIFYING" },
    };
    Object.assign(state.items[0], {
      actionable: false,
      reason: "relation-reverted",
      resumeAt: new Date(due).toISOString(),
      resumeWhen: "verify original unknowns then recovery first",
      blockEvidence: [f.proof],
    });
    return state;
  });
  return {
    f,
    due,
    clock: () => clock,
    setClock: (v) => (clock = v),
    priority: new FollowPriority(f.store, () => clock),
  };
}
test("future backoff keeps replies available, exact expiry resumes only matching item", async (t) => {
  const q = await setup(t);
  const prior = await q.f.store.load();
  assert.equal((await q.priority.inspect("round-1", "follow")).ready, false);
  q.setClock(q.due);
  assert.equal((await q.priority.resume("round-1", "follow")).ready, true);
  const after = (await q.f.store.load()).state;
  assert.equal(after.items[0].actionable, true);
  assert.deepEqual(after.executions, prior.state.executions);
  assert.deepEqual(after.actions, prior.state.actions);
  assert.deepEqual(after.attempts, prior.state.attempts);
});
test("newer shared backoff and unrelated block cannot be reopened", async (t) => {
  const q = await setup(t);
  q.setClock(q.due);
  await q.f.store.transaction(({ state }) => {
    state.executions.foreign.followBackoff = {
      nextEligibleCheckAt: new Date(q.due + 1000).toISOString(),
      evidenceRef: q.f.proof,
    };
    return state;
  });
  assert.equal((await q.priority.resume("round-1", "follow")).ready, false);
  q.setClock(q.due + 1001);
  await q.f.store.transaction(({ state }) => {
    state.items[0].reason = "account-alert";
    return state;
  });
  assert.equal((await q.priority.resume("round-1", "follow")).ready, false);
  assert.equal((await q.f.store.load()).state.items[0].actionable, false);
});
test("reply batch yields at a boundary when recovery becomes due, before another intent", async (t) => {
  const q = await setup(t);
  const api = createBusinessHarness({
    store: q.f.store,
    platform: {},
    clock: q.clock,
  });
  let calls = 0;
  api.replyToPost = async () => {
    calls++;
    q.setClock(q.due);
    return { status: "verified" };
  };
  const r = await api.replyBatch({
    taskId: "round-1",
    followPriorityExecutorId: "follow",
    actions: [
      { id: "r1", kind: "reply" },
      { id: "r2", kind: "reply" },
    ],
  });
  assert.equal(calls, 1);
  assert.equal(r.results[1].reason, "follow-priority-ready");
  assert.ok(!(await q.f.store.load()).state.actions.some((a) => a.id === "r2"));
});
test("router runs replies before expiry and follows at expiry without changing other actors", async (t) => {
  const q = await setup(t);
  const api = createBusinessHarness({
    store: q.f.store,
    platform: {},
    clock: q.clock,
  });
  let replies = 0,
    follows = 0;
  api.replyBatch = async () => {
    replies++;
    return { status: "verified", results: [] };
  };
  const proto = Object.getPrototypeOf(api),
    original = proto.followBatch;
  proto.followBatch = async () => {
    follows++;
    return { status: "verified", verified: 1 };
  };
  t.after(() => (proto.followBatch = original));
  const args = {
    taskId: "round-1",
    follow: {
      executor: {
        id: "follow",
        scopeKinds: ["follow"],
        evidenceRef: q.f.proof,
      },
      handles: ["Peer1", "Peer2", "Peer3", "Peer4", "Peer5"],
    },
    reply: { actions: [] },
  };
  assert.equal((await api.runFollowPriorityBatch(args)).selected, "reply");
  assert.equal(follows, 0);
  q.setClock(q.due);
  assert.equal((await api.runFollowPriorityBatch(args)).selected, "follow");
  assert.equal(follows, 1);
  assert.equal(replies, 1);
});
test("router immediately follows after a reply reports the due boundary", async (t) => {
  const q = await setup(t);
  const api = createBusinessHarness({
    store: q.f.store,
    platform: {},
    clock: q.clock,
  });
  let follows = 0;
  api.replyBatch = async () => {
    q.setClock(q.due);
    return {
      status: "needsDecision",
      results: [{ reason: "follow-priority-ready" }],
    };
  };
  const proto = Object.getPrototypeOf(api),
    original = proto.followBatch;
  proto.followBatch = async () => {
    follows++;
    return { status: "verified" };
  };
  t.after(() => (proto.followBatch = original));
  const r = await api.runFollowPriorityBatch({
    taskId: "round-1",
    follow: {
      executor: {
        id: "follow",
        scopeKinds: ["follow"],
        evidenceRef: q.f.proof,
      },
      handles: ["Peer1", "Peer2", "Peer3", "Peer4", "Peer5"],
    },
    reply: { actions: [] },
  });
  assert.equal(r.selected, "follow");
  assert.equal(follows, 1);
});
test("midnight and missing original authority perform no platform work", async (t) => {
  const q = await setup(t);
  const api = createBusinessHarness({
    store: q.f.store,
    platform: {},
    clock: q.clock,
  });
  let calls = 0;
  api.replyBatch = async () => {
    calls++;
    throw Error("must not run");
  };
  const args = {
    taskId: "round-1",
    follow: {
      executor: {
        id: "follow",
        scopeKinds: ["follow"],
        evidenceRef: q.f.proof,
      },
      handles: ["Peer1", "Peer2", "Peer3", "Peer4", "Peer5"],
    },
    reply: { actions: [] },
  };
  q.setClock(Date.parse("2026-10-12T00:00:00+08:00"));
  assert.equal(
    (await api.runFollowPriorityBatch(args)).reason,
    "night-platform-window",
  );
  assert.equal(calls, 0);
  q.setClock(q.due);
  args.follow.executor.id = "missing";
  assert.equal(
    (await api.runFollowPriorityBatch(args)).reason,
    "follow-priority-authority-missing",
  );
  assert.equal(calls, 0);
});

test("actual shared follow budgets and group gaps select replies instead of retrying a blocked follow", async (t) => {
  const q = await setup(t);
  q.setClock(q.due);
  await q.f.store.transaction(({ state }) => {
    state.items[0].actionable = true;
    state.executions.follow.followCadence = {
      sharedRollingPlanningLimit: 2,
      sharedRollingPlanningWindowMs: 3600000,
      minimumGapFromLastAttemptMs: 180000,
    };
    state.attempts = [
      { kind: "follow", at: new Date(NOW - 700000).toISOString() },
      { kind: "follow", at: new Date(NOW - 600000).toISOString() },
    ];
    return state;
  });
  assert.equal(
    (await q.priority.inspect("round-1", "follow")).reason,
    "follow-cadence-rolling-budget",
  );
  await q.f.store.transaction(({ state }) => {
    state.attempts = [{ kind: "follow", at: new Date(NOW).toISOString() }];
    return state;
  });
  assert.equal(
    (await q.priority.inspect("round-1", "follow")).reason,
    "follow-cadence-group-gap",
  );
});

test("due recovery settles only original unknown IDs through read-only recovery before the normal batch", async (t) => {
  const q = await setup(t);
  q.setClock(q.due);
  let recovered = [],
    batches = 0;
  await q.f.store.transaction(({ state }) => {
    state.actions[0].status = "unknown";
    state.actions[0].intentAt = new Date(NOW - 5000).toISOString();
    return state;
  });
  const before = (await q.f.store.load()).state.actions[0];
  const r = await q.priority.run(
    {
      taskId: "round-1",
      follow: {
        executor: {
          id: "follow",
          scopeKinds: ["follow"],
          evidenceRef: q.f.proof,
        },
        handles: ["Peer1", "Peer2", "Peer3", "Peer4", "Peer5"],
        recoveryTargets: [{ handle: before.handle }],
      },
      reply: { actions: [] },
    },
    {
      reply: async () => {
        throw Error("reply must yield");
      },
      follow: async () => ({
        verifySubmission: async (x) => {
          recovered.push(x.actionId);
          return { status: "unknown" };
        },
        followBatch: async () => {
          batches++;
          return { status: "verified" };
        },
      }),
    },
  );
  assert.equal(r.selected, "follow");
  assert.deepEqual(recovered, [before.id]);
  assert.equal(batches, 1);
  assert.equal((await q.f.store.load()).state.actions[0].status, "unknown");
});

test("early follow priority honors the original scoped permit without widening night defaults", async (t) => {
  const q = await setup(t);
  const start = Date.parse("2026-10-12T06:00:00+08:00");
  const end = Date.parse("2026-10-13T00:00:00+08:00");
  await q.f.store.transaction(({ state }) => {
    state.items[0].actionable = true;
    delete state.items[0].resumeAt;
    delete state.executions.follow.followBackoff;
    state.executions.follow.id = "follow";
    return state;
  });
  q.setClock(start);
  assert.equal(
    (await q.priority.inspect("round-1", "follow")).reason,
    "night-platform-window",
  );
  const permit = {
    kind: "follow",
    executorId: "follow",
    userAuthorized: true,
    evidenceRef: q.f.proof,
    startsAt: new Date(start).toISOString(),
    expiresAt: new Date(end).toISOString(),
  };
  async function setPermit(value) {
    await q.f.store.transaction(({ state }) => {
      state.executions.follow.windowAuthorization = value;
      return state;
    });
  }
  await setPermit(permit);
  assert.equal((await q.priority.inspect("round-1", "follow")).ready, true);
  q.setClock(start - 1);
  assert.equal(
    (await q.priority.inspect("round-1", "follow")).reason,
    "night-platform-window",
  );
  q.setClock(end);
  assert.equal(
    (await q.priority.inspect("round-1", "follow")).reason,
    "night-platform-window",
  );
  q.setClock(start);
  for (const patch of [
    { userAuthorized: false },
    { executorId: "foreign" },
    { kind: "reply" },
    { evidenceRef: "missing-permit-proof" },
    { startsAt: "invalid" },
    { expiresAt: "invalid" },
  ]) {
    await setPermit({ ...permit, ...patch });
    assert.equal(
      (await q.priority.inspect("round-1", "follow")).reason,
      "night-platform-window",
    );
  }
});

test("early reply permit keeps follow selection closed and independent reply available", async (t) => {
  const q = await setup(t);
  const start = Date.parse("2026-10-12T06:00:00+08:00");
  const end = Date.parse("2026-10-12T07:00:00+08:00");
  q.setClock(start);
  const permit = {
    kind: "reply",
    executorId: "follow",
    userAuthorized: true,
    evidenceRef: q.f.proof,
    startsAt: new Date(start).toISOString(),
    expiresAt: new Date(end).toISOString(),
  };
  await q.f.store.transaction(({ state }) => {
    state.executions.follow.id = "follow";
    state.executions.follow.scopeKinds = ["follow", "reply"];
    state.executions.follow.windowAuthorization = permit;
    return state;
  });
  const before = await q.f.store.load();
  const selection = await q.priority.inspect("round-1", "follow");
  assert.equal(selection.ready, false);
  assert.equal(selection.blocked, undefined);
  assert.equal(selection.reason, "follow-window-not-open");
  const api = createBusinessHarness({
    store: q.f.store,
    platform: {},
    clock: q.clock,
  });
  let calls = 0;
  api.replyToPost = async () => {
    calls++;
    return { status: "verified" };
  };
  const result = await api.replyBatch({
    taskId: "round-1",
    followPriorityExecutorId: "follow",
    actions: [{ id: "early-reply", kind: "reply" }],
  });
  assert.equal(calls, 1);
  assert.equal(result.results[0].status, "verified");
  assert.deepEqual(
    (await q.f.store.load()).state.actions,
    before.state.actions,
  );
  for (const patch of [
    { userAuthorized: false },
    { executorId: "foreign" },
    { evidenceRef: "missing" },
    { expiresAt: new Date(start).toISOString() },
    { startsAt: new Date(start + 1).toISOString() },
  ]) {
    await q.f.store.transaction(({ state }) => {
      state.executions.follow.windowAuthorization = { ...permit, ...patch };
      return state;
    });
    assert.equal(
      (await q.priority.inspect("round-1", "follow")).reason,
      "night-platform-window",
    );
  }
});

test("early reply permit cannot hide missing original follow authority", async (t) => {
  const q = await setup(t);
  const start = Date.parse("2026-10-12T06:00:00+08:00");
  q.setClock(start);
  const valid = {
    id: "follow",
    scopeKinds: ["follow", "reply"],
    tabId: "follow-tab",
    evidenceRef: q.f.proof,
    windowAuthorization: {
      kind: "reply",
      executorId: "follow",
      userAuthorized: true,
      evidenceRef: q.f.proof,
      startsAt: new Date(start).toISOString(),
      expiresAt: new Date(start + 3600000).toISOString(),
    },
  };
  for (const patch of [
    { scopeKinds: ["reply"] },
    { tabId: null },
    { evidenceRef: "missing" },
  ]) {
    await q.f.store.transaction(({ state }) => {
      state.executions.follow = { ...valid, ...patch };
      return state;
    });
    const r = await q.priority.inspect("round-1", "follow");
    assert.equal(r.ready, false);
    assert.equal(r.blocked, true);
  }
  await q.f.store.transaction(({ state }) => {
    state.executions.follow = valid;
    return state;
  });
  assert.equal(
    (await q.priority.inspect("wrong-task", "follow")).blocked,
    true,
  );
});
