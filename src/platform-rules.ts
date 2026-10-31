export const handlePattern = /^[A-Za-z0-9_]{1,15}$/;
export function xURL(value: any): any {
  const url = new URL(
    /^x\.com\//.test(value ?? "") ? `https://${value}` : value,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "x.com" ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error("只接受已观察的https://x.com目标");
  return url;
}
export const sameHandle = (a: any, b: any) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.toLowerCase() === b.toLowerCase();
export const sameText = (a: any, b: any) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n") ===
    b.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
export const samePublishedText = (a: any, b: any) => {
  const rendered = (value: any) =>
    typeof value === "string"
      ? value
          .replace(/(https?:\/\/[^\s…]+)…(?=\s|$)/g, "$1")
          .replace(/(https?:\/\/[A-Za-z0-9.-]+(?::\d+)?)\/(?=[\s`]|$)/g, "$1")
      : value;
  return sameText(rendered(a), rendered(b));
};
export const source = (post: any, page: any) => ({
  id: post.id,
  author: post.author,
  authorIdentity: post.authorIdentity,
  datetime: post.datetime,
  url: post.primary ? new URL(post.primary, page).href : null,
  body: post.body,
  replyToId: post.replyToId,
  images: post.images ?? [],
  media: post.media ?? [],
  links: post.links ?? [],
  metrics: [
    ...new Set(
      [...(post.buttons ?? []), ...(post.metrics ?? [])]
        .map((metric: any) =>
          typeof metric === "string" ? metric : metric?.label,
        )
        .filter(
          (label: any) =>
            typeof label === "string" &&
            /(?:回复|转帖|喜欢|书签|观看|查看|引用|replies|reply|reposts?|retweets?|likes?|bookmarks?|views?|quotes?)/i.test(
              label,
            ) &&
            /\d/.test(label),
        ),
    ),
  ],
  needsExpansion: post.needsExpansion,
  missing: [
    ...(post.missing ?? []),
    ...(!post.body ? ["exact-body-unconfirmed"] : []),
  ],
});

export function emptySearch(value: any): boolean {
  if (
    !value.accountHandle ||
    value.needsStateCheck ||
    value.loading ||
    value.loadError ||
    value.alerts?.length ||
    value.posts?.length ||
    !value.emptyEvidence?.length
  )
    return false;
  try {
    return xURL(value.page).pathname === "/search";
  } catch {
    return false;
  }
}

export function matchesReviewedAssets(post: any, assets: any[] = []): boolean {
  return assets.every((asset: any) =>
    /\.mp4$/i.test(asset.path ?? "")
      ? post.media?.some((media: any) => media.kind === "video")
      : post.images?.some((image: any) => image.alt === asset.alt),
  );
}
