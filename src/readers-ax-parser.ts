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
