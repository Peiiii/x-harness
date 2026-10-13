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
        renderedIds: rows.map((p) => p.id),
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

test("source pagination advances one viewport before waiting for asynchronous cards", async () => {
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
          if (selector === "time") return {};
          if (selector === "body") return anchor;
          assert.equal(selector, 'a[href="/example_user/status/5"]');
          return anchor;
        },
      },
    },
  });
  await editing.nextPosts({});
  assert.deepEqual(keys, ["PageDown"]);
  assert.equal(session.current, null);
});

test("native source pagination preserves focus without activating an offscreen anchor", async () => {
  const keys = [];
  const anchor = {
    filter: () => anchor,
    press: async () => {
      throw Error("offscreen focus must not be used");
    },
  };
  const session = {
    current: { query: { view: "posts" }, result: { posts: [post(5)] } },
  };
  const editing = new DOMEditing({
    session,
    unique: async (x) => x,
    locator: () => anchor,
    observe: async () => ({}),
    tab: {
      pressKey: async (index, key) => {
        assert.equal(index, null);
        keys.push(key);
      },
      playwright: {
        locator: (selector) => {
          if (selector === "time") return {};
          if (selector === "body") return anchor;
          assert.equal(selector, 'a[href="/example_user/status/5"]');
          return anchor;
        },
      },
    },
  });
  await editing.nextPosts({});
  assert.deepEqual(keys, ["PageDown"]);
  assert.equal(session.current, null);
});

test("empty first bookmark screen waits even when DOM marks navigation ready", async () => {
  let loaded = false;
  const actions = [];
  const browser = {
    observe: async () => ({
      page: "https://x.com/i/bookmarks/folder/7",
      renderedArticles: loaded ? 1 : 0,
      posts: loaded ? [post(7)] : [],
      needsStateCheck: false,
      alerts: [],
    }),
    act: async (q) => {
      actions.push(q);
      loaded = true;
    },
  };
  const observation = new PlatformObservation({ browser, clock: () => 0 });
  const result = await observation.ready({
    view: "posts",
    offset: 0,
    limit: 5,
  });
  assert.deepEqual(
    result.posts.map((p) => p.id),
    ["7"],
  );
  assert.deepEqual(actions, [{ operation: "waitForPosts" }]);
});

test("an offset window survives transient removal of every rendered article", async () => {
  let loaded = false;
  const actions = [];
  const browser = {
    observe: async ({ offset }) => ({
      page: "https://x.com/i/bookmarks/folder/7",
      renderedArticles: loaded ? 6 : 0,
      firstRenderedId: loaded ? "1" : undefined,
      posts: loaded && offset === 5 ? [post(6)] : [],
      needsStateCheck: false,
      alerts: [],
    }),
    act: async (q) => {
      actions.push(q);
      loaded = true;
    },
  };
  const observation = new PlatformObservation({ browser, clock: () => 0 });
  const result = await observation.ready({
    view: "posts",
    offset: 5,
    limit: 5,
  });
  assert.deepEqual(
    result.posts.map((p) => p.id),
    ["6"],
  );
  assert.deepEqual(actions, [{ operation: "waitForPosts", offset: 5 }]);
});

test("an empty first list stays unconfirmed after timeout and never scrolls an absent card", async () => {
  const actions = [];
  const browser = {
    observe: async () => ({
      page: "https://x.com/i/bookmarks/folder/7",
      renderedArticles: 0,
      posts: [],
      needsStateCheck: false,
      alerts: [],
    }),
    act: async (q) => {
      actions.push(q);
      throw Error("timed out");
    },
  };
  const observation = new PlatformObservation({ browser, clock: () => 0 });
  const collections = new PlatformCollections({
    browser,
    ready: observation.ready,
    observed: observation.observed,
    choose: observation.choose,
  });
  const result = await collections.collectSources({ maxPages: 2, limit: 1 });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["source-page-unconfirmed"]);
  assert.deepEqual(actions, [{ operation: "waitForPosts" }]);
});

