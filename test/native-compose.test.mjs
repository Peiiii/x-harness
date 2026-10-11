import test from "node:test";
import assert from "node:assert/strict";
import { readAX } from "../dist/diagnostics.js";
const composer = `0 标准窗口 X, URL: x.com/compose/post
  1 文本栏 地址和搜索栏, Value: x.com/compose/post
  2 HTML 内容 X, URL: x.com/compose/post
    3 container
      4 文本输入区 (settable) 帖子文本, Value:
      5 按钮 添加照片或视频
      6 按钮 (disabled) 发帖
`;
test("native composer without AX dialog is bounded by exact route and unique editor/submit", () => {
  const actual = readAX(composer, { mode: "composer" });
  assert.equal(actual.needsStateCheck, false);
  assert.ok(actual.evidence.some((e) => e.index === 4));
  assert.ok(!actual.evidence.some((e) => e.index === 1));
  for (const bad of [
    composer.replaceAll("/compose/post", "/home"),
    composer.replace("6 按钮 (disabled) 发帖", "6 文本 发帖"),
    composer + "    7 文本输入区 (settable) 帖子文本, Value: x\n",
  ])
    assert.equal(readAX(bad, { mode: "composer" }).needsStateCheck, true);
});
test("native file picker rejects browser page and requires observed OS dialog", () => {
  assert.equal(readAX(composer, { mode: "filepicker" }).needsStateCheck, true);
  const actual = readAX(
    "0 标准窗口 X\n  1 sheet 打开\n    2 文本栏 文件名, Value: \n    3 按钮 打开\n",
    { mode: "filepicker" },
  );
  assert.equal(actual.needsStateCheck, false);
  const osRoot = readAX(
    "0 表单 Description: 打开, ID: open-panel\n  1 文本栏 URL: file:///private-file, Value: private-file\n  2 文本栏 文件名, Value: target\n  3 按钮 打开\n",
    { mode: "filepicker" },
  );
  assert.equal(osRoot.needsStateCheck, false);
  assert.ok(!osRoot.evidence.some((e) => e.index === 1));
});
test("native image description excludes address bar and requires media route and save", () => {
  const ax =
    "0 标准窗口 X, URL: x.com/compose/post/media\n  1 文本栏 地址和搜索栏, Value: x.com/compose/post/media\n  2 HTML 内容 X, URL: x.com/compose/post/media\n    3 标签 编辑图片描述\n    4 文本输入区 (settable) 描述, Value: test\n    5 按钮 保存\n";
  const r = readAX(ax, { mode: "media" });
  assert.equal(r.needsStateCheck, false);
  assert.equal(r.evidence.filter((e) => /文本输入区/.test(e.label)).length, 1);
  assert.ok(!r.evidence.some((e) => e.index === 1));
  assert.equal(
    readAX(ax.replaceAll("/media", ""), { mode: "media" }).needsStateCheck,
    true,
  );
});

import { fixture } from "./fixtures.mjs";
for (const mode of ["valid", "wrong-action", "expired", "missing-proof"])
  test(`independent original honors only its manual window: ${mode}`, async (t) => {
    const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
    const now = Date.parse("2026-10-11T14:25:00Z");
    f.setNow(now);
    f.edit((s) => {
      s.scopeKinds = ["reply"];
      s.scopeEvidenceRef = f.proof;
    });
    const action = f.read().actions[0];
    const result = await f.harness.publishPost({
      taskId: "round-1",
      draftPath: f.draft,
      preparedAction: action,
      independentExecution: {
        tabId: "isolated-tab",
        evidenceRef: f.proof,
        scopeEvidenceRef: f.proof,
        windowAuthorization: {
          actionId: mode === "wrong-action" ? "other" : action.id,
          userAuthorized: true,
          expiresAt: new Date(
            now + (mode === "expired" ? -1 : 60000),
          ).toISOString(),
          evidenceRef: mode === "missing-proof" ? "/missing" : f.proof,
        },
      },
    });
    assert.equal(f.writes.length, mode === "valid" ? 1 : 0);
    if (mode === "valid") assert.equal(result.status, "verified");
  });
