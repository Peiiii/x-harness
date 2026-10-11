import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
for (const [time, allowed] of [
  ["2026-10-11T21:59:59+08:00", true],
  ["2026-10-11T22:00:00+08:00", true],
  ["2026-10-11T23:59:59+08:00", true],
  ["2026-10-12T00:00:00+08:00", false],
  ["2026-10-12T06:59:59+08:00", false],
  ["2026-10-12T07:00:00+08:00", true],
]) {
  test(`reply submission uses actual Shanghai 07–24 window: ${time}`, async (t) => {
    const f = fixture(t, { planned: [0, 0, 1], actionKinds: ["reply"] });
    f.setNow(Date.parse(time));
    const { api } = f.newExecutor("reply", ["reply"]);
    await api.replyToPost({
      taskId: "round-1",
      postId: "123",
      text: "有具体贡献的回复",
    });
    assert.equal(f.writes.length, allowed ? 1 : 0);
  });
}
test("extending reply hours does not extend original publication", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  f.setNow(Date.parse("2026-10-11T23:00:00+08:00"));
  const { api } = f.newExecutor("original", ["original"]);
  await api.publishPost({ taskId: "round-1", draftPath: f.draft });
  assert.equal(f.writes.length, 0);
});
