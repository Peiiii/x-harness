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
