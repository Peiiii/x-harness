import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readPosts } from "../dist/readers-posts.js";
import { readThreadLikeSurface } from "../dist/readers-thread-likes.js";
import { PlatformThreadLikes } from "../dist/platform-thread-likes.js";
import { DOMEditing } from "../dist/browser-dom-editing.js";

function surface({
  root = true,
  seen = false,
  wrongRoute = false,
  timePaths = {},
} = {}) {
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
              closest: () => ({
                getAttribute: () => timePaths[id] ?? `/Author/status/${id}`,
              }),
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

test("edited timestamp root retains exact thread identity and boundaries", () => {
  const s = surface({ timePaths: { 100: "/Author/status/100/history" } });
  assert.equal(s.threadRootPresent, true);
  assert.equal(s.threadConfirmed, true);
  assert.deepEqual(s.threadIds, ["100", "101"]);
});

test("edited timestamp reply remains in its confirmed original thread", () => {
  const s = surface({ timePaths: { 101: "/Author/status/101/history" } });
  assert.deepEqual(s.threadIds, ["100", "101"]);
  assert.deepEqual(
    surface({
      wrongRoute: true,
      timePaths: { 100: "/Author/status/100/history" },
    }).threadIds,
    [],
  );
  assert.equal(
    surface({ timePaths: { 100: "/Author/status/999/history" } })
      .threadConfirmed,
    false,
  );
});

for (const suffix of [
  "/photo/1",
  "/video/1",
  "/history/other",
  "/history?other=1",
])
  test(`non-thread timestamp suffix cannot establish the root: ${suffix}`, () => {
    const s = surface({ timePaths: { 100: `/Author/status/100${suffix}` } });
    assert.equal(s.threadRootPresent, false);
    assert.equal(s.threadConfirmed, false);
    assert.deepEqual(s.threadIds, []);
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
  for (const [postAX, finalLiked, primarySuffix] of [
    ["bound", true],
    ["missing", true],
    ["missing", false],
    ["route-change", false],
    ["alert", false],
  ].flatMap(([postAX, finalLiked]) =>
    ["", "/history"].map((suffix) => [postAX, finalLiked, suffix]),
  )) {
    test(`like uses one native activation with exact DOM verification: thread=${thread} permalink=${primarySuffix} after=${postAX} liked=${finalLiked}`, async () => {
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
            primary: `/Author/status/101${primarySuffix}`,
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
        evaluate: async () => ({
          page: result.page,
          hittable: true,
          direction: null,
        }),
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
              : `Window: "Post", App: Google Chrome.\n0 标准窗口 Post, URL: x.com/Author/status/100\n\t1 container 主页时间线\n\t\t2 container Author @Author comment\n\t\t\t3 link ${primarySuffix ? "这是该帖子的最新版本。 上次编辑 " : ""}下午9:00 · 2026年10月14日, Value: x.com/Author/status/101${primarySuffix}\n\t\t\t4 文本 comment\n\t\t\t5 按钮 ${liked ? "1 喜欢次数。喜欢了" : "0 喜欢次数。喜欢"}\n`,
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

for (const primary of [
  "/Author/status/999/history",
  "/Author/status/101/photo/1",
  "/Author/status/101/history/other",
  "/Author/status/101/history?other=1",
])
  test(`like rejects unsupported or mismatched permalink before intent: ${primary}`, async () => {
    let intents = 0;
    const editing = new DOMEditing({
      session: {
        current: {
          query: { view: "posts", targetId: "101" },
          result: {
            posts: [
              { id: "101", primary, buttons: [{ label: "0 Likes. Like" }] },
            ],
          },
        },
      },
      locator: () => {
        throw Error("unexpected locator");
      },
      tab: {},
    });
    await assert.rejects(
      editing.likePost({
        postId: "101",
        beforeSubmit: async () => {
          intents++;
        },
      }),
      /like-permalink-unconfirmed/,
    );
    assert.equal(intents, 0);
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

// Native AX activation of an offscreen control may scroll without toggling it.
// Prepare visibility before intent, preserving the original scoped observation.
function visibilityFixture({
  readyAfter = 1,
  changed = {},
  overlay = false,
} = {}) {
  const query = { view: "posts", targetId: "101", threadRootId: "100" };
  const initial = {
    page: "https://x.com/Author/status/100",
    accountHandle: "Pei",
    alerts: [],
    threadConfirmed: true,
    threadIds: ["100", "101"],
    posts: [
      {
        id: "101",
        author: "Author",
        body: "comment",
        primary: "/Author/status/101",
        buttons: [{ label: "0 Likes. Like" }],
      },
    ],
  };
  const calls = { scrolls: 0, intents: 0, clicks: 0, liked: false };
  const button = {
    count: async () => 1,
    waitFor: async () => {},
    evaluate: async () => ({
      page: initial.page,
      hittable: calls.scrolls >= readyAfter && !overlay,
      direction: overlay
        ? null
        : calls.scrolls >= readyAfter
          ? null
          : "PageDown",
    }),
    click: async () => {
      throw Error("unexpected locator click");
    },
  };
  const article = {
    count: async () => 1,
    getByRole: () => button,
    filter: () => article,
  };
  const editing = new DOMEditing({
    session: { current: { query, result: initial } },
    unique: async (l) => l,
    locator: () => article,
    tab: {
      playwright: { locator: () => ({}) },
      pressKey: async (index, key) => {
        assert.equal(index, null);
        assert.equal(key, "PageDown");
        calls.scrolls++;
      },
      getAXState: async () =>
        `Window: "Post", App: Google Chrome.\n0 标准窗口 Post, URL: x.com/Author/status/100\n\t1 container Author @Author comment\n\t\t2 link 下午9:00 · 2026年10月14日, Value: x.com/Author/status/101\n\t\t3 文本 comment\n\t\t5 按钮 0 喜欢次数。喜欢\n`,
      click: async () => {
        calls.clicks++;
        calls.liked = calls.scrolls >= readyAfter;
      },
    },
    observe: async (q) => {
      assert.equal(q.threadRootId, "100");
      return {
        ...initial,
        ...changed,
        posts: changed.posts ?? [
          {
            ...initial.posts[0],
            buttons: [
              { label: calls.liked ? "1 Likes. Liked" : "0 Likes. Like" },
            ],
          },
        ],
      };
    },
  });
  return {
    calls,
    run: () =>
      editing.likePost({
        postId: "101",
        beforeSubmit: async () => {
          assert.ok(calls.scrolls >= readyAfter);
          calls.intents++;
        },
      }),
  };
}

test("offscreen like becomes hittable before one intent and native activation", async () => {
  const f = visibilityFixture();
  const out = await f.run();
  assert.equal(out.value.liked, true);
  assert.deepEqual(f.calls, { scrolls: 1, intents: 1, clicks: 1, liked: true });
  assert.equal(out.value.likeReadiness.scrolls, 1);
});

for (const [name, options] of [
  ["overlay", { overlay: true }],
  ["bounded no progress", { readyAfter: 99 }],
  ["route", { changed: { page: "https://x.com/Other/status/999" } }],
  ["account", { changed: { accountHandle: "Other" } }],
  ["alert", { changed: { alerts: ["challenge"] } }],
  ["state", { changed: { needsStateCheck: true } }],
  ["author", { changed: { posts: [{ id: "101", author: "Other" }] } }],
  ["target", { changed: { posts: [{ id: "102", author: "Author" }] } }],
  ["thread", { changed: { threadConfirmed: false } }],
])
  test(`visibility preparation refuses ${name} before intent`, async () => {
    const f = visibilityFixture(options);
    await assert.rejects(f.run(), /like-native-target-unconfirmed/);
    assert.equal(f.calls.intents, 0);
    assert.equal(f.calls.clicks, 0);
    assert.ok(f.calls.scrolls <= 3);
  });

test("a like observed after preparation is preexisting, never toggled", async () => {
  const f = visibilityFixture({
    changed: {
      posts: [
        {
          id: "101",
          author: "Author",
          body: "comment",
          primary: "/Author/status/101",
          buttons: [{ label: "1 Likes. Liked" }],
        },
      ],
    },
  });
  assert.equal((await f.run()).value.preexisting, true);
  assert.equal(f.calls.intents, 0);
  assert.equal(f.calls.clicks, 0);
});
