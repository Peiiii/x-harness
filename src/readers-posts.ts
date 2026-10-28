// Self-contained, read-only DOM function for cua_repl's documented evaluate.
export function readPosts({
  offset = 0,
  limit = 5,
  targetId = "",
  threadRootId = "",
  bulk = false,
}: any = {}): any {
  if (
    !Number.isInteger(offset) ||
    offset < 0 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > (threadRootId ? 1000 : bulk === true ? 50 : 5)
  )
    throw new Error("offset>=0；limit为1～5");
  if (threadRootId && !/^\d+$/.test(threadRootId))
    throw new Error("threadRootId必须是数字公开ID");
  if (targetId && !/^\d+$/.test(targetId))
    throw new Error("targetId必须是数字公开ID");
  const visible = (el: any) => el.getClientRects().length > 0;
  const primaryTime = (a: any) =>
    Array.from<any>(a.querySelectorAll("time")).find(
      (t: any) =>
        visible(t) &&
        /\/status\/\d+(?:$|[/?#])/.test(
          t.closest("a")?.getAttribute("href") ?? "",
        ),
    ) ?? null;
  const all = Array.from<any>(
    document.querySelectorAll<HTMLElement>("article"),
  ).filter(visible);
  const firstTime = all[0] && primaryTime(all[0]);
  const candidates = targetId
    ? all.filter((a: any) => {
        const primary = primaryTime(a)?.closest("a")?.getAttribute("href");
        return (
          primary && new RegExp(`/status/${targetId}(?:$|[/?#])`).test(primary)
        );
      })
    : all;
  const posts = candidates.slice(offset, offset + limit).map((a: any) => {
    const time = primaryTime(a);
    const primary = time?.closest("a")?.getAttribute("href") ?? null;
    const links = [
      ...new Set(
        Array.from<any>(a.querySelectorAll("a[href]"))
          .filter(visible)
          .map((l: any) => l.getAttribute("href")),
      ),
    ];
    const buttons = Array.from<any>(a.querySelectorAll("button"))
      .filter(visible)
      .map((b: any) => ({
        label: b.getAttribute("aria-label") || b.innerText,
        disabled: b.hasAttribute("disabled"),
      }));
    const text = a.innerText;
    const datetime = time?.getAttribute("datetime") ?? null;
    const id = primary?.match(/\/status\/(\d+)/)?.[1] ?? null;
    const author = primary?.match(/\/([^/]+)\/status\//)?.[1] ?? null;
    const headers = Array.from<any>(
      a.querySelectorAll('[data-testid="User-Name"]'),
    )
      .filter(visible)
      .filter((header: any) =>
        Array.from<any>(header.querySelectorAll("a[href]")).some(
          (link: any) =>
            visible(link) &&
            link.getAttribute("href")?.toLowerCase() ===
              `/${author}`.toLowerCase(),
        ),
      );
    const header = headers.length === 1 ? headers[0] : null;
    const badges = header
      ? Array.from<any>(
          header.querySelectorAll('svg[data-testid="icon-verified"]'),
        )
          .filter(visible)
          .filter((badge: any) => {
            const style = getComputedStyle(badge);
            return style.visibility !== "hidden" && style.opacity !== "0";
          })
          .filter((badge: any) =>
            /^(?:认证账号|Verified account)$/i.test(
              badge.getAttribute("aria-label") ?? "",
            ),
          )
      : [];
    const blue =
      badges.length === 1 &&
      [
        getComputedStyle(badges[0]).color,
        getComputedStyle(badges[0]).fill,
      ].includes("rgb(29, 155, 240)")
        ? true
        : null;
    const names = header
      ? Array.from<any>(header.querySelectorAll("a[href]"))
          .filter(
            (link: any) =>
              visible(link) &&
              link.getAttribute("href")?.toLowerCase() ===
                `/${author}`.toLowerCase(),
          )
          .map((link: any) => link.innerText?.trim())
          .filter((name: any) => name && !name.startsWith("@"))
      : [];
    const authorIdentity = author
      ? {
          handle: author,
          profileURL: `https://x.com/${author}`,
          name: names.length === 1 ? names[0] : null,
          source: "post-card",
          blue,
          missing: !header
            ? ["unique-author-header-unconfirmed"]
            : blue !== true
              ? ["blue-check-unconfirmed"]
              : [],
        }
      : undefined;
    const images = Array.from<any>(
      a.querySelectorAll('[data-testid="tweetPhoto"] img'),
    )
      .filter(visible)
      .map((img: any) => ({
        alt: img.getAttribute("alt"),
        src: img.getAttribute("src"),
      }));
    const media = Array.from<any>(
      a.querySelectorAll('[data-testid="videoPlayer"],video'),
    )
      .filter(visible)
      .map((el: any) => ({
        kind: "video",
        label: el.getAttribute("aria-label"),
        poster: el.getAttribute("poster"),
        requiresViewing: true,
      }));
    return {
      id,
      author,
      authorIdentity,
      datetime,
      primary,
      text,
      links,
      buttons,
      // View/quote counts may be visible links rather than buttons; collect in this same read.
      metrics: [
        ...buttons,
        ...Array.from<any>(
          a.querySelectorAll('a[href$="/analytics"],a[href$="/quotes"]'),
        )
          .filter(visible)
          .map((link: any) => ({
            label:
              link.getAttribute("aria-label") ||
              `${link.getAttribute("href").endsWith("/analytics") ? "观看" : "引用"} ${link.innerText}`,
          })),
      ],
      images,
      media,
      needsExpansion: /显示更多|Show more/i.test(text),
      missing: [
        !id && "id",
        !author && "author",
        !datetime && "datetime",
        !text && "text",
      ].filter(Boolean),
    };
  });
  const versionLinks = Array.from<any>(
    document.querySelectorAll<HTMLElement>("a[href]"),
  )
    .filter(visible)
    .filter((a: any) =>
      /最新版本|查看最新帖子|Latest version|View latest/i.test(a.innerText),
    )
    .slice(0, 5)
    .map((a: any) => ({ label: a.innerText, href: a.getAttribute("href") }));
  const emptyEvidence =
    all.length === 0
      ? [
          ...new Set(
            Array.from<any>(document.querySelectorAll<HTMLElement>("main span"))
              .filter(visible)
              .map((e: any) => e.innerText?.trim())
              .filter(
                (text: any) =>
                  text &&
                  text.length <= 400 &&
                  !text.includes("\n") &&
                  /^(?:没有.*结果|未找到.*结果|No results for)/i.test(text),
              ),
          ),
        ].slice(0, 2)
      : [];
  return {
    firstRenderedId:
      firstTime
        ?.closest("a")
        ?.getAttribute("href")
        ?.match(/\/status\/(\d+)/)?.[1] ?? null,
    renderedArticles: all.length,
    renderedIds: all
      .map(
        (a) =>
          primaryTime(a)
            ?.closest("a")
            ?.getAttribute("href")
            ?.match(/\/status\/(\d+)/)?.[1],
      )
      .filter(Boolean),
    viewportScrollTop: document.scrollingElement?.scrollTop,
    atRenderedTail:
      Boolean(document.scrollingElement) &&
      document.scrollingElement!.scrollTop +
        document.scrollingElement!.clientHeight >=
        document.scrollingElement!.scrollHeight - 2,
    loading: Array.from(document.querySelectorAll('[role="progressbar"]')).some(
      (el: any) =>
        visible(el) &&
        getComputedStyle(el).visibility !== "hidden" &&
        getComputedStyle(el).opacity !== "0" &&
        !el.closest('[aria-hidden="true"]'),
    ),
    matched: candidates.length,
    offset,
    moreInDOM: candidates.length > offset + posts.length,
    pageComplete: false,
    needsStateCheck: all.length === 0 && emptyEvidence.length === 0,
    posts,
    versionLinks,
    emptyEvidence,
    alerts: Array.from<any>(
      document.querySelectorAll<HTMLElement>('[role="alert"]'),
    )
      .filter(visible)
      .map((e: any) => e.innerText),
  };
}

export function changes(
  result: any,
  cache: any,
  page: any,
  fresh: any = false,
): any {
  const unchangedIds: any[] = [];
  const posts = result.posts.filter((post: any) => {
    if (!post.id) return true;
    const key = `${page}|${post.id}`;
    const value = JSON.stringify(post);
    const changed = cache[key] !== value;
    cache[key] = value;
    if (!fresh && !changed) unchangedIds.push(post.id);
    return fresh || changed;
  });
  const outputChars = JSON.stringify({ ...result, posts, unchangedIds }).length;
  const optimizationHint =
    outputChars > 8000
      ? posts.length > 1
        ? "缩小读取窗口或按已观察ID定向读取；保留完整正文"
        : "单篇证据本身长，保留全文，不截断"
      : null;
  return {
    ...result,
    posts,
    unchanged: result.posts.length - posts.length,
    unchangedIds,
    fresh,
    outputChars,
    optimizationHint,
  };
}
