import test from "node:test";
import assert from "node:assert/strict";
import { FollowBatchPacing } from "../dist/follow-batch-pacing.js";
function setup() {
  let now = 10000,
    state = {
      followBatches: [{ id: "batch" }],
      attempts: [{ kind: "follow", at: new Date(now).toISOString() }],
    };
  const waits = [];
  const store = {
    transaction: async (fn) => {
      state = await fn({ state });
      return { state };
    },
  };
  return {
    pace: new FollowBatchPacing(
      store,
      () => now,
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
    ),
    waits,
    state: () => state,
    now: () => now,
  };
}
test("bounded random gap is persisted and resume neither resamples nor repeats elapsed wait", async () => {
  const f = setup(),
    p = { minGapMs: 5000, maxGapMs: 7000 };
  await f.pace.before("batch", "fixture", p);
  const gap = f.state().followBatches[0].gaps.fixture.gapMs;
  assert.ok(gap >= 5000 && gap <= 7000);
  assert.equal(f.waits[0], gap);
  await f.pace.before("batch", "FIXTURE", p);
  assert.equal(f.waits.length, 1);
  assert.equal(f.state().followBatches[0].gaps.fixture.gapMs, gap);
});
test("invalid pacing is rejected and changed resumed pacing does not alter the original gap", async () => {
  for (const p of [
    { minGapMs: 1, maxGapMs: 6000 },
    { minGapMs: 6000, maxGapMs: 5000 },
    { minGapMs: 5000, maxGapMs: 31000 },
  ])
    assert.throws(() => FollowBatchPacing.validate(p));
  const f = setup();
  await f.pace.before("batch", "fixture", { minGapMs: 5000, maxGapMs: 5000 });
  await assert.rejects(() =>
    f.pace.before("batch", "fixture", { minGapMs: 6000, maxGapMs: 6000 }),
  );
});
test("no option preserves current behavior; no fabricated attempts are recorded", async () => {
  const f = setup();
  await f.pace.before("batch", "fixture");
  assert.equal(f.waits.length, 0);
  assert.equal(f.state().attempts.length, 1);
  assert.equal(f.state().followBatches[0].gaps, undefined);
});

test("a pacing wait that cannot fit yields before waiting and retains its chosen original gap", async () => {
  const f = setup(),
    pacing = { minGapMs: 5000, maxGapMs: 5000 };
  assert.equal(
    await f.pace.before("batch", "fixture", pacing, Date.now() + 1000),
    false,
  );
  assert.equal(f.waits.length, 0);
  assert.equal(f.state().attempts.length, 1);
  const gap = f.state().followBatches[0].gaps.fixture.gapMs;
  await f.pace.before("batch", "fixture", pacing, Date.now() + 10000);
  assert.deepEqual(f.waits, [5000]);
  assert.equal(f.state().followBatches[0].gaps.fixture.gapMs, gap);
});
