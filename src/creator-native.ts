import type { BoundaryRecord } from "./boundary.js";
import type { CreatorOptions } from "./types.js";

// Bounded collection on an already selected profile. Relative AX times stay unknown.
export async function collectCreatorNative(
  low: BoundaryRecord,
  { handle, target = 10, maxScrolls = 18, navigate = true }: CreatorOptions,
): Promise<BoundaryRecord> {
  if (
    !/^[A-Za-z0-9_]{1,15}$/.test(handle) ||
    !Number.isInteger(target) ||
    target < 1 ||
    target > 50 ||
    !Number.isInteger(maxScrolls) ||
    maxScrolls < 0 ||
    maxScrolls > 50
  )
    throw new Error("Invalid creator collection input");
  if (navigate)
    return {
      status: "needsCapability",
      complete: false,
      posts: [],
      missing: ["native.creator-navigation"],
    };
  const profile = await low.observe({ mode: "profile" });
  const expected = new RegExp(`^(?:https?://)?x\\.com/${handle}/?$`, "i");
  if (!expected.test(profile.page ?? "") || profile.needsStateCheck)
    throw new Error("creator-url-mismatch");
  const posts = new Map<string, BoundaryRecord>();
  const missing = new Set<string>();
  const labels = (profile.evidence ?? [])
    .filter((e: BoundaryRecord) => /^(?:文本|text|link) /.test(e.label))
    .map((e: BoundaryRecord) => e.label.replace(/^(?:文本|text|link) /, ""));
  const meta = {
    headerText: labels.join("\n"),
    totalPostsText:
      labels.find((label: string) => /^[\d,.万亿KMB]+ 帖子$/.test(label)) ??
      null,
    missing: [],
  };
  let scrolls = 0,
    stagnant = 0,
    last: BoundaryRecord;
  const result = () => {
    const selected = [...posts.values()].slice(0, target);
    if (selected.length < target) missing.add("creator-target-not-reached");
    for (const post of selected) {
      if (!post.datetime) missing.add("absolute-time-missing");
      if (post.needsExpansion) missing.add("post-needs-expansion");
      if (!post.body) missing.add("post-body-missing");
    }
    if (profile.alerts?.length) missing.add("platform-alert");
    return {
      profile: { ...profile, handle },
      meta,
      posts: selected,
      complete: missing.size === 0,
      missing: [...missing],
      scrolls,
      observedAt: new Date().toISOString(),
    };
  };
  for (;;) {
    const before = posts.size;
    for (let offset = 0; offset < 250; offset += 5) {
      last = await low.observe({ mode: "posts", offset, limit: 5 });
      if (
        !expected.test(last.page ?? "") ||
        last.needsStateCheck ||
        last.alerts?.length
      ) {
        missing.add("creator-window-unconfirmed");
        return { ...result(), alerts: last.alerts ?? [] };
      }
      for (const post of last.posts ?? []) {
        if (post.id && post.author?.toLowerCase() === handle.toLowerCase())
          posts.set(post.id, {
            ...post,
            body: post.text,
            primary: `https://x.com/${post.author}/status/${post.id}`,
            links: (post.evidence ?? []).flatMap((e: BoundaryRecord) => {
              const href = e.label.match(
                /Value: ((?:https?:\/\/)?(?:[\w.-]+\.[a-z]+)\/[^\s,]*)/i,
              )?.[1];
              return href
                ? [href.startsWith("http") ? href : `https://${href}`]
                : [];
            }),
            metricDescriptions: (post.evidence ?? []).map(
              (e: BoundaryRecord) => e.label,
            ),
          });
      }
      if (!last.moreInDOM || posts.size >= target) break;
    }
    stagnant = posts.size === before ? stagnant + 1 : 0;
    if (posts.size >= target || scrolls >= maxScrolls || stagnant >= 3) break;
    // Restore a fresh visible window so the scroll index is never from an old read.
    last = await low.observe({ mode: "posts", limit: 5 });
    if (
      !expected.test(last.page ?? "") ||
      last.needsStateCheck ||
      last.alerts?.length
    ) {
      missing.add("creator-window-unconfirmed");
      return result();
    }
    const control = last.posts
      ?.flatMap((post: BoundaryRecord) => post.evidence ?? [])
      .find((entry: BoundaryRecord) =>
        /^link .*Value: x\.com\/\w+\/status\/\d+(?:,|$)/.test(entry.label),
      );
    if (!control) {
      missing.add("native.creator-scroll-target");
      break;
    }
    await low.act({
      index: control.index,
      operation: "scroll",
      value: "down",
      read: { mode: "posts", limit: 5 },
    });
    scrolls++;
  }
  return result();
}
