import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createXGrowthHarness } from "../dist/index.js";
import { fixture } from "./fixtures.mjs";
function tabFixture({
  incomplete = false,
  alerts = [],
  interrupt = false,
} = {}) {
  const calls = [];
  const article = {
    first: () => article,
    waitFor: async () => {},
    getByRole: () => ({ all: async () => [] }),
  };
  const tab = {
    id: "creator-tab",
    url: async () => "https://x.com/creator",
    goto: async () => calls.push("goto"),
    reload: async () => calls.push("reload"),
    scroll: async () => calls.push("scroll"),
    getAXState: async () => {
      calls.push("AX");
      if (interrupt) throw Error("browser connection interrupted");
      return {};
    },
    playwright: {
      locator: () => article,
      evaluate: async (fn, args) => {
        calls.push(fn.name);
        if (fn.name === "readProfile")
          return {
            handle: "creator",
            blue: true,
            biography: "作者简介",
            following: { value: 10, text: "10 正在关注", precision: "exact" },
            followers: { value: 20, text: "20 关注者", precision: "exact" },
          };
        if (fn.name === "readCreatorMeta")
          return {
            headerText: "作者\n1.5万 帖子\n2019年9月 加入\n编辑/关注/噪音",
            totalPostsText: "1.5万 帖子",
            externalLinks: [
              "https://example.com",
              "https://x.com/tos",
              "https://help.x.com/faq",
            ],
            missing: [],
          };
        if (fn.name === "readCreatorPostExtras")
          return [
            {
              id: "123",
              metricDescriptions: ["2 回复", "3 喜欢次数", "4 次观看", "Grok"],
              quoted: false,
              videoElements: 0,
              images: [{ src: "avatar" }],
            },
          ];
        return {
          page: "https://x.com/creator",
          moreInDOM: false,
          alerts,
          posts: [
            {
              id: "123",
              author: "creator",
              datetime: incomplete ? null : "2026-10-11T12:00:00.000Z",
              primary: "/creator/status/123",
              body: "完整正文\n".repeat(40),
              images: [
                { src: "https://pbs.twimg.com/media/abc", alt: "正文图" },
              ],
              links: ["/creator", "https://example.com/source"],
              buttons: [{ label: "更多" }],
            },
          ],
        };
      },
    },
  };
  return { tab, calls };
}
const make = (t, options) => {
  const f = fixture(t),
    v = tabFixture(options);
  return {
    ...f,
    ...v,
    api: createXGrowthHarness({
      tab: v.tab,
      ledgerPath: f.ledger,
      proofDirectory: f.dir,
    }),
  };
};
test("creator accepts the official nested AX tab without mutating it", async (t) => {
  const f = fixture(t);
  const v = tabFixture();
  const { getAXState, scroll, ...other } = v.tab;
  const tab = {
    ...other,
    ax: {
      get: async (mode, options) => {
        assert.equal(mode, "state");
        return getAXState(options);
      },
      scroll,
    },
  };
  const api = createXGrowthHarness({
    tab,
    ledgerPath: f.ledger,
    proofDirectory: f.dir,
  });
  const result = await api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
    mode: "decision",
  });
  assert.equal(result.status, "observed");
  assert.equal(result.person.handle, "creator");
  assert.ok(v.calls.includes("AX"));
  assert.equal(tab.getAXState, undefined);
  assert.equal(tab.scroll, undefined);
});
for (const widths of [
  [310, 310],
  [1440, 310],
]) {
  test(`creator collects across viewport widths ${widths.join(" -> ")}`, async (t) => {
    const f = make(t);
    const { runInNewContext } = await import("node:vm");
    const original = f.tab.playwright.evaluate;
    let page = 0;
    f.tab.playwright.evaluate = async (fn, args) => {
      if (fn.name === "readCreatorScrollPoint")
        return runInNewContext(`(${fn.toString()})()`, {
          innerWidth: widths[Math.min(page, widths.length - 1)],
          innerHeight: 715,
        });
      const result = await original(fn, args);
      if (fn.name === "readXObservation")
        result.posts = result.posts.map((post) => ({
          ...post,
          id: String(123 + page),
          primary: `/creator/status/${123 + page}`,
        }));
      return result;
    };
    f.tab.scroll = async ([x, y]) => {
      assert.ok(x >= 0 && x < widths[Math.min(page, widths.length - 1)]);
      assert.ok(y >= 0 && y < 715);
      page++;
    };
    const result = await f.api.readCreator({
      handle: "creator",
      target: 3,
      maxScrolls: 2,
      mode: "decision",
    });
    assert.equal(result.status, "observed");
    assert.equal(result.complete, true);
    assert.deepEqual(result.sources.map((post) => post.id).sort(), [
      "123",
      "124",
      "125",
    ]);
    assert.equal(page, 2);
  });
}
test("creator root collects once, preserves exact evidence and local raw proof, whitelists metadata and seeds delta", async (t) => {
  const f = make(t);
  const result = await f.api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
    mode: "decision",
  });
  assert.equal(result.status, "observed");
  assert.equal(result.complete, true);
  assert.equal(result.person.handle, "creator");
  assert.equal(result.creator.totalPostsText, "1.5万 帖子");
  assert.equal(result.creator.name, "作者");
  assert.deepEqual(result.creator.externalLinks, ["https://example.com"]);
  assert.equal(result.creator.joined, "2019年9月 加入");
  assert.equal(result.sources[0].body, "完整正文\n".repeat(40));
  assert.equal(result.sources[0].url, "https://x.com/creator/status/123");
  assert.equal(result.sources[0].images[0].alt, "正文图");
  assert.deepEqual(result.sources[0].metrics, [
    "2 回复",
    "3 喜欢次数",
    "4 次观看",
  ]);
  assert.ok(!JSON.stringify(result).includes("编辑/关注/噪音"));
  assert.equal(f.calls.filter((v) => v === "readXObservation").length, 1);
  assert.ok(
    readFileSync(result.evidenceRef, "utf8").includes("编辑/关注/噪音"),
  );
  const delta = await f.api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
    mode: "delta",
  });
  assert.deepEqual(delta.unchangedIds, ["123"]);
  assert.deepEqual(delta.sources, []);
  assert.equal(delta.person, undefined);
  assert.equal(delta.creator, undefined);
  assert.equal(delta.fresh, true);
  const receipt = await f.api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
  });
  assert.equal(receipt.sources, undefined);
  assert.equal(receipt.person, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(receipt)) < 1024);
});
test("creator partial time, platform warning and unsupported native adapter never count complete", async (t) => {
  const f = make(t, { incomplete: true });
  const result = await f.api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
    mode: "decision",
  });
  assert.equal(result.status, "needsDecision");
  assert.equal(result.complete, false);
  assert.ok(result.missing.includes("absolute-time-missing"));
  const a = make(t, { alerts: ["请验证身份"] });
  const partial = await a.api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
    mode: "decision",
  });
  assert.equal(partial.complete, false);
  assert.ok(partial.missing.includes("platform-alert"));
  let reads = 0;
  const native = createXGrowthHarness({
    app: {
      getAXState: async () => {
        reads++;
        return {};
      },
    },
    ledgerPath: f.ledger,
    proofDirectory: f.dir,
  });
  const absent = await native.readCreator({ handle: "creator", target: 1 });
  assert.equal(absent.status, "needsCapability");
  assert.equal(reads, 0);
});
test("creator interruption remains a compact business failure; subsequent same instance can resume", async (t) => {
  const f = make(t, { interrupt: true });
  const r = await f.api.readCreator({ handle: "creator", target: 1 });
  assert.equal(r.status, "needsDecision");
  assert.equal(r.fresh, false);
  assert.equal(r.diagnostic.code, "connection-failed");
  f.tab.getAXState = async () => ({});
  const resumed = await f.api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
  });
  assert.equal(resumed.status, "observed");
});

