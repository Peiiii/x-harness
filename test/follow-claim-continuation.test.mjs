import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";

function setup(t) {
  const f = fixture(t, { planned: [5, 1, 1] });
  f.edit((s) => {
    const base = s.actions.find((a) => a.kind === "follow");
    for (let i = 1; i < 5; i++)
      s.actions.push({
        ...structuredClone(base),
        id: "follow-" + i,
        handle: "reader" + i,
        url: "https://x.com/reader" + i,
        quality: { ...base.quality, handle: "reader" + i },
      });
  });
  return {
    f,
    actor: f.newExecutor("recovered-follow", ["follow"]),
    handles: ["reader", "reader1", "reader2", "reader3", "reader4"],
  };
}
test("an occupied first follow does not stop four independent original batch members", async (t) => {
  const { f, actor, handles } = setup(t);
  const claim = {
    token: "old-token",
    pid: null,
    runtimeId: "old-runtime",
    executorId: "original-follow",
  };
  f.edit((s) => {
    s.actions[0].claim = claim;
  });
  const result = await actor.api.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 4, JSON.stringify(result));
  assert.deepEqual(f.read().actions[0].claim, claim);
  assert.equal(f.read().actions[0].status, "prepared");
  assert.ok(result.decision.some((d) => d.error === "same-action-claimed"));
  await actor.api.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 4, "verified members never resent");
});
test("a page held by another live runtime still stops the entire follow batch", async (t) => {
  const { f, actor, handles } = setup(t);
  f.edit((s) => {
    s.executions = {
      old: {
        id: "old",
        tabId: "recovered-follow",
        runtimeId: "old-runtime",
        pid: null,
        activity: "round",
        actionId: "follow-0",
      },
    };
  });
  await actor.api.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 0);
});
