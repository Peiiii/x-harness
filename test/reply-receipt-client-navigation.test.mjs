import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformWriting } from "../dist/platform-writing.js";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
const action = {
  kind: "reply",
  accountHandle: "Owner",
  accountURL: "https://x.com/Owner",
  postId: "10",
  url: "https://x.com/Peer/status/10",
  evidenceRef: "parent",
  text: "Reviewed reply",
  intentAt: "2026-10-12T08:00:00Z",
  beforeIds: ["10"],
  observedPublicURL: "https://x.com/Owner/status/11",
  observedPublicEvidenceRef: "receipt",
};
const post = {
  id: "11",
  author: "Owner",
  body: action.text,
  datetime: "2026-10-12T08:00:02Z",
  primary: "/Owner/status/11",
  replyToId: "10",
  needsExpansion: false,
};
for (const outcome of [
  "correct",
  "parentless",
  "wrong-parent",
  "changed-text",
  "stale-time",
  "duplicate",
  "alert",
])
  test(`observed reply receipt preserves exact acceptance without reload: ${outcome}`, async () => {
    const commands = [],
      opens = [];
    const snapshot = () => ({
      page: action.observedPublicURL,
      accountHandle: outcome === "wrong-account" ? "Other" : "Owner",
      alerts: outcome === "alert" ? ["challenge"] : [],
      needsStateCheck: false,
      posts: [
        {
          ...post,
          ...(outcome === "parentless" ? { replyToId: null } : {}),
          ...(outcome === "wrong-parent" ? { replyToId: "99" } : {}),
          ...(outcome === "changed-text" ? { body: "changed" } : {}),
          ...(outcome === "stale-time"
            ? { datetime: "2026-10-12T07:00:00Z" }
            : {}),
        },
        ...(outcome === "duplicate" ? [{ ...post, id: "12" }] : []),
      ],
    });
    const writing = createPlatformWriting({
      open: async (_target, q) => {
        opens.push(q);
        return snapshot();
      },
      observed: async () => snapshot(),
      browser: {
        capabilities: () => [],
        act: async (c) => commands.push(c.operation),
      },
      clock: () => Date.parse("2026-10-12T08:01:00Z"),
      readPost: async () => snapshot(),
      readPerson: async () => {
        throw Error("No person read");
      },
      followStage: async () => {
        throw Error("No follow");
      },
    });
    const r = await writing.findSubmission(action);
    assert.equal(r.verified, outcome === "correct");
    if (["correct", "parentless", "wrong-parent", "alert"].includes(outcome))
      assert.equal(commands.includes("refreshPosts"), false);
    assert.equal(opens[0].preferClientNavigation, true);
    assert.equal(
      commands.some((c) => /submit/.test(c)),
      false,
    );
  });
for (const mode of ["unique", "missing", "ambiguous", "forced", "default"])
  test(`reply receipt client route ${mode}`, async () => {
    let page = "https://x.com/Peer/status/10";
    const calls = [];
    const link = {
      filter() {
        return this;
      },
      count: async () =>
        mode === "missing" ? 0 : mode === "ambiguous" ? 2 : 1,
      click: async () => {
        calls.push("click");
        page = action.observedPublicURL;
      },
    };
    const article = {
      filter() {
        return this;
      },
      first() {
        return this;
      },
      waitFor: async () => calls.push("article"),
    };
    const navigation = new DOMNavigation({
      session: {},
      observe: async () => ({
        page,
        accountHandle: "Owner",
        alerts: [],
        needsStateCheck: false,
      }),
      tab: {
        url: async () => page,
        goto: async (url) => {
          calls.push("goto");
          page = url;
        },
        playwright: {
          locator: () => link,
          getByRole: () => article,
          waitForURL: async (url) => assert.equal(page, url),
        },
      },
    });
    await navigation.openObserved({
      url: action.observedPublicURL,
      view: "posts",
      evidenceRef: "receipt",
      ...(mode === "default" ? {} : { preferClientNavigation: true }),
      ...(mode === "forced" ? { forceNavigation: true } : {}),
    });
    assert.deepEqual(calls, [mode === "unique" ? "click" : "goto", "article"]);
  });

