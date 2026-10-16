import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readPosts } from "../dist/readers-posts.js";
import { readThreadLikeSurface } from "../dist/readers-thread-likes.js";
import { PlatformThreadLikes } from "../dist/platform-thread-likes.js";
import { DOMEditing } from "../dist/browser-dom-editing.js";

function surface({ root = true, seen = false, wrongRoute = false } = {}) {
  const node = (order, text = "") => ({
    order,
    tagName: "BUTTON",
    innerText: text,
    getClientRects: () => [1],
    getAttribute: () => null,
    hasAttribute: () => false,
    closest: () => null,
    compareDocumentPosition: (other) => (other.order > order ? 4 : 2),
  });
  const article = (id, order, ad = false) => ({
    ...node(order),
    tagName: "ARTICLE",
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
  const heading = { ...node(6, "Discover more"), tagName: "H2" };
  const column = {
    querySelectorAll: () =>
      [...articles, expand, outside, spam, heading].sort(
        (a, b) => a.order - b.order,
      ),
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

for (const thread of [false, true])
  for (const [postAX, finalLiked] of [
    ["bound", true],
    ["missing", true],
    ["missing", false],
    ["route-change", false],
    ["alert", false],
  ]) {
    test(`like uses one native activation with exact DOM verification: thread=${thread} after=${postAX} liked=${finalLiked}`, async () => {
      const query = {
        view: "posts",
        targetId: "101",
        ...(thread ? { threadRootId: "100" } : {}),
      };
      const result = {
        page: "https://x.com/Author/status/100",
        posts: [
          {
            id: "101",
            author: "Author",
            body: "comment",
            primary: "/Author/status/101",
            buttons: [{ label: "0 Likes. Like" }],
          },
        ],
        alerts: [],
        accountHandle: "Pei",
      };
      let clicks = 0,
        intents = 0,
        verification,
        liked = false;
      const button = {
        waitFor: async () => {},
        count: async () => 1,
        click: async () => {
          throw Error("unexpected locator activation");
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
        tab: {
          playwright: { locator: () => ({}) },
          getAXState: async () =>
            liked && postAX !== "bound"
              ? postAX === "route-change"
                ? `Window: "Other", App: Google Chrome.\n0 标准窗口 Other, URL: x.com/Other/status/999\n`
                : postAX === "alert"
                  ? `Window: "Post", App: Google Chrome.\n0 标准窗口 Post, URL: x.com/Author/status/100\n9 文本 rate limit\n`
                  : `Window: "Post", App: Google Chrome.\n0 标准窗口 Post, URL: x.com/Author/status/100\n`
              : `Window: "Post", App: Google Chrome.\n0 标准窗口 Post, URL: x.com/Author/status/100\n\t1 container 主页时间线\n\t\t2 container Author @Author comment\n\t\t\t3 link 下午9:00 · 2026年10月14日, Value: x.com/Author/status/101\n\t\t\t4 文本 comment\n\t\t\t5 按钮 ${liked ? "1 喜欢次数。喜欢了" : "0 喜欢次数。喜欢"}\n`,
          click: async (index) => {
            assert.equal(index, 5);
            clicks++;
            liked = true;
          },
          pressKey: async () => {
            throw Error("unexpected keyboard");
          },
        },
        observe: async (q) => {
          verification = q;
          return {
            posts: [
              {
                id: "101",
                buttons: [
                  { label: finalLiked ? "1 Likes. Liked" : "0 Likes. Like" },
                ],
              },
            ],
            alerts: postAX === "alert" ? ["challenge"] : [],
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
      assert.equal(out.value.liked, finalLiked);
      assert.equal(verification.targetId, "101");
      assert.equal(verification.threadRootId, thread ? "100" : undefined);
    });
  }

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

// Execute the actual reader boundary rather than a preconstructed platform view.
test("actual DOM reader supports thread bulk windows while ordinary reads keep the 5-card bound", () => {
  assert.throws(() => readPosts({ limit: 6 }), /limit/);
  assert.throws(
    () => readPosts({ limit: 1000, threadRootId: "invalid" }),
    /threadRootId/,
  );
  const context = vm.createContext({
    document: { querySelectorAll: () => [], scrollingElement: null },
  });
  const out = vm.runInContext(
    `(${readPosts.toString()})({limit:1000,threadRootId:"100"})`,
    context,
  );
  assert.equal(out.posts.length, 0);
  assert.throws(() => readPosts({ limit: 1001, threadRootId: "100" }), /limit/);
});

test("thread reader recovers one exact committed page after readiness timeout without another navigation", async () => {
  let opens = 0,
    reads = 0;
  const value = {
    page: "https://x.com/Author/status/100",
    accountHandle: "Pei",
    threadRootPresent: true,
    threadConfirmed: true,
    threadIds: ["100"],
    posts: [{ id: "100" }],
    alerts: [],
  };
  const reader = new PlatformThreadLikes({
    open: async () => {
      opens++;
      throw Error("Playwright selector deadline exceeded");
    },
    observed: async () => {
      reads++;
      return value;
    },
    ready: async () => value,
    browser: {
      act: async () => {
        throw Error("unexpected navigation");
      },
    },
  });
  const out = await reader.readThreadLikeWindow({
    url: value.page,
    rootId: "100",
    evidenceRef: "proof",
    reset: true,
  });
  assert.equal(out.needsStateCheck, false);
  assert.equal(opens, 1);
  assert.equal(reads, 1);
});

test("a CSS-hidden residual loading bar does not keep a finished thread loading", () => {
  let visibility = "hidden";
  const indicator = { getClientRects: () => [1], closest: () => null };
  const context = vm.createContext({
    document: {
      scrollingElement: null,
      querySelectorAll: (q) =>
        q === '[role="progressbar"]' ? [indicator] : [],
    },
    getComputedStyle: () => ({ visibility, opacity: "1" }),
  });
  const read = `(${readPosts.toString()})({limit:5})`;
  assert.equal(vm.runInContext(read, context).loading, false);
  visibility = "visible";
  assert.equal(vm.runInContext(read, context).loading, true);
});
