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
    if (["correct", "parentless", "wrong-parent"].includes(outcome))
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

for (const mode of [
  "valid",
  "foreign",
  "ambiguous",
  "alert",
  "account",
  "route",
])
  test(`transient reply receipt captured before idle: ${mode}`, async () => {
    const { createDOMSubmission } =
      await import("../dist/browser-dom-submission.js");
    const events = [];
    const finish = createDOMSubmission({
      session: {},
      observe: async () => {
        events.push("capture");
        return {
          page: mode === "route" ? "https://x.com/home" : action.url,
          accountHandle: mode === "account" ? "Other" : "Owner",
          alerts: mode === "alert" ? ["challenge"] : [],
          needsStateCheck: false,
          submissionLinks: [
            {
              href:
                mode === "foreign" ? "/Other/status/11" : "/Owner/status/11",
            },
            ...(mode === "ambiguous" ? [{ href: "/Owner/status/12" }] : []),
          ],
        };
      },
      tab: {
        playwright: { waitForLoadState: async () => events.push("idle") },
      },
      submitAX: null,
      unique: () => {
        throw Error("No extra control");
      },
      locator: () => {
        throw Error("No extra control");
      },
    });
    const r = await finish(
      { operation: "submitReply", actionId: "reply-1", activation: "keyboard" },
      {
        loc: { press: async () => events.push("submit") },
        submittedEditor: { waitFor: async () => events.push("editor-clear") },
      },
      { view: "composer" },
      {
        page: action.url,
        accountHandle: "Owner",
        editorText: action.text,
        replyToId: action.postId,
      },
    );
    assert.deepEqual(events, ["submit", "editor-clear", "capture", "idle"]);
    if (mode === "valid") {
      assert.equal(r.actionId, "reply-1");
      assert.deepEqual(r.receiptCandidate, {
        id: "11",
        url: action.observedPublicURL,
      });
      assert.notEqual(r.verified, true);
    } else assert.equal(r, undefined);
  });
for (const outcome of ["verified", "read-error"])
  test(`original receipt is persisted before first verification: ${outcome}`, async (t) => {
    const { fixture, NOW } = await import("./fixtures.mjs");
    const { createBusinessHarness } = await import("../dist/diagnostics.js");
    const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 1] });
    const submit = f.platform.submitReply;
    const find = f.platform.findSubmission;
    let submittedId,
      verifiedReads = 0;
    f.platform.submitReply = async (a) => {
      await submit(a);
      submittedId = f.posts.at(-1).id;
      return {
        actionId: a.id,
        accountHandle: a.accountHandle,
        page: a.url,
        capturedAt: new Date(NOW).toISOString(),
        receiptCandidate: {
          id: submittedId,
          url: `https://x.com/Pei/status/${submittedId}`,
        },
      };
    };
    f.platform.findSubmission = async (a, c) => {
      if (c?.phase === "baseline") return find(a, c);
      verifiedReads++;
      const state = (await f.store.load()).state;
      const persisted = state.actions.find((x) => x.id === a.id);
      assert.equal(persisted.status, "unknown");
      assert.equal(
        persisted.observedPublicURL,
        `https://x.com/Pei/status/${submittedId}`,
      );
      assert.equal(a.observedPublicURL, persisted.observedPublicURL);
      assert.ok(persisted.observedPublicEvidenceRef);
      if (outcome === "read-error") throw Error("public read unavailable");
      return {
        verified: true,
        publicId: submittedId,
        posts: [f.posts.at(-1)],
        alerts: [],
        needsStateCheck: false,
      };
    };
    const api = createBusinessHarness({
      store: f.store,
      platform: f.platform,
      clock: () => NOW,
    });
    const r = await api.replyToPost({
      taskId: "round-1",
      postId: "123",
      text: "有具体贡献的回复",
    });
    assert.equal(f.writes.length, 1);
    assert.equal(verifiedReads, 1);
    assert.equal(r.status, outcome === "verified" ? "verified" : "unknown");
    const s = (await f.store.load()).state;
    assert.equal(
      s.actions[0].observedPublicURL,
      `https://x.com/Pei/status/${submittedId}`,
    );
    assert.equal(
      s.items.find((i) => i.kind === "reply").verified,
      outcome === "verified" ? 1 : 0,
    );
  });

test("receipt links come only from a visible exact informational sent notice", async (t) => {
  const { readXSurface } = await import("../dist/browser.js");
  const sent = "你的帖子已发送。你有 1 小时时间进行任何编辑。\n查看";
  const link = {
    getClientRects: () => [{}],
    getAttribute: (n) => (n === "href" ? "/Owner/status/11" : null),
  };
  const notice = (text, visible = true) => ({
    innerText: text,
    getClientRects: () => (visible ? [{}] : []),
    querySelectorAll: () => [link],
  });
  const profile = {
    innerText: "Profile",
    getClientRects: () => [{}],
    getAttribute: (n) =>
      n === "aria-label" ? "Profile" : n === "href" ? "/Owner" : null,
  };
  for (const [key, value] of Object.entries({
    document: {
      querySelectorAll: (s) =>
        s === "a[href]"
          ? [profile]
          : s === '[role="alert"]'
            ? [notice(sent), notice(sent, false), notice(sent + "\n操作受限")]
            : [],
    },
    location: { href: action.url },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() =>
      descriptor
        ? Object.defineProperty(globalThis, key, descriptor)
        : delete globalThis[key],
    );
  }
  const r = readXSurface({ view: "posts", posts: [] });
  assert.deepEqual(r.submissionLinks, [
    { href: "/Owner/status/11", notice: sent },
  ]);
  assert.ok(r.alerts.includes(sent + "\n操作受限"));
});