test("root platform forwards the reply client preference and avoids refreshing its exact receipt", async () => {
  const { createXPlatform } = await import("../dist/platform.js");
  let page = action.url;
  const calls = [];
  const platform = createXPlatform(
    {
      capabilities: () => [],
      act: async (c) => {
        calls.push(c);
        if (c.url) page = c.url;
      },
      observe: async () => ({
        page,
        accountHandle: "Owner",
        accountURL: action.accountURL,
        needsStateCheck: false,
        alerts: [],
        posts: [post],
      }),
    },
    { clock: () => Date.parse("2026-10-12T08:01:00Z") },
  );
  const r = await platform.findSubmission(action);
  assert.equal(r.verified, true);
  assert.equal(
    calls.find((c) => c.operation === "openObserved").preferClientNavigation,
    true,
  );
  assert.equal(
    calls.some((c) => c.operation === "refreshPosts"),
    false,
  );
  assert.equal(
    calls.some((c) => /submit/.test(c.operation)),
    false,
  );
});
for (const mode of ["inert", "alert", "wrong-route", "transport"])
  test(`preferred receipt navigation retains bounded failure ${mode}`, async () => {
    const target = action.observedPublicURL,
      initial = action.url,
      calls = [];
    let page = initial,
      waits = 0;
    const link = {
      filter() {
        return this;
      },
      count: async () => 1,
      click: async () => {
        calls.push("click");
        if (mode === "transport") throw Error("connection interrupted");
        if (mode === "wrong-route") page = "https://x.com/home";
      },
    };
    const article = {
      filter() {
        return this;
      },
      first() {
        return this;
      },
      waitFor: async () => calls.push("article"),
    };
    const nav = new DOMNavigation({
      session: {},
      observe: async () => ({
        page,
        accountHandle: "Owner",
        needsStateCheck: false,
        alerts: mode === "alert" ? ["challenge"] : [],
      }),
      tab: {
        url: async () => page,
        goto: async (url) => {
          calls.push("goto");
          page = url;
        },
        playwright: {
          locator: () => link,
          getByRole: () => article,
          waitForURL: async () => {
            if (!waits++) throw Error("Timed out waiting for URL");
          },
        },
      },
    });
    const op = () =>
      nav.openObserved({
        view: "posts",
        url: target,
        evidenceRef: "receipt",
        preferClientNavigation: true,
      });
    if (mode === "inert") {
      await op();
      assert.deepEqual(calls, ["click", "goto", "article"]);
    } else {
      await assert.rejects(op());
      assert.deepEqual(calls, ["click"]);
    }
  });

test("first normal reply verification acquires the observed candidate before any refresh", async () => {
  let opens = 0;
  const commands = [],
    queries = [];
  const current = {
    page: action.url,
    accountHandle: "Owner",
    alerts: [],
    needsStateCheck: false,
    posts: [{ ...post, replyToId: null }],
  };
  const detail = { ...current, page: action.observedPublicURL, posts: [post] };
  const writing = createPlatformWriting({
    open: async (_target, q) => {
      queries.push(q);
      return ++opens === 1 ? current : detail;
    },
    observed: async () => current,
    browser: {
      capabilities: () => [],
      act: async (c) => {
        commands.push(c.operation);
      },
    },
    clock: () => Date.parse("2026-10-12T08:01:00Z"),
    readPost: async () => detail,
    readPerson: async () => {
      throw Error("No person");
    },
    followStage: async () => {
      throw Error("No follow");
    },
  });
  const r = await writing.findSubmission({
    ...action,
    observedPublicURL: undefined,
    observedPublicEvidenceRef: undefined,
  });
  assert.equal(r.verified, true);
  assert.equal(commands.includes("refreshPosts"), false);
  assert.equal(queries[1].preferClientNavigation, true);
});

test("a later changed detail preserves the originally observed receipt without success", async () => {
  const initial = {
    page: action.url,
    accountHandle: "Owner",
    alerts: [],
    needsStateCheck: false,
    posts: [{ ...post, replyToId: null }],
  };
  const changed = {
    ...initial,
    page: action.observedPublicURL,
    posts: [{ ...post, body: "changed", replyToId: "10" }],
  };
  let opens = 0;
  const writing = createPlatformWriting({
    open: async () => (++opens === 1 ? initial : changed),
    observed: async () => changed,
    browser: {
      capabilities: () => ["refreshPosts"],
      act: async () => {
        throw Error("No writes");
      },
    },
    clock: () => Date.parse("2026-10-12T08:01:00Z"),
    readPost: async () => changed,
    readPerson: async () => {
      throw Error("No person");
    },
    followStage: async () => {
      throw Error("No follow");
    },
  });
  const r = await writing.findSubmission({
    ...action,
    observedPublicURL: undefined,
    observedPublicEvidenceRef: undefined,
  });
  assert.equal(r.verified, false);
  assert.deepEqual(r.receiptCandidate, {
    url: action.observedPublicURL,
    id: "11",
  });
});

