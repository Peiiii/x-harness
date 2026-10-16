/** Read-only thread scope. Uses ordered DOM rows supported by CUA's page scope. */
export function readThreadLikeSurface({
  threadRootId,
  threadRootSeen = false,
}: any) {
  if (!threadRootId) return {};
  const visible = (el: any) => el.getClientRects().length > 0;
  const column = document.querySelector('main [data-testid="primaryColumn"]');
  const atRoot = new URL(location.href).pathname.endsWith(
    `/status/${threadRootId}`,
  );
  if (!column || !atRoot) return { threadConfirmed: false, threadIds: [] };
  // CUA's read-only DOM does not implement compareDocumentPosition. One ordered
  // query preserves the actual article/disclosure/recommendation boundaries.
  const rows = Array.from<any>(
    column.querySelectorAll(
      'article,h2,[role="heading"],button,[role="button"]',
    ),
  ).filter(visible);
  const isArticle = (el: any) => el.tagName === "ARTICLE";
  const isHeading = (el: any) =>
    el.tagName === "H2" || el.getAttribute("role") === "heading";
  const id = (article: any) =>
    [...article.querySelectorAll("time")]
      .filter(visible)
      .map((el: any) => el.closest("a")?.getAttribute("href"))
      .find((href: any) =>
        /^\/\w+\/status\/\d+(?:\/history)?$/.test(href ?? ""),
      )
      ?.match(/\/status\/(\d+)/)?.[1];
  const rootIndex = rows.findIndex(
    (el) => isArticle(el) && id(el) === threadRootId,
  );
  const boundaryIndex = rows.findIndex(
    (el) =>
      isHeading(el) &&
      /^(?:发现更多|探索更多|更多帖子|为你推荐|Discover more|More posts|You might like)$/i.test(
        el.innerText.trim(),
      ),
  );
  const confirmed = rootIndex >= 0 || threadRootSeen;
  const inThread = (index: number) =>
    confirmed &&
    (rootIndex < 0 || index >= rootIndex) &&
    (boundaryIndex < 0 || index < boundaryIndex);
  const ads = (article: any) =>
    article.querySelector('[data-testid="placementTracking"]') ||
    [...article.querySelectorAll("span")].some(
      (el: any) =>
        visible(el) && /^(Ad|Promoted|广告|推广)$/.test(el.innerText.trim()),
    );
  const controls = rows
    .filter(
      (el: any, index) =>
        inThread(index) &&
        (el.tagName === "BUTTON" || el.getAttribute("role") === "button") &&
        !el.closest('[data-testid="tweetText"]'),
    )
    .map((el: any) => ({
      label: el.getAttribute("aria-label") || el.innerText.trim(),
      disabled: el.hasAttribute("disabled"),
    }))
    .filter(
      (control) =>
        !control.disabled &&
        /^(?:显示回复|显示更多回复|查看回复|查看其他回复|Show replies|Show more replies|View replies|Show additional replies)$/i.test(
          control.label,
        ),
    );
  return {
    threadConfirmed: confirmed,
    threadRootPresent: rootIndex >= 0,
    threadIds: rows
      .filter((el, index) => isArticle(el) && inThread(index) && !ads(el))
      .map(id)
      .filter(Boolean),
    threadBoundary: boundaryIndex >= 0,
    threadExpandControls: controls.slice(0, 20),
  };
}
