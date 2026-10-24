import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/diagnostics.js";

for (const mode of ["inert", "warning", "changed-route"]) {
  test(`cold search profile navigation preserves one safe fallback: ${mode}`, async () => {
    let page = "https://x.com/search?q=topic",
      waits = 0;
    const calls = [],
      reads = [];
    const link = {
      filter() {
        return this;
      },
      async count() {
        return 1;
      },
      async click() {
        calls.push("click");
        if (mode === "changed-route") page = "https://x.com/home";
      },
      async waitFor() {},
    };
    const tab = {
      async url() {
        return page;
      },
      async goto(url) {
        calls.push("goto");
        page = url;
      },
      playwright: {
        locator() {
          return link;
        },
        async waitForURL() {
          if (!waits++)
            throw Error("Timed out waiting for URL https://x.com/reader");
        },
        async evaluate(_program, query) {
          reads.push(query.view);
          return {
            page,
            accountHandle: "Pei",
            alerts: mode === "warning" ? ["请验证身份"] : [],
            needsStateCheck: query.view === "person",
          };
        },
      },
    };
    const browser = createDOMXBrowser(tab);
    const action = () =>
      browser.act({
        operation: "openObserved",
        view: "person",
        handle: "reader",
        url: "https://x.com/reader",
        evidenceRef: "observed-source",
      });
    if (mode === "inert") {
      await action();
      assert.deepEqual(calls, ["click", "goto"]);
    } else {
      await assert.rejects(action());
      assert.deepEqual(calls, ["click"]);
    }
    assert.deepEqual(reads, ["account"]);
  });
}

for (const mode of ["committed", "wrong-route", "alert", "other-error"]) {
  test(`post direct URL wait preserves fresh exact route: ${mode}`, async () => {
    const target = "https://x.com/peer/status/123";
    let page = "https://x.com/search?q=mutual",
      waits = 0,
      contentWaits = 0;
    const calls = [];
    const locator = {
      filter() {
        return this;
      },
      first() {
        return this;
      },
      async count() {
        return 1;
      },
      async click() {
        calls.push("click");
      },
      async waitFor() {
        contentWaits++;
      },
    };
    const tab = {
      async url() {
        return page;
      },
      async goto(url) {
        calls.push("goto");
        page = mode === "wrong-route" ? "https://x.com/home" : url;
      },
      playwright: {
        locator() {
          return locator;
        },
        getByRole() {
          return locator;
        },
        async waitForURL() {
          waits++;
          if (waits === 1 && mode === "other-error")
            throw Error("transport unavailable");
          throw Error(`Timed out waiting for URL ${target}`);
        },
        async evaluate() {
          return {
            page,
            accountHandle: "owner",
            needsStateCheck: false,
            alerts:
              waits === 1 && mode === "alert" ? ["verification needed"] : [],
          };
        },
      },
    };
    const browser = createDOMXBrowser(tab);
    const run = () =>
      browser.act({
        operation: "openObserved",
        view: "posts",
        url: target,
        evidenceRef: "observed-parent",
      });
    if (mode === "committed") {
      await run();
      assert.equal(contentWaits, 1);
    } else {
      await assert.rejects(run());
      assert.equal(contentWaits, 0);
    }
    assert.deepEqual(calls, ["goto"]);
    assert.equal(waits, 1);
  });
}

test("already committed post still waits for exact content without another navigation", async () => {
  const target = "https://x.com/reader/status/123";
  let waits = 0;
  const article = {
    filter() {
      return this;
    },
    first() {
      return this;
    },
    async waitFor() {
      waits++;
    },
  };
  const browser = createDOMXBrowser({
    url: async () => target,
    goto: async () => {
      throw Error("unexpected navigation");
    },
    playwright: { getByRole: () => article, locator: () => ({}) },
  });
  await browser.act({
    operation: "openObserved",
    view: "posts",
    url: target,
    evidenceRef: "observed",
  });
  assert.equal(waits, 1);
});

