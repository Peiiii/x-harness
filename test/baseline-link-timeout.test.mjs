import test from "node:test";
import assert from "node:assert/strict";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
for (const mode of [
  "recover",
  "committed",
  "alert",
  "changed",
  "missing-account",
  "non-timeout",
  "strict-receipt",
])
  test("read-only baseline link timeout " + mode, async () => {
    let page = "https://x.com/home",
      gotos = 0,
      checks = 0,
      waits = 0;
    const url = "https://x.com/owner";
    const locator = {
      filter() {
        return this;
      },
      first() {
        return this;
      },
      count: async () => 1,
      click: async () => {
        if (mode === "committed") page = url;
        throw Error(
          mode === "non-timeout"
            ? "connection closed"
            : 'Timed out after 3000ms waiting for selector a[href="/owner"]',
        );
      },
      waitFor: async () => {
        waits++;
      },
    };
    const nav = new DOMNavigation({
      session: {},
      observe: async () => {
        checks++;
        return {
          page: mode === "changed" ? "https://x.com/elsewhere" : page,
          accountHandle: mode === "missing-account" ? null : "owner",
          needsStateCheck: false,
          alerts: mode === "alert" ? ["challenge"] : [],
        };
      },
      tab: {
        url: async () => page,
        goto: async (u) => {
          gotos++;
          page = u;
        },
        playwright: {
          locator: () => locator,
          getByRole: () => locator,
          waitForURL: async () => {},
        },
      },
    });
    const p = nav.openObserved({
      view: "posts",
      url,
      evidenceRef: "observed-owner-route",
      preferObservedLink: mode === "strict-receipt",
    });
    if (["recover", "committed"].includes(mode)) {
      await p;
      assert.equal(gotos, mode === "recover" ? 1 : 0);
      assert.equal(waits, 1);
      assert.equal(checks, 1);
    } else {
      await assert.rejects(p);
      assert.equal(gotos, 0);
    }
  });
