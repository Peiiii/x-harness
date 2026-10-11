import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";

for (const mode of [
  "valid",
  "absent",
  "expired",
  "future",
  "other-executor",
  "other-kind",
  "missing-proof",
  "budget-full",
]) {
  test(`night follow keeps scoped authorization and budget: ${mode}`, async (t) => {
    const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
    const now = Date.parse("2026-10-11T16:50:00Z");
    f.setNow(now);
    f.edit((s) => {
      s.executions = {
        follow: {
          id: "follow",
          tabId: "follow",
          scopeKinds: ["follow"],
          status: "RUNNING",
          evidenceRef: f.proof,
        },
      };
      if (mode !== "absent")
        s.executions.follow.windowAuthorization = {
          executorId: mode === "other-executor" ? "other" : "follow",
          kind: mode === "other-kind" ? "reply" : "follow",
          userAuthorized: true,
          evidenceRef: mode === "missing-proof" ? "/missing-proof" : f.proof,
          startsAt: new Date(
            now + (mode === "future" ? 60000 : -60000),
          ).toISOString(),
          expiresAt: new Date(
            now + (mode === "expired" ? -1 : 60000),
          ).toISOString(),
        };
      if (mode === "budget-full")
        s.attempts = Array.from({ length: 100 }, (_, i) => ({
          actionId: `prior-${i}`,
          kind: "follow",
          at: new Date(now - 600000 - i * 1000).toISOString(),
        }));
    });
    const { api } = f.newExecutor("follow", ["follow"]);
    await api.followOne({ taskId: "round-1", handle: "reader" });
    assert.equal(f.writes.length, mode === "valid" ? 1 : 0);
  });
}
