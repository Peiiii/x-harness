import test from "node:test";
import assert from "node:assert/strict";
import { PlatformCollections } from "../dist/platform-collections.js";

const post = (id) => ({
  id: String(id),
  author: "example_peer",
  body: `Synthetic source ${id}`,
  datetime: "2026-11-01T00:00:00Z",
  primary: `/example_peer/status/${id}`,
});
function fixture() {
  let ids = Array.from({ length: 10 }, (_, i) => String(i + 1));
  const calls = [];
  const page = "https://x.com/search?q=example";
  const frame = (query) => {
    calls.push(query);
    const offset = query.offset ?? 0;
    return {
      page,
      accountHandle: "example_owner",
      firstRenderedId: ids[0],
      posts: ids.slice(offset, offset + 5).map(post),
      moreInDOM: ids.length > offset + 5,
      alerts: [],
      needsStateCheck: false,
    };
  };
  const reader = new PlatformCollections({
    ready: async (q) => frame(q),
    observed: async (q) => frame(q),
    browser: { act: async (q) => calls.push(q) },
  });
  return { reader, calls, setIds: (next) => (ids = next) };
}
for (const change of ["insert", "remove"])
  test(`search resume refreshes a zero-offset anchor after prefix ${change}`, async () => {
    const f = fixture();
    const first = await f.reader.searchSources({
      query: "example",
      limit: 5,
      maxPages: 10,
    });
    assert.deepEqual(
      first.sources.map((p) => p.id),
      ["1", "2", "3", "4", "5"],
    );
    f.setIds(
      change === "insert"
        ? ["99", ...Array.from({ length: 10 }, (_, i) => String(i + 1))]
        : Array.from({ length: 10 }, (_, i) => String(i + 2)),
    );
    const result = await f.reader.searchSources({
      query: "example",
      limit: 5,
      maxPages: 10,
      resume: true,
      processedIds: ["99", ...first.sources.map((p) => p.id)],
    });
    assert.deepEqual(
      result.sources.map((p) => p.id),
      ["6", "7", "8", "9", "10"],
    );
    assert.equal(result.complete, true);
    assert.deepEqual(result.missing, []);
    assert.equal(
      f.calls.filter((q) => q.operation === "searchSources").length,
      1,
    );
    assert.equal(
      f.calls.some((q) => q.operation === "nextPosts"),
      false,
    );
  });

test("a prefix change discovered at a nonzero offset still restarts from fresh head", async () => {
  const offsets = [];
  let changed = false;
  const reader = new PlatformCollections({
    ready: async (query) => {
      offsets.push(query.offset);
      if (query.offset) changed = true;
      const ids = changed
        ? ["99", "1", "2", "3", "4", "5", "6"]
        : ["1", "2", "3", "4", "5", "6"];
      return {
        page: "https://x.com/search?q=example",
        accountHandle: "example_owner",
        firstRenderedId: ids[0],
        posts: ids.slice(query.offset, query.offset + 5).map(post),
        moreInDOM: true,
        alerts: [],
        needsStateCheck: false,
      };
    },
    browser: { act: async () => {} },
  });
  const result = await reader.searchSources({
    query: "example",
    limit: 1,
    maxPages: 2,
    processedIds: ["1", "2", "3", "4", "5"],
  });
  assert.deepEqual(offsets, [0, 5, 0]);
  assert.deepEqual(
    result.sources.map((p) => p.id),
    ["99"],
  );
});
