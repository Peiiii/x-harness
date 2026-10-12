import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

test("reviewed emoji replies remain executable after emoji history", async (t) => {
  const f = fixture(t, { actionKinds: ["reply"] });
  f.edit((s) => {
    const a = s.actions[0];
    a.text = "New reply😄";
    a.quality.approvedText = a.text;
    s.actions.push({
      ...a,
      id: "prior",
      postId: "456",
      status: "unknown",
      text: "Previous🙂",
      intentAt: new Date(NOW - 60000).toISOString(),
    });
    s.items[0].planned = 2;
    s.items[0].unknown = 1;
  });
  const a = f.read().actions[0];
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => NOW,
    executor: {
      id: "style-owner",
      tabId: "style-tab",
      scopeKinds: ["reply"],
      evidenceRef: f.proof,
    },
  });
  const result = await api.replyToPost({
    taskId: "round-1",
    postId: a.postId,
    text: a.text,
    preparedAction: a,
  });
  assert.equal(result.status, "verified");
  assert.equal(f.read().actions[0].status, "verified");
  assert.ok(f.commands.length > 0);
});
