import test from "node:test";
import assert from "node:assert/strict";
import { PlatformThreadLikes } from "../dist/platform-thread-likes.js";

test("duplicate disclosure labels advance through one uniquely observed branch anchor", async () => {
  const url = "https://x.com/Author/status/100";
  const controls = ["101", "102"].map((postId) => ({
    label: "Show more replies",
    disabled: false,
    anchor: { postId, primary: `/Author/status/${postId}` },
  }));
  const commands = [];
  let expanded = false;
  const observe = async () => ({
    page: url,
    accountHandle: "Reader",
    threadConfirmed: true,
    threadRootPresent: true,
    threadIds: expanded ? ["100", "101", "102", "103"] : ["100", "101", "102"],
    threadExpandControls: expanded ? [] : controls,
    posts: (expanded
      ? ["100", "101", "102", "103"]
      : ["100", "101", "102"]
    ).map((id) => ({ id, author: "Author" })),
    alerts: [],
  });
  const platform = new PlatformThreadLikes({
    open: observe,
    ready: observe,
    observed: observe,
    browser: {
      act: async (command) => {
        commands.push(command);
        expanded = true;
      },
    },
  });
  const args = { rootId: "100", url, evidenceRef: "synthetic-proof" };
  await platform.readThreadLikeWindow({ ...args, reset: true });
  const result = await platform.advanceThreadLikes(args);
  assert.equal(commands.length, 1);
  assert.equal(commands[0].operation, "expandThreadReplies");
  assert.deepEqual(commands[0].anchor, controls[0].anchor);
  assert.ok(result.posts.some((post) => post.id === "103"));
});

import vm from "node:vm";
import { readThreadLikeSurface } from "../dist/readers-thread-likes.js";
import { DOMEditing } from "../dist/browser-dom-editing.js";

function anchoredSurface({
  ad = false,
  hidden = false,
  count = 1,
  gap = false,
  history = false,
  boundary = false,
} = {}) {
  const base = {
    getClientRects: () => [1],
    getAttribute: () => null,
    hasAttribute: () => false,
    closest: () => null,
  };
  const article = (id) => ({
    ...base,
    tagName: "ARTICLE",
    innerText: "synthetic",
    querySelector: () => (id === "101" && ad ? {} : null),
    querySelectorAll: (q) =>
      q === "time"
        ? [
            {
              ...base,
              closest: () => ({
                getAttribute: () =>
                  `/Author/status/${id}${history ? "/history" : ""}`,
              }),
            },
          ]
        : [],
    getClientRects: () => (id === "101" && hidden ? [] : [1]),
  });
  const root = article("100"),
    child = article("101");
  const previous = {
    getAttribute: () => (gap ? "unrelated" : "cellInnerDiv"),
    querySelectorAll: () => (count === 1 ? [child] : [child, article("102")]),
  };
  const cell = { previousElementSibling: previous, querySelectorAll: () => [] };
  const button = {
    ...base,
    tagName: "BUTTON",
    innerText: "Show replies",
    closest: (q) => (q.includes("cellInnerDiv") ? cell : null),
  };
  const heading = { ...base, tagName: "H2", innerText: "Discover more" };
  const rows = [root, ...(boundary ? [heading] : []), child, button];
  const context = vm.createContext({
    URL,
    location: { href: "https://x.com/Author/status/100" },
    document: { querySelector: () => ({ querySelectorAll: () => rows }) },
  });
  return JSON.parse(
    JSON.stringify(
      vm.runInContext(
        `(${readThreadLikeSurface.toString()})({threadRootId:'100'})`,
        context,
      ),
    ),
  );
}

test("observer binds only the immediately adjacent eligible article cell, including edited links", () => {
  assert.deepEqual(anchoredSurface().threadExpandControls[0].anchor, {
    postId: "101",
    primary: "/Author/status/101",
  });
  assert.equal(
    anchoredSurface({ history: true }).threadExpandControls[0].anchor.primary,
    "/Author/status/101/history",
  );
  for (const opts of [
    { ad: true },
    { hidden: true },
    { count: 2 },
    { gap: true },
  ])
    assert.equal(
      anchoredSurface(opts).threadExpandControls[0].anchor,
      undefined,
    );
  assert.deepEqual(
    anchoredSurface({ boundary: true }).threadExpandControls,
    [],
  );
});

