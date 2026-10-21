import test from "node:test";
import assert from "node:assert/strict";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";

for (const operation of ["openObserved", "refreshPerson"]) {
  for (const mode of [
    "unavailable",
    "arrives-after-timeout",
    "normal",
    "empty-timeline",
    "alert",
    "wrong-route",
    "loading",
  ]) {
    test(`${operation} profile unavailable readiness: ${mode}`, async () => {
      const url = "https://x.com/reader";
      let waits = 0,
        reloads = 0;
      const unavailable = () =>
        mode !== "normal" &&
        mode !== "loading" &&
        (mode !== "arrives-after-timeout" || waits > 0);
      const nameVisible = () => mode === "normal" || mode === "empty-timeline";
      const target = {
        async waitFor() {
          waits++;
          if (!nameVisible()) throw Error("target-content-readiness-timeout");
        },
      };
      const nav = new DOMNavigation({
        session: {},
        observe: async () => ({
          page: mode === "wrong-route" ? "https://x.com/home" : url,
          accountHandle: "owner",
          alerts: mode === "alert" ? ["challenge"] : [],
        }),
        tab: {
          url: async () => url,
          goto: async () => {},
          reload: async () => {
            reloads++;
          },
          playwright: {
            locator: (selector) =>
              selector === '[data-testid="UserName"]'
                ? { ...target, isVisible: async () => nameVisible() }
                : { isVisible: async () => unavailable() },
            getByRole: () => target,
            waitForURL: async () => {},
            waitForLoadState: async () => {},
          },
        },
      });
      const run = () =>
        nav[operation]({
          view: "person",
          handle: "reader",
          url,
          evidenceRef: "synthetic-profile",
          forceNavigation: true,
        });
      if (nameVisible()) {
        await run();
        assert.equal(waits, 1);
      } else {
        await assert.rejects(
          run(),
          mode === "alert" || mode === "wrong-route"
            ? /target-readiness-route-or-alert/
            : mode === "loading"
              ? /timeout/
              : /profile-content-unavailable/,
        );
        if (
          mode === "unavailable" ||
          mode === "alert" ||
          mode === "wrong-route"
        )
          assert.equal(waits, 0);
        if (mode === "arrives-after-timeout") assert.ok(waits <= 4);
      }
      if (mode !== "loading")
        assert.equal(reloads, operation === "refreshPerson" ? 1 : 0);
    });
  }
}
