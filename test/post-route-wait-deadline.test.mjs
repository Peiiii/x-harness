import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/diagnostics.js";

test("observed post navigation uses its route deadline, not the read deadline", async () => {
  const target = "https://x.com/XiaotiaoWang";
  let page = "https://x.com/home";
  let routeTimeout;
  const locator = {
    filter() {
      return this;
    },
    first() {
      return this;
    },
    async count() {
      return 0;
    },
    async waitFor() {},
  };
  const tab = {
    async url() {
      return page;
    },
    async goto() {},
    playwright: {
      locator() {
        return locator;
      },
      getByRole() {
        return locator;
      },
      async waitForURL(url, options) {
        routeTimeout = options.timeoutMs;
        await new Promise((resolve) => setTimeout(resolve, 20));
        page = url;
      },
    },
  };

  const browser = createDOMXBrowser(tab, { readTimeoutMs: 5 });
  await browser.act({
    operation: "openObserved",
    view: "posts",
    url: target,
    evidenceRef: "observed-profile-proof",
  });
  assert.equal(routeTimeout, 15000);
  assert.equal(page, target);
});
