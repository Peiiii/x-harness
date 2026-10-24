import test from "node:test";
import assert from "node:assert/strict";
import { readNavigation } from "../dist/readers-navigation.js";

for (const duplicate of [false, true]) {
  test(`timeline navigation scopes unrelated profile controls, duplicate=${duplicate}`, () => {
    const previousDocument = globalThis.document;
    const previousLocation = globalThis.location;
    const node = (label, role, inNav = false) => ({
      tagName: "A",
      innerText: label,
      disabled: false,
      getClientRects: () => [1],
      getAttribute: (key) =>
        key === "role" ? role : key === "href" ? "/creator/with_replies" : null,
      closest: (selector) => (selector === "nav" && inNav ? {} : null),
    });
    const tabs = [node("Replies", "tab")];
    if (duplicate) tabs.push(node("Replies", "tab"));
    const ordinary = Array.from({ length: 45 }, (_, i) =>
      node(`profile-${i}`, "link"),
    );
    globalThis.location = { href: "https://x.com/creator" };
    globalThis.document = {
      querySelector: () => ({
        querySelectorAll: (selector) =>
          selector.includes("h1") ? [] : [...tabs, ...ordinary],
      }),
      querySelectorAll: () => [],
    };
    try {
      const unchanged = readNavigation();
      assert.equal(unchanged.needsStateCheck, true);
      assert.deepEqual(unchanged.missing, ["navigation-window-overflow"]);
      const scoped = readNavigation({ timelineNavigation: true });
      assert.equal(scoped.needsStateCheck, false);
      assert.equal(scoped.controls.length, duplicate ? 2 : 1);
      assert.ok(scoped.controls.every((control) => control.role === "tab"));
    } finally {
      globalThis.document = previousDocument;
      globalThis.location = previousLocation;
    }
  });
}
