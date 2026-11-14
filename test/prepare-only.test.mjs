import test from "node:test";
import assert from "node:assert/strict";
import { fixture, NOW } from "./fixtures.mjs";

for (const parallel of [false, true]) {
  test(`prepare-only preserves backoff and unknown without browser work: ${parallel}`, async (t) => {
    const f = fixture(t, { planned: [3, 0, 0], actionKinds: ["follow"] });
    const added = { ...f.state.actions[0], id: "follow-next", handle: "next" };
    f.edit((s) => {
      s.actions[0].status = "unknown";
      s.items[0].unknown = 1;
      Object.assign(s.items[0], {
        actionable: false,
        reason: "actual-follow-rate-warning",
        resumeAt: new Date(NOW + 3600000).toISOString(),
      });
    });
    const api = parallel ? f.newExecutor("follow", ["follow"]).api : f.harness;
    const result = await api.runGrowthRound({
      taskId: "round-1",
      maxActions: 0,
      decision: {
        type: "prepareActions",
        accountHandle: "Pei",
        ownershipEvidenceRef: f.proof,
        actions: [added],
      },
    });
    assert.equal(result.status, "checkpoint");
    assert.equal(result.mayEnd, false);
    assert.deepEqual(f.commands, []);
    assert.deepEqual(f.observations, []);
    assert.deepEqual(f.read().attempts, []);
    assert.equal(f.read().items[0].unknown, 1);
    assert.equal(f.read().items[0].actionable, false);
    assert.equal(f.read().actions[0].status, "unknown");
    assert.equal(f.read().actions[1].id, "follow-next");
    const duplicate = await api.runGrowthRound({
      taskId: "round-1",
      maxActions: 0,
      decision: {
        type: "prepareActions",
        accountHandle: "Pei",
        ownershipEvidenceRef: f.proof,
        actions: [added],
      },
    });
    assert.equal(duplicate.status, "needsDecision");
    assert.equal(f.read().actions.length, 2);
    const invalid = await api.runGrowthRound({
      taskId: "round-1",
      maxActions: 0,
    });
    assert.equal(invalid.status, "needsDecision");
    assert.deepEqual(f.commands, []);
  });
}

for (const parallel of [false, true]) {
  test(`prepare-only renews only an untouched original action's calendar window: ${parallel}`, async (t) => {
    const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
    const oldWindow = {
      notBefore: "2026-11-14T13:01:00.000Z",
      notAfter: "2026-11-14T13:04:00.000Z",
    };
    const newWindow = {
      notBefore: "2026-11-14T13:38:00.000Z",
      notAfter: "2026-11-14T13:41:00.000Z",
    };
    f.edit((s) => Object.assign(s.actions[0], oldWindow));
    const renewed = { ...f.read().actions[0], ...newWindow };
    const api = parallel
      ? f.newExecutor("original", ["original"]).api
      : f.harness;

    const result = await api.runGrowthRound({
      taskId: "round-1",
      maxActions: 0,
      decision: {
        type: "prepareActions",
        accountHandle: "Pei",
        ownershipEvidenceRef: f.proof,
        actions: [renewed],
      },
    });

    assert.equal(result.status, "checkpoint", result.error);
    assert.deepEqual(f.read().actions, [renewed]);
    assert.deepEqual(f.commands, []);
    assert.deepEqual(f.observations, []);
  });
}

test("prepare-only refuses to renew a changed, claimed, attempted, or submitted original action", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  const oldWindow = {
    notBefore: "2026-11-14T13:01:00.000Z",
    notAfter: "2026-11-14T13:04:00.000Z",
  };
  const nextWindow = {
    notBefore: "2026-11-14T13:38:00.000Z",
    notAfter: "2026-11-14T13:41:00.000Z",
  };

  for (const [index, scenario] of [
    {
      propose: (action) => {
        action.text = "正文被改动";
      },
    },
    {
      prepare: (action) => {
        action.intentAt = new Date(NOW).toISOString();
      },
    },
    {
      prepare: (action) => {
        action.activatedAt = new Date(NOW).toISOString();
      },
    },
    {
      prepare: (action) => {
        action.claim = { owner: "other" };
      },
    },
    {
      prepare: (_, state) => {
        state.attempts.push({ actionId: "original-0" });
      },
    },
    {
      prepare: (action) => {
        action.publicId = "already-published";
      },
    },
    {
      propose: (action) => {
        action.notBefore = "not-a-time";
      },
    },
    {
      propose: (action) => {
        action.notAfter = action.notBefore;
      },
    },
    {
      propose: (action) => {
        delete action.notAfter;
      },
    },
  ].entries()) {
    f.edit((s) => {
      Object.assign(s.actions[0], oldWindow);
      scenario.prepare?.(s.actions[0], s);
    });
    const renewed = { ...f.read().actions[0], ...nextWindow };
    scenario.propose?.(renewed);
    const before = f.read();
    const result = await f.harness.runGrowthRound({
      taskId: "round-1",
      maxActions: 0,
      decision: {
        type: "prepareActions",
        accountHandle: "Pei",
        ownershipEvidenceRef: f.proof,
        actions: [renewed],
      },
    });

    assert.equal(
      result.status,
      "needsDecision",
      `case ${index}: ${result.error}`,
    );
    assert.deepEqual(f.read().actions, before.actions);
    assert.deepEqual(f.read().attempts, before.attempts);
    assert.deepEqual(f.commands, []);
    assert.deepEqual(f.observations, []);
    f.edit((s) => {
      delete s.actions[0].intentAt;
      delete s.actions[0].activatedAt;
      delete s.actions[0].claim;
      delete s.actions[0].publicId;
      s.actions[0].text = "已审正文";
      s.attempts = [];
    });
  }
});

test("business can prepare beyond planned without clearing unresolved actions", async (t) => {
  const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
  const added = { ...f.state.actions[0], id: "follow-next", handle: "next" };
  f.edit((s) => {
    s.actions[0].status = "unknown";
    s.items[0].unknown = 1;
  });
  const api = f.newExecutor("follow", ["follow"]).api;
  const result = await api.runGrowthRound({
    taskId: "round-1",
    maxActions: 0,
    decision: {
      type: "prepareActions",
      accountHandle: "Pei",
      ownershipEvidenceRef: f.proof,
      actions: [added],
    },
  });
  assert.equal(result.status, "checkpoint");
  assert.equal(f.read().actions[0].status, "unknown");
  assert.equal(f.read().actions[1].id, "follow-next");
  assert.equal(f.read().items[0].unknown, 1);
});
