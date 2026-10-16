import test from "node:test";
import assert from "node:assert/strict";
import { PlatformThreadLikes } from "../dist/platform-thread-likes.js";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";
const url = "https://x.com/Author/status/100";
function scenario(t, windows, overrides = {}) {
  const f = fixture(t);
  let index = 0;
  const actions = [];
  const view = () => ({
    page: url,
    threadRootPresent: index === 0,
    threadConfirmed: true,
    threadIds: windows[index],
    posts: [...windows[index], "999"].map((id) => ({
      id,
      author: "Author",
      primary: `/Author/status/${id}`,
      body: `complete body ${id}`,
    })),
    alerts: [],
    threadExpandControls:
      index + 1 < windows.length ? [{ label: "Show replies" }] : [],
    threadBoundary: index === windows.length - 1,
    ...overrides[index],
  });
  const reader = new PlatformThreadLikes({
    open: async () => view(),
    ready: async () => view(),
    observed: async () => view(),
    browser: {
      act: async (a) => {
        actions.push(a.operation);
        assert.equal(a.operation, "expandThreadReplies");
        index++;
      },
    },
  });
  const api = createBusinessHarness({
    store: f.store,
    clock: () => NOW,
    platform: {
      preflight: () => ({ covered: true }),
      readPostComments: reader.readPostComments.bind(reader),
      captureProof: ({ observation }) => ({ observation }),
    },
  });
  return {
    api,
    f,
    actions,
    args: {
      target: { postId: "100", url, evidenceRef: f.proof },
      mode: "decision",
    },
  };
}
test("root reader expands bounded windows, excludes root/duplicates/non-thread/processed rows and never writes", async (t) => {
  const s = scenario(t, [
    ["100", "101", "102"],
    ["102", "103"],
  ]);
  const out = await s.api.readPostComments({
    ...s.args,
    processedIds: ["101"],
  });
  assert.equal(out.status, "observed");
  assert.deepEqual(
    out.sources.map((p) => p.id),
    ["102", "103"],
  );
  assert.ok(out.sources.every((p) => p.replyToId == null));
  assert.equal(out.paginationBoundary.kind, "rendered-tail");
  assert.equal(out.paginationBoundary.scopeComplete, false);
  assert.equal(out.paginationBoundary.hiddenOrUnavailable, "unknown");
  assert.equal(out.pageComplete, false);
  assert.deepEqual(s.actions, ["expandThreadReplies"]);
  const state = (await s.f.store.load()).state;
  assert.ok(!state.reactions?.length);
  assert.equal(state.actions.filter((a) => a.status !== "prepared").length, 0);
});
test("receipt and delta retain page-limit checkpoint and hidden coverage", async (t) => {
  for (const mode of ["receipt", "delta"]) {
    const s = scenario(t, [["100", "101"], ["102"]]);
    const out = await s.api.readPostComments({ ...s.args, maxPages: 1, mode });
    assert.equal(out.paginationBoundary.kind, "page-limit");
    assert.equal(out.paginationBoundary.pages, 1);
    assert.equal(out.pageComplete, false);
    assert.equal(out.complete, true);
    assert.deepEqual(s.actions, []);
  }
});
test("scope loss and alert preserve earlier partial evidence and stop", async (t) => {
  for (const fault of [
    { page: "https://x.com/Other/status/200" },
    { alerts: ["rate limited"] },
  ]) {
    const s = scenario(t, [["100", "101"], ["102"]], { 1: fault });
    const out = await s.api.readPostComments(s.args);
    assert.equal(out.status, "needsDecision");
    assert.equal(out.complete, false);
    assert.deepEqual(
      out.sources.map((p) => p.id),
      ["101"],
    );
    assert.equal(s.actions.length, 1);
  }
});
test("wrong root first window and invalid evidenced target never collect comments", async (t) => {
  const s = scenario(t, [["101"]], {
    0: {
      threadRootPresent: false,
      threadConfirmed: false,
      alerts: ["challenge"],
    },
  });
  const out = await s.api.readPostComments(s.args);
  assert.equal(out.complete, false);
  assert.deepEqual(out.sources, []);
  const v = scenario(t, [["100", "101"]]);
  const bad = await v.api.readPostComments({
    ...v.args,
    target: { ...v.args.target, postId: "200" },
  });
  assert.equal(bad.status, "needsDecision");
  assert.deepEqual(v.actions, []);
});
test("read failure retains captured rows with unknown coverage", async (t) => {
  const s = scenario(t, [["100", "101"], ["102"]]);
  const original = s.api;
  // A non-timeout expansion exception must retain the preceding captured window.
  const reader = new PlatformThreadLikes({
    open: async () => ({
      page: url,
      threadRootPresent: true,
      threadConfirmed: true,
      threadIds: ["101"],
      posts: [{ id: "101", author: "Author", primary: "/Author/status/101" }],
    }),
    observed: async () => {
      throw Error("lost connection");
    },
    ready: async () => {
      throw Error("unexpected");
    },
    browser: {},
  });
  const out = await reader.readPostComments(s.args);
  assert.equal(out.complete, false);
  assert.equal(out.sources[0].id, "101");
  assert.equal(out.paginationBoundary.kind, "read-unconfirmed");
  assert.ok(original);
});

test("time bound returns checkpoint without advancing or claiming full coverage", async () => {
  const dateNow = Date.now;
  let now = 1000,
    reads = 0;
  const reader = new PlatformThreadLikes({
    open: async () => {
      reads++;
      now += 20;
      return {
        page: url,
        threadRootPresent: true,
        threadConfirmed: true,
        threadIds: ["101"],
        posts: [{ id: "101", primary: "/Author/status/101" }],
      };
    },
    observed: async () => {
      throw Error("must not advance");
    },
    ready: async () => {
      throw Error("must not retry");
    },
    browser: {},
  });
  Date.now = () => now;
  try {
    const out = await reader.readPostComments({
      target: { postId: "100", url, evidenceRef: "proof" },
      timeBudgetMs: 10,
    });
    assert.equal(reads, 1);
    assert.equal(out.paginationBoundary.kind, "time-limit");
    assert.equal(out.paginationBoundary.scopeComplete, false);
    assert.equal(out.sources.length, 1);
  } finally {
    Date.now = dateNow;
  }
});
