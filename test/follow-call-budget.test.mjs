import test from "node:test";
import assert from "node:assert/strict";
import { fixture, NOW } from "./fixtures.mjs";
import { createBusinessHarness } from "../dist/diagnostics.js";
const setup = (t) => {
  const f = fixture(t, {
    planned: [5, 0, 0],
    actionKinds: Array(5).fill("follow"),
  });
  f.edit((s) => {
    s.actions = s.actions.map((a, i) => ({
      ...a,
      handle: `reader${i}`,
      url: `https://x.com/reader${i}`,
      quality: { ...a.quality, handle: `reader${i}` },
    }));
  });
  return {
    f,
    api: createBusinessHarness({
      platform: f.platform,
      store: f.store,
      clock: () => NOW,
    }),
    handles: f.read().actions.map((a) => a.handle),
  };
};
test("elapsed batch yields after a verified target and resumes exact original IDs without duplicate activation", async (t) => {
  const { f, api, handles } = setup(t);
  let wall = 0;
  t.mock.method(Date, "now", () => wall);
  const original = f.browser.act;
  f.browser.act = async function (command) {
    await original.call(this, command);
    if (command.operation === "follow") wall += 100;
  };
  const first = await api.followBatch({
    taskId: "round-1",
    handles,
    timeBudgetMs: 50,
  });
  assert.equal(first.status, "checkpoint");
  assert.equal(first.yieldReason, "time-budget-exhausted");
  assert.equal(first.verified, 1);
  assert.equal(first.remaining, 4);
  assert.equal(first.mayEnd, false);
  assert.equal(
    f.read().actions.filter((a) => a.status === "prepared").length,
    4,
  );
  f.edit((state) => {
    state.followBatches[0].attempted = 0;
    state.followBatches[0].verifiedTotal = 0;
  }); // Prior kernel reset may have lost only the summary.
  const resumed = await api.followBatch({
    taskId: "round-1",
    handles,
    timeBudgetMs: 1000,
  });
  assert.equal(resumed.batchId, first.batchId);
  assert.equal(resumed.remaining, 0);
  assert.equal(f.writes.length, 5);
  assert.equal(f.read().attempts.length, 5);
  assert.equal(f.read().followBatches[0].attempted, 5);
  assert.equal(f.read().followBatches[0].verifiedTotal, 5);
});
test("invalid elapsed budget makes no intention, claim or browser request", async (t) => {
  const { f, handles } = setup(t);
  for (const timeBudgetMs of [0, -1, NaN, Infinity])
    await assert.rejects(
      f.harness.followBatch({ taskId: "round-1", handles, timeBudgetMs }),
      /follow-call-time-budget-invalid/,
    );
  assert.equal(f.writes.length, 0);
  assert.equal(f.commands.length, 0);
  assert.equal(f.read().attempts.length, 0);
  assert.equal(f.read().followBatches, undefined);
});
