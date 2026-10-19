import test from "node:test";
import assert from "node:assert/strict";
import { replyAuthorReason } from "../dist/reply-author-policy.js";
const action = {
  id: "new",
  kind: "reply",
  sourceCategory: "mutual",
  conversation: { recipientHandle: "Peer", rootId: "30" },
};
const exists = (p) => p === "policy-proof" || p === "history-proof";
const state = {
  replyAuthorPolicy: {
    userAuthorized: true,
    max: 2,
    evidenceRef: "policy-proof",
  },
  replyAuthorHistory: {
    complete: true,
    evidenceRef: "history-proof",
    entries: [
      { id: "old", kind: "reply", author: "@peer", status: "verified" },
    ],
  },
  actions: [],
};
test("different roots and unresolved second replies share one author ceiling; same ID is not doubled", () => {
  assert.equal(replyAuthorReason(state, action, exists), null);
  const s = {
    ...state,
    actions: [
      {
        id: "old",
        kind: "reply",
        status: "verified",
        conversation: { recipientHandle: "peer" },
      },
      {
        id: "second",
        kind: "reply",
        status: "unknown",
        conversation: { recipientHandle: "PEER", rootId: "20" },
      },
    ],
  };
  assert.equal(replyAuthorReason(s, action, exists), "reply-author-limit");
  assert.equal(replyAuthorReason(s, { ...action, id: "second" }, exists), null);
  assert.equal(
    replyAuthorReason(
      s,
      { ...action, conversation: { recipientHandle: "newpeer" } },
      exists,
    ),
    null,
  );
});
test("missing history fails closed; received conversations outside active category are unchanged", () => {
  assert.equal(
    replyAuthorReason(
      { ...state, replyAuthorHistory: { complete: false } },
      action,
      exists,
    ),
    "reply-author-history-unconfirmed",
  );
  assert.equal(
    replyAuthorReason(state, { ...action, sourceCategory: "incoming" }, exists),
    null,
  );
});

test("a third active comment is rejected before navigation, intent or click", async (t) => {
  const { fixture, NOW } = await import("./fixtures.mjs");
  const { createBusinessHarness } = await import("../dist/diagnostics.js");
  const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 3] });
  f.edit((s) => {
    s.actions[0].sourceCategory = "mutual";
    s.actions[0].conversation = {
      recipientHandle: "peer",
      rootId: "123",
      round: 1,
    };
    s.replyAuthorPolicy = {
      userAuthorized: true,
      max: 2,
      evidenceRef: f.proof,
    };
    s.replyAuthorHistory = {
      complete: true,
      evidenceRef: f.proof,
      entries: [
        { id: "first", kind: "reply", author: "peer", status: "verified" },
        { id: "second", kind: "reply", author: "peer", status: "unknown" },
      ],
    };
  });
  const a = f.read().actions[0];
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => NOW,
  });
  const r = await api.replyToPost({
    taskId: "round-1",
    postId: a.postId,
    text: a.text,
    preparedAction: a,
  });
  assert.equal(r.status, "needsDecision");
  assert.match(JSON.stringify(r), /reply-author-limit/);
  assert.equal(f.writes.length, 0);
  assert.equal(f.read().attempts.length, 0);
});

test("received history does not consume the active-author ceiling", () => {
  const entries = ["incoming", "incoming-reply", "incoming"].map(
    (sourceCategory, i) => ({
      id: `received-${i}`,
      kind: "reply",
      author: "peer",
      status: i === 2 ? "unknown" : "verified",
      sourceCategory,
    }),
  );
  assert.equal(
    replyAuthorReason(
      {
        ...state,
        replyAuthorHistory: { ...state.replyAuthorHistory, entries },
      },
      action,
      exists,
    ),
    null,
  );
  assert.equal(
    replyAuthorReason(
      {
        ...state,
        replyAuthorHistory: {
          ...state.replyAuthorHistory,
          entries: [
            ...entries,
            ...state.replyAuthorHistory.entries,
            {
              id: "active-unknown",
              kind: "reply",
              author: "peer",
              status: "unknown",
              sourceCategory: "mutual",
            },
          ],
        },
      },
      action,
      exists,
    ),
    "reply-author-limit",
  );
});

test("a current explicit received classification supersedes a stale category without changing reservations", () => {
  const entries = [
    { id: "one", kind: "reply", author: "peer", status: "verified" },
    { id: "two", kind: "reply", author: "peer", status: "unknown" },
  ];
  const current = [{ id: "one", kind: "reply", sourceCategory: "incoming" }];
  assert.equal(
    replyAuthorReason(
      {
        ...state,
        replyAuthorHistory: { ...state.replyAuthorHistory, entries },
        actions: current,
      },
      action,
      exists,
    ),
    null,
  );
  assert.equal(
    replyAuthorReason(
      {
        ...state,
        replyAuthorHistory: { ...state.replyAuthorHistory, entries },
        actions: [{ id: "one", kind: "reply", status: "prepared" }],
      },
      action,
      exists,
    ),
    "reply-author-limit",
  );
});

test("the root reply API permits a first active reply after received conversations", async (t) => {
  const { fixture, NOW } = await import("./fixtures.mjs");
  const { createBusinessHarness } = await import("../dist/diagnostics.js");
  const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 3] });
  f.edit((s) => {
    s.actions[0].sourceCategory = "mutual";
    s.actions[0].conversation = {
      recipientHandle: "author",
      rootId: "123",
      round: 1,
    };
    s.replyAuthorPolicy = {
      userAuthorized: true,
      max: 2,
      evidenceRef: f.proof,
    };
    s.replyAuthorHistory = {
      complete: true,
      evidenceRef: f.proof,
      entries: Array.from({ length: 3 }, (_, i) => ({
        id: `received-${i}`,
        kind: "reply",
        author: "author",
        status: "verified",
        sourceCategory: "incoming",
      })),
    };
  });
  const a = f.read().actions[0];
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => NOW,
  });
  const result = await api.replyToPost({
    taskId: "round-1",
    postId: a.postId,
    text: a.text,
    preparedAction: a,
  });
  assert.equal(result.status, "verified");
  assert.equal(f.writes.length, 1);
});

test("explicit unknown category corrections remain conservative and preserve older reservations", () => {
  for (const sourceCategory of [null, "unclassified", "mutual"]) {
    const entries = [
      {
        id: "one",
        kind: "reply",
        author: "peer",
        status: "verified",
        sourceCategory: "incoming",
      },
      { id: "two", kind: "reply", author: "peer", status: "unknown" },
    ];
    assert.equal(
      replyAuthorReason(
        {
          ...state,
          replyAuthorHistory: { ...state.replyAuthorHistory, entries },
          actions: [
            { id: "one", kind: "reply", status: "prepared", sourceCategory },
          ],
        },
        action,
        exists,
      ),
      "reply-author-limit",
    );
  }
});
