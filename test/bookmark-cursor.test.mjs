import test from "node:test";
import assert from "node:assert/strict";
import { PlatformCollections } from "../dist/platform-collections.js";

for (const mode of ["ready", "absent", "changed", "alert"]) {
  test(`source pagination restores an empty semantic anchor only when ${mode}`, async () => {
    const page = "https://x.com/home";
    const post = (id) => ({
      id,
      author: "example",
      body: "Example source",
      datetime: "2026-01-01T00:00:00Z",
      primary: `/example/status/${id}`,
    });
    let scrolls = 0;
    let current;
    const observation = (posts, extra = {}) => ({
      page,
      posts,
      renderedIds: scrolls < 2 ? ["1"] : ["1", "2"],
      renderedArticles: scrolls < 2 ? 1 : 2,
      firstRenderedId: "1",
      moreInDOM: false,
      viewportScrollTop: scrolls * 100,
      needsStateCheck: false,
      alerts: [],
      ...extra,
    });
    const ready = async () =>
      (current = observation(
        scrolls === 0 ? [post("1")] : scrolls === 1 ? [] : [post("2")],
      ));
    const c = new PlatformCollections({
      ready,
      observed: async () => {
        if (scrolls !== 1) return ready();
        current = observation(mode === "absent" ? [] : [post("1")], {
          page: mode === "changed" ? "https://x.com/other" : page,
          alerts: mode === "alert" ? ["challenge"] : [],
        });
        return current;
      },
      browser: {
        act: async ({ operation }) => {
          if (operation !== "nextPosts") return;
          if (!current.posts.at(-1)?.primary)
            throw Error("source pagination requires an observed permalink");
          scrolls++;
        },
      },
      choose: async () => false,
    });
    const result = await c.collectSources({
      processedIds: ["1"],
      limit: 1,
      maxPages: 2,
    });
    assert.equal(scrolls, mode === "ready" ? 2 : 1);
    assert.equal(result.complete, mode === "ready");
    assert.deepEqual(
      result.sources.map((p) => p.id),
      mode === "ready" ? ["2"] : [],
    );
    if (mode !== "ready") assert.equal(result.needsStateCheck, true);
  });
}

test("bounded bookmark continuation reaches unread retained cards beyond ten windows", async () => {
  let rows = Array.from({ length: 65 }, (_, i) => ({
    id: String(i + 1),
    author: "example",
    body: "Example source",
    datetime: "2026-01-01T00:00:00Z",
    primary: `/example/status/${i + 1}`,
  }));
  let page = "https://x.com/i/bookmarks/example";
  const observe = async ({ view, offset = 0, limit = 5 }) => ({
    page,
    headings: ["Example folder"],
    posts: rows.slice(offset, offset + limit),
    firstRenderedId: rows[0]?.id,
    moreInDOM: offset + limit < rows.length,
    alerts: [],
    needsStateCheck: false,
  });
  const c = new PlatformCollections({
    browser: {
      act: async () => {
        throw Error("all cards already retained");
      },
    },
    ready: observe,
    observed: observe,
    choose: async () => false,
  });
  const processedIds = Array.from({ length: 60 }, (_, i) => String(i + 1));
  const first = await c.collectSources({
    processedIds,
    maxPages: 10,
    limit: 1,
  });
  assert.equal(first.complete, false);
  const second = await c.readBookmarks({
    folder: "Example folder",
    processedIds,
    maxPages: 3,
    limit: 1,
    resume: true,
  });
  assert.deepEqual(
    second.sources.map((s) => s.id),
    ["61"],
  );
  rows = [{ ...rows[0], id: "999", primary: "/example/status/999" }];
  const replaced = await c.readBookmarks({
    folder: "Example folder",
    processedIds,
    maxPages: 1,
    limit: 1,
    resume: true,
  });
  assert.deepEqual(
    replaced.sources.map((s) => s.id),
    ["999"],
  );
});

for (const mode of [
  "selected",
  "selected-normal",
  "wrong-name",
  "unselected",
  "duplicate-selected",
  "wrong-route",
  "alert",
  "loading",
]) {
  test(`named bookmark continuation with a history heading: ${mode}`, async () => {
    let postReads = 0;
    let waits = 0;
    const controls = [
      {
        role: "tab",
        label: mode === "wrong-name" ? "Other folder" : "Example folder",
        selected: mode !== "unselected",
      },
    ];
    if (mode === "selected-normal")
      controls.push({ role: "tab", label: "Bookmarks", selected: false });
    if (mode === "duplicate-selected")
      controls.push({ role: "tab", label: "Other folder", selected: true });
    const navigation = {
      page:
        mode === "wrong-route"
          ? "https://x.com/home"
          : "https://x.com/i/history/bookmarks/123",
      headings: ["History"],
      controls,
      needsStateCheck: mode === "loading",
      alerts: mode === "alert" ? ["rate-limit"] : [],
    };
    const ready = async ({ view }) => {
      if (view !== "posts") return navigation;
      postReads++;
      return {
        ...navigation,
        posts: [
          {
            id: "41",
            author: "example",
            body: "A complete source",
            datetime: "2026-01-01T00:00:00Z",
            primary: "/example/status/41",
          },
        ],
        moreInDOM: false,
      };
    };
    const c = new PlatformCollections({
      ready,
      observed: ready,
      choose: async (value, predicate) =>
        value.controls.filter(predicate).length === 1,
      browser: { act: async () => waits++ },
    });
    const result = await c.readBookmarks({
      folder: "Example folder",
      resume: mode !== "selected-normal",
      limit: 1,
      maxPages: 1,
    });
    if (mode.startsWith("selected")) {
      assert.deepEqual(
        result.sources.map((s) => s.id),
        ["41"],
      );
      assert.equal(result.folderEvidence.name, "Example folder");
      assert.equal(waits, 0);
    } else {
      assert.deepEqual(result.missing, ["folder-selection-unconfirmed"]);
      assert.equal(postReads, 0);
    }
  });
}
