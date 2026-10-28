import test from "node:test";
import assert from "node:assert/strict";
import { readAX } from "../dist/diagnostics.js";
import { createNativeXBrowser } from "../dist/browser-native.js";
import { fixture } from "./fixtures.mjs";
const home = `0 标准窗口 X, URL: x.com/home
  1 HTML 内容 X, URL: x.com/home
    2 link 个人资料, Value: x.com/sample
    3 文本输入区 (settable) 帖子文本, Value: first

third
    4 按钮 发帖
    5 container Feed @other
      6 link post, Value: x.com/other/status/123
      7 按钮 回复
`;
test("native home isolates composer from feed and preserves exact paragraphs", async () => {
  const r = readAX(home, { mode: "composer" });
  assert.equal(r.needsStateCheck, false);
  assert.deepEqual(
    r.evidence.map((e) => e.index),
    [3, 4],
  );
  const browser = createNativeXBrowser({ getAXState: async () => home });
  const observation = await browser.observe({ view: "composer" });
  assert.equal(observation.accountHandle, "sample");
  assert.equal(observation.editorText, "first\n\nthird");
  assert.equal(observation.replyToId, null);
});
test("home refuses missing identity, missing submit, ambiguous editor and arbitrary route", () => {
  for (const s of [
    home.replace("2 link 个人资料", "2 link other"),
    home.replace("4 按钮 发帖", "4 文本 发帖"),
    home + "    8 文本输入区 (settable) 帖子文本, Value: other\n",
    home.replaceAll("/home", "/explore"),
  ]) {
    assert.equal(readAX(s, { mode: "composer" }).needsStateCheck, true);
  }
});
test("original accepts observed home but refuses an arbitrary compose URL", async (t) => {
  for (const route of ["home", "explore"]) {
    const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
    f.edit((s) => {
      s.actions[0].composeURL = "https://x.com/" + route;
    });
    const result = await f.harness.publishPost({
      taskId: "round-1",
      draftPath: f.draft,
    });
    assert.equal(f.writes.length, route === "home" ? 1 : 0);
    if (route === "explore") assert.equal(result.status, "needsDecision");
  }
});

import { PlatformWriting } from "../dist/platform-writing.js";
for (const mode of [
  "native-lines",
  "wrong-character",
  "joined-lines",
  "wrong-account",
  "dom-lines",
]) {
  test(`native editor representation retains content and account guards: ${mode}`, async () => {
    let filled = false,
      writes = 0;
    const writing = new PlatformWriting({
      observed: async () => ({
        editorText: !filled
          ? ""
          : mode === "wrong-character"
            ? "first\nchanged"
            : mode === "joined-lines"
              ? "firstthird"
              : "first\nthird",
        accountHandle: mode === "wrong-account" ? "other" : "sample",
        editorTextRepresentation:
          mode === "dom-lines" ? undefined : "native-ax-lines",
        needsStateCheck: false,
        alerts: [],
      }),
      browser: {
        act: async (q) => {
          if (q.operation === "fillComposer") filled = true;
          else if (q.operation === "submitPost") writes++;
        },
      },
    });
    const action = {
      kind: "original",
      text: "first\n\nthird",
      accountHandle: "sample",
    };
    if (mode === "native-lines") await writing.compose(action);
    else await assert.rejects(writing.compose(action), /提交前账号/);
    assert.equal(writes, mode === "native-lines" ? 1 : 0);
  });
}

for (const mode of [
  "focused",
  "autocomplete",
  "absent",
  "actor-changed",
  "body-changed",
  "guard-refused",
]) {
  test(`native keyboard activates only fresh unchanged focused submit: ${mode}`, async () => {
    const calls = [];
    let tabs = 0;
    const app = {
      getAXState: async () => {
        let ax =
          home +
          (mode === "autocomplete"
            ? "    8 列表框\n      9 文本 (selected) #sample\n"
            : "");
        if (calls.includes("Return"))
          ax = ax.replace("Value: first\n\nthird", "Value: ");
        if (tabs && mode === "actor-changed")
          ax = ax.replace("x.com/sample", "x.com/other");
        if (tabs && mode === "body-changed")
          ax = ax.replace("Value: first", "Value: changed");
        return (
          ax +
          `\nThe focused UI element is ${tabs && mode !== "absent" ? "4 按钮 发帖" : "3 文本输入区 (settable) 帖子文本"}`
        );
      },
      pressKey: async (key) => {
        calls.push(key);
        if (key === "Tab") tabs++;
      },
      click: async () => {
        throw Error("must never click");
      },
      paste: async () => {},
    };
    const b = createNativeXBrowser(app);
    await b.observe({ view: "composer" });
    const run = () =>
      b.act({
        operation: "submitPost",
        activation: "keyboard",
        beforeSubmit: async () => {
          calls.push("guard");
          if (tabs && mode === "guard-refused") throw Error("guard refused");
        },
      });
    if (["focused", "autocomplete"].includes(mode)) {
      await run();
      assert.deepEqual(calls.slice(-2), ["guard", "Return"]);
    } else await assert.rejects(run());
    assert.equal(
      calls.filter((x) => x === "Escape").length,
      mode === "autocomplete" ? 1 : 0,
    );
    if (["absent", "actor-changed", "body-changed"].includes(mode))
      assert.equal(calls.filter((x) => x === "guard").length, 0);
    assert.equal(
      calls.filter((x) => x === "Return").length,
      ["focused", "autocomplete"].includes(mode) ? 1 : 0,
    );
  });
}

