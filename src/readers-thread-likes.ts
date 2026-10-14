/** Read-only thread scope. No clicks, hidden state or network access. */
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
  const articles = [...column.querySelectorAll("article")].filter(visible);
  const id = (article: any) =>
    [...article.querySelectorAll("time")]
      .filter(visible)
      .map((el: any) => el.closest("a")?.getAttribute("href"))
      .find((href: any) => /^\/\w+\/status\/\d+$/.test(href ?? ""))
      ?.match(/\/status\/(\d+)/)?.[1];
  const rootIndex = articles.findIndex(
    (article) => id(article) === threadRootId,
  );
  const headings = [...column.querySelectorAll('h2,[role="heading"]')].filter(
    visible,
  );
  const boundary = headings.find((el: any) =>
    /^(?:发现更多|探索更多|更多帖子|为你推荐|Discover more|More posts|You might like)$/i.test(
      el.innerText.trim(),
    ),
  );
  const beforeBoundary = (el: any) =>
    !boundary || Boolean(el.compareDocumentPosition(boundary) & 4);
  const confirmed = rootIndex >= 0 || threadRootSeen;
  const inThread = (el: any) =>
    confirmed &&
    beforeBoundary(el) &&
    (rootIndex < 0 ||
      el === articles[rootIndex] ||
      Boolean(articles[rootIndex].compareDocumentPosition(el) & 4));
  const ads = (article: any) =>
    article.querySelector('[data-testid="placementTracking"]') ||
    [...article.querySelectorAll("span")].some(
      (el: any) =>
        visible(el) && /^(Ad|Promoted|广告|推广)$/.test(el.innerText.trim()),
    );
  const controls = [...column.querySelectorAll('button,[role="button"]')]
    .filter(visible)
    .filter(
      (el: any) => inThread(el) && !el.closest('[data-testid="tweetText"]'),
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
    threadIds: articles
      .filter((el) => inThread(el) && !ads(el))
      .map(id)
      .filter(Boolean),
    threadBoundary: Boolean(boundary),
    threadExpandControls: controls.slice(0, 20),
  };
}
