import test from "node:test";
import assert from "node:assert/strict";
import { collectCreatorDOM } from "../dist/creator.js";
import { readPosts } from "../dist/readers-posts.js";

test("creator reads 25 rendered posts in one bounded observation", async () => {
  const calls = [];
  const articles = { first: () => articles, waitFor: async () => {} };
  const posts = Array.from({ length: 25 }, (_, i) => ({
    id: String(i + 1),
    author: "person",
    body: "body",
    datetime: `2026-10-28T00:${String(i).padStart(2, "0")}:00Z`,
  }));
  const tab = {
    url: async () => "https://x.com/person",
    reload: async () => {},
    getAXState: async () => {},
    playwright: {
      locator: () => articles,
      evaluate: async (fn, args) => {
        if (fn.name === "readProfile") return { handle: "person" };
        if (fn.name === "readCreatorMeta") return { missing: [] };
        if (fn.name === "readCreatorPostExtras") return [];
        calls.push(args);
        return {
          posts: posts.slice(args.offset, args.offset + args.limit),
          moreInDOM: false,
          alerts: [],
        };
      },
    },
  };
  const result = await collectCreatorDOM(tab, "person", {
    target: 25,
    maxScrolls: 0,
    expand: false,
  });
  assert.equal(result.posts.length, 25);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    view: "posts",
    offset: 0,
    limit: 25,
    bulk: true,
  });
  assert.throws(() => readPosts({ limit: 6 }), /limit/);
  assert.throws(() => readPosts({ limit: 51, bulk: true }), /limit/);
});
