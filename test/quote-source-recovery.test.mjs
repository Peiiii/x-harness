import test from "node:test";
import assert from "node:assert/strict";
import { resolveQuotedSource } from "../dist/platform-quote.js";
import { GrowthRecovery } from "../dist/growth-recovery.js";
import { source } from "../dist/results.js";
const card = {
  text: "Name\n@source\nDate\nSpecific source body.",
  datetime: "2026-10-10T00:00:00Z",
};
const quote = {
  id: "20",
  primary: "/source/status/20",
  author: "source",
  body: "Specific source body.",
  datetime: card.datetime,
  needsExpansion: false,
};
const parent = {
  id: "10",
  author: "owner",
  body: "Specific reviewed content.",
  quoteCards: [card],
  datetime: "2026-10-12T02:00:01Z",
  needsExpansion: false,
};
async function resolve(change = {}) {
  const initial = { posts: [structuredClone(parent)] };
  return resolveQuotedSource(
    { postId: "10", url: "https://x.com/owner/status/10" },
    initial,
    {
      browser: {
        act: async (c) => {
          if (c.operation === "expandPost") return;
          assert.equal(c.operation, "openQuote");
          return { url: "https://x.com/source/status/20" };
        },
      },
      ready: async () => ({ posts: [{ ...quote, ...change }] }),
      open: async () => ({ posts: [structuredClone(parent)] }),
    },
  );
}
test("quoted source requires observed navigation plus exact author date and body then fresh parent card", async () => {
  const result = await resolve();
  assert.equal(result.posts[0].quoteSource.id, "20");
  assert.equal(
    source(result.posts[0]).quoteSource.url,
    "https://x.com/source/status/20",
  );
  for (const c of [
    { body: "Changed" },
    { author: "other" },
    { datetime: "2026-10-11T00:00:00Z" },
    { needsExpansion: true },
  ])
    assert.equal((await resolve(c)).posts[0].quoteSource, undefined);
});
async function recover(change = {}) {
  const resolved = (await resolve()).posts[0];
  Object.assign(resolved, change);
  const action = {
    id: "a",
    kind: "original",
    status: "unknown",
    draftPath: "draft.post.md",
    accountHandle: "owner",
    text: "Specific reviewed content.\n\nhttps://x.com/source/status/20",
    intentAt: "2026-10-12T02:00:00Z",
    beforeIds: [],
  };
  const recovery = new GrowthRecovery({
    capability: () => ({ covered: true }),
    platform: {
      readPost: async (target) => {
        assert.equal(target.resolveQuote, true);
        return { posts: [resolved], alerts: [] };
      },
    },
    load: async () => ({ state: { actions: [action] } }),
    evidenceExists: () => true,
    clock: () => Date.parse("2026-10-12T02:01:00Z"),
    store: { withLock: async (f) => f() },
    settleProof: async () => {},
  });
  return recovery.verifyPublishedPost({
    taskId: "t",
    draftPath: action.draftPath,
    publicURL: "https://x.com/owner/status/10",
    evidenceRef: "proof",
  });
}
test("recovery never accepts same author different source ID or wrong parent, body, time or media", async () => {
  assert.equal((await recover()).status, "verified");
  for (const change of [
    { quoteSource: undefined },
    {
      quoteSource: {
        id: "21",
        url: "https://x.com/source/status/21",
        parentId: "10",
      },
    },
    {
      quoteSource: {
        id: "20",
        url: "https://x.com/source/status/20",
        parentId: "11",
      },
    },
    { body: "Changed" },
    { author: "other" },
    { datetime: "2026-10-12T01:59:00Z" },
    { needsExpansion: true },
  ])
    assert.equal((await recover(change)).status, "unknown");
});