for (const mode of ["unique", "missing", "ambiguous", "forced"]) {
  test(`publication profile return keeps the loaded client when safe: ${mode}`, async () => {
    const target = "https://x.com/owner";
    let page = "https://x.com/compose/post",
      contentWaits = 0;
    const calls = [];
    const link = {
      filter() {
        return this;
      },
      count: async () =>
        mode === "missing" ? 0 : mode === "ambiguous" ? 2 : 1,
      click: async () => {
        calls.push("click");
        page = target;
      },
    };
    const article = {
      first() {
        return this;
      },
      waitFor: async () => {
        contentWaits++;
      },
    };
    const browser = createDOMXBrowser({
      url: async () => page,
      goto: async (url) => {
        calls.push("goto");
        page = url;
      },
      playwright: {
        locator: () => link,
        getByRole: () => article,
        waitForURL: async (url) => {
          assert.equal(page, url);
        },
      },
    });
    await browser.act({
      operation: "openObserved",
      view: "posts",
      url: target,
      evidenceRef: "reviewed-own-profile",
      ...(mode === "forced" ? { forceNavigation: true } : {}),
    });
    assert.deepEqual(calls, [mode === "unique" ? "click" : "goto"]);
    assert.equal(contentWaits, 1);
  });
}

for (const mode of ["unique", "missing", "ambiguous", "forced"]) {
  test(`profile result refresh uses an evidenced timeline round trip without reload: ${mode}`, async () => {
    const url = "https://x.com/owner",
      calls = [];
    let page = url;
    const profile = {
      filter() {
        return this;
      },
      count: async () =>
        mode === "missing" ? 0 : mode === "ambiguous" ? 2 : 1,
      getAttribute: async () => "true",
      click: async () => {
        calls.push("timeline");
        page = url;
      },
    };
    const adjacent = {
      filter() {
        return this;
      },
      count: async () => 1,
      click: async () => {
        calls.push("adjacent");
        page = url + "/with_replies";
      },
    };
    const article = {
      first() {
        return this;
      },
      waitFor: async () => {
        calls.push("content");
      },
    };
    const browser = createDOMXBrowser({
      url: async () => page,
      reload: async () => {
        calls.push("reload");
      },
      getAXState: async () => {},
      playwright: {
        locator: (selector) =>
          selector.includes("/with_replies") ? adjacent : profile,
        getByRole: () => article,
        waitForURL: async (target) => {
          assert.equal(page, target);
        },
      },
    });
    await browser.act({
      operation: "refreshPosts",
      url,
      evidenceRef: "original-profile-proof",
      ...(mode === "forced" ? { forceNavigation: true } : {}),
    });
    assert.deepEqual(
      calls,
      mode === "unique"
        ? ["adjacent", "timeline", "content"]
        : ["reload", "content"],
    );
  });
}

test("original refresh waits for the reviewed candidate rather than an early pinned card", async () => {
  let expected;
  let waits = 0;
  const article = {
    first() {
      return this;
    },
    filter(q) {
      expected = q.hasText;
      return this;
    },
    waitFor: async () => {
      waits++;
    },
  };
  const browser = createDOMXBrowser({
    url: async () => "https://x.com/owner",
    reload: async () => {},
    playwright: { getByRole: () => article },
  });
  await browser.act({
    operation: "refreshPosts",
    url: "https://x.com/owner",
    evidenceRef: "synthetic",
    expectedText: "reviewed candidate",
  });
  assert.equal(expected, "reviewed candidate");
  assert.equal(waits, 1);
});

