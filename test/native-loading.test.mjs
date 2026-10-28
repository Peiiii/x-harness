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
