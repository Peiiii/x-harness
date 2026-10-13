import test from "node:test";
import assert from "node:assert/strict";
import { fixture, NOW } from "./fixtures.mjs";
import { followObservationAuthorized } from "../dist/follow-observation-policy.js";

function configure(f) {
  f.edit((s) => {
    s.executions = {
      follow: {
        id: "follow",
        tabId: "follow",
        scopeKinds: ["follow"],
        status: "RUNNING",
        evidenceRef: f.proof,
        followObservationAuthorization: {
          kind: "follow",
          executorId: "follow",
          taskId: s.batchId,
          accountHandle: s.accountHandle,
          userAuthorized: true,
          evidenceRef: f.proof,
          startsAt: new Date(NOW - 60000).toISOString(),
          expiresAt: "2026-10-11T16:00:00Z",
        },
      },
    };
    s.attempts = Array.from({ length: 100 }, (_, i) => ({
      actionId: `prior-${i}`,
      kind: "follow",
      at: new Date(NOW - 1000 - i * 1000).toISOString(),
    }));
    s.execution.followGroup = {
      attempts: 100,
      lastAt: new Date(NOW - 1000).toISOString(),
    };
  });
}

for (const mode of [
  "valid",
  "absent",
  "expired",
  "future",
  "other-executor",
  "other-task",
  "other-account",
  "other-kind",
  "missing-proof",
  "unsigned",
  "next-day",
  "overnight",
  "history-gap",
  "invalid-history",
]) {
  test(`observation permit preserves boundaries: ${mode}`, async (t) => {
    const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
    configure(f);
    f.edit((s) => {
      const p = s.executions.follow.followObservationAuthorization;
      if (mode === "absent")
        delete s.executions.follow.followObservationAuthorization;
      if (mode === "expired") p.expiresAt = new Date(NOW).toISOString();
      if (mode === "future") p.startsAt = new Date(NOW + 1000).toISOString();
      if (mode === "other-executor") p.executorId = "other";
      if (mode === "other-task") p.taskId = "other";
      if (mode === "other-account") p.accountHandle = "other";
      if (mode === "other-kind") p.kind = "reply";
      if (mode === "missing-proof") p.evidenceRef = "/missing";
      if (mode === "unsigned") p.userAuthorized = false;
      if (mode === "next-day") p.expiresAt = "2026-10-12T16:00:00Z";
      if (mode === "overnight") p.startsAt = "2026-10-10T16:00:00Z";
      if (mode === "history-gap") s.attemptsCoverage.complete = false;
      if (mode === "invalid-history") s.attempts[0].at = "invalid";
    });
    const { api } = f.newExecutor("follow", ["follow"]);
    await api.followOne({ taskId: "round-1", handle: "reader" });
    assert.equal(f.writes.length, mode === "valid" ? 1 : 0);
  });
}

test("batch and individual gates share the permit without losing attempts", async (t) => {
  const f = fixture(t, {
    planned: [10, 0, 0],
    actionKinds: Array(10).fill("follow"),
  });
  configure(f);
  f.edit((s) => {
    s.actions = s.actions.map((a, i) => ({
      ...a,
      handle: `reader${i}`,
      url: `https://x.com/reader${i}`,
      quality: { ...a.quality, handle: `reader${i}` },
    }));
  });
  const { api } = f.newExecutor("follow", ["follow"]);
  const handles = f.read().actions.map((a) => a.handle);
  const result = await api.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 10, JSON.stringify(result));
  assert.equal(f.read().attempts.length, 110);
  assert.equal(f.read().items[0].verified, 10);
  await api.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 10, "verified IDs must never resubmit");
});

test("permit cannot cross midnight or change another executor policy", (t) => {
  const f = fixture(t);
  configure(f);
  const s = f.read(),
    executor = { id: "follow", scopeKinds: ["follow"] };
  assert.equal(
    followObservationAuthorized(
      s,
      executor,
      Date.parse("2026-10-11T16:00:00Z"),
      () => true,
    ),
    false,
  );
  assert.equal(
    followObservationAuthorized(
      s,
      { ...executor, id: "other" },
      NOW,
      () => true,
    ),
    false,
  );
});

test("actual platform refusal still stops observation submissions", async (t) => {
  const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
  configure(f);
  const { api, browser } = f.newExecutor("follow", ["follow"]);
  browser.alerts = ["抱歉，你受到速度限制。请稍等片刻，然后再试一次。"];
  await api.followOne({ taskId: "round-1", handle: "reader" });
  assert.equal(f.writes.length, 0);
});
