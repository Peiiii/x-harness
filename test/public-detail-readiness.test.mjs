import test from "node:test";
import assert from "node:assert/strict";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
const url = "https://x.com/example_owner/status/123";
async function open(fault) {
  const calls = [];
  let page = "https://x.com/example_owner";
  const permalink = {
    filter() {
      return this;
    },
    count: async () => 0,
  };
  const articles = {
    filter(options) {
      calls.push(["target", options.has]);
      return this;
    },
    first() {
      return {
        waitFor: async (options) => {
          calls.push(["article", options]);
          if (fault === "article-timeout") throw Error("article timeout");
        },
      };
    },
  };
  const navigation = new DOMNavigation({
    session: {},
    observe: async () => {
      throw Error("No fallback observation for direct navigation");
    },
    tab: {
      url: async () => page,
      goto: async (destination) => {
        calls.push(["goto", destination]);
        page = destination;
      },
      playwright: {
        locator: (selector) =>
          selector.startsWith("a[href=") ? permalink : null,
        getByRole: (role) => {
          assert.equal(role, "article");
          return articles;
        },
        waitForURL: async (destination, options) => {
          calls.push(["url", options]);
          assert.equal(destination, url);
          assert.equal(options.waitUntil, "commit");
          if (fault === "interrupted") throw Error("connection interrupted");
          if (fault === "url-timeout") throw Error("Timed out waiting for URL");
        },
      },
    },
  });
  try {
    await navigation.openObserved({
      url,
      view: "posts",
      evidenceRef: "synthetic-proof",
    });
    return { calls };
  } catch (error) {
    return { calls, error };
  }
}
test("cold public detail waits for URL commit then the exact permalink article, not page load or a stale article", async () => {
  const r = await open();
  assert.equal(r.error, undefined);
  assert.deepEqual(
    r.calls.map((x) => x[0]),
    ["goto", "url", "target", "article"],
  );
  assert.equal(r.calls[1][1].timeoutMs, 15000);
  assert.equal(r.calls[3][1].state, "visible");
  assert.equal(r.calls[3][1].timeoutMs, 15000);
});
test("detail route timeout, interruption and article timeout remain failures without another navigation or any submit", async () => {
  for (const fault of ["url-timeout", "interrupted", "article-timeout"]) {
    const r = await open(fault);
    assert.ok(r.error);
    assert.equal(r.calls.filter((x) => x[0] === "goto").length, 1);
    assert.ok(!r.calls.some((x) => x[0] === "submit"));
  }
});