test("creator delta preserves changed profile when post content is unchanged", async (t) => {
  const f = make(t);
  await f.api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
    mode: "decision",
  });
  const original = f.tab.playwright.evaluate;
  f.tab.playwright.evaluate = async (fn, args) => {
    const result = await original(fn, args);
    return fn.name === "readProfile"
      ? { ...result, biography: "新简介" }
      : result;
  };
  const result = await f.api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
    mode: "delta",
  });
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.unchangedIds, ["123"]);
  assert.equal(result.person.biography, "新简介");
  assert.equal(result.creator, undefined);
});

for (const scenario of [
  "select",
  "already-selected",
  "no-navigation",
  "missing",
  "foreign",
  "ambiguous",
  "selected-ambiguous",
  "alert",
  "not-selected",
]) {
  test(`observed creator Replies surface: ${scenario}`, async () => {
    const { PlatformCollections } =
      await import("../dist/platform-collections.js");
    let selected = ["already-selected", "selected-ambiguous"].includes(
        scenario,
      ),
      activations = 0;
    const collected = [];
    const nav = () => ({
      page: "https://x.com/creator" + (selected ? "/with_replies" : ""),
      accountHandle: "Pei",
      alerts: scenario === "alert" ? ["challenge"] : [],
      controls:
        scenario === "missing"
          ? []
          : Array.from(
              {
                length: ["ambiguous", "selected-ambiguous"].includes(scenario)
                  ? 2
                  : 1,
              },
              () => ({
                role: "tab",
                label: "回复",
                href:
                  scenario === "foreign"
                    ? "/other/with_replies"
                    : "/creator/with_replies",
                selected,
              }),
            ),
    });
    const collections = new PlatformCollections({
      ready: async () => nav(),
      observed: async () => nav(),
      choose: async (n, p) => {
        const matches = n.controls.filter(p);
        if (matches.length !== 1) return false;
        activations++;
        if (scenario !== "not-selected") selected = true;
        return true;
      },
      browser: {
        collectCreator: async (q) => {
          collected.push(q);
          return {
            profile: { handle: "creator" },
            meta: { missing: [] },
            posts: [],
            complete: true,
          };
        },
      },
    });
    const result = await collections.readCreator({
      handle: "creator",
      timeline: "replies",
      navigate: !["already-selected", "no-navigation"].includes(scenario),
    });
    const success = ["select", "already-selected"].includes(scenario);
    assert.equal(result.complete, success);
    assert.equal(result.timeline?.kind, success ? "replies" : undefined);
    assert.equal(
      activations,
      ["select", "not-selected"].includes(scenario) ? 1 : 0,
    );
    if (success) {
      assert.equal(collected.at(-1).timeline, "replies");
      assert.equal(collected.at(-1).navigate, false);
      assert.equal(result.timeline.page, "https://x.com/creator/with_replies");
    }
    if (scenario === "no-navigation") assert.equal(collected.length, 0);
  });
}

