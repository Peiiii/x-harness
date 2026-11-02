import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readPosts } from "../dist/readers-posts.js";
import { PlatformObservation } from "../dist/platform-observation.js";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
const page = "https://x.com/home";
const loadError = { code: "timeline-load-error", retryLabel: "重试" };
function readError(primary = true) {
  const button = {
    innerText: "重试",
    parentElement: { innerText: "出错了。请尝试重新加载。\n重试" },
    getClientRects: () => [{}],
  };
  const column = {
    getClientRects: () => [{}],
    querySelectorAll: (s) => (s === "button" && primary ? [button] : []),
  };
  return vm.runInNewContext("(" + readPosts.toString() + ")({})", {
    document: {
      querySelectorAll: (s) =>
        s === 'main [data-testid="primaryColumn"]' ? [column] : [],
      scrollingElement: null,
    },
    getComputedStyle: () => ({ visibility: "visible", opacity: "1" }),
  });
}
test("timeline error is recognized from its own retry container, not a sidebar", () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(readError().loadError)),
    loadError,
  );
  assert.equal(readError(false).loadError, undefined);
});
for (const mode of ["success", "persistent", "alert"])
  test(`visible timeline failure retries once then ${mode}`, async () => {
    let waits = 0,
      retries = 0;
    const browser = {
      observe: async () => ({
        page,
        accountHandle: "owner",
        posts: retries && mode === "success" ? [{ id: "1" }] : [],
        needsStateCheck: !(retries && mode === "success"),
        loading: true,
        loadError: !retries || mode === "persistent" ? loadError : undefined,
        alerts: mode === "alert" ? ["refusal"] : [],
      }),
      act: async ({ operation }) => {
        if (operation === "retryPosts") retries++;
        else {
          waits++;
          throw Error("timed out");
        }
      },
    };
    const r = await new PlatformObservation({ browser, clock: () => 0 }).ready({
      view: "posts",
      limit: 1,
    });
    assert.equal(retries, mode === "alert" ? 0 : 1);
    assert.equal(waits, 0);
    assert.equal(r.posts.length, mode === "success" ? 1 : 0);
  });
for (const mode of ["ok", "route", "ambiguous", "alert"])
  test(`retry control ${mode} stays in observed primary timeline`, async () => {
    let clicks = 0;
    const current = {
      query: { view: "posts" },
      result: {
        page,
        accountHandle: "owner",
        loadError,
        alerts: mode === "alert" ? ["refusal"] : [],
      },
    };
    const retry = {
      filter() {
        return this;
      },
      count: async () => (mode === "ambiguous" ? 2 : 1),
      click: async () => clicks++,
    };
    const column = { count: async () => 1, getByRole: () => retry };
    const tab = {
      url: async () => (mode === "route" ? "https://x.com/explore" : page),
      playwright: { locator: () => column },
    };
    const nav = new DOMNavigation({
      session: { current },
      tab,
      observe: async () => ({}),
    });
    if (mode === "ok") await nav.retryPosts({ page });
    else await assert.rejects(() => nav.retryPosts({ page }));
    assert.equal(clicks, mode === "ok" ? 1 : 0);
  });
test("an error appearing during a loading wait stops the remaining selector waits", async () => {
  let waits = 0;
  const browser = {
    observe: async () => ({
      page,
      accountHandle: "owner",
      posts: [],
      loading: true,
      needsStateCheck: true,
      ...(waits ? { loadError } : {}),
    }),
    act: async () => {
      waits++;
      throw Error("timed out");
    },
  };
  const result = await new PlatformObservation({
    browser,
    clock: () => 0,
  }).ready({ view: "posts" });
  assert.equal(waits, 1);
  assert.equal(result.loadError.code, "timeline-load-error");
});
test("retry result from another account cannot establish a healthy source read", async () => {
  let retried = false;
  const browser = {
    observe: async () => ({
      page,
      accountHandle: retried ? "other" : "owner",
      posts: retried ? [{ id: "1" }] : [],
      loading: false,
      needsStateCheck: !retried,
      ...(!retried ? { loadError } : {}),
    }),
    act: async () => {
      retried = true;
    },
  };
  const result = await new PlatformObservation({
    browser,
    clock: () => 0,
  }).ready({ view: "posts" });
  assert.equal(result.needsStateCheck, true);
  assert(result.alerts.includes("account-changed-during-read"));
});
