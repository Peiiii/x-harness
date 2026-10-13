import test from "node:test";
import assert from "node:assert/strict";
import { readNavigation } from "../dist/readers-navigation.js";
test("bookmark navigation ignores recommendation links without hiding actual entry or tab", () => {
  const prior = globalThis.document,
    prevLocation = globalThis.location;
  const node = (label, role = "link", nav = false) => ({
    tagName: "A",
    innerText: label,
    disabled: false,
    children: [],
    getClientRects: () => [1],
    getAttribute: (k) =>
      k === "role"
        ? role
        : k === "aria-selected"
          ? "true"
          : k === "href"
            ? "/i/history"
            : null,
    closest: (s) => (s === "nav" && nav ? {} : null),
  });
  const nav = [node("历史", "link", true), node("更多菜单项", "button", true)],
    tab = node("书签", "tab");
  const recommendations = Array.from({ length: 45 }, (_, i) =>
    node(`suggested-${i}`),
  );
  globalThis.location = { href: "https://x.com/i/history" };
  globalThis.document = {
    querySelector: () => ({
      querySelectorAll: (q) =>
        q.includes("h1") ? [] : [tab, ...recommendations],
    }),
    querySelectorAll: (q) => (q === "nav a[href],nav button" ? nav : []),
  };
  try {
    const r = readNavigation({ bookmarkNavigation: true });
    assert.equal(r.needsStateCheck, false);
    assert.deepEqual(
      r.controls.map((x) => x.label),
      ["历史", "更多菜单项", "书签"],
    );
    assert.ok(!r.controls.some((x) => x.label.startsWith("suggested")));
  } finally {
    globalThis.document = prior;
    globalThis.location = prevLocation;
  }
});