test("progressive virtual windows find an unprocessed middle source and wait on DOM IDs, not global processed IDs", async () => {
  let stage = 0;
  const global = Array.from({ length: 31 }, (_, i) => String(i + 1)).filter(
    (id) => id !== "15",
  );
  const reads = [];
  const browser = {
    observe: async ({ offset = 0, limit = 5 }) => {
      const rows = Array.from({ length: 10 }, (_, i) =>
        post(1 + stage * 3 + i),
      );
      return {
        page: "https://x.com/i/bookmarks/folder/7",
        posts: rows.slice(offset, offset + limit),
        renderedIds: rows.map((p) => p.id),
        firstRenderedId: rows[0].id,
        renderedArticles: rows.length,
        moreInDOM: offset + limit < rows.length,
        needsStateCheck: false,
        alerts: [],
      };
    },
    act: async (command) => {
      if (command.operation === "nextPosts") {
        stage++;
        return;
      }
      assert.equal(command.operation, "waitForPosts");
      const oldDOM = Array.from({ length: 10 }, (_, i) =>
        String(1 + (stage - 1) * 3 + i),
      );
      assert.deepEqual(command.excludeIds, oldDOM);
      reads.push(command.excludeIds);
    },
  };
  const observation = new PlatformObservation({ browser, clock: () => 0 });
  const adapter = new PlatformCollections({
    browser,
    ready: observation.ready,
    observed: observation.observed,
    choose: observation.choose,
  });
  const result = await adapter.collectSources({
    processedIds: global,
    limit: 1,
    maxPages: 10,
  });
  assert.deepEqual(
    result.sources.map((p) => p.id),
    ["15"],
  );
  assert.equal(stage, 2);
  assert.equal(reads.length, 2);
});

test("retained DOM survives several viewport scrolls before asynchronous cards change", async () => {
  let stage = 0;
  let scrolls = 0;
  const global = Array.from({ length: 31 }, (_, i) => String(i + 1)).filter(
    (id) => id !== "15",
  );
  const reads = [];
  const browser = {
    observe: async ({ offset = 0, limit = 5 }) => {
      const rows = Array.from({ length: 10 }, (_, i) =>
        post(1 + stage * 3 + i),
      );
      return {
        page: "https://x.com/i/bookmarks/folder/7",
        posts: rows.slice(offset, offset + limit),
        renderedIds: rows.map((p) => p.id),
        firstRenderedId: rows[0].id,
        renderedArticles: rows.length,
        viewportScrollTop: scrolls * 600,
        moreInDOM: offset + limit < rows.length,
        needsStateCheck: false,
        alerts: [],
      };
    },
    act: async (command) => {
      if (command.operation === "nextPosts") {
        scrolls++;
        stage = Math.floor(scrolls / 3);
        return;
      }
      assert.equal(command.operation, "waitForPosts");
      const oldDOM = Array.from({ length: 10 }, (_, i) =>
        String(1 + Math.floor((scrolls - 1) / 3) * 3 + i),
      );
      assert.deepEqual(command.excludeIds, oldDOM);
      reads.push(command.excludeIds);
      if (scrolls % 3) throw Error("timed out");
    },
  };
  const observation = new PlatformObservation({ browser, clock: () => 0 });
  const adapter = new PlatformCollections({
    browser,
    ready: observation.ready,
    observed: observation.observed,
    choose: observation.choose,
  });
  const result = await adapter.collectSources({
    processedIds: global,
    limit: 1,
    maxPages: 10,
  });
  assert.deepEqual(
    result.sources.map((p) => p.id),
    ["15"],
  );
  assert.equal(stage, 2);
  assert.equal(scrolls, 6);
  assert.equal(reads.length, 6);
});

test("stable rendered tail is exposed as a boundary, never full-folder completion", async () => {
  const rows = [post(1), post(2)];
  const browser = {
    observe: async ({ offset = 0, limit = 5 }) => ({
      page: "https://x.com/i/bookmarks/folder/7",
      posts: rows.slice(offset, offset + limit),
      renderedIds: ["1", "2"],
      firstRenderedId: "1",
      renderedArticles: 2,
      moreInDOM: false,
      atRenderedTail: true,
      loading: false,
      needsStateCheck: false,
      alerts: [],
    }),
    act: async (command) => {
      if (command.operation === "waitForPosts") throw Error("timed out");
    },
  };
  const observation = new PlatformObservation({ browser, clock: () => 0 });
  const adapter = new PlatformCollections({
    browser,
    ready: observation.ready,
    observed: observation.observed,
    choose: observation.choose,
  });
  const result = await adapter.collectSources({
    processedIds: ["1", "2"],
    limit: 1,
    maxPages: 10,
  });
  assert.equal(result.complete, false);
  assert.equal(result.pageComplete, false);
  assert.equal(result.paginationBoundary.scopeComplete, false);
  assert.equal(result.paginationBoundary.lastId, "2");
  assert.ok(result.missing.includes("stable-rendered-tail"));
});