test("truncated quote binds only a substantial visible prefix plus author/time and reads expansion", async () => {
  const body =
    "A specific source explanation with a concrete comparison and method. Further complete steps.";
  const clipped = {
    text: "Name\n@source\nDate\n" + body.slice(0, 62) + "…",
    body: body.slice(0, 62) + "…",
    datetime: card.datetime,
  };
  for (const wrong of [false, true]) {
    let expanded = false;
    const p = { ...parent, quoteCards: [clipped] };
    const result = await resolveQuotedSource(
      { postId: "10", url: "https://x.com/owner/status/10" },
      { posts: [p] },
      {
        browser: {
          act: async (q) => {
            if (q.operation === "expandPost") {
              expanded = true;
              return;
            }
            return { url: "https://x.com/source/status/20" };
          },
        },
        ready: async () => ({
          posts: [
            {
              ...quote,
              body: wrong ? "Unrelated body." : body,
              needsExpansion: !expanded,
            },
          ],
        }),
        open: async () => ({ posts: [structuredClone(p)] }),
      },
    );
    assert.equal(expanded, true);
    if (wrong) {
      assert.equal(result.complete, false);
      assert.ok(result.missing.includes("quoted-source-unconfirmed"));
    } else assert.equal(result.posts[0].quoteSource.body, body);
  }
});

test("DOM quote selection compares exact observed text, ignoring empty link controls without relying on substring filters", async () => {
  const { DOMNavigation } = await import("../dist/browser-dom-navigation.js");
  for (const duplicate of [false, true]) {
    let clicked = 0;
    const texts = duplicate ? ["", card.text, card.text] : ["", card.text];
    const controls = {
      filter: (q) => {
        assert.deepEqual(q, { visible: true });
        return controls;
      },
      count: async () => texts.length,
      nth: (i) => ({
        innerText: async () => texts[i],
        click: async () => clicked++,
      }),
    };
    const article = { filter: () => article, locator: () => controls };
    const nav = new DOMNavigation({
      session: {
        current: {
          query: { view: "posts" },
          result: {
            page: "https://x.com/owner/status/10",
            posts: [{ ...parent, primary: "/owner/status/10" }],
          },
        },
      },
      observe: async () => ({}),
      tab: {
        url: async () => "https://x.com/source/status/20",
        playwright: {
          getByRole: () => article,
          locator: () => ({}),
          expectNavigation: async (fn) => fn(),
        },
      },
    });
    if (duplicate) {
      await assert.rejects(
        nav.openQuote({ postId: "10", cardText: card.text }),
        /controls:3:matches:2/,
      );
      assert.equal(clicked, 0);
    } else {
      assert.equal(
        (await nav.openQuote({ postId: "10", cardText: card.text })).url,
        "https://x.com/source/status/20",
      );
      assert.equal(clicked, 1);
    }
  }
});

test("media quote uses its observed DOM body even when the receipt omits body", async () => {
  const { DOMNavigation } = await import("../dist/browser-dom-navigation.js");
  let url = "https://x.com/owner/status/10",
    bodyClicks = 0,
    cardClicks = 0;
  const text = {
    filter: () => text,
    count: async () => 1,
    innerText: async () => "Specific source body.",
    click: async () => {
      bodyClicks++;
    },
  };
  const control = {
    innerText: async () => card.text,
    click: async () => {
      cardClicks++;
      url = "https://x.com/source/status/20/photo/1";
    },
    locator: (selector) => {
      if (selector === 'a[href*="/status/"]')
        return {
          count: async () => 1,
          nth: () => ({
            getAttribute: async () => "/source/status/20/photo/1",
          }),
        };
      assert.equal(selector, '[data-testid="tweetText"]');
      return text;
    },
  };
  const controls = {
    filter: () => controls,
    count: async () => 1,
    nth: () => control,
  };
  const article = { filter: () => article, locator: () => controls };
  const nav = new DOMNavigation({
    session: {
      current: {
        query: { view: "posts" },
        result: {
          page: url,
          posts: [{ ...parent, primary: "/owner/status/10" }],
        },
      },
    },
    observe: async () => ({}),
    tab: {
      url: async () => url,
      goto: async (destination) => {
        url = destination;
      },
      playwright: {
        getByRole: () => article,
        locator: () => ({}),
        expectNavigation: async (fn) => fn(),
        waitForURL: async (destination) => {
          assert.equal(destination, "https://x.com/source/status/20");
          assert.equal(typeof destination, "string");
          url = destination;
        },
      },
    },
  });
  assert.equal(
    (await nav.openQuote({ postId: "10", cardText: card.text })).url,
    "https://x.com/source/status/20",
  );
  assert.equal(bodyClicks, 0);
  assert.equal(cardClicks, 0);
});