for (const scenario of [
  "absent",
  "collision",
  "forged",
  "account",
  "root",
  "alert",
]) {
  test(`platform refuses ${scenario} without expansion and retains captured data`, async () => {
    let current = {
      page: "https://x.com/Author/status/100",
      accountHandle: "Reader",
      threadConfirmed: true,
      threadRootPresent: true,
      threadIds: ["100", "101"],
      posts: [{ id: "101" }],
      alerts: [],
      threadExpandControls: [],
    };
    const anchor = { postId: "101", primary: "/Author/status/101" };
    const controls =
      scenario === "absent"
        ? [{ label: "Show replies" }, { label: "Show replies" }]
        : [
            { label: "Show replies", anchor },
            {
              label: "Show replies",
              anchor:
                scenario === "collision"
                  ? anchor
                  : { postId: "999", primary: "/Author/status/999" },
            },
          ];
    const commands = [];
    const observe = async () => current;
    const api = new PlatformThreadLikes({
      open: observe,
      ready: observe,
      observed: observe,
      browser: { act: async (c) => commands.push(c) },
    });
    const args = { rootId: "100", url: current.page };
    await api.readThreadLikeWindow({ ...args, reset: true });
    current = { ...current, threadExpandControls: controls };
    if (scenario === "forged")
      current.threadExpandControls = [
        {
          label: "Show replies",
          anchor: { postId: "101", primary: "/Author/status/999" },
        },
      ];
    if (scenario === "account") current.accountHandle = "Other";
    if (scenario === "root") current.page = "https://x.com/Author/status/999";
    if (scenario === "alert") current.alerts = ["synthetic alert"];
    const result = await api.advanceThreadLikes(args);
    assert.equal(commands.length, 0);
    assert.ok(result.needsStateCheck || result.alerts?.length);
    if (scenario !== "root" && scenario !== "account")
      assert.equal(result.posts[0].id, "101");
  });
}

function editingFixture(change = {}) {
  const anchor = { postId: "101", primary: "/Author/status/101" };
  const result = {
    accountHandle: "Reader",
    threadConfirmed: true,
    threadIds: ["100", "101"],
    threadExpandControls: [
      { label: "Show replies", anchor },
      {
        label: "Show replies",
        anchor: { postId: "102", primary: "/Author/status/102" },
      },
    ],
    ...change,
  };
  const session = { current: { query: { threadRootId: "100" }, result } };
  const calls = [];
  const button = {
    count: async () => 1,
    click: async () => calls.push("click"),
  };
  const container = {
    count: async () => 1,
    getByRole: (role, opts) => {
      calls.push({ role, opts });
      return button;
    },
  };
  const editor = new DOMEditing({
    session,
    unique: async (loc) => {
      assert.equal(await loc.count(), 1);
      return loc;
    },
    tab: {
      playwright: {
        locator: (selector) => {
          calls.push({ selector });
          return container;
        },
      },
    },
    locator: () => {},
    observe: async () => {},
  });
  return {
    editor,
    session,
    calls,
    command: {
      rootId: "100",
      accountHandle: "Reader",
      label: "Show replies",
      anchor,
    },
  };
}

test("DOM activates one exact anchored adjacent cell rather than the same-label peer", async () => {
  const f = editingFixture();
  await f.editor.expandThreadReplies(f.command);
  assert.match(
    f.calls[0].selector,
    /:has\(a\[href="\/Author\/status\/101"\] time\) \+ \[data-testid="cellInnerDiv"\]/,
  );
  assert.equal(f.calls.filter((c) => c === "click").length, 1);
  assert.equal(f.session.current, null);
});
for (const scenario of [
  "stale",
  "account",
  "root",
  "alert",
  "collision",
  "path",
]) {
  test(`DOM rejects ${scenario} descriptor before any locator or click`, async () => {
    const f = editingFixture();
    if (scenario === "stale")
      f.session.current.result.threadExpandControls = [];
    if (scenario === "account")
      f.session.current.result.accountHandle = "Other";
    if (scenario === "root") f.session.current.query.threadRootId = "999";
    if (scenario === "alert") f.session.current.result.alerts = ["synthetic"];
    if (scenario === "collision")
      f.session.current.result.threadExpandControls.push(
        f.session.current.result.threadExpandControls[0],
      );
    if (scenario === "path")
      f.command.anchor = { postId: "101", primary: "/Author/status/999" };
    await assert.rejects(
      f.editor.expandThreadReplies(f.command),
      /thread-expand-unconfirmed/,
    );
    assert.equal(f.calls.length, 0);
  });
}
