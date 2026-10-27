import test from "node:test";
import assert from "node:assert/strict";
import { NativeBookmarkCollector } from "../dist/bookmark-native.js";
import { serialized } from "../dist/browser-common.js";
const raw = `0 标准窗口 X, URL: x.com/i/history/bookmarks/123
  1 HTML 内容 收藏 / X, URL: x.com/i/history/bookmarks/123
    2 link 个人资料, Value: x.com/sample
    3 标签 (selected) Example , Value: 1
    4 标题 Example, Value: 1
`;
function fixture(states = [raw], windows = [["100", "101"]]) {
  let i = 0,
    ax = "";
  const acts = [];
  return {
    acts,
    collector: new NativeBookmarkCollector(
      {
        observe: async () => {
          ax = states[Math.min(i, states.length - 1)];
          return {
            page: "x.com/i/history/bookmarks/123",
            posts: windows[Math.min(i, windows.length - 1)].map((id) => ({
              id,
              author: "sample",
              text: "body " + id,
              datetime: null,
              missing: ["datetime"],
              evidence: [
                {
                  index: 10,
                  label: `link now, Value: x.com/sample/status/${id}`,
                },
              ],
            })),
          };
        },
        act: async (x) => {
          acts.push(x);
          i++;
        },
      },
      () => ax,
    ),
  };
}
test("native selected folder is bounded, deduplicated, and never declares complete detail/media", async () => {
  const f = fixture(
    [raw, raw],
    [
      ["100", "101"],
      ["101", "102"],
    ],
  );
  const r = await f.collector.collect({
    folder: "Example",
    processedIds: ["100"],
    maxPages: 2,
    limit: 3,
  });
  assert.deepEqual(
    r.sources.map((p) => p.id),
    ["101", "102"],
  );
  assert.equal(r.complete, false);
  assert.equal(r.folderEvidence.name, "Example");
  assert.equal(r.paginationBoundary.scopeComplete, false);
  assert.ok(
    r.sources.every((p) =>
      p.missing.includes("native-source-detail-and-media-review-required"),
    ),
  );
  assert.equal(f.acts.length, 1);
});
test("wrong folder, missing same-frame actor and duplicate headings refuse before scroll", async () => {
  for (const s of [
    raw.replace("Example, Value: 1", "Other, Value: 1"),
    raw.replace("link 个人资料", "link other"),
    raw + "    5 标题 Example, Value: 1\n",
  ]) {
    const f = fixture([s]);
    const r = await f.collector.collect({ folder: "Example" });
    assert.equal(r.sources.length, 0);
    assert.ok(r.missing.includes("native-bookmark-folder-unconfirmed"));
    assert.equal(f.acts.length, 0);
  }
});
test("finite processed-only read is not whole-folder exhaustion and no-new-window is explicit", async () => {
  const f = fixture();
  const r = await f.collector.collect({
    folder: "Example",
    processedIds: ["100", "101"],
    maxPages: 3,
  });
  assert.equal(r.sources.length, 0);
  assert.equal(r.pages, 2);
  assert.ok(r.missing.includes("native-bookmark-no-new-window"));
  assert.equal(r.paginationBoundary.scopeComplete, false);
});
test("native collection uses the same browser concurrency boundary", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const p = serialized({
    collectBookmarks: async () => gate,
    observe: async () => ({}),
  });
  const pending = p.collectBookmarks({});
  await assert.rejects(p.observe({}), /禁止并发/);
  release();
  await pending;
});

test("rendered continuation advances offsets before any native scroll", async () => {
  const offsets = [];
  let ax = raw;
  const f = new NativeBookmarkCollector(
    {
      observe: async (q) => {
        offsets.push(q.offset);
        return {
          page: "x.com/i/history/bookmarks/123",
          moreInDOM: q.offset === 0,
          posts: [
            {
              id: q.offset === 0 ? "100" : "101",
              author: "sample",
              text: "text",
              evidence: [],
            },
          ],
        };
      },
      act: async () => {
        throw Error("unexpected scroll");
      },
    },
    () => ax,
  );
  const r = await f.collect({
    folder: "Example",
    processedIds: ["100"],
    limit: 1,
    maxPages: 2,
  });
  assert.deepEqual(offsets, [0, 5]);
  assert.equal(r.sources[0].id, "101");
});
