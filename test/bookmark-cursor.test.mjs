import test from "node:test";
import assert from "node:assert/strict";
import { PlatformCollections } from "../dist/platform-collections.js";
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
