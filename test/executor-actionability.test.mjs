import test from "node:test";
import assert from "node:assert/strict";
import { fixture, NOW } from "./fixtures.mjs";
import { createBusinessHarness } from "../dist/diagnostics.js";
for (const mode of [
  "different",
  "different-kind",
  "unregistered-scope",
  "same",
  "global",
  "missing-proof",
  "stale",
  "alert",
]) {
  test(`executor-local refusal: ${mode}`, async (t) => {
    const f = fixture(t, { actionKinds: ["reply"] });
    const executor = {
      id: mode === "same" ? "primary" : "gap",
      tabId: "gap-tab",
      scopeKinds: ["reply"],
      evidenceRef: f.proof,
    };
    const primary = {
      id: "primary",
      status: "BLOCKED",
      scopeKinds:
        mode === "different-kind"
          ? ["follow"]
          : mode === "unregistered-scope"
            ? []
            : ["reply"],
      evidenceRef: f.proof,
      activity: "independent read failure",
    };
    await f.store.transaction(({ state }) => {
      state.executions = { primary };
      Object.assign(state.items[2], {
        actionable: false,
        reason: "local reader failed",
        blockEvidence: [f.proof],
        executionRestriction: {
          scope: mode === "global" ? "account" : "executor",
          reason:
            mode === "stale"
              ? "previous reader failure"
              : "local reader failed",
          executorId: "primary",
          evidenceRef: mode === "missing-proof" ? "absent" : f.proof,
        },
      });
      return state;
    });
    if (mode === "alert") f.browser.alerts = ["account warning"];
    const api = createBusinessHarness({
      store: f.store,
      platform: f.platform,
      clock: () => NOW,
      executor,
    });
    const result = await api.replyToPost({
      taskId: "round-1",
      postId: "123",
      text: "有具体贡献的回复",
    });
    const state = (await f.store.load()).state;
    assert.equal(state.items[2].actionable, false);
    if (["different", "different-kind"].includes(mode)) {
      assert.equal(result.status, "verified");
      assert.equal(f.writes.length, 1);
      assert.deepEqual(state.executions.primary, primary);
      assert.equal(state.items[2].verified, 1);
    } else {
      assert.notEqual(result.status, "verified");
      assert.equal(f.writes.length, 0);
      assert.equal(state.attempts.length, 0);
    }
  });
}
