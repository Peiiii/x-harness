import type { SourceLinkEvidence } from "./types.js";

/** Only restore uniquely observed fragments; never weaken whole-body equality. */
export function matchesRenderedLinks(
  reviewed: string,
  post: { body?: string; links?: string[] },
  links: SourceLinkEvidence[] | undefined,
  evidenceExists: (ref: string) => boolean,
): boolean {
  if (!Array.isArray(links) || !links.length || typeof post.body !== "string")
    return false;
  const reviewedURLs = reviewed.match(/https:\/\/[^\s]+/g) ?? [];
  const hrefs = new Set<string>(),
    displays = new Set<string>(),
    urls = new Set<string>();
  const replacements: { start: number; end: number; url: string }[] = [];
  for (const link of links) {
    if (
      !link ||
      typeof link.renderedText !== "string" ||
      !link.renderedText ||
      !link.href ||
      !link.resolvedURL ||
      !link.evidenceRef ||
      !evidenceExists(link.evidenceRef) ||
      !post.links?.includes(link.href) ||
      hrefs.has(link.href) ||
      displays.has(link.renderedText) ||
      urls.has(link.resolvedURL) ||
      reviewedURLs.filter((url) => url === link.resolvedURL).length !== 1
    )
      return false;
    try {
      if (
        new URL(link.href).protocol !== "https:" ||
        new URL(link.resolvedURL).protocol !== "https:"
      )
        return false;
    } catch {
      return false;
    }
    const start = post.body.indexOf(link.renderedText);
    if (start < 0 || post.body.indexOf(link.renderedText, start + 1) >= 0)
      return false;
    replacements.push({
      start,
      end: start + link.renderedText.length,
      url: link.resolvedURL,
    });
    hrefs.add(link.href);
    displays.add(link.renderedText);
    urls.add(link.resolvedURL);
  }
  replacements.sort((a, b) => a.start - b.start);
  for (let i = 1; i < replacements.length; i++)
    if (replacements[i].start < replacements[i - 1].end) return false;
  let restored = post.body;
  for (const replacement of replacements.reverse())
    restored =
      restored.slice(0, replacement.start) +
      replacement.url +
      restored.slice(replacement.end);
  return restored === reviewed;
}
