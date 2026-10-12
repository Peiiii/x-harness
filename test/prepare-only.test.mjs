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
