import test from "node:test";
import assert from "node:assert/strict";
const root =
  process.env.HARNESS_TEST_BASE ?? new URL("../dist/", import.meta.url).href;
const { createDOMXBrowser } = await import(root + "browser-dom.js");
function fixture(options = {}) {
  const calls = [];
  const state = {
    handle: "fixture_a",
    page: "https://x.com/fixture_self/followers",
    livePage: "https://x.com/fixture_self/followers",
    retryCount: 1,
    primaryCount: 1,
    alerts: [],
    ...options,
  };
  const retry = {
    filter() {
      return this;
    },
    count: async () => state.retryCount,
    click: async () => {
      calls.push("primary-retry");
      if (state.clickFails) throw Error("read activation failed");
    },
  };
  const cells = {
    filter(o) {
      assert.ok(o.hasText.test("出错了。请尝试重新加载。重试"));
      return this;
    },
    getByRole(role, o) {
      assert.equal(role, "button");
      assert.ok(o.name.test("重试"));
      return retry;
    },
  };
  const primary = {
    count: async () => state.primaryCount,
    locator(selector) {
      assert.equal(selector, '[data-testid="cellInnerDiv"]');
      return cells;
    },
  };
  const tab = {
    url: async () => state.livePage,
    getAXState: async () =>
      `17 container 时间线：关注者\n23 button 回关 @${state.handle}\n31 button 重试\n51 button 重试`,
    scroll: async (...args) => calls.push(["scroll", ...args]),
    playwright: {
      locator(selector) {
        assert.equal(selector, 'main [data-testid="primaryColumn"]');
        return primary;
      },
      evaluate: async () => ({
        page: state.page,
        accountHandle: "fixture_self",
        people: [
          {
            handle: state.handle,
            url: "https://x.com/" + state.handle,
            relationship: "follows-you",
            blue: true,
          },
        ],
        scrollAnchor: { handle: state.handle, pages: 1 },
        alerts: state.alerts,
        needsStateCheck: false,
      }),
    },
  };
  return { browser: createDOMXBrowser(tab), state, calls };
}
test("confirmed list error retries only its unique primary cell, not the sidebar, once per boundary", async () => {
  const f = fixture();
  await f.browser.observe({ view: "people", limit: 1 });
  await f.browser.act({ operation: "nextPeople" });
  assert.deepEqual(f.calls, ["primary-retry"]);
  await f.browser.observe({ view: "people", limit: 1 });
  await assert.rejects(
    () => f.browser.act({ operation: "nextPeople" }),
    /people-retry-already-attempted/,
  );
  assert.deepEqual(f.calls, ["primary-retry"]);
});
test("sidebar-only error retains ordinary observed list scrolling", async () => {
  const f = fixture({ retryCount: 0 });
  await f.browser.observe({ view: "people", limit: 1 });
  await f.browser.act({ operation: "nextPeople" });
  assert.deepEqual(f.calls, [["scroll", 23, "down", 1]]);
});
for (const options of [{ retryCount: 2 }, { primaryCount: 2 }])
  test(
    "ambiguous primary error refuses without activation " +
      JSON.stringify(options),
    async () => {
      const f = fixture(options);
      await f.browser.observe({ view: "people", limit: 1 });
      await assert.rejects(
        () => f.browser.act({ operation: "nextPeople" }),
        /people-retry-control-ambiguous/,
      );
      assert.deepEqual(f.calls, []);
    },
  );
test("changed live page refuses the old list retry", async () => {
  const f = fixture({ livePage: "https://x.com/home" });
  await f.browser.observe({ view: "people", limit: 1 });
  await assert.rejects(
    () => f.browser.act({ operation: "nextPeople" }),
    /people-retry-page-changed/,
  );
  assert.deepEqual(f.calls, []);
});
test("platform alerts preserve the original refusal before list recovery", async () => {
  const f = fixture({ alerts: ["synthetic refusal"] });
  await f.browser.observe({ view: "people", limit: 1 });
  await assert.rejects(
    () => f.browser.act({ operation: "nextPeople" }),
    /people-page-unconfirmed/,
  );
  assert.deepEqual(f.calls, []);
});
test("actual list progress grants a distinct bounded read retry", async () => {
  const f = fixture();
  await f.browser.observe({ view: "people", limit: 1 });
  await f.browser.act({ operation: "nextPeople" });
  f.state.handle = "fixture_b";
  await f.browser.observe({ view: "people", limit: 1 });
  await f.browser.act({ operation: "nextPeople" });
  assert.deepEqual(f.calls, ["primary-retry", "primary-retry"]);
});
test("a failed activation is not repeated at the same original boundary", async () => {
  const f = fixture({ clickFails: true });
  await f.browser.observe({ view: "people", limit: 1 });
  await assert.rejects(
    () => f.browser.act({ operation: "nextPeople" }),
    /read activation failed/,
  );
  await f.browser.observe({ view: "people", limit: 1 });
  await assert.rejects(
    () => f.browser.act({ operation: "nextPeople" }),
    /people-retry-already-attempted/,
  );
  assert.deepEqual(f.calls, ["primary-retry"]);
});
