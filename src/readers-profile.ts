import type { BoundaryRecord } from "./boundary.js";

// Profile selectors are the visible controls observed in the live X workflow.
// Missing/ambiguous counters remain unknown; rounded counts carry their precision.
export function readProfile({ handle }: any = {}): any {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle ?? ""))
    throw new Error("需要已观察的X handle");
  const visible = (el: any) => el.getClientRects().length > 0;
  const main = document.querySelector("main");
  if (!main)
    return {
      handle,
      blue: null,
      relationship: "unknown",
      alerts: ["missing-main"],
      observedAt: new Date().toISOString(),
    };
  const buttons = Array.from<any>(main.querySelectorAll("button")).filter(
    visible,
  );
  const labels = buttons.map(
    (b: any) => b.getAttribute("aria-label") || b.innerText,
  );
  const relationship =
    labels.includes(`正在关注 @${handle}`) ||
    labels.includes(`取消关注 @${handle}`)
      ? "following"
      : labels.includes(`回关 @${handle}`)
        ? "follows-you"
        : labels.includes(`关注 @${handle}`)
          ? "not-following"
          : "unknown";
  const badges = buttons
    .filter(
      (b: any) => b.getAttribute("aria-label") === "提供已验证账号的详细信息。",
    )
    .map((b: any) => b.querySelector("svg"))
    .filter(Boolean);
  const blue =
    badges.length === 1
      ? [
          getComputedStyle(badges[0]).color,
          getComputedStyle(badges[0]).fill,
        ].includes("rgb(29, 155, 240)")
      : null;
  const links = Array.from<any>(main.querySelectorAll("a[href]")).filter(
    visible,
  );
  const counter = (suffixes: any) => {
    const matched = links.filter((a: any) =>
      suffixes.some(
        (s: any) =>
          a.getAttribute("href")?.toLowerCase() ===
          `/${handle}/${s}`.toLowerCase(),
      ),
    );
    const texts = [...new Set(matched.map((a: any) => a.innerText.trim()))];
    if (texts.length !== 1)
      return { value: null, text: texts, precision: "unknown" };
    const match = texts[0].match(/^([\d,.]+)\s*(万|亿|[KMB])?/i);
    const factors: BoundaryRecord = {
      万: 1e4,
      亿: 1e8,
      K: 1e3,
      M: 1e6,
      B: 1e9,
    };
    const value = match
      ? Number(match[1].replaceAll(",", "")) *
        (factors[match[2]?.toUpperCase()] ?? 1)
      : null;
    const hrefs = [...new Set(matched.map((a: any) => a.getAttribute("href")))];
    return {
      value: Number.isFinite(value) ? value : null,
      text: texts[0],
      precision: match?.[2] ? "rounded" : "exact",
      url: hrefs.length === 1 ? "https://x.com" + hrefs[0] : null,
    };
  };
  return {
    handle,
    blue,
    relationship,
    relationshipControls: labels
      .filter(
        (label: any) =>
          label.includes("@" + handle) || /取消关注|订阅/.test(label),
      )
      .slice(0, 5),
    biography:
      main.querySelector<HTMLElement>('[data-testid="UserDescription"]')
        ?.innerText ?? null,
    following: counter(["following"]),
    followers: counter(["followers", "verified_followers"]),
    alerts: Array.from<any>(
      document.querySelectorAll<HTMLElement>('[role="alert"]'),
    )
      .filter(visible)
      .map((a: any) => a.innerText),
    observedAt: new Date().toISOString(),
  };
}

