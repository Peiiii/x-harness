import test from "node:test";
import assert from "node:assert/strict";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
for (const mode of ["slow", "moved", "interrupted", "still-missing"])
  test(`composer readiness ${mode} stays on original route and never submits`, async () => {
    let page = "https://x.com/owner/status/123",
      waits = 0,
      gotos = 0;
    const tab = {
      url: async () => page,
      goto: async (u) => {
        gotos++;
        page = u;
      },
      playwright: {
        locator: () => ({
          filter() {
            return this;
          },
          count: async () => 0,
        }),
        waitForURL: async () => {},
        getByRole: () => ({
          waitFor: async () => {
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
      },
    };
    const nav = new DOMNavigation({
      tab,
      session: {},
      observe: async () => {
        throw Error("must not read account");
      },
    });
    const run = () =>
      nav.openObserved({
        url: "https://x.com/home",
        view: "composer",
        evidenceRef: "original-compose",
      });
    if (mode === "slow") {
      await run();
      assert.equal(waits, 2);
    } else {
      await assert.rejects(run);
      assert.equal(waits, mode === "still-missing" ? 2 : 1);
    }
    assert.equal(gotos, 1);
  });
