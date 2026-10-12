import test from "node:test";
import assert from "node:assert/strict";
import { replyEmojiReason } from "../dist/reply-emoji-policy.js";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

const policy = { sampleRate: 0.15, maxInRecent: 2 };
const draft = (id, text = "A friendly reply🙂") => ({
  id,
  kind: "reply",
  status: "prepared",
  text,
});
const history = (texts) => ({
  actions: texts.map((text, i) => ({
    ...draft("old-" + i, text),
    status: i % 2 ? "unknown" : "verified",
    intentAt: new Date(NOW - (i + 1) * 60000).toISOString(),
  })),
});

test("emoji choice is stable per original action and does not insert or require emoji", () => {
  let selected = 0;
  for (let i = 0; i < 200; i++) {
    const a = draft("reply-" + i);
    const first = replyEmojiReason({ actions: [] }, a, policy);
    assert.equal(
      first,
      replyEmojiReason(
        { actions: [] },
        { ...a, text: "Different words😄" },
        policy,
      ),
    );
    if (first === null) selected++;
    assert.equal(
      replyEmojiReason(
        history(["old🙂", "old😂"]),
        draft(a.id, "Plain words"),
        policy,
      ),
      null,
    );
  }
  assert.ok(
    selected >= 10 && selected <= 60,
    `fixed sample yielded ${selected}/200`,
  );
});

test("recent submission checks include unknown, reject consecutive and projected overuse", () => {
  assert.equal(
    replyEmojiReason(history(["previous🙂"]), draft("new"), {
      ...policy,
      sampleRate: 1,
    }),
    "reply-emoji-consecutive",
  );
  assert.equal(
    replyEmojiReason(history(["plain", "old🙂", "old😂"]), draft("new"), {
      ...policy,
      sampleRate: 1,
    }),
    "reply-emoji-rolling-budget",
  );
  assert.equal(
    replyEmojiReason(history(["plain", "old🙂"]), draft("new"), {
      ...policy,
      sampleRate: 1,
    }),
    null,
  );
});

test("style policy cannot obstruct prior submission recovery and remains optional", () => {
  for (const status of ["intent", "unknown", "verified"])
    assert.equal(
      replyEmojiReason(history(["old🙂"]), { ...draft("new"), status }, policy),
      null,
    );
  assert.equal(
    replyEmojiReason(history(["old🙂"]), draft("new"), undefined),
    null,
  );
  assert.equal(
    replyEmojiReason({ actions: [] }, draft("new"), {
      sampleRate: 2,
      maxInRecent: 2,
    }),
    "reply-emoji-policy-invalid",
  );
});

test("business style refusal occurs before navigation, intent or submission", async (t) => {
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
      replyEmojiPolicy: policy,
    },
  });
  const result = await api.replyToPost({
    taskId: "round-1",
    postId: a.postId,
    text: a.text,
    preparedAction: a,
  });
  assert.equal(result.status, "needsDecision");
  assert.match(JSON.stringify(result), /reply-emoji-consecutive/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.commands.length, 0);
  assert.equal(f.read().actions[0].status, "prepared");
  assert.equal(f.read().attempts.length, 0);
});
