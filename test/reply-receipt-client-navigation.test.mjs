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
