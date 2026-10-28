import test from "node:test";
import assert from "node:assert/strict";
import { createNativeXBrowser } from "../dist/browser-native.js";
test("native loading recovery stays bounded without writes and retains missing evidence", async () => {
  let reads = 0,
    writes = 0;
  const browser = createNativeXBrowser({
    getAXState: async () => {
      reads++;
      return "0 标准窗口 加载中, URL: x.com/Ax886333/status/123\n  1 进度指示器 0";
    },
    click: async () => writes++,
  });
  const result = await browser.act({ operation: "waitForPosts" });
  assert.equal(reads, 20);
  assert.equal(writes, 0);
  assert.equal(result.needsStateCheck, true);
  assert.equal(result.posts.length, 0);
});

for (const appears of [true, false]) {
  test(`native receipt refresh waits beyond an early unrelated card: ${appears}`, async () => {
    let reads = 0;
    let reloads = 0;
    const ax = (body) => `0 标准窗口 X, URL: x.com/sample
  1 按钮 重新加载
  2 HTML 内容 X, URL: x.com/sample
    3 container sample @sample
      4 link 上午8:42 · 2026年10月26日, Value: x.com/sample/status/456
      5 文本 ${body}
`;
    const browser = createNativeXBrowser({
      getAXState: async () => {
        reads++;
        return ax(
          appears && reads >= 4 ? "reviewed candidate" : "pinned old post",
        );
      },
      click: async (index) => {
        assert.equal(index, 1);
        reloads++;
      },
    });
    const result = await browser.act({
      operation: "refreshPosts",
      expectedText: "reviewed candidate",
    });
    assert.equal(reloads, 1);
    assert.equal(reads, appears ? 4 : 22);
    assert.equal(
      result.posts[0].text,
      appears ? "reviewed candidate" : "pinned old post",
    );
  });
}
