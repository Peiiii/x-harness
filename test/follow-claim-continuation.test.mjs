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

test("a pre-intent profile UI timeout preserves that member and continues the original batch", async (t) => {
  const { f, actor, handles } = setup(t);
  const read = actor.platform.readPerson.bind(actor.platform);
  actor.platform.readPerson = async (target) => {
    if (target.handle === "reader")
      throw new Error(
        "Playwright selector deadline exceeded: UserName timed out",
      );
    return read(target);
  };
  const result = await actor.api.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 4, JSON.stringify(result));
  assert.equal(result.verifiedThisCall, 4);
  assert.equal(result.remaining, 1);
  assert.ok(result.decision.some((d) => d.reason === "person-read-failed"));
  const first = f.read().actions[0];
  assert.equal(first.status, "prepared");
  assert.equal(first.intentAt, undefined);
  assert.equal(first.claim, undefined);
  await actor.api.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 4, "verified members are never resent");
});

for (const message of [
  "HTTP 429 timed out",
  "HTTP 503 timeout",
  "browser connection timeout",
  "login verification timed out",
  "authentication timeout",
  "captcha timed out",
])
  test(`profile failure still stops the batch: ${message}`, async (t) => {
    const { f, actor, handles } = setup(t);
    actor.platform.readPerson = async () => {
      throw new Error(message);
    };
    await actor.api.followBatch({ taskId: "round-1", handles });
    assert.equal(f.writes.length, 0);
    assert.equal(f.read().attempts.length, 0);
  });

test("a profile timeout after the action changed to intent cannot continue", async (t) => {
  const { f, actor, handles } = setup(t);
  actor.platform.readPerson = async () => {
    f.edit((s) => {
      s.actions[0].status = "intent";
      s.actions[0].intentAt = s.updatedAt;
    });
    throw new Error("profile selector timed out");
  };
  await actor.api.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 0);
  assert.equal(f.read().actions[0].status, "intent");
});

test("a newly unknown follow still stops the batch without submitting other members", async (t) => {
  const { f, actor, handles } = setup(t);
  actor.browser.rollbackFollow = true;
  await actor.api.followBatch({ taskId: "round-1", handles });
  assert.equal(f.writes.length, 1);
  assert.equal(f.read().actions[0].status, "unknown");
  assert.ok(
    f
      .read()
      .actions.slice(1, 5)
      .every((a) => a.status === "prepared"),
  );
});