test("native public body preserves paragraphs and excludes popup metric text", () => {
  const ax = `0 标准窗口 X, URL: x.com/sample/status/456
  1 container sample @sample
    2 link 下午1:05 · 2026年10月11日, Value: x.com/sample/status/456
    3 文本 first

third

    4 弹出式按钮 2 次转帖。转帖
      5 文本 2
    6 按钮 3 喜欢次数。喜欢
      7 文本 3
`;
  const p = readAX(ax, { mode: "posts", targetId: "456" }).posts[0];
  assert.equal(p.text, "first\n\nthird");
  assert.equal(p.datetime, "2026-10-11T05:05:00.000Z");
});

test("native refresh executes an observed reload and exposes an actual public URL", async () => {
  let clicks = 0;
  const ax = `0 标准窗口 X, URL: x.com/sample
  1 按钮 重新加载
  2 HTML 内容 X, URL: x.com/sample
    3 container sample @sample
      4 link 上午8:42 · 2026年10月26日, Value: x.com/sample/status/456
      5 文本 Body
`;
  const b = createNativeXBrowser({
    getAXState: async () => ax,
    click: async (index) => {
      assert.equal(index, 1);
      clicks++;
    },
  });
  assert.deepEqual(b.capabilities("refreshPosts"), []);
  await b.act({ operation: "refreshPosts" });
  assert.equal(clicks, 1);
  const result = await b.observe({ view: "posts", limit: 5 });
  assert.equal(result.posts[0].primary, "https://x.com/sample/status/456");
});

test("native trailing hashtag paragraph is complete only with observed sibling layout", () => {
  const ax = `0 标准窗口 X, URL: x.com/sample/status/456
  1 container sample @sample
    2 link 下午1:05 · 2026年10月11日, Value: x.com/sample/status/456
    3 container
      4 文本 first

third

      5 link #one, Value: x.com/hashtag/one
      6 link #two, Value: x.com/hashtag/two
    7 按钮 0 回复。回复
`;
  const p = readAX(ax, { mode: "posts", targetId: "456" }).posts[0];
  assert.equal(p.text, "first\n\nthird\n\n#one #two");
  assert.equal(p.needsExpansion, false);
  const bad = readAX(ax.replace("third\n\n", "third\n"), {
    mode: "posts",
    targetId: "456",
  }).posts[0];
  assert.equal(bad.needsExpansion, true);
});

const redactedHome = `0 标准窗口 主页 / X, URL: …
  1 文本栏 (settable) 地址和搜索栏, Value: x.com/home, Placeholder: search
  2 HTML 内容 主页 / X, URL: …
    3 link 个人资料, Value: x.com/sample
    4 文本输入区 (settable) 帖子文本, Value: hello
    5 按钮 发帖
  6 标签 (selected, settable, boolean) 主页 / X - memory, Value: on
The focused UI element is 4 文本输入区 (settable) 帖子文本, Value: hello
`;
test("redacted native route requires same-frame address, selected title and blurred omnibox", () => {
  assert.equal(
    readAX(redactedHome, { mode: "composer" }).needsStateCheck,
    false,
  );
  for (const value of [
    redactedHome.replace("主页 / X - memory", "other / X - memory"),
    redactedHome.replace(
      "is 4 文本输入区",
      "is 1 文本栏 (settable) 地址和搜索栏",
    ),
    redactedHome + "  7 HTML 内容 主页 / X, URL: …\n",
    redactedHome + "  7 按钮 停止\n",
    redactedHome.replace("Value: x.com/home", "Value: other.example/home"),
  ])
    assert.equal(readAX(value, { mode: "composer" }).needsStateCheck, true);
});
