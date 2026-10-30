import test from "node:test";
import assert from "node:assert/strict";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
for (const mode of [
  "ok",
  "no-ticket",
  "other-text",
  "alert",
  "wrong-account",
  "wrong-route",
  "persistent",
  "no-tabs",
])
  test(`cleared original profile cache recovery: ${mode}`, async () => {
    let reloads = 0,
      waits = 0,
      clicks = 0;
    const url = "https://x.com/owner";
    const tabControl = {
      filter() {
        return this;
      },
      count: async () => (mode === "no-tabs" ? 0 : 1),
      getAttribute: async () => "true",
      click: async () => clicks++,
    };
    const candidate = {
      first() {
        return this;
      },
      filter() {
        return this;
      },
      waitFor: async () => {
        waits++;
        if (!reloads || ["persistent", "no-tabs"].includes(mode))
          throw Error("Playwright selector deadline exceeded");
      },
    };
    const session = {
      originalReceiptReload:
        mode === "no-ticket"
          ? undefined
          : {
              text: mode === "other-text" ? "other" : "reviewed text",
              accountHandle: "owner",
            },
    };
    const tab = {
      url: async () => url,
      reload: async () => reloads++,
      playwright: {
        locator: () => tabControl,
        getByRole: () => candidate,
        waitForURL: async () => {},
      },
    };
    const nav = new DOMNavigation({
      session,
      tab,
      observe: async () => ({
        page: mode === "wrong-route" ? "https://x.com/other" : url,
        accountHandle: mode === "wrong-account" ? "other" : "owner",
        needsStateCheck: false,
        alerts: mode === "alert" ? ["verify"] : [],
      }),
    });
    const call = () =>
      nav.refreshPosts({
        url,
        evidenceRef: "original-proof",
        expectedText: "reviewed text",
      });
    if (mode === "ok") await call();
    else await assert.rejects(call);
    assert.equal(
      reloads,
      ["ok", "persistent", "no-tabs"].includes(mode) ? 1 : 0,
    );
    assert.equal(session.originalReceiptReload, undefined);
    assert.equal(clicks, mode === "no-tabs" ? 0 : 2);
  });