test("creator DOM accepts only exact already selected Replies route and preserves default Posts", async () => {
  const { collectCreatorDOM } = await import("../dist/creator.js");
  const v = tabFixture();
  v.tab.url = async () => "https://x.com/creator/with_replies";
  const result = await collectCreatorDOM(v.tab, "creator", {
    timeline: "replies",
    navigate: false,
    target: 1,
    maxScrolls: 0,
  });
  assert.equal(result.complete, true);
  assert.ok(!v.calls.includes("goto"));
  v.tab.url = async () => "https://x.com/creator";
  await assert.rejects(() =>
    collectCreatorDOM(v.tab, "creator", {
      timeline: "replies",
      navigate: false,
      target: 1,
      maxScrolls: 0,
    }),
  );
  await assert.rejects(() =>
    collectCreatorDOM(v.tab, "creator", {
      timeline: "replies",
      target: 1,
      maxScrolls: 0,
    }),
  );
});

for (const scenario of [
  "late-post",
  "still-empty",
  "route-change",
  "connection",
  "alert",
]) {
  test(`creator first-post timeout recovery is bounded: ${scenario}`, async () => {
    const { collectCreatorDOM } = await import("../dist/creator.js");
    const v = tabFixture({
      alerts: scenario === "alert" ? ["请验证身份"] : [],
    });
    let ax = 0,
      waits = 0,
      current = "https://x.com/creator";
    const originalEvaluate = v.tab.playwright.evaluate;
    const failure = Error(
      scenario === "connection"
        ? "browser disconnected"
        : "locator.waitFor visible timed out",
    );
    v.tab.url = async () => current;
    v.tab.getAXState = async () => {
      ax++;
      if (ax === 2 && scenario === "route-change")
        current = "https://x.com/other";
      return {};
    };
    v.tab.playwright.locator = () => ({
      first() {
        return this;
      },
      waitFor: async () => {
        waits++;
        throw failure;
      },
      getByRole: () => ({ all: async () => [] }),
    });
    v.tab.playwright.evaluate = async (fn, args) =>
      fn.name === "readCreatorHasVisiblePosts"
        ? scenario !== "still-empty"
        : originalEvaluate(fn, args);
    const run = () =>
      collectCreatorDOM(v.tab, "creator", {
        navigate: false,
        target: 1,
        maxScrolls: 0,
      });
    if (["late-post", "alert"].includes(scenario)) {
      const r = await run();
      assert.equal(r.complete, scenario === "late-post");
      if (scenario === "alert") assert.deepEqual(r.alerts, ["请验证身份"]);
      assert.equal(ax, 2);
    } else {
      await assert.rejects(run, (e) => e === failure);
      assert.equal(
        ax,
        scenario === "connection" ? 1 : scenario === "still-empty" ? 4 : 2,
      );
    }
    assert.equal(
      waits,
      scenario === "still-empty" ? 3 : 1,
      "same-page waits are bounded and never repeat navigation",
    );
    assert.ok(!v.calls.includes("goto") && !v.calls.includes("reload"));
  });
}

