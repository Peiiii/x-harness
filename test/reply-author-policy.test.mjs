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
