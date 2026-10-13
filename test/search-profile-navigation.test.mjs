import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/diagnostics.js";

for (const mode of ["inert", "warning", "changed-route"]) {
  test(`cold search profile navigation preserves one safe fallback: ${mode}`, async () => {
    let page = "https://x.com/search?q=topic",
      waits = 0;
    const calls = [],
      reads = [];
    const link = {
      filter() {
        return this;
      },
      async count() {
        return 1;
      },
      async click() {
        calls.push("click");
        if (mode === "changed-route") page = "https://x.com/home";
      },
      async waitFor() {},
    };
    const tab = {
      async url() {
        return page;
      },
      async goto(url) {
        calls.push("goto");
        page = url;
      },
      playwright: {
        locator() {
          return link;
        },
        async waitForURL() {
          if (!waits++)
            throw Error("Timed out waiting for URL https://x.com/reader");
        },
        async evaluate(_program, query) {
          reads.push(query.view);
          return {
            page,
            accountHandle: "Pei",
            alerts: mode === "warning" ? ["请验证身份"] : [],
            needsStateCheck: query.view === "person",
          };
        },
      },
    };
    const browser = createDOMXBrowser(tab);
    const action = () =>
      browser.act({
        operation: "openObserved",
        view: "person",
        handle: "reader",
        url: "https://x.com/reader",
        evidenceRef: "observed-source",
      });
    if (mode === "inert") {
      await action();
      assert.deepEqual(calls, ["click", "goto"]);
    } else {
      await assert.rejects(action());
      assert.deepEqual(calls, ["click"]);
    }
    assert.deepEqual(reads, ["account"]);
  });
}

for (const mode of ["committed", "wrong-route", "alert", "other-error"]) {
  test(`post fallback URL wait preserves fresh exact route: ${mode}`, async () => {
    const target = "https://x.com/peer/status/123";
    let page = "https://x.com/search?q=mutual",
      waits = 0,
      contentWaits = 0;
    const calls = [];
    const locator = {
      filter() {
        return this;
      },
      first() {
        return this;
      },
      async count() {
        return 1;
      },
      async click() {
        calls.push("click");
      },
      async waitFor() {
        contentWaits++;
      },
    };
    const tab = {
      async url() {
        return page;
      },
      async goto(url) {
        calls.push("goto");
        page = mode === "wrong-route" ? "https://x.com/home" : url;
      },
      playwright: {
        locator() {
          return locator;
        },
        getByRole() {
          return locator;
        },
        async waitForURL() {
          waits++;
          if (waits === 2 && mode === "other-error")
            throw Error("transport unavailable");
          throw Error(`Timed out waiting for URL ${target}`);
        },
        async evaluate() {
          return {
            page,
            accountHandle: "owner",
            needsStateCheck: false,
            alerts:
              waits === 2 && mode === "alert" ? ["verification needed"] : [],
          };
        },
      },
    };
    const browser = createDOMXBrowser(tab);
    const run = () =>
      browser.act({
        operation: "openObserved",
        view: "posts",
        url: target,
        evidenceRef: "observed-parent",
      });
    if (mode === "committed") {
      await run();
      assert.equal(contentWaits, 1);
    } else {
      await assert.rejects(run());
      assert.equal(contentWaits, 0);
    }
    assert.deepEqual(calls, ["click", "goto"]);
    assert.equal(waits, 2);
  });
}
