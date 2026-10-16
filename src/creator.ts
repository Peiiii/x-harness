import { readProfile } from "./readers-profile.js";
import { readXObservation } from "./observation.js";
import type { BoundaryRecord } from "./boundary.js";
import type { CreatorOptions } from "./types.js";

// Read-only DOM metadata. Counts retain the platform's displayed precision.
export function readCreatorMeta() {
  const main = document.querySelector("main");
  if (!main)
    return { headerText: null, totalPostsText: null, missing: ["main"] };
  const first = main.querySelector("article");
  const body = main.innerText;
  const boundary = first ? body.indexOf(first.innerText) : -1;
  const headerText = boundary >= 0 ? body.slice(0, boundary) : body;
  return {
    headerText,
    totalPostsText:
      headerText.match(/([\d,.]+\s*(?:万|亿|[KMB])?)\s*帖子/)?.[0] ?? null,
    externalLinks: [
      ...new Set(
        Array.from(main.querySelectorAll<HTMLAnchorElement>("a[href]"))
          .filter((a) => !a.closest("article"))
          .map((a) => a.getAttribute("href"))
          .filter((h) => /^https?:/.test(h ?? "")),
      ),
    ],
    missing: first ? [] : ["timeline-not-loaded"],
  };
}
export function readCreatorPostExtras() {
  return Array.from(document.querySelectorAll<HTMLElement>("article"))
    .filter((a) => a.getClientRects().length)
    .map((a) => {
      const primary = Array.from(a.querySelectorAll("time"))
        .find(
          (t) =>
            t.getClientRects().length > 0 &&
            /\/status\/\d+(?:$|[/?#])/.test(
              t.closest("a")?.getAttribute("href") ?? "",
            ),
        )
        ?.closest("a")
        ?.getAttribute("href");
      const id = primary?.match(/\/status\/(\d+)/)?.[1] ?? null;
      return {
        id,
        metricDescriptions: Array.from(a.querySelectorAll("[aria-label]"))
          .map((e) => e.getAttribute("aria-label"))
          .filter((l) => /回复|喜欢|书签|次观看|次查看/.test(l ?? "")),
        analytics: Array.from(a.querySelectorAll<HTMLAnchorElement>("a[href]"))
          .filter((l) =>
            l.getAttribute("href")?.includes(`/status/${id}/analytics`),
          )
          .map((l) => ({
            label: l.getAttribute("aria-label"),
            text: l.innerText,
          })),
        images: Array.from(a.querySelectorAll("img")).map((i) => ({
          alt: i.getAttribute("alt"),
          src: i.getAttribute("src"),
        })),
        videoElements: a.querySelectorAll("video").length,
        quoted: /\n引用\n/.test(a.innerText),
        pinned: a.innerText.startsWith("已置顶"),
      };
    });
}
export async function collectCreatorDOM(
  tab: BoundaryRecord,
  handle: string,
  {
    target = 10,
    maxScrolls = 18,
    navigate = true,
    expand = true,
    timeline = "posts",
  }: Omit<CreatorOptions, "handle" | "mode"> = {},
): Promise<BoundaryRecord> {
  if (
    !["posts", "replies"].includes(timeline) ||
    (timeline === "replies" && navigate) ||
    !/^[A-Za-z0-9_]{1,15}$/.test(handle) ||
    !Number.isInteger(target) ||
    target < 1 ||
    target > 50 ||
    !Number.isInteger(maxScrolls) ||
    maxScrolls < 0 ||
    maxScrolls > 50
  )
    throw Error("Invalid creator collection input");
  const url = `https://x.com/${handle}`;
  if (navigate) {
    if ((await tab.url()) === url) await tab.reload();
    else await tab.goto(url);
  }
  const current = new URL(await tab.url());
  if (
    current.origin !== "https://x.com" ||
    current.pathname.toLowerCase() !==
      "/" +
        handle.toLowerCase() +
        (timeline === "replies" ? "/with_replies" : "")
  )
    throw Error("creator-url-mismatch");
  await tab.getAXState({ emit: false });
  await tab.playwright
    .locator("article")
    .first()
    .waitFor({ state: "visible", timeoutMs: 15000 });
  const profile = await tab.playwright.evaluate(readProfile, { handle });
  const meta = await tab.playwright.evaluate(readCreatorMeta);
  const posts = new Map<string, BoundaryRecord>();
  let scrolls = 0;
  let stagnant = 0;
  for (;;) {
    if (expand) {
      const buttons = await tab.playwright
        .locator("article")
        .getByRole("button", { name: "显示更多", exact: true })
        .all();
      for (const button of buttons) {
        try {
          await button.click({ timeoutMs: 1000 });
        } catch (error: unknown) {
          if (
            !(error instanceof Error) ||
            !/timed out|timeout/i.test(error.message)
          )
            throw error;
          /* Keep needsExpansion as evidence of incomplete text. */
        }
      }
      if (buttons.length) await tab.getAXState({ emit: false });
    }
    const extras = new Map<string, BoundaryRecord>(
      (await tab.playwright.evaluate(readCreatorPostExtras)).map(
        (p: BoundaryRecord) => [p.id, p],
      ),
    );
    const before = posts.size;
    for (let offset = 0; ; offset += 5) {
      const read = await tab.playwright.evaluate(readXObservation, {
        view: "posts",
        offset,
        limit: 5,
      });
      if (read.alerts?.length)
        return {
          profile,
          meta,
          posts: [...posts.values()],
          complete: false,
          alerts: read.alerts,
          scrolls,
          observedAt: new Date().toISOString(),
        };
      for (const post of read.posts) {
        const extra = extras.get(post.id) ?? {};
        if (
          post.author?.toLowerCase() === handle.toLowerCase() &&
          !extra.pinned &&
          !/^(.*转帖了|.*已转帖)/.test(
            (post.text ?? post.body ?? "").split("\n")[0],
          )
        )
          posts.set(post.id, { ...post, ...extra, images: post.images });
      }
      if (!read.moreInDOM || posts.size >= target) break;
      if (offset >= 245) break;
      /* finite safety bound for unusual retained DOM */
    }
    if (posts.size >= target || scrolls >= maxScrolls || stagnant >= 6) break;
    stagnant = posts.size === before ? stagnant + 1 : 0;
    const scrollPoint = await tab.playwright.evaluate(
      function readCreatorScrollPoint() {
        if (innerWidth <= 0 || innerHeight <= 0)
          throw Error("creator-viewport-unavailable");
        return [Math.floor(innerWidth / 2), Math.floor(innerHeight * 0.75)];
      },
    );
    await tab.scroll(scrollPoint, "down", 4);
    await tab.getAXState({ emit: false });
    scrolls++;
  }
  const selected = [...posts.values()]
    .sort((a, b) => (b.datetime ?? "").localeCompare(a.datetime ?? ""))
    .slice(0, target);
  const missing = [
    ...new Set(
      selected.flatMap((p) =>
        [
          !p.datetime ? "absolute-time-missing" : null,
          p.needsExpansion ? "post-needs-expansion" : null,
          !p.body ? "post-body-missing" : null,
        ].filter(Boolean),
      ),
    ),
  ];
  if (posts.size < target) missing.push("creator-target-not-reached");
  return {
    profile,
    meta,
    posts: selected,
    complete: missing.length === 0,
    missing,
    scrolls,
    observedAt: new Date().toISOString(),
  };
}
