import test from "node:test";
import assert from "node:assert/strict";
import { collectCreatorNative } from "../dist/creator-native.js";
import { readAX } from "../dist/diagnostics.js";

test("native navigation exposes observed Chrome window-menu targets", () => {
  const nav = readAX(
    "0 窗口, Secondary Actions: Cancel, Pick\n\t1 菜单 Secondary Actions: Cancel\n\t\t45 Leo / X, ID: makeKeyAndOrderFront:",
    { mode: "navigation" },
  );
  assert.deepEqual(nav.evidence, [
    { index: 45, label: "Leo / X, ID: makeKeyAndOrderFront:" },
  ]);
});

test("creator keeps partial source links and stops before scrolling a switched window", async () => {
  let reads = 0;
  const low = {
    observe: async ({ mode }) =>
      mode === "profile"
        ? { page: "x.com/creator", evidence: [] }
        : ++reads === 1
          ? {
              page: "x.com/creator",
              posts: [
                {
                  id: "1",
                  author: "creator",
                  text: "source",
                  datetime: null,
                  evidence: [
                    { index: 7, label: "link source, Value: t.co/example" },
                  ],
                },
              ],
            }
          : { page: "x.com/other", posts: [] },
    act: async () => {
      throw new Error("must not scroll another window");
    },
  };
  const result = await collectCreatorNative(low, {
    handle: "creator",
    target: 2,
    navigate: false,
  });
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].primary, "https://x.com/creator/status/1");
  assert.deepEqual(result.posts[0].links, ["https://t.co/example"]);
  assert.equal(result.profile.handle, "creator");
  assert.ok(result.meta);
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes("creator-window-unconfirmed"));
});

test("native creator deduplicates windows, ignores other authors and preserves relative-time gaps", async () => {
  let scrolled = false;
  const p = (id, author = "creator") => ({
    id,
    author,
    text: `body ${id}`,
    datetime: null,
    evidence: [
      { index: 7, label: `link 1分钟 前, Value: x.com/${author}/status/${id}` },
    ],
  });
  const low = {
    observe: async ({ mode }) =>
      mode === "profile"
        ? { page: "x.com/creator", evidence: [] }
        : {
            page: "x.com/creator",
            posts: scrolled ? [p("1"), p("2"), p("3", "other")] : [p("1")],
            moreInDOM: false,
          },
    act: async (command) => {
      assert.equal(command.index, 7);
      assert.equal(command.operation, "scroll");
      scrolled = true;
    },
  };
  const result = await collectCreatorNative(low, {
    handle: "creator",
    target: 2,
    maxScrolls: 2,
    navigate: false,
  });
  assert.deepEqual(
    result.posts.map((p) => p.id),
    ["1", "2"],
  );
  assert.equal(result.posts[0].body, "body 1");
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["absolute-time-missing"]);
});

test("native creator refuses navigation and mismatched profiles and bounds stagnant collection", async () => {
  assert.equal(
    (await collectCreatorNative({}, { handle: "creator" })).status,
    "needsCapability",
  );
  await assert.rejects(
    () =>
      collectCreatorNative(
        { observe: async () => ({ page: "x.com/other" }) },
        { handle: "creator", navigate: false },
      ),
    /mismatch/,
  );
  let scrolls = 0;
  const post = {
    id: "1",
    author: "creator",
    text: "full",
    datetime: "2026-10-11T00:00:00Z",
    evidence: [{ index: 7, label: "link now, Value: x.com/creator/status/1" }],
  };
  const low = {
    observe: async ({ mode }) => ({
      page: "x.com/creator",
      evidence: [],
      ...(mode === "posts" ? { posts: [post], moreInDOM: false } : {}),
    }),
    act: async () => {
      scrolls++;
    },
  };
  const result = await collectCreatorNative(low, {
    handle: "creator",
    target: 2,
    maxScrolls: 1,
    navigate: false,
  });
  assert.equal(scrolls, 1);
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes("creator-target-not-reached"));
});
