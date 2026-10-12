import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";

for (const [label, at, expected] of [
  ["23:59 still authorized", "2026-10-12T15:59:59Z", 1],
  ["00:00 permit expires", "2026-10-12T16:00:00Z", 0],
  ["06:59 remains closed", "2026-10-12T22:59:59Z", 0],
]) {
  test(`documented daily follow permit: ${label}`, async (t) => {
    const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
    f.setNow(Date.parse(at));
    f.edit((state) => {
      state.executions = {
        follow: {
          id: "follow",
          tabId: "follow",
          scopeKinds: ["follow"],
          status: "RUNNING",
          evidenceRef: f.proof,
        },
      };
    });
    const { api } = f.newExecutor("follow", ["follow"]);
    await f.store.transaction(({ state }) => {
      state.executions.follow.windowAuthorization = {
        kind: "follow",
        executorId: "follow",
        userAuthorized: true,
        evidenceRef: f.proof,
        startsAt: "2026-10-11T23:00:00Z",
        expiresAt: "2026-10-12T16:00:00Z",
      };
      return state;
    });
    const snapshot = await f.store.load();
    const action = snapshot.state.actions.find((a) => a.kind === "follow");
    await api.followOne({ taskId: "round-1", handle: action.handle });
    assert.equal(f.writes.length, expected);
  });
}

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