test("an evidenced original receipt can use one unique visible permalink without document navigation", async () => {
  const url = "https://x.com/owner/status/123";
  let page = "https://x.com/owner";
  const calls = [];
  const link = {
    filter() {
      return this;
    },
    count: async () => 1,
    click: async () => {
      calls.push("link");
      page = url;
    },
  };
  const article = {
    filter() {
      return this;
    },
    first() {
      return this;
    },
    waitFor: async () => {},
  };
  const browser = createDOMXBrowser({
    url: async () => page,
    goto: async () => {
      calls.push("goto");
    },
    playwright: {
      locator: () => link,
      getByRole: () => article,
      waitForURL: async (target) => assert.equal(page, target),
    },
  });
  await browser.act({
    operation: "openObserved",
    view: "posts",
    url,
    evidenceRef: "observed-own-receipt",
    preferObservedLink: true,
    targetId: "123",
  });
  assert.deepEqual(calls, ["link"]);
});

for (const count of [0, 2])
  test(`original receipt missing or ambiguous link does not fall back to document navigation: ${count}`, async () => {
    let gotos = 0;
    const link = {
      filter() {
        return this;
      },
      count: async () => count,
    };
    const browser = createDOMXBrowser({
      url: async () => "https://x.com/owner",
      goto: async () => {
        gotos++;
      },
      playwright: { locator: () => link },
    });
    await assert.rejects(
      () =>
        browser.act({
          operation: "openObserved",
          view: "posts",
          url: "https://x.com/owner/status/123",
          evidenceRef: "real-proof",
          preferObservedLink: true,
        }),
      /original-receipt-link-not-currently-visible/,
    );
    assert.equal(gotos, 0);
  });

for (const [visible, namedCount, forced] of [
  [0, 0, false],
  [1, 0, false],
  [2, 1, false],
  [2, 2, false],
  [1, 0, true],
]) {
  test(`one navigation reuses URL and exact-link reads: ${visible}/${namedCount}/${forced}`, async () => {
    let page = "https://x.com/search?q=people",
      urlReads = 0,
      linkReads = 0,
      nameReads = 0;
    const calls = [];
    const named = {
      count: async () => {
        nameReads++;
        return namedCount;
      },
      click: async () => {
        calls.push("named");
        page = "https://x.com/peer";
      },
    };
    const link = {
      filter: (options) => (options.hasText ? named : link),
      count: async () => {
        linkReads++;
        return visible;
      },
      click: async () => {
        calls.push("link");
        page = "https://x.com/peer";
      },
      waitFor: async () => {},
    };
    const browser = createDOMXBrowser({
      url: async () => {
        urlReads++;
        return page;
      },
      goto: async (url) => {
        calls.push("goto");
        page = url;
      },
      playwright: {
        locator: () => link,
        waitForURL: async (url) => assert.equal(page, url),
      },
    });
    await browser.act({
      operation: "openObserved",
      view: "person",
      handle: "peer",
      url: "https://x.com/peer",
      evidenceRef: "observed-person",
      forceNavigation: forced,
    });
    assert.equal(urlReads, 1);
    assert.equal(linkReads, forced ? 0 : 1);
    assert.equal(nameReads, !forced && visible > 1 ? 1 : 0);
    assert.deepEqual(calls, [
      forced || visible === 0 || (visible > 1 && namedCount !== 1)
        ? "goto"
        : visible === 1
          ? "link"
          : "named",
    ]);
  });
}

test("missing live URL never makes a retained observation a same-page shortcut", async () => {
  const target = "https://x.com/peer";
  let page = target;
  const calls = [];
  const link = {
    filter() {
      return this;
    },
    count: async () => 0,
    waitFor: async () => {},
  };
  const browser = createDOMXBrowser({
    goto: async (url) => {
      calls.push("goto");
      page = url;
    },
    playwright: {
      locator: () => link,
      waitForURL: async (url) => assert.equal(page, url),
      evaluate: async () => ({ page, accountHandle: "owner", alerts: [] }),
    },
  });
  await browser.observe({ view: "person", handle: "peer" });
  page = "https://x.com/home";
  await browser.act({
    operation: "openObserved",
    view: "person",
    handle: "peer",
    url: target,
    evidenceRef: "observed-peer",
  });
  assert.deepEqual(calls, ["goto"]);
});
