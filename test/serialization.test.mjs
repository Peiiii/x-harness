import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readAX, setupCode } from "../dist/readers.js";

test("REPL setup serializes the actual AX parser dependency closure for every public read mode", () => {
  const context = vm.createContext({});
  vm.runInContext(setupCode(), context);
  const state =
    "0 window URL: https://x.com/owner\n  1 link 个人资料, Value: x.com/owner\n  2 text 示例正文";
  for (const mode of ["navigation", "posts", "profile", "people", "composer"]) {
    const expected = readAX(state, { mode });
    const actual = context.xReadAX(state, { mode });
    assert.deepEqual(
      JSON.parse(JSON.stringify(actual)),
      JSON.parse(JSON.stringify(expected)),
      mode,
    );
  }
  assert.throws(
    () => context.xReadAX("following is a diff", { mode: "invalid" }),
    /AX mode/,
  );
});

test("serialized native harness includes its class and detached instance methods", async () => {
  const context = vm.createContext({});
  vm.runInContext(setupCode(), context);
  const state =
    "0 window URL: https://x.com/owner\n  1 link 个人资料, Value: x.com/owner";
  let reads = 0;
  const harness = context.xCreateAXHarness({
    getAXState: async (options) => {
      assert.equal(options.emit, false);
      assert.equal(options.disableDiffing, true);
      reads++;
      return state;
    },
  });
  const { observe } = harness;
  const actual = await observe({ mode: "navigation" });
  assert.deepEqual(
    JSON.parse(JSON.stringify(actual)),
    readAX(state, { mode: "navigation" }),
  );
  assert.equal(reads, 1);
});

test("serialized parser applies the same redacted URL corroboration and refusal", () => {
  const context = vm.createContext({});
  vm.runInContext(setupCode(), context);
  const state = `0 标准窗口 主页 / X, URL: …
  1 文本栏 (settable) 地址和搜索栏, Value: x.com/home, Placeholder: search
  2 HTML 内容 主页 / X, URL: …
    3 link 个人资料, Value: x.com/sample
    4 文本输入区 (settable) 帖子文本, Value: hello
    5 按钮 发帖
  6 标签 (selected, settable, boolean) 主页 / X - memory, Value: on
The focused UI element is 4 文本输入区 (settable) 帖子文本, Value: hello`;
  for (const input of [
    state,
    state.replace("主页 / X - memory", "other / X - memory"),
  ]) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(context.xReadAX(input, { mode: "composer" }))),
      JSON.parse(JSON.stringify(readAX(input, { mode: "composer" }))),
    );
  }
  assert.equal(
    context.xReadAX(state, { mode: "composer" }).needsStateCheck,
    false,
  );
  assert.equal(
    context.xReadAX(state.replace("主页 / X - memory", "other / X - memory"), {
      mode: "composer",
    }).needsStateCheck,
    true,
  );
});