test("creator step journal records a durable pending stage, errors and root correlation without content", async (t) => {
  const { api, tab } = make(t);
  let release, signal;
  const entered = new Promise((resolve) => {
    signal = resolve;
  });
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  tab.url = async () => {
    signal();
    return pending;
  };
  tab.reload = async () => {
    throw new Error("private page detail");
  };
  const work = api.readCreator({
    handle: "creator",
    target: 1,
    maxScrolls: 0,
    mode: "decision",
  });
  await entered;
  const { readdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = api.usageStatus().directory;
  const records = () =>
    readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
  const initial = records().find(
    (r) => r.operation === "creator:read-initial-url",
  );
  assert(initial && initial.startedAt && !initial.finishedAt);
  assert(initial.rootCallId && initial.parentCallId);
  release("https://x.com/creator");
  const result = await work;
  assert.equal(result.status, "needsDecision");
  const all = records();
  const route = all.find((r) => r.operation === "creator:read-initial-url");
  const reload = all.find((r) => r.operation === "creator:reload-profile");
  assert.equal(route.status, "returned");
  assert.equal(reload.status, "threw");
  assert.equal(typeof reload.durationMs, "number");
  assert.equal(reload.rootCallId, route.rootCallId);
  assert(!JSON.stringify(all).includes("private page detail"));
});

test("an early host selector timeout does not abandon a profile that becomes ready on the next bounded wait", async () => {
  const { collectCreatorDOM } = await import("../dist/creator.js");
  const v = tabFixture();
  let waits = 0;
  const locator = v.tab.playwright.locator;
  const original = v.tab.playwright.evaluate;
  v.tab.playwright.locator = () => ({
    ...locator(),
    first() {
      return this;
    },
    waitFor: async () => {
      if (++waits === 1) throw Error("selector deadline exceeded");
    },
  });
  v.tab.playwright.evaluate = async (fn, args) =>
    fn.name === "readCreatorHasVisiblePosts" ? false : original(fn, args);
  const result = await collectCreatorDOM(v.tab, "creator", {
    navigate: false,
    target: 1,
    maxScrolls: 0,
  });
  assert.equal(result.complete, true);
  assert.equal(waits, 2);
  assert(!v.calls.includes("reload") && !v.calls.includes("goto"));
});

test("an explicit page error stops bounded readiness checks without repeated waits", async () => {
  const { collectCreatorDOM } = await import("../dist/creator.js");
  const v = tabFixture();
  let waits = 0;
  v.tab.getAXState = async () => "出错了。请尝试重新加载";
  v.tab.playwright.locator = () => ({
    first() {
      return this;
    },
    waitFor: async () => {
      waits++;
      throw Error("selector deadline exceeded");
    },
  });
  const original = v.tab.playwright.evaluate;
  v.tab.playwright.evaluate = async (fn, args) =>
    fn.name === "readCreatorHasVisiblePosts" ? false : original(fn, args);
  await assert.rejects(
    collectCreatorDOM(v.tab, "creator", {
      navigate: false,
      target: 1,
      maxScrolls: 0,
    }),
    /selector deadline/,
  );
  assert.equal(waits, 1);
});
