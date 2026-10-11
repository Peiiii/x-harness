import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";

for (const mode of [
  "valid",
  "absent",
  "expired",
  "other-executor",
  "other-kind",
  "missing-proof",
]) {
  test(`night reply requires scoped current manual authorization: ${mode}`, async (t) => {
    const f = fixture(t, { planned: [0, 0, 1], actionKinds: ["reply"] });
    const now = Date.parse("2026-10-11T22:10:00Z");
    f.setNow(now);
    f.edit((s) => {
      s.executions = {
        reply: {
          id: "reply",
          scopeKinds: ["reply"],
          tabId: "reply",
          status: "RUNNING",
          evidenceRef: f.proof,
        },
      };
      if (mode !== "absent")
        s.executions.reply.windowAuthorization = {
          executorId: mode === "other-executor" ? "other" : "reply",
          kind: mode === "other-kind" ? "original" : "reply",
          userAuthorized: true,
          evidenceRef: mode === "missing-proof" ? "/missing-proof" : f.proof,
          startsAt: new Date(now - 60000).toISOString(),
          expiresAt: new Date(
            now + (mode === "expired" ? -1 : 60000),
          ).toISOString(),
        };
    });
    const { api } = f.newExecutor("reply", ["reply"]);
    await api.replyToPost({
      taskId: "round-1",
      postId: "123",
      text: "有具体贡献的回复",
    });
    assert.equal(f.writes.length, mode === "valid" ? 1 : 0);
  });
}