for (const mode of ["committed", "inert", "alert", "wrong-route"])
  test(`cross-realm receipt navigation preserves existing boundary: ${mode}`, async () => {
    const { runInNewContext } = await import("node:vm");
    const hostError = runInNewContext('new Error("Timed out waiting for URL")');
    assert.equal(hostError instanceof Error, false);
    let page = action.url,
      waits = 0;
    const calls = [];
    const link = {
      filter() {
        return this;
      },
      count: async () => 1,
      click: async () => {
        calls.push("click");
        if (mode === "committed") page = action.observedPublicURL;
        if (mode === "wrong-route") page = "https://x.com/home";
      },
    };
    const article = {
      filter() {
        return this;
      },
      first() {
        return this;
      },
      waitFor: async () => calls.push("article"),
    };
    const nav = new DOMNavigation({
      session: {},
      observe: async () => ({
        page,
        accountHandle: "Owner",
        needsStateCheck: false,
        alerts: mode === "alert" ? ["challenge"] : [],
      }),
      tab: {
        url: async () => page,
        goto: async (url) => {
          calls.push("goto");
          page = url;
        },
        playwright: {
          locator: () => link,
          getByRole: () => article,
          waitForURL: async () => {
            if (!waits++) throw hostError;
          },
        },
      },
    });
    const op = () =>
      nav.openObserved({
        view: "posts",
        url: action.observedPublicURL,
        evidenceRef: "receipt",
        preferClientNavigation: true,
      });
    if (["committed", "inert"].includes(mode)) {
      await op();
      assert.deepEqual(
        calls,
        mode === "committed"
          ? ["click", "article"]
          : ["click", "goto", "article"],
      );
    } else {
      await assert.rejects(op());
      assert.deepEqual(calls, ["click"]);
    }
  });
test("cross-realm detail timeout retains the first observed original permalink", async () => {
  const { runInNewContext } = await import("node:vm");
  let opens = 0;
  const value = {
    page: action.url,
    accountHandle: "Owner",
    alerts: [],
    needsStateCheck: false,
    posts: [{ ...post, replyToId: null }],
  };
  const writing = createPlatformWriting({
    open: async () => {
      if (++opens === 2)
        throw runInNewContext('new Error("Timed out waiting for URL")');
      return value;
    },
    observed: async () => value,
    browser: {
      capabilities: () => ["refreshPosts"],
      act: async () => {
        throw Error("No writes");
      },
    },
    clock: () => Date.parse("2026-10-12T08:01:00Z"),
    readPost: async () => value,
    readPerson: async () => {
      throw Error("No person");
    },
    followStage: async () => {
      throw Error("No follow");
    },
  });
  const r = await writing.findSubmission({
    ...action,
    observedPublicURL: undefined,
    observedPublicEvidenceRef: undefined,
  });
  assert.equal(r.verified, false);
  assert.deepEqual(r.receiptCandidate, {
    url: action.observedPublicURL,
    id: "11",
  });
});
test("cross-realm open timeout freshly checks the committed exact route", async () => {
  const { runInNewContext } = await import("node:vm");
  const { PlatformObservation } =
    await import("../dist/platform-observation.js");
  let page = action.url,
    calls = 0;
  const observed = new PlatformObservation({
    clock: () => Date.parse("2026-10-12T08:01:00Z"),
    browser: {
      observe: async () => ({
        page,
        accountHandle: "Owner",
        alerts: [],
        needsStateCheck: false,
        posts: [post],
      }),
      act: async () => {
        calls++;
        page = action.observedPublicURL;
        throw runInNewContext('new Error("Timed out waiting for URL")');
      },
    },
  });
  const r = await observed.open(
    { url: action.observedPublicURL, evidenceRef: "receipt" },
    { view: "posts", targetId: "11" },
  );
  assert.equal(r.page, action.observedPublicURL);
  assert.equal(calls, 1);
});
