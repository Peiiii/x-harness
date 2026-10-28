import test from "node:test";
import assert from "node:assert/strict";
import { createNativeXBrowser } from "../dist/browser-native.js";
const home = (text, extra = "") => `0 标准窗口 X, URL: x.com/home
  1 HTML 内容 X, URL: x.com/home
    2 link 个人资料, Value: x.com/sample
    3 文本输入区 (settable) 帖子文本, Value: ${text}
    4 按钮 发帖
${extra}`;
for (const mode of ["clear", "retained", "changed", "autocomplete"])
  test(`native submission waits for actual editor completion without a second click: ${mode}`, async () => {
    let clicks = 0,
      reads = 0,
      escape = 0,
      guards = 0;
    const app = {
      getAXState: async () => {
        reads++;
        return home(
          clicks && (mode === "clear" || mode === "autocomplete") && reads > 4
            ? ""
            : clicks && mode === "changed"
              ? "other"
              : "reviewed",
          mode === "autocomplete" && !escape
            ? "    8 列表框\n      9 文本 (selected) #sample"
            : "",
        );
      },
      click: async () => {
        clicks++;
      },
      pressKey: async (key) => {
        assert.equal(key, "Escape");
        escape++;
      },
      paste: async () => {},
    };
    const b = createNativeXBrowser(app);
    await b.observe({ view: "composer" });
    const run = () =>
      b.act({
        operation: "submitPost",
        beforeSubmit: async () => {
          guards++;
        },
      });
    if (["clear", "autocomplete"].includes(mode)) await run();
    else await assert.rejects(run());
    assert.equal(clicks, 1);
    assert.equal(guards, 1);
    assert.equal(escape, mode === "autocomplete" ? 1 : 0);
    assert.ok(reads >= (mode === "changed" ? 2 : 3));
  });
