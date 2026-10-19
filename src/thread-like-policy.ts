import { createHash } from "node:crypto";
import { xURL } from "./platform-rules.js";
import type { ThreadLikeOptions } from "./types.js";

export function threadLikeConfig(args: ThreadLikeOptions) {
  const url = xURL(args.url);
  const rootId = url.pathname.match(
    /^\/[A-Za-z0-9_]{1,15}\/status\/(\d+)\/?$/,
  )?.[1];
  if (!rootId || url.search || url.hash) throw Error("thread-like-url-invalid");
  const config = {
    url: `https://x.com${url.pathname.replace(/\/$/, "")}`,
    rootId,
    reuseCurrentPage: args.reuseCurrentPage === true,
    sampleRate: args.sampleRate ?? 0.6,
    maxLikes: args.maxLikes ?? 20,
    maxPages: args.maxPages ?? 40,
    timeBudgetMs: args.timeBudgetMs ?? 120000,
  };
  if (
    !Number.isFinite(config.sampleRate) ||
    config.sampleRate < 0 ||
    config.sampleRate > 1
  )
    throw Error("thread-like-sample-invalid");
  for (const [key, max] of [
    ["maxLikes", 100],
    ["maxPages", 200],
    ["timeBudgetMs", 600000],
  ] as const)
    if (!Number.isInteger(config[key]) || config[key] < 1 || config[key] > max)
      throw Error("thread-like-budget-invalid");
  if (args.batchId !== undefined && !args.batchId.trim())
    throw Error("thread-like-batch-invalid");
  return config;
}
export function threadLikeFraction(seed: string, id: string, purpose: string) {
  return (
    createHash("sha256")
      .update(`${seed}:${purpose}:${id}`)
      .digest()
      .readUInt32BE(0) / 4294967296
  );
}
export function latestReactionTime(state: any) {
  return Math.max(
    0,
    ...(state.reactions ?? []).map((a: any) => Date.parse(a.intentAt) || 0),
    ...(state.actions ?? [])
      .filter(
        (a: any) =>
          a.kind === "reply" &&
          ["intent", "unknown", "verified"].includes(a.status),
      )
      .map((a: any) => Date.parse(a.intentAt) || 0),
  );
}
export function likeState(post: any): "liked" | "unliked" | "unconfirmed" {
  const buttons = (post?.buttons ?? []).filter((b: any) =>
    /(?:喜欢|Likes?|Unlike)/i.test(b.label),
  );
  if (buttons.length !== 1 || buttons[0].disabled) return "unconfirmed";
  return /喜欢了|取消喜欢|Unlike|Liked/i.test(buttons[0].label)
    ? "liked"
    : "unliked";
}
