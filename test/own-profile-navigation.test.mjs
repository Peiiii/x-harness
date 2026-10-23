import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/diagnostics.js";
for (const mode of ["unique-nav", "missing-nav", "ambiguous-nav", "forced"]) {
  test(`own profile return disambiguates only the exact visible navigation link: ${mode}`, async () => {
    const target = "https://x.com/owner";
    let page = "https://x.com/peer/status/123";
    const calls = [];
    const ordinary = {
      filter() {
        return this;
      },
      count: async () => 2,
      click: async () => {
        throw Error("ambiguous link clicked");
      },
    };
    const nav = {
      filter() {
        return this;
      },
      count: async () =>
        mode === "missing-nav" ? 0 : mode === "ambiguous-nav" ? 2 : 1,
      click: async () => {
        calls.push("nav");
        page = target;
      },
    };
    const article = {
      first() {
        return this;
      },
      waitFor: async () => {
        calls.push("content");
      },
    };
    const browser = createDOMXBrowser({
      url: async () => page,
      goto: async (url) => {
        calls.push("goto");
        page = url;
      },
      playwright: {
        locator: (s) => (s.includes("AppTabBar_Profile_Link") ? nav : ordinary),
        getByRole: () => article,
        waitForURL: async (url) => assert.equal(page, url),
      },
    });
    await browser.act({
      operation: "openObserved",
      view: "posts",
      url: target,
      evidenceRef: "observed-own-profile",
      ...(mode === "forced" ? { forceNavigation: true } : {}),
    });
    assert.deepEqual(calls, [
      mode === "unique-nav" ? "nav" : "goto",
      "content",
    ]);
  });
}
