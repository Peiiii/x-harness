import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { DraftSchedule } from "../dist/draft-schedule.js";
import { fixture, NOW } from "./fixtures.mjs";

test("original notBefore metadata blocks before intent and permits exactly at boundary", async (t) => {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  const at = new Date(NOW + 60000).toISOString();
  writeFileSync(f.draft, `---\nnotBefore: '${at}'\n---\n\n## 正文\n已审正文`);
  f.edit((s) => {
    s.actions[0].quality.draftFingerprint = f.store.fingerprint(f.draft);
  });
  const api = f.harness;
  const args = {
    taskId: "round-1",
    draftPath: f.draft,
    independentExecution: {
      tabId: "schedule",
      evidenceRef: f.proof,
      scopeEvidenceRef: f.proof,
    },
  };
  const waiting = await api.publishPost(args);
  assert.equal(waiting.status, "waiting", JSON.stringify(waiting));
  assert.equal(waiting.resumeAt, at);
  const scoped = await f
    .newExecutor("scope-schedule", ["original"])
    .api.publishPost(args);
  assert.equal(scoped.status, "needsDecision");
  assert.equal(scoped.decision[0].reason, "draft-not-before-not-reached");
  assert.equal(f.writes.length, 0);
  assert.equal(f.read().attempts.length, 0);
  assert.equal(f.read().actions[0].status, "prepared");
  assert.equal(f.read().items[1].unknown, 0);
  f.setNow(NOW + 60000);
  assert.equal((await api.publishPost(args)).status, "verified");
  assert.equal(f.writes.length, 1);
});

test("draft and action dates use the later constraint; invalid or zoneless dates reject", (t) => {
  const f = fixture(t, { actionKinds: ["original"] });
  const gate = new DraftSchedule();
  writeFileSync(
    f.draft,
    "最早发布窗口：2026-10-11T10:02:00+08:00；场景：any\n## 正文\nnotBefore: invalid-body-text",
  );
  const a = {
    kind: "original",
    draftPath: f.draft,
    notBefore: "2026-10-11T10:01:00+08:00",
  };
  assert.equal(gate.resolve(a).at, "2026-10-11T02:02:00.000Z");
  assert.equal(gate.reason(a, NOW), "draft-not-before-not-reached");
  assert.equal(
    gate.resolve({ ...a, notBefore: "2026-10-11T10:05:00" }).invalid,
    true,
  );
  assert.equal(gate.resolve({ ...a, notBefore: "not-a-date" }).invalid, true);
  assert.deepEqual(gate.resolve({ ...a, kind: "reply" }), {});
});
