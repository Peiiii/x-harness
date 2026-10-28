import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/browser-dom.js";

function fixture(defaultPostActivation) {
  const activations = [];
  const button = {
    count: async () => 1,
    press: async (key) => activations.push(`key:${key}`),
    click: async () => activations.push("click"),
  };
  const editor = {
    count: async () => 1,
    filter() {
      return this;
    },
    waitFor: async () => {},
  };
  const tab = {
    playwright: {
      evaluate: async () => ({
        page: "https://x.com/home",
        accountHandle: "Pei",
        alerts: [],
        editors: [{ label: "帖子文本", text: "内容" }],
        buttons: [
          { label: "发帖", disabled: false },
          { label: "回复", disabled: false },
        ],
      }),
      getByRole: (role) => (role === "button" ? button : editor),
    },
  };
  return {
    browser: createDOMXBrowser(tab, { defaultPostActivation }),
    activations,
  };
}
for (const [option, explicit, expected] of [
  ["keyboard", undefined, "key:Enter"],
  ["keyboard", "click", "click"],
  [undefined, undefined, "click"],
]) {
  test(`original default ${option} explicit ${explicit} activates once via ${expected}`, async () => {
    const f = fixture(option);
    await f.browser.observe({ view: "composer" });
    await f.browser.act({
      operation: "submitPost",
      ...(explicit ? { activation: explicit } : {}),
    });
    assert.deepEqual(f.activations, [expected]);
  });
}
test("original default does not change reply activation", async () => {
  const f = fixture("keyboard");
  await f.browser.observe({ view: "composer" });
  await f.browser.act({ operation: "submitReply" });
  assert.deepEqual(f.activations, ["click"]);
});

test("the final authorization gate runs after capture setup and never activates when denied", async () => {
  const f = fixture("keyboard");
  await f.browser.observe({ view: "composer" });
  await assert.rejects(
    f.browser.act({
      operation: "submitPost",
      beforeSubmit: async () => {
        throw Error("window expired");
      },
    }),
    /window expired/,
  );
  assert.deepEqual(f.activations, []);
});
