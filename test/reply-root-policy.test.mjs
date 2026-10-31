import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { replyRootAgeReason } from "../dist/reply-root-policy.js";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

function proof(f, age, extra = {}) {
  writeFileSync(
    f.proof,
    JSON.stringify({
      observation: {
        posts: [
          {
            id: "123",
            datetime: new Date(NOW).toISOString(),
            replyToId: "999",
          },
          {
            id: "999",
            datetime: new Date(NOW - age).toISOString(),
            replyToId: null,
            ...extra,
          },
        ],
      },
    }),
  );
  f.edit((s) => {
    s.actions[0].conversation = {
      recipientHandle: "author",
      rootId: "999",
      round: 1,
    };
  });
  return f.read().actions[0];
}
test("root age uses original root time, rejects missing/conflicting identity, and preserves opt-out", (t) => {
  const f = fixture(t, { actionKinds: ["reply"] });
  let action = proof(f, 13 * 3600000);
  assert.equal(replyRootAgeReason(action, 12, NOW), "reply-root-expired");
  assert.equal(replyRootAgeReason(action, undefined, NOW), null);
  action = proof(f, 12 * 3600000);
  assert.equal(replyRootAgeReason(action, 12, NOW), null);
  assert.equal(replyRootAgeReason(action, 12, NOW + 1), "reply-root-expired");
  action = proof(f, 1000, { datetime: null });
  assert.equal(
    replyRootAgeReason(action, 12, NOW),
    "reply-root-absolute-time-required",
  );
  action = proof(f, 1000, { replyToId: "998" });
  assert.equal(
    replyRootAgeReason(action, 12, NOW),
    "reply-root-is-known-child",
  );
  assert.equal(
    replyRootAgeReason({ ...action, conversation: { rootId: "777" } }, 12, NOW),
    "reply-root-publication-proof-required",
  );
});
test("root age uses the fresh root proof when source evidence is a discovery result", (t) => {
  const f = fixture(t, { actionKinds: ["reply"] });
  const action = proof(f, 1000);
  writeFileSync(
    f.proof,
    JSON.stringify({ operation: "searchSources", result: { posts: [] } }),
  );
  const freshRootProof = join(dirname(f.proof), "fresh-root-proof.json");
  writeFileSync(
    freshRootProof,
    JSON.stringify({
      observation: {
        posts: [
          {
            id: action.postId,
            datetime: new Date(NOW).toISOString(),
            replyToId: "999",
          },
          {
            id: "999",
            datetime: new Date(NOW - 1000).toISOString(),
            replyToId: null,
          },
        ],
      },
    }),
  );
  action.freshMetricsEvidenceRef = freshRootProof;
  assert.equal(replyRootAgeReason(action, 12, NOW), null);
});
test("business reply refuses an expired root before navigation, intent, or click", async (t) => {
  const f = fixture(t, { actionKinds: ["reply"] });
  const action = proof(f, 13 * 3600000);
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => NOW,
    executor: {
      id: "root-reader",
      tabId: "root-tab",
      scopeKinds: ["reply"],
      evidenceRef: f.proof,
      replyMaxRootAgeHours: 12,
    },
  });
  const result = await api.replyToPost({
    taskId: "round-1",
    postId: action.postId,
    text: action.text,
    preparedAction: action,
  });
  assert.equal(result.status, "needsDecision");
  assert.match(JSON.stringify(result), /reply-root-expired/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.read().attempts.length, 0);
  assert.equal(f.read().actions[0].status, "prepared");
});
test("age is rechecked at the actual submit boundary when a reply crosses the cutoff", async (t) => {
  const f = fixture(t, { actionKinds: ["reply"] });
  const action = proof(f, 12 * 3600000 - 500);
  let now = NOW;
  const act = f.browser.act.bind(f.browser);
  f.browser.act = async (command) => {
    await act(command);
    if (command.operation === "fillComposer") {
      now = NOW + 1000;
      f.setNow(now);
    }
  };
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => now,
    executor: {
      id: "root-reader",
      tabId: "root-tab",
      scopeKinds: ["reply"],
      evidenceRef: f.proof,
      replyMaxRootAgeHours: 12,
    },
  });
  const result = await api.replyToPost({
    taskId: "round-1",
    postId: action.postId,
    text: action.text,
    preparedAction: action,
  });
  assert.notEqual(result.status, "verified");
  assert.equal(f.writes.length, 0);
  assert.ok(f.commands.includes("fillComposer"));
});

test("batched source proof admits original root time while known children and expiry still fail", (t) => {
  const f = fixture(t, { actionKinds: ["reply"] });
  const action = f.read().actions[0];
  action.conversation = { recipientHandle: "author", rootId: "123", round: 1 };
  for (const [node, expected] of [
    [
      {
        id: "123",
        datetime: new Date(NOW - 1000).toISOString(),
        replyToId: null,
      },
      null,
    ],
    [
      { id: "123", datetime: new Date(NOW - 13 * 3600000).toISOString() },
      "reply-root-expired",
    ],
    [
      { id: "123", datetime: new Date(NOW).toISOString(), replyToId: "99" },
      "reply-root-is-known-child",
    ],
  ]) {
    writeFileSync(
      f.proof,
      JSON.stringify({ observation: { sources: [node] } }),
    );
    assert.equal(replyRootAgeReason(action, 12, NOW), expected);
  }
});
