import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/diagnostics.js";

function fixture(mode = "normal") {
  let latestReady = false;
  let page = "https://x.com/home",
    query;
  const calls = [];
  const input = {
    filter() {
      return this;
    },
    async count() {
      return mode === "missing" ? 0 : mode === "ambiguous" ? 2 : 1;
    },
    async fill(value) {
      query = value;
      calls.push("fill");
    },
    async press(key) {
      if (mode === "transport") throw Error("connection interrupted");
      assert.equal(key, "Enter");
      calls.push("enter");
      if (mode !== "inert")
        page =
          mode === "wrong-route"
            ? "https://x.com/home"
            : `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query`;
    },
  };
  const latest = {
    filter() {
      return this;
    },
    async count() {
      if (mode === "delayed-latest" && !latestReady) return 0;
      return mode === "missing-latest" ? 0 : 1;
    },
    async waitFor() {
      latestReady = true;
    },
    async click() {
      calls.push("latest");
      page += "&f=live";
    },
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
      locator(selector) {
        assert.match(selector, /SearchBox_Search_Input/);
        return input;
      },
      getByRole(role) {
        assert.equal(role, "tab");
        return latest;
      },
      async waitForURL() {
        if (["inert", "wrong-route"].includes(mode))
          throw Error("Timed out waiting for URL");
      },
      async evaluate(_program, query) {
        assert.equal(query.timelineNavigation, true);
        return {
          page,
          accountHandle: "Owner",
          alerts: mode === "warning" ? ["请验证"] : [],
          needsStateCheck: false,
        };
      },
    },
  };
  if (mode === "unsupported") input.fill = undefined;
  return {
    browser: createDOMXBrowser(tab),
    calls,
    page: () => page,
    setPage(url) {
      page = url;
    },
  };
}

test("two search queries keep the loaded client and confirm latest without document navigation", async () => {
  const f = fixture();
  for (const query of ["first topic", "第二个话题"]) {
    await f.browser.act({ operation: "searchSources", query });
    const url = new URL(f.page());
    assert.equal(url.searchParams.get("q"), query);
    assert.equal(url.searchParams.get("f"), "live");
  }
  assert.equal(f.calls.includes("goto"), false);
  assert.deepEqual(f.calls, [
    "fill",
    "enter",
    "latest",
    "fill",
    "enter",
    "latest",
  ]);
});

test("route can commit before the Latest control finishes rendering", async () => {
  const f = fixture("delayed-latest");
  await f.browser.act({ operation: "searchSources", query: "topic" });
  assert.equal(new URL(f.page()).searchParams.get("f"), "live");
  assert.equal(f.calls.includes("goto"), false);
});

test("same semantic live query reuses page despite parameter ordering", async () => {
  const f = fixture();
  f.setPage("https://x.com/search?f=live&q=first%20topic&src=typed_query");
  await f.browser.act({ operation: "searchSources", query: "first topic" });
  assert.deepEqual(f.calls, []);
});

for (const mode of ["missing", "unsupported"]) {
  test(`one existing direct navigation when client input is unavailable: ${mode}`, async () => {
    const f = fixture(mode);
    await f.browser.act({ operation: "searchSources", query: "topic" });
    assert.deepEqual(f.calls, ["goto"]);
    assert.equal(new URL(f.page()).searchParams.get("f"), "live");
  });
}

for (const mode of [
  "ambiguous",
  "inert",
  "wrong-route",
  "warning",
  "missing-latest",
  "transport",
]) {
  test(`failed client search never adds a document retry: ${mode}`, async () => {
    const f = fixture(mode);
    await assert.rejects(() =>
      f.browser.act({ operation: "searchSources", query: "topic" }),
    );
    assert.equal(f.calls.includes("goto"), false);
  });
}
