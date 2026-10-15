import test from "node:test";
import assert from "node:assert/strict";
import { PlatformCollections } from "../dist/platform-collections.js";
import { readResult } from "../dist/results.js";
import { createBusinessHarness, createXPlatform } from "../dist/diagnostics.js";
import { fixture } from "./fixtures.mjs";

function collection({
  page = "https://x.com/explore",
  tabs = [{ role: "tab", label: "为你推荐", selected: false }],
  needsNavigationWait = false,
  unflaggedNavigationWait = false,
  navigationWaitCompletes = true,
  posts = [
    {
      id: "100",
      author: "writer",
      datetime: "2026-10-14T01:00:00.000Z",
      body: "完整的推荐帖子正文。",
      metrics: [{ label: "喜欢 25" }, { label: "回复 6" }],
    },
  ],
} = {}) {
  const calls = [],
    reads = [];
  let currentPage = "https://x.com/home";
  let postsReady = false;
  const dependencies = {
    ready: async (query) => {
      reads.push(query.view);
      if (query.view === "navigation")
        return {
          page: currentPage,
          controls:
            (needsNavigationWait || unflaggedNavigationWait) && !postsReady
              ? []
              : tabs,
          headings: [],
          needsStateCheck: needsNavigationWait && !postsReady,
          alerts: [],
        };
      return {
        page: currentPage,
        accountHandle: "writer",
        posts,
        needsStateCheck: false,
        alerts: [],
      };
    },
    observed: async () => ({ posts: [] }),
    browser: {
      act: async (command) => {
        calls.push(command.operation);
        if (command.operation === "openExploreRecommendations")
          currentPage = page;
        if (command.operation === "waitForPosts" && navigationWaitCompletes)
          postsReady = true;
      },
    },
    choose: async (value, predicate) => {
      const matches = value.controls.filter(predicate);
      if (matches.length !== 1) return false;
      matches[0].selected = true;
      return true;
    },
  };
  return {
    api: new PlatformCollections(dependencies),
    calls,
    reads,
  };
}

test("Explore reader selects the recommendation tab and retains bounded source evidence", async () => {
  const f = collection({
    posts: [
      {
        id: "100",
        author: "writer",
        datetime: "2026-10-14T01:00:00.000Z",
        body: "完整的推荐帖子正文。",
        metrics: [{ label: "喜欢 25" }, { label: "回复 6" }],
      },
      {
        id: "101",
        author: "another",
        datetime: "2026-10-14T01:01:00.000Z",
        body: "下一条帖子。",
        metrics: [],
      },
    ],
  });
  const result = await f.api.readExploreRecommendations({
    limit: 1,
    processedIds: ["100"],
  });

  assert.equal(f.calls[0], "openExploreRecommendations");
  assert.equal(result.complete, true);
  assert.equal(
    result.sourceOrigin?.kind,
    "explore-recommendations",
    JSON.stringify(result),
  );
  assert.equal(result.sourceOrigin.page, "https://x.com/explore");
  assert.equal(result.sourceOrigin.selectedTab, "为你推荐");
  assert.equal(result.sources[0].id, "101");
  assert.equal(result.sources[0].body, "下一条帖子。");
  assert.deepEqual(result.sources[0].metrics, []);
});

test("Explore reader refuses to attribute cards when the recommendation tab is absent", async () => {
  const f = collection({
    tabs: [{ role: "tab", label: "热门", selected: true }],
  });
  const result = await f.api.readExploreRecommendations({ limit: 1 });

  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["explore-recommended-tab-unconfirmed"]);
  assert.equal(result.sourceOrigin, undefined);
  assert.equal(f.reads.includes("posts"), false);
});

test("Explore reader performs one bounded wait for the feed before checking its tab", async () => {
  const f = collection({ needsNavigationWait: true });
  const result = await f.api.readExploreRecommendations({ limit: 1 });

  assert.equal(result.complete, true);
  assert.equal(result.sourceOrigin.selectedTab, "为你推荐");
  assert.deepEqual(f.calls, ["openExploreRecommendations", "waitForPosts"]);
});

