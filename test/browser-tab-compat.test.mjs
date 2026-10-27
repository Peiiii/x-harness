import test from "node:test";
import assert from "node:assert/strict";
import { compatibleTab } from "../dist/browser-tab-compat.js";

test("nested AX methods preserve receiver and forward supported arguments", async () => {
  const calls = [];
  const ax = {
    marker: "ax",
    async get(mode, options) {
      calls.push([this.marker, mode, options]);
      return "visible state";
    },
    async scroll(target, direction, pages) {
      calls.push([this.marker, target, direction, pages]);
    },
  };
  const original = {
    ax,
    marker: "tab",
    url() {
      return this.marker;
    },
  };
  const adapted = compatibleTab(original);
  assert.equal(adapted.url(), "tab");
  assert.equal(
    await adapted.getAXState({ emit: false, disableDiffing: true }),
    "visible state",
  );
  await adapted.scroll(9, "down", 1);
  assert.deepEqual(calls, [
    ["ax", "state", { disableDiffing: true }],
    ["ax", 9, "down", 1],
  ]);
  assert.equal(original.getAXState, undefined);
  assert.equal(adapted.click, undefined);
});

test("existing top-level methods take precedence over nested alternatives", async () => {
  const tab = {
    marker: "legacy",
    getAXState() {
      return this.marker;
    },
    ax: {
      get() {
        throw Error("unexpected fallback");
      },
    },
  };
  assert.equal(await compatibleTab(tab).getAXState(), "legacy");
  assert.equal(compatibleTab({}).getAXState, undefined);
});

test("frozen tabs retain non-configurable properties while exposing AX fallback", async () => {
  const tab = Object.freeze({
    url: () => "https://x.example/profile",
    ax: { get: async () => "visible state" },
  });
  const adapted = compatibleTab(tab);
  assert.equal(adapted.url(), "https://x.example/profile");
  assert.equal(await adapted.getAXState(), "visible state");
});
