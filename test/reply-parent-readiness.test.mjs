import test from "node:test";
import assert from "node:assert/strict";
import { createXPlatform } from "../dist/platform.js";

for (const mode of [
  "delayed",
  "ready",
  "wrong-parent",
  "missing-parent",
  "loading",
  "alert",
  "timeout",
  "route-change",
])
  test(`reply receipt uses existing bounded ancestor readiness: ${mode}`, async () => {
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
    let loaded = ["ready", "wrong-parent"].includes(mode);
    const commands = [];
    const root = {
      id: mode === "wrong-parent" ? "999" : "123",
      author: "source",
      body: "Synthetic root",
      datetime: "2026-11-01T02:00:00Z",
      primary:
        mode === "wrong-parent" ? "/source/status/999" : "/source/status/123",
    };
    const child = {
      id: "456",
      author: action.accountHandle,
      body: action.text,
      datetime: "2026-11-01T03:00:05Z",
      primary: "/example_owner/status/456",
      replyToId: null,
    };
    const browser = {
      capabilities: (operation) =>
        operation === "refreshPosts" ? ["refreshPosts"] : [],
      observe: async (query) => ({
        page,
        accountHandle: action.accountHandle,
        alerts: mode === "alert" ? ["Verify identity"] : [],
        needsStateCheck: Boolean(query.threadRootId),
        loading: true,
        posts: query.targetId
          ? [
              {
                ...child,
                replyToId: query.replyTargetId && loaded ? root.id : null,
              },
            ]
          : loaded
            ? [root, child]
            : [child],
        threadConfirmed: false,
        threadRootPresent: false,
      }),
      act: async (command) => {
        commands.push(command);
        if (command.operation === "waitForPosts" && command.ancestorHandle) {
          assert.equal(command.ancestorHandle, "source");
          assert.equal(command.targetId, "456");
          if (mode === "delayed") loaded = true;
          if (mode === "route-change") page = "https://x.com/other/status/777";
          if (["timeout", "loading"].includes(mode))
            throw Error("Timed out waiting for ancestor");
        } else if (command.operation === "openObserved") page = command.url;
        else throw Error(`Unexpected action ${command.operation}`);
      },
    };
    const result = await createXPlatform(browser, {
      clock: () => now,
    }).findSubmission(action);
    assert.equal(result.verified, ["delayed", "ready"].includes(mode));
    assert.equal(
      result.publicId,
      ["delayed", "ready"].includes(mode) ? "456" : null,
    );
    const waits = commands.filter(
      (c) => c.operation === "waitForPosts" && c.ancestorHandle,
    );
    assert.equal(
      waits.length,
      ["ready", "wrong-parent", "alert"].includes(mode) ? 0 : 1,
    );
    assert.equal(
      commands.some((c) => /submit|fill|click/i.test(c.operation)),
      false,
    );
    assert.equal(action.postId, "123");
  });
