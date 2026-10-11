import test from "node:test";
import assert from "node:assert/strict";
import { readAX } from "../dist/diagnostics.js";
const sample = (time) => `0 标准窗口 帖子, URL: x.com/Ax886333/status/123
  1 container Ax @Ax886333 ${time} 原文 1 回复
    2 link Ax, Value: x.com/Ax886333
    3 link ${time}, Value: x.com/Ax886333/status/123
    4 文本 原文
    5 文本 1
    6 按钮 1 回复。回复
      7 文本 1
    8 按钮 2 喜欢次数。喜欢
      9 文本 2`;
test("native post keeps numeric body text, excludes button counts, and reports actual minute precision", () => {
  const p = readAX(sample("下午9:22 · 2026年10月11日"), { limit: 1 }).posts[0];
  assert.equal(p.text, "原文\n1");
  assert.equal(p.datetime, "2026-10-11T13:22:00.000Z");
  assert.equal(p.datetimePrecision, "minute");
});
test("relative native time remains unknown instead of fabricated", () => {
  const p = readAX(sample("1小时 前"), { limit: 1 }).posts[0];
  assert.equal(p.datetime, null);
  assert.ok(p.missing.includes("datetime"));
});
