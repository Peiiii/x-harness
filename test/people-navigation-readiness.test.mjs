import test from "node:test";
import assert from "node:assert/strict";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";

for (const mode of ["slow", "moved", "interrupted", "still-missing"]) {
  test(`people list readiness ${mode} keeps the observed route`, async () => {
    let page = "https://x.com/fixture_source",
      waits = 0,
      navigations = 0;
    const tab = {
      url: async () => page,
      goto: async (url) => {
        navigations++;
        page = url;
      },
      playwright: {
        locator: (selector) => ({
          filter() {
            return this;
          },
          count: async () => 0,
          first() {
            return this;
          },
          waitFor: async () => {
            assert.match(selector, /UserCell/);
            waits++;
            if (mode === "moved") page = "https://x.com/login";
            if (waits === 1 || mode === "still-missing")
              throw Error(
                mode === "interrupted"
                  ? "connection interrupted"
                  : "selector deadline exceeded",
              );
          },
        }),
        waitForURL: async () => {},
      },
    };
    const nav = new DOMNavigation({
      tab,
      session: {},
      observe: async () => {
        throw Error("unexpected read");
      },
    });
    const run = () =>
      nav.openObserved({
        url: "https://x.com/fixture_source/following",
        view: "people",
        evidenceRef: "synthetic:list",
      });
    if (mode === "slow") await run();
    else await assert.rejects(run);
    assert.equal(waits, mode === "slow" || mode === "still-missing" ? 2 : 1);
    assert.equal(navigations, 1);
  });
}
