// Native Chrome fallback: process a suppressed full AX observation in the REPL.
// Keeps visible leaf evidence and action indexes; never reconstructs a diff as a full page.

import { parseAXNodes, createAXTree } from "./readers-ax-tree.js";
import {
  projectAXFilepicker,
  projectAXMedia,
  projectAXNavigation,
  projectAXPeople,
  projectAXPosts,
  projectAXProfile,
  projectAXComposer,
} from "./readers-ax-views.js";
/** Corroborate a redacted web-area URL only from the same full native frame. */
export function corroborateNativeURL(state: string): string {
  const lines = state.split("\n");
  const web = lines.filter((x) =>
    /^\s*\d+ (?:HTML 内容|AXWebArea) .*, URL: …$/.test(x),
  );
  const address = lines.filter((x) =>
    /^\s*\d+ 文本栏 .*地址和搜索栏, Value: (?:https?:\/\/)?x\.com\//.test(x),
  );
  const selected = lines.filter((x) =>
    /^\s*\d+ 标签 \(selected, settable, boolean\) .*Value: on$/.test(x),
  );
  if (
    web.length !== 1 ||
    address.length !== 1 ||
    selected.length !== 1 ||
    /The focused UI element is \d+ 文本栏 .*地址和搜索栏/.test(state) ||
    /^\s*\d+ 按钮 停止(?:,|$)/m.test(state)
  )
    return state;
  const title = web[0].match(/(?:HTML 内容|AXWebArea) (.*), URL: …$/)?.[1];
  const url = address[0].match(/Value: ((?:https?:\/\/)?x\.com\/[^\s,]*)/)?.[1];
  const selectedTitle = selected[0]
    .replace(/^\s*\d+ 标签 \(selected, settable, boolean\) /, "")
    .split(/ - |, Value:/)[0];
  if (!title || !url || title !== selectedTitle || !/(?:^| )\/ X$/.test(title))
    return state;
  // Only the proven web-area node is normalized; account/body/target remain independently checked.
  return lines
    .map((x) => (x === web[0] ? x.replace(/URL: …$/, "URL: " + url) : x))
    .join("\n");
}
export function readAX(
  state: any,
  {
    mode = "posts",
    offset = 0,
    limit = 1,
    targetId = "",
    targetHandle = "",
  }: any = {},
): any {
  if (
    ![
      "posts",
      "composer",
      "profile",
      "people",
      "navigation",
      "filepicker",
      "media",
    ].includes(mode)
  )
    throw new Error("AX mode必须为posts/composer/profile/people/navigation");
  if (typeof state !== "string") throw new Error("AX state必须为完整字符串");
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 5 ||
    (targetId && !/^\d+$/.test(targetId))
  )
    throw new Error("无效AX读取窗口或ID");
  if (targetHandle && (mode !== "people" || !/^\w{1,15}$/.test(targetHandle)))
    throw new Error("targetHandle必须为people模式已观察的handle");
  const alertLines = state
    .split("\n")
    .filter((line: any) =>
      /抱歉.*限制|速度限制|请求异常|访问受限|验证码|验证挑战|登录以继续|captcha|rate limit/i.test(
        line,
      ),
    );
  const unknown = (reason: any) => ({
    mode,
    posts: [],
    evidence: [],
    alerts: alertLines,
    missing: [reason],
    needsStateCheck: true,
    pageComplete: false,
  });
  if (
    /following is a diff|Removed element IDs:|no change in the accessibility tree/i.test(
      state,
    )
  )
    return unknown("full-ax-required");
  state = corroborateNativeURL(state);
  const page = state.match(/URL:\s*((?:https?:\/\/)?x\.com\/[^\s,]*)/)?.[1];
  if (!page && !["navigation", "filepicker"].includes(mode))
    return unknown("x-page-unconfirmed");
  const nodes = parseAXNodes(state);
  const tree = createAXTree(nodes);
  const context = {
    mode,
    page,
    offset,
    limit,
    targetId,
    targetHandle,
    unknown,
    alertLines,
  };
  if (mode === "filepicker") return projectAXFilepicker(tree, context);
  if (mode === "media") return projectAXMedia(tree, context);
  if (mode === "navigation") return projectAXNavigation(tree, context);
  if (mode === "people") return projectAXPeople(tree, context);
  if (mode === "posts") return projectAXPosts(tree, context);
  if (mode === "profile") return projectAXProfile(tree, context);
  return projectAXComposer(tree, context);
}
