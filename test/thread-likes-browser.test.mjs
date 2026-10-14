import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readThreadLikeSurface } from "../dist/readers-thread-likes.js";
import { PlatformThreadLikes } from "../dist/platform-thread-likes.js";
import { DOMEditing } from "../dist/browser-dom-editing.js";

function surface({ root = true, seen = false, wrongRoute = false } = {}) {
  const node = (order, text = "") => ({
    order,
    innerText: text,
    getClientRects: () => [1],
    getAttribute: () => null,
    hasAttribute: () => false,
    closest: () => null,
    compareDocumentPosition: (other) => (other.order > order ? 4 : 2),
  });
  const article = (id, order, ad = false) => ({
    ...node(order),
    querySelector: () => (ad ? {} : null),
    querySelectorAll: (q) =>
      q === "time"
        ? [
            {
              ...node(order),
              closest: () => ({ getAttribute: () => `/Author/status/${id}` }),
            },
          ]
        : [],
  });
  const articles = [
    article("99", 1),
    ...(root ? [article("100", 2)] : []),
    article("101", 3),
    article("102", 4, true),
    article("200", 7),
  ];
  const expand = node(5, "Show more replies"),
    outside = node(8, "Show replies"),
    spam = node(5, "Show probable spam");
  const column = {
    querySelectorAll: (q) =>
      q === "article"
        ? articles
        : q === 'h2,[role="heading"]'
          ? [node(6, "Discover more")]
          : [expand, outside, spam],
  };
  const context = vm.createContext({
    URL,
    location: {
      href: wrongRoute
        ? "https://x.com/Author/status/999"
        : "https://x.com/Author/status/100",
    },
    document: { querySelector: () => column },
  });
  context.query = { threadRootId: "100", threadRootSeen: seen };
  return JSON.parse(
    JSON.stringify(
      vm.runInContext(`(${readThreadLikeSurface.toString()})(query)`, context),
    ),
  );
}

test("thread DOM scope excludes ancestors, ads, recommendation rows and hidden-spam expansion", () => {
  const s = surface();
  assert.equal(s.threadConfirmed, true);
  assert.deepEqual(s.threadIds, ["100", "101"]);
  assert.deepEqual(s.threadExpandControls, [
    { label: "Show more replies", disabled: false },
  ]);
  assert.equal(surface({ wrongRoute: true }).threadConfirmed, false);
  assert.deepEqual(surface({ root: false }).threadIds, []);
  assert.equal(surface({ root: false, seen: true }).threadConfirmed, true);
});

test("platform reuses thread page for exact child like; expand and pagination preserve scope", async () => {
  const url = "https://x.com/Author/status/100",
    commands = [],
    queries = [];
  let expanded = false;
  const observe = async (q) => {
    queries.push(q);
    return {
      page: url,
      accountHandle: "Pei",
      alerts: [],
      threadConfirmed: true,
      threadRootPresent: true,
      threadIds: ["100", "101"],
      threadExpandControls: expanded ? [] : [{ label: "Show more replies" }],
      posts: q.targetId
        ? [{ id: q.targetId, author: "Author" }]
        : [{ id: "100" }, { id: "101" }, { id: "200" }],
      atRenderedTail: false,
    };
  };
  const p = new PlatformThreadLikes({
    open: async (_target, q) => observe(q),
    ready: observe,
    observed: observe,
    browser: {
      act: async (c) => {
        commands.push(c);
        if (c.operation === "expandThreadReplies") expanded = true;
        return { liked: true };
      },
    },
  });
  const args = { url, rootId: "100", evidenceRef: "proof" };
  const first = await p.readThreadLikeWindow({ ...args, reset: true });
  assert.deepEqual(
    first.posts.map((p) => p.id),
    ["100", "101"],
  );
  await p.likeThreadPost({
    ...args,
    postId: "101",
    author: "Author",
    accountHandle: "Pei",
  });
  await p.advanceThreadLikes(args);
  await p.advanceThreadLikes(args);
  assert.deepEqual(
    commands.map((c) => c.operation),
    ["likePost", "expandThreadReplies", "nextPosts"],
  );
  assert.ok(
    queries.some((q) => q.targetId === "101" && q.threadRootId === "100"),
  );
  await assert.rejects(
    p.likeThreadPost({
      ...args,
      postId: "200",
      author: "Author",
      accountHandle: "Pei",
    }),
    /target-unconfirmed/,
  );
  await assert.rejects(
    p.likeThreadPost({
      ...args,
      postId: "101",
      author: "Author",
      accountHandle: "Other",
    }),
    /target-unconfirmed/,
  );
});

test("DOM click uses the observed child's article and preserves thread context for post-click verification", async () => {
  const query = {
    view: "posts",
    targetId: "101",
    threadRootId: "100",
    threadRootSeen: true,
  };
  const result = {
    posts: [
      {
        id: "101",
        primary: "/Author/status/101",
        buttons: [{ label: "0 Likes. Like" }],
      },
    ],
    alerts: [],
    accountHandle: "Pei",
  };
  let clicks = 0,
    intents = 0,
    verification;
  const button = {
    count: async () => 1,
    click: async () => {
      clicks++;
    },
  };
  const article = {
    count: async () => 1,
    getByRole: () => button,
    filter: () => article,
  };
  const editing = new DOMEditing({
    session: { current: { query, result } },
    unique: async (l) => {
      assert.equal(await l.count(), 1);
      return l;
    },
    locator: () => article,
    tab: { playwright: { locator: () => ({}) } },
    observe: async (q) => {
      verification = q;
      return {
        posts: [{ id: "101", buttons: [{ label: "1 Likes. Liked" }] }],
        alerts: [],
      };
    },
  });
  const out = await editing.likePost({
    postId: "101",
    beforeSubmit: async () => {
      intents++;
    },
  });
  assert.equal(clicks, 1);
  assert.equal(intents, 1);
  assert.equal(out.value.liked, true);
  assert.equal(verification.threadRootId, "100");
});

test("DOM preexisting like never invokes intent or button click", async () => {
  const editing = new DOMEditing({
    session: {
      current: {
        query: { view: "posts", targetId: "101" },
        result: {
          posts: [{ id: "101", buttons: [{ label: "1 Likes. Liked" }] }],
        },
      },
    },
    unique: async () => {
      throw Error("unexpected click");
    },
    locator: () => {
      throw Error("unexpected locator");
    },
    tab: {},
    observe: async () => {
      throw Error("unexpected observe");
    },
  });
  const out = await editing.likePost({
    postId: "101",
    beforeSubmit: async () => {
      throw Error("unexpected intent");
    },
  });
  assert.equal(out.value.preexisting, true);
});
