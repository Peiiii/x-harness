import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser, createXPlatform } from "../dist/diagnostics.js";

test("long post keeps full review but uses a bounded retained-editor anchor before one keyboard submit", async () => {
  const body = "工具榜单\n\n" + "完整用途、理由和入口。".repeat(250);
  const calls = [];
  const port = createDOMXBrowser({
    playwright: {
      evaluate: async () => ({
        editors: [{ label: "帖子文本", text: body }],
        buttons: [{ label: "发帖", disabled: false }],
        needsStateCheck: false,
      }),
      getByRole: (role) =>
        role === "button"
          ? { count: async () => 1, press: async () => calls.push("submit") }
          : {
              filter: ({ hasText }) => {
                assert(hasText.source.length <= 128);
                assert(hasText.test(body));
                return {
                  count: async () => 1,
                  waitFor: async () => calls.push("clear"),
                };
              },
            },
      waitForLoadState: async () => calls.push("idle"),
    },
  });
  await port.observe({ view: "composer" });
  await port.act({
    operation: "submitPost",
    activation: "keyboard",
    beforeSubmit: () => calls.push("intent"),
  });
  assert.deepEqual(calls, ["intent", "submit", "clear"]);
});

test("observed original permalink verifies display ellipsis only when the whole original path remains", async () => {
  const url = "https://x.com/owner/status/10";
  const action = {
    kind: "original",
    accountHandle: "owner",
    accountURL: "https://x.com/owner",
    accountEvidenceRef: "profile",
    observedPublicURL: url,
    observedPublicEvidenceRef: "fresh",
    text: "工具：https://github.com/org/full-repo\n前缀 `https://r.jina.ai/`",
    intentAt: "2026-10-11T14:21:00Z",
    beforeIds: [],
  };
  for (const truncated of [false, true]) {
    const platform = createXPlatform(
      {
        capabilities: () => ["refreshPosts"],
        observe: async () => ({
          page: url,
          accountHandle: "owner",
          alerts: [],
          needsStateCheck: false,
          posts: [
            {
              id: "10",
              author: "owner",
              datetime: "2026-10-11T14:21:15Z",
              body:
                "工具：https://github.com/org/" +
                (truncated ? "full" : "full-repo") +
                "…\n前缀 `https://r.jina.ai`",
              needsExpansion: false,
            },
          ],
        }),
        act: () => {
          throw Error("no navigation or write expected");
        },
      },
      { clock: () => Date.parse("2026-10-11T14:22:00Z") },
    );
    assert.equal((await platform.findSubmission(action)).verified, !truncated);
  }
});