for (const returnMode of ["exact", "profile"])
  test("original quote client navigation activates the bound card and returns by exact history without goto", async () => {
    const { DOMNavigation } = await import("../dist/browser-dom-navigation.js");
    const own = "https://x.com/owner/status/10",
      source = "https://x.com/source/status/20";
    let url = own;
    const calls = [];
    const control = {
      innerText: async () => card.text,
      press: async (key) => {
        assert.equal(key, "Enter");
        calls.push("card");
        url = source;
      },
      locator: (selector) =>
        selector === 'a[href*="/status/"]'
          ? {
              count: async () => 1,
              nth: () => ({
                getAttribute: async () => "/source/status/20/photo/1",
              }),
            }
          : {
              filter() {
                return this;
              },
              count: async () => 0,
            },
    };
    const controls = {
      filter() {
        return this;
      },
      count: async () => 1,
      nth: () => control,
    };
    const article = {
      filter() {
        return this;
      },
      locator: () => controls,
      first() {
        return this;
      },
      waitFor: async () => {},
    };
    const session = {
      current: {
        query: { view: "posts" },
        result: {
          page: own,
          posts: [{ ...parent, primary: "/owner/status/10" }],
        },
      },
    };
    const nav = new DOMNavigation({
      session,
      observe: async () => ({}),
      tab: {
        url: async () => url,
        goto: async () => {
          calls.push("goto");
        },
        back: async () => {
          calls.push("back");
          url = returnMode === "exact" ? own : "https://x.com/owner";
        },
        playwright: {
          getByRole: () => article,
          locator: () => ({
            filter() {
              return this;
            },
            count: async () => 1,
            click: async () => {
              calls.push("receipt");
              url = own;
            },
          }),
          waitForURL: async (target) => assert.equal(url, target),
        },
      },
    });
    assert.equal(
      (
        await nav.openQuote({
          postId: "10",
          cardText: card.text,
          preferClientNavigation: true,
        })
      ).url,
      source,
    );
    await nav.openObserved({
      url: own,
      evidenceRef: "original-parent",
      view: "posts",
      preferObservedLink: true,
    });
    assert.deepEqual(
      calls,
      returnMode === "exact" ? ["card", "back"] : ["card", "back", "receipt"],
    );
  });

test("a quote history return without its unique receipt link remains unknown without document navigation", async () => {
  const { DOMNavigation } = await import("../dist/browser-dom-navigation.js");
  let url = "https://x.com/source/status/20",
    gotos = 0;
  const nav = new DOMNavigation({
    session: {
      quoteClientReturn: {
        parent: "https://x.com/owner/status/10",
        source: url,
      },
    },
    observe: async () => ({}),
    tab: {
      url: async () => url,
      back: async () => {
        url = "https://x.com/owner";
      },
      goto: async () => {
        gotos++;
      },
      playwright: {
        locator: () => ({
          filter() {
            return this;
          },
          count: async () => 0,
        }),
      },
    },
  });
  await assert.rejects(
    () =>
      nav.openObserved({
        url: "https://x.com/owner/status/10",
        evidenceRef: "actual-parent",
        view: "posts",
        preferObservedLink: true,
      }),
    /quote-client-return-link-unavailable/,
  );
  assert.equal(gotos, 0);
  assert.equal(url, "https://x.com/owner");
});