// Bounded visible person cells for a currently loaded follower/following list.
export function readPeople({
  offset = 0,
  limit = 5,
  bulk = false,
}: any = {}): any {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > (bulk === true ? 100 : 5)
  )
    throw new Error("人物窗口须为非负offset及1–5 limit");
  const visible = (el: any) => el.getClientRects().length > 0;
  const cells = Array.from<any>(
    document.querySelectorAll<HTMLElement>(
      'main [data-testid="primaryColumn"] [data-testid="UserCell"]',
    ),
  ).filter(visible);
  const people = cells.slice(offset, offset + limit).map((cell: any) => {
    const links = Array.from<any>(cell.querySelectorAll("a[href]"))
      .filter(visible)
      .map((a: any) => ({ text: a.innerText, href: a.getAttribute("href") }));
    const buttons = Array.from<any>(cell.querySelectorAll("button"))
      .filter(visible)
      .map((b: any) => ({
        label: b.getAttribute("aria-label") || b.innerText,
        disabled: b.disabled,
      }));
    const handles = [
      ...new Set(
        links
          .map((a: any) => a.href?.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1])
          .filter(Boolean),
      ),
    ];
    const handle = handles.length === 1 ? String(handles[0]) : null;
    const badges = Array.from(
      cell.querySelectorAll('svg[data-testid="icon-verified"]'),
    ).filter(visible) as Element[];
    const blue =
      badges.length === 1
        ? [
            getComputedStyle(badges[0]).color,
            getComputedStyle(badges[0]).fill,
          ].includes("rgb(29, 155, 240)")
        : null;
    const labels = buttons.map((b: any) => b.label);
    const relationship = !handle
      ? "unknown"
      : labels.includes(`正在关注 @${handle}`) ||
          labels.includes(`取消关注 @${handle}`)
        ? "following"
        : labels.includes(`回关 @${handle}`)
          ? "follows-you"
          : labels.includes(`关注 @${handle}`)
            ? "not-following"
            : "unknown";
    const lines = cell.innerText.split("\n");
    const handleAt = handle
      ? lines.findIndex(
          (line: string) =>
            line.trim().toLowerCase() === `@${handle}`.toLowerCase(),
        )
      : -1;
    const intro = handleAt < 0 ? [] : lines.slice(handleAt + 1);
    while (
      intro.length &&
      [
        "",
        "关注了你",
        "正在关注",
        "回关",
        "关注",
        "Following",
        "Follow",
        "Follows you",
      ].includes(intro[0].trim())
    )
      intro.shift();
    const biography = intro.join("\n").trim() || null;
    return {
      text: cell.innerText,
      links,
      buttons,
      handle,
      url: handle ? "https://x.com/" + handle : null,
      blue,
      relationship,
      biography,
    };
  });
  return {
    page: location.href,
    people,
    offset,
    renderedPeople: cells.length,
    moreInDOM: offset + limit < cells.length,
    pageComplete: false,
    needsStateCheck: !people.length,
    missing: people.length ? [] : ["people-cells-not-found"],
    alerts: Array.from<any>(
      document.querySelectorAll<HTMLElement>('[role="alert"]'),
    )
      .filter(visible)
      .map((a: any) => a.innerText),
    observedAt: new Date().toISOString(),
  };
}

// This ranks observed clues, never a predicted follow-back probability.
export function screenCandidates(
  profiles: any,
  { minRatio = 0.8 }: any = {},
): any {
  if (!Array.isArray(profiles) || !Number.isFinite(minRatio) || minRatio <= 0)
    throw new Error("profiles数组和正minRatio必填");
  const seen = new Set();
  return profiles
    .map((p: any) => {
      const key = String(p.handle ?? "").toLowerCase();
      const duplicate = seen.has(key);
      seen.add(key);
      const following = p.following?.value,
        followers = p.followers?.value;
      const ratio =
        Number.isFinite(following) &&
        Number.isFinite(followers) &&
        followers > 0
          ? following / followers
          : null;
      const clues: any[] = [];
      if (typeof p.mutualEvidence === "string" && p.mutualEvidence.trim())
        clues.push({ kind: "explicit-mutual", evidence: p.mutualEvidence });
      if (ratio !== null && ratio >= minRatio)
        clues.push({
          kind: "following-ratio",
          ratio,
          following: p.following,
          followers: p.followers,
          evidence: "关注/粉丝比例线索，非回关概率",
        });
      const rejected = [
        duplicate && "duplicate",
        p.blue !== true && "blue-unconfirmed",
        p.relationship !== "not-following" && "relationship-ineligible",
        p.alerts?.length && "page-alert",
        !clues.length && "no-followback-clue",
        !/^[A-Za-z0-9_]{1,15}$/.test(p.handle ?? "") && "invalid-handle",
      ].filter(Boolean);
      return { ...p, ratio, clues, eligible: rejected.length === 0, rejected };
    })
    .sort(
      (a: any, b: any) =>
        Number(b.eligible) - Number(a.eligible) ||
        Number(b.clues.some((c: any) => c.kind === "explicit-mutual")) -
          Number(a.clues.some((c: any) => c.kind === "explicit-mutual")),
    );
}