test("Explore reader retains bounded navigation evidence when the tab remains unavailable", async () => {
  const f = collection({
    needsNavigationWait: true,
    navigationWaitCompletes: false,
  });
  const result = await f.api.readExploreRecommendations({ limit: 1 });

  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["explore-navigation-unconfirmed"]);
  assert.deepEqual(result.navigationEvidence.tabs, []);
  assert.equal(result.navigationEvidence.page, "https://x.com/explore");
});

test("Explore diagnostic cards remain unqualified when navigation state is unavailable", async () => {
  const f = collection({
    needsNavigationWait: true,
    navigationWaitCompletes: false,
    posts: [
      {
        id: "100",
        author: "writer",
        datetime: "2026-10-14T01:00:00.000Z",
        body: "诊断读取到的卡片。",
        metrics: [],
      },
      {
        id: "101",
        author: "another",
        datetime: "2026-10-14T01:01:00.000Z",
        body: "第二条卡片。",
        metrics: [],
      },
    ],
  });
  const result = await f.api.readExploreRecommendations({ limit: 1 });

  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["explore-navigation-unconfirmed"]);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].body, "诊断读取到的卡片。");
  assert.equal(result.sourceOrigin, undefined);
});

test("Explore provenance is filtered at the public business boundary and visible metrics survive", () => {
  const result = readResult(
    "readExploreRecommendations",
    {
      status: "observed",
      complete: true,
      sourceOrigin: {
        kind: "explore-recommendations",
        page: "https://x.com/explore",
        selectedTab: "For you",
      },
      sources: [
        {
          id: "200",
          author: "writer",
          body: "完整帖子正文。",
          metrics: ["Likes 25", "Reply 6", "unknown label 3"],
        },
      ],
    },
    "decision",
  );
  assert.equal(result.sourceOrigin.selectedTab, "For you");
  assert.deepEqual(result.sources[0].metrics, ["Likes 25", "Reply 6"]);

  const invalid = readResult(
    "readExploreRecommendations",
    {
      status: "observed",
      sourceOrigin: {
        kind: "explore-recommendations",
        page: "https://x.com/search?q=explore",
        selectedTab: "For you",
      },
    },
    "decision",
  );
  assert.equal(invalid.sourceOrigin, undefined);
});

test("business root exposes readExploreRecommendations with source provenance", async (t) => {
  const f = fixture(t),
    calls = [];
  let page = "https://x.com/home";
  const browser = {
    capabilities: () => [],
    observe: async ({ view }) =>
      view === "navigation"
        ? {
            page,
            controls: [{ role: "tab", label: "For you", selected: true }],
            headings: [],
            needsStateCheck: false,
            alerts: [],
          }
        : {
            page,
            accountHandle: "writer",
            posts: [
              {
                id: "300",
                author: "writer",
                datetime: "2026-10-14T01:00:00.000Z",
                body: "完整的真实帖子内容。",
                metrics: [{ label: "Likes 25" }],
              },
            ],
            needsStateCheck: false,
            alerts: [],
          },
    act: async (command) => {
      calls.push(command.operation);
      if (command.operation === "openExploreRecommendations")
        page = "https://x.com/explore";
    },
  };
  const api = createBusinessHarness({
    store: f.store,
    platform: createXPlatform(browser),
  });
  const result = await api.readExploreRecommendations({ mode: "decision" });

  assert.equal(
    result.sourceOrigin?.kind,
    "explore-recommendations",
    JSON.stringify(result),
  );
  assert.equal(result.sources[0].id, "300");
  assert.equal(result.sources[0].body, "完整的真实帖子内容。");
  assert.deepEqual(result.sources[0].metrics, ["Likes 25"]);
  assert.deepEqual(calls, ["openExploreRecommendations"]);
});

for (const completes of [true, false]) {
  test(`Explore waits once for empty unflagged navigation; completes=${completes}`, async () => {
    const f = collection({
      unflaggedNavigationWait: true,
      navigationWaitCompletes: completes,
    });
    const result = await f.api.readExploreRecommendations({ limit: 1 });
    assert.deepEqual(f.calls, ["openExploreRecommendations", "waitForPosts"]);
    assert.equal(result.complete, completes);
    if (completes) assert.equal(result.sourceOrigin.selectedTab, "为你推荐");
    else {
      assert.equal(result.sourceOrigin, undefined);
      assert.deepEqual(result.missing, ["explore-recommended-tab-unconfirmed"]);
    }
  });
}
