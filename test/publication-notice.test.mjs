import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/diagnostics.js";
const sent = "你的帖子已发送。你有 1 小时时间进行任何编辑。\n查看";
test("slow read-only host setup retains exact composer evidence and refusals", async () => {
  const browser = createDOMXBrowser({
    playwright: {
      evaluate: async (_reader, query, options) => {
        if ((options?.timeoutMs ?? 30_000) <= 31_000)
          throw Error("playwright.evaluate exceeded its deadline");
        assert.equal(query.view, "composer");
        return {
          accountHandle: "Example",
          editors: [{ text: "Reviewed text\n\nSecond line" }],
          alerts: ["Too many requests"],
        };
      },
    },
  });
  const result = await browser.observe({ view: "composer" });
  assert.equal(result.editorText, "Reviewed text\n\nSecond line");
  assert.equal(result.accountHandle, "Example");
  assert.deepEqual(result.alerts, ["Too many requests"]);
});
test("an explicit observation timeout still fails without retry or activation", async () => {
  let calls = 0;
  const browser = createDOMXBrowser({
    playwright: {
      evaluate: async () => {
        calls++;
        throw Error("playwright.evaluate exceeded its deadline");
      },
    },
  });
  await assert.rejects(browser.observe({ view: "composer" }), /deadline/);
  assert.equal(calls, 1);
  await assert.rejects(browser.act({ operation: "submitPost" }), /先observe/);
});
test("observed send toast is informational and preserves simultaneous refusals", async () => {
  const browser = createDOMXBrowser({
    playwright: {
      evaluate: async () => ({
        alerts: [sent, "检测到 AI 生成内容", "Too many requests"],
        posts: [],
      }),
    },
  });
  const result = await browser.observe({ view: "posts" });
  assert.deepEqual(result.notices, [sent, "检测到 AI 生成内容"]);
  assert.deepEqual(result.alerts, ["Too many requests"]);
});
test("a send toast combined with unknown extra text stays blocking", async () => {
  const combined = sent + "\n操作受限";
  const browser = createDOMXBrowser({
    playwright: { evaluate: async () => ({ alerts: [combined], posts: [] }) },
  });
  const result = await browser.observe({ view: "posts" });
  assert.deepEqual(result.alerts, [combined]);
  assert.deepEqual(result.notices, []);
});
