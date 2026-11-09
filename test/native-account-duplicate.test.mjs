import test from "node:test";
import assert from "node:assert/strict";
import { createNativeXBrowser } from "../dist/diagnostics.js";
const frame = (handles) => `0 标准窗口 Profile, URL: x.com/ExampleOwner
${handles.map((h, i) => `  ${i + 1} link 个人资料, Value: x.com/${h}`).join("\n")}`;
for (const view of ["account", "posts", "composer"]) {
  test(`native ${view} identifies repeated consistent own-profile links`, async () => {
    const browser = createNativeXBrowser({
      getAXState: async () => frame(["ExampleOwner", "ExampleOwner"]),
    });
    assert.equal(
      (await browser.observe({ view })).accountHandle,
      "ExampleOwner",
    );
  });
  test(`native ${view} keeps conflicting own-profile identities unconfirmed`, async () => {
    const browser = createNativeXBrowser({
      getAXState: async () => frame(["ExampleOwner", "DifferentOwner"]),
    });
    assert.equal((await browser.observe({ view })).accountHandle, null);
  });
}
test("profile page URL alone is not operating-account evidence", async () => {
  const browser = createNativeXBrowser({ getAXState: async () => frame([]) });
  assert.equal(
    (await browser.observe({ view: "account" })).accountHandle,
    null,
  );
});
