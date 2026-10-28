import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformTargets } from "../dist/platform-targets.js";
import { readResult } from "../dist/results.js";

test("feedback avoids detail reads only for resolved IDs in the original window", async () => {
  const opened = [];
  const target = { postId: "1", url: "https://x.com/owner/status/1" };
  const platform = createPlatformTargets({
    open: async (input) => {
      opened.push(input.url);
      const id = input.url.split("/").at(-1);
      return {
        page: input.url,
        posts: [
          {
            id,
            author: id === "1" ? "owner" : "reader",
            body: "text",
            replyToId: id === "1" ? null : "1",
          },
        ],
      };
    },
    observed: async () => ({
      page: target.url,
      posts: [
        { id: "1" },
        { id: "2", primary: "/reader/status/2" },
        { id: "3", primary: "/reader/status/3" },
      ],
    }),
    browser: {},
    ready: async () => ({}),
  });
  const out = await platform.readFeedback({
    targets: [target],
    processedIds: ["2"],
  });
  assert.deepEqual(opened, [target.url, "https://x.com/reader/status/3"]);
  assert.deepEqual(
    out.feedback[0].replies.map((x) => x.id),
    ["3"],
  );
  opened.length = 0;
  await platform.readFeedback({ targets: [target] });
  assert.equal(opened.length, 3);
  await assert.rejects(
    platform.readFeedback({ targets: [target], processedIds: [null] }),
    /数字字符串/,
  );
});

test("candidate mode collects bounded unconfirmed targets without opening detail pages", async () => {
  const opened = [];
  const target = { postId: "1", url: "https://x.com/owner/status/1" };
  const platform = createPlatformTargets({
    open: async (input) => {
      opened.push(input.url);
      return {
        page: input.url,
        posts: [{ id: "1", author: "owner", body: "root" }],
      };
    },
    observed: async () => ({
      page: target.url,
      posts: [
        { id: "1" },
        { id: "2", primary: "/reader/status/2", author: "reader" },
      ],
    }),
    browser: {},
    ready: async () => ({}),
  });
  const result = await platform.readFeedback({
    targets: [target],
    candidateOnly: true,
  });
  assert.deepEqual(opened, [target.url]);
  assert.deepEqual(result.feedback[0].replies, []);
  assert.deepEqual(result.feedback[0].replyCandidates, [
    { id: "2", author: "reader", url: "https://x.com/reader/status/2" },
  ]);
  const projected = readResult(
    "readFeedback",
    { status: "observed", fresh: true, complete: true, ...result },
    "decision",
  );
  assert.deepEqual(
    projected.feedback[0].replyCandidates,
    result.feedback[0].replyCandidates,
  );
  assert.deepEqual(projected.feedback[0].replies, []);
});

test("candidate mode does not call an unconfirmed thread an empty success", async () => {
  const target = { postId: "1", url: "https://x.com/owner/status/1" };
  const platform = createPlatformTargets({
    open: async () => ({ page: target.url, posts: [{ id: "1" }] }),
    observed: async () => ({
      page: target.url,
      posts: [{ id: "1" }],
      alerts: ["verification"],
    }),
    browser: {},
    ready: async () => ({}),
  });
  const result = await platform.readFeedback({
    targets: [target],
    candidateOnly: true,
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.alerts, ["verification"]);
});
