import test from "node:test";
import assert from "node:assert/strict";
import { PlatformObservation } from "../dist/platform-observation.js";
import { PlatformCollections } from "../dist/platform-collections.js";
import { DOMEditing } from "../dist/browser-dom-editing.js";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";

const post = (id) => ({
  id: String(id),
  author: "example_user",
  body: `Example source ${id}`,
  datetime: "2026-01-01T00:00:00Z",
  primary: `/example_user/status/${id}`,
  needsExpansion: false,
});

async function collect(mode) {
  let rows = [1, 2, 3, 4, 5].map(post);
  let advanced = false;
  const actions = [];
  const browser = {
    observe: async ({ offset = 0, limit = 5 }) => {
      const posts = rows.slice(offset, offset + limit);
      return {
        page: "https://x.com/search?q=example",
        accountHandle: "example_owner",
        renderedArticles: rows.length,
        firstRenderedId: rows[0]?.id,
        posts,
        moreInDOM: offset + posts.length < rows.length,
        needsStateCheck: false,
        alerts: advanced && mode === "alert" ? ["Example platform alert"] : [],
      };
    },
    act: async (command) => {
      actions.push(command);
      if (command.operation === "nextPosts") {
        advanced = true;
        return;
      }
      assert.equal(command.operation, "waitForPosts");
      if (command.excludeIds)
        assert.deepEqual(command.excludeIds, ["1", "2", "3", "4", "5"]);
      else assert.equal(command.offset, 5);
      if (mode === "append") {
        rows.push(post(6));
        return;
      }
      if (mode === "virtual") {
        rows = [9, 10, 11, 12, 13].map(post);
        return;
      }
      throw Error("timed out waiting for requested source window");
    },
  };
  const observation = new PlatformObservation({ browser, clock: () => 0 });
  const collections = new PlatformCollections({
    browser,
    ready: observation.ready,
    observed: observation.observed,
    choose: observation.choose,
  });
  const result = await collections.collectSources({
    processedIds: ["1", "2", "3", "4", "5"],
    maxPages: 3,
    limit: 1,
  });
  return { result, actions };
}

test("source collection waits for a delayed retained-prefix window", async () => {
  const { result, actions } = await collect("append");
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.sources.map((s) => s.id),
    ["6"],
  );
  assert.deepEqual(
    actions.map((a) => a.operation),
    ["nextPosts", "waitForPosts"],
  );
});

test("source collection restarts at a prefix replaced during the wait", async () => {
  const { result } = await collect("virtual");
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.sources.map((s) => s.id),
    ["9"],
  );
});

test("an unrendered source window remains incomplete after bounded render waits", async () => {
  const { result, actions } = await collect("timeout");
  assert.equal(result.complete, false);
  assert.deepEqual(result.sources, []);
  assert.ok(result.missing.includes("source-window-not-yet-rendered"));
  assert.equal(actions.filter((a) => a.operation === "waitForPosts").length, 2);
});

test("a platform alert stops source pagination before an offset wait", async () => {
  const { result, actions } = await collect("alert");
  assert.equal(result.complete, false);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(
    actions.map((a) => a.operation),
    ["nextPosts"],
  );
});

test("DOM source waits target the requested slot and preserve the initial wait", async () => {
  const selected = [];
  const make = (name) => ({
    waitFor: async (options) => selected.push({ name, options }),
  });
  const navigation = new DOMNavigation({
    session: {},
    observe: async () => ({}),
    tab: {
      playwright: {
        getByRole: () => ({
          first: () => make("first"),
          nth: (index) => make(`nth:${index}`),
        }),
      },
    },
  });
  await navigation.waitForPosts({ offset: 5 });
  await navigation.waitForPosts({});
  assert.deepEqual(
    selected.map((s) => s.name),
    ["nth:5", "first"],
  );
  assert.ok(selected.every((s) => s.options.timeoutMs === 5000));
  await assert.rejects(navigation.waitForPosts({ offset: -1 }));
});

test("DOM pagination waits for a new card, not an already visible old prefix", async () => {
  const calls = [];
  const articles = {
    filter: (q) => {
      calls.push(q);
      return articles;
    },
    first: () => ({ waitFor: async (q) => calls.push(q) }),
  };
  const navigation = new DOMNavigation({
    session: {},
    observe: async () => ({}),
    tab: {
      playwright: {
        getByRole: (role) => {
          assert.equal(role, "article");
          return articles;
        },
        locator: (selector) => {
          calls.push(selector);
          return { selector };
        },
      },
    },
  });
  await navigation.waitForPosts({ excludeIds: ["1", "2"] });
  assert.equal(calls[0], 'a[href$="/status/1"],a[href$="/status/2"]');
  assert.ok(calls[1].hasNot);
  assert.deepEqual(calls[2], { state: "visible", timeoutMs: 5000 });
  await assert.rejects(navigation.waitForPosts({ excludeIds: ["1]"] }));
});

test("source pagination reaches the loaded tail before waiting for asynchronous cards", async () => {
  const keys = [];
  const anchor = { filter: () => anchor, press: async (key) => keys.push(key) };
  const session = {
    current: { query: { view: "posts" }, result: { posts: [post(5)] } },
  };
  const editing = new DOMEditing({
    session,
    unique: async (x) => x,
    locator: () => anchor,
    observe: async () => ({}),
    tab: {
      playwright: {
        locator: (selector) => {
          assert.equal(selector, 'a[href="/example_user/status/5"]');
          return anchor;
        },
      },
    },
  });
  await editing.nextPosts({});
  assert.deepEqual(keys, ["End"]);
  assert.equal(session.current, null);
});
