import test from "node:test";
import assert from "node:assert/strict";
import { createXPlatform } from "../dist/platform.js";

for (const mode of [
  "exact",
  "wrong-parent",
  "wrong-child",
  "wrong-text",
  "wrong-author",
  "old-child",
  "alert",
  "wrong-page",
  "incomplete-root",
  "explicit-wrong-parent",
  "nested-unknown-parent",
  "wrong-account",
  "outside-thread",
  "duplicate-child",
])
  test(`actual raw root-thread reader supplies receipt proof: ${mode}`, async () => {
    const now = Date.parse("2026-11-01T03:00:10Z");
    const action = {
      kind: "reply",
      postId: "123",
      url: "https://x.com/source/status/123",
      evidenceRef: "root-proof",
      accountHandle: "example_owner",
      accountURL: "https://x.com/example_owner",
      text: "Synthetic reviewed reply",
      intentAt: "2026-11-01T03:00:00Z",
      beforeIds: [],
      observedPublicURL: "https://x.com/example_owner/status/456",
      observedPublicEvidenceRef: "child-proof",
    };
    let page = action.observedPublicURL;
    const commands = [];
    const child = {
      id: "456",
      author: action.accountHandle,
      body: action.text,
      datetime: "2026-11-01T03:00:05Z",
      primary: "/example_owner/status/456",
      replyToId: null,
    };
    const root = {
      id: mode === "wrong-parent" ? "999" : "123",
      author: "source",
      body: mode === "incomplete-root" ? "" : "Synthetic full parent",
      datetime: "2026-11-01T02:00:00Z",
      primary:
        mode === "wrong-parent" ? "/source/status/999" : "/source/status/123",
    };
    const threadChild = {
      ...child,
      ...(mode === "wrong-child"
        ? { id: "777", primary: "/example_owner/status/777" }
        : {}),
      ...(mode === "wrong-text" ? { body: "Other text" } : {}),
      ...(mode === "wrong-author" ? { author: "other" } : {}),
      ...(mode === "old-child" ? { datetime: "2026-11-01T02:59:00Z" } : {}),
      ...(mode === "explicit-wrong-parent" ? { replyToId: "999" } : {}),
    };
    const platform = createXPlatform(
      {
        capabilities: (operation) =>
          operation === "refreshPosts" ? ["refreshPosts"] : [],
        observe: async (query) => {
          const inRoot = page === action.url;
          return {
            page:
              mode === "wrong-page" && inRoot
                ? "https://x.com/elsewhere/status/789"
                : page,
            accountHandle:
              mode === "wrong-account" && inRoot
                ? "other_account"
                : action.accountHandle,
            alerts: mode === "alert" && inRoot ? ["Verify identity"] : [],
            needsStateCheck: false,
            loading: true,
            posts: inRoot
              ? mode === "nested-unknown-parent"
                ? [
                    root,
                    {
                      id: "888",
                      author: "another",
                      body: "Another branch",
                      datetime: child.datetime,
                      primary: "/another/status/888",
                    },
                    threadChild,
                  ]
                : mode === "duplicate-child"
                  ? [root, threadChild, threadChild]
                  : [root, threadChild]
              : query.targetId
                ? [child]
                : [
                    {
                      id: null,
                      author: null,
                      body: null,
                      text: "This post is unavailable",
                    },
                    child,
                  ],
            threadRootPresent: inRoot && root.id === action.postId,
            threadConfirmed: inRoot && root.id === action.postId,
            threadIds: inRoot
              ? [
                  root.id,
                  ...(mode === "nested-unknown-parent" ? ["888"] : []),
                  ...(mode === "outside-thread" ? [] : [threadChild.id]),
                ]
              : [],
            threadBoundary: true,
            threadExpandControls: [],
          };
        },
        act: async (command) => {
          commands.push(command.operation);
          if (command.operation === "openObserved") page = command.url;
          else if (command.operation === "waitForPosts")
            throw Error("Timed out waiting for ancestor");
          else throw Error(`Unexpected action ${command.operation}`);
        },
      },
      { clock: () => now },
    );
    const result = await platform.findSubmission(action);
    assert.equal(result.verified, mode === "exact");
    assert.equal(result.publicId, mode === "exact" ? "456" : null);
    if (mode === "exact") {
      assert.equal(
        result.replyParentEvidence.binding,
        "observed-root-thread-membership",
      );
      assert.equal(result.replyParentEvidence.parent.id, "123");
      assert.equal(result.replyParentEvidence.child.id, "456");
    }
    assert.equal(
      commands.some((c) => /submit|fill|click/i.test(c)),
      false,
    );
  });
