import type { BoundaryRecord } from "./boundary.js";
import { readProfile } from "./readers-profile.js";
import { readPosts } from "./readers-posts.js";
import { readComposer, readMediaEditor } from "./readers-composer.js";
import { readNavigation, readMenu } from "./readers-navigation.js";
export { createDOMXBrowser, readXNetworkDiagnostics } from "./browser-dom.js";
export { createNativeXBrowser } from "./browser-native.js";
// Read-only supplement: account identity, composer context and exact tweet bodies.
// Existing readers still own article/profile/composer boundaries.
export function readXSurface({
  view,
  posts = [],
  targetId,
  replyTargetId,
}: any = {}): any {
  const visible = (el: any) => el.getClientRects().length > 0;
  const profile = [...document.querySelectorAll<HTMLElement>("a[href]")].filter(
    (el: any) =>
      visible(el) &&
      ["个人资料", "Profile"].includes(
        el.getAttribute("aria-label") || el.innerText.trim(),
      ) &&
      /^\/\w{1,15}$/.test(el.getAttribute("href")),
  );
  const own =
    profile.length === 1 ? profile[0].getAttribute("href")!.slice(1) : null;
  const base: BoundaryRecord = {
    page: location.href,
    accountHandle: own,
    accountURL: own ? `https://x.com/${own}` : null,
    alerts: [...document.querySelectorAll<HTMLElement>('[role="alert"]')]
      .filter(visible)
      .map((el: any) => el.innerText),
  };
  if (view === "composer") {
    const dialogs = [
      ...document.querySelectorAll<HTMLElement>('[role="dialog"]'),
    ].filter(visible);
    const ids =
      dialogs.length === 1
        ? [
            ...new Set(
              [...dialogs[0].querySelectorAll("a[href]")]
                .filter(visible)
                .flatMap(
                  (el: any) =>
                    el
                      .getAttribute("href")
                      .match(/^\/\w+\/status\/(\d+)$/)?.[1] ?? [],
                ),
            ),
          ]
        : [];
    const replyContexts = [...new Set(dialogs.map((el: any) => el.innerText))];
    const replyQuotes = [
      ...new Set(
        dialogs.flatMap((el: any) =>
          [...el.querySelectorAll('[data-testid="tweetText"]')]
            .filter(visible)
            .map((text: any) => text.innerText),
        ),
      ),
    ];
    return {
      ...base,
      replyToId: ids.length === 1 ? ids[0] : null,
      inlineComposer: dialogs.length === 0,
      replyContexts,
      replyQuotes,
    };
  }
  if (view === "posts") {
    const all = [...document.querySelectorAll<HTMLElement>("article")].filter(
      visible,
    );
    return {
      ...base,
      bodies: posts.map((post: any) => {
        const articles = all.filter(
          (article: any) =>
            [...article.querySelectorAll("time")]
              .filter(visible)
              .find(
                (time: any) =>
                  time.closest("a")?.getAttribute("href") === post.primary,
              )
              ?.closest("a")
              ?.getAttribute("href") === post.primary,
        );
        const texts =
          articles.length === 1
            ? [
                ...articles[0].querySelectorAll('[data-testid="tweetText"]'),
              ].filter(
                (el: any) =>
                  visible(el) && !el.closest?.('[role="link"][tabindex="0"]'),
              )
            : [];
        let replyToId: any = null,
          parentEvidence: any = null;
        const childIndex = all.indexOf(articles[0]);
        if (
          replyTargetId &&
          targetId === post.id &&
          articles.length === 1 &&
          childIndex > 0 &&
          new URL(location.href).pathname.endsWith(`/status/${post.id}`)
        ) {
          // Nested conversations can include older ancestors before the direct parent.
          const parent = [...all[childIndex - 1].querySelectorAll("time")]
            .filter(visible)
            .find((time: any) =>
              /^\/\w+\/status\/\d+$/.test(
                time.closest("a")?.getAttribute("href") ?? "",
              ),
            )
            ?.closest("a")
            ?.getAttribute("href");
          const match = parent?.match(/^\/(\w+)\/status\/(\d+)$/);
          const labels = [...articles[0].querySelectorAll("div,span")]
            .filter(visible)
            .filter(
              (el: any) =>
                !el.closest('[data-testid="tweetText"]') &&
                !el.querySelector('[data-testid="tweetText"]'),
            )
            .map((el: any) => el.innerText.trim().replace(/\s+/g, " "));
          const directLabel =
            match &&
            labels.some((text: any) =>
              [`回复 @${match[1]}`, `Replying to @${match[1]}`].includes(text),
            );
          // X can omit the inline reply label on a permalink. Its title still prefixes the direct
          // recipient before older ancestors; require that prefix and the adjacent parent together.
          const titleRecipient = (document.title ?? "").match(
            /[“"]@([A-Za-z0-9_]{1,15})(?=\s)/,
          )?.[1];
          const titleMatchesParent =
            match && titleRecipient?.toLowerCase() === match[1].toLowerCase();
          if (
            match?.[2] === replyTargetId &&
            (directLabel || titleMatchesParent)
          ) {
            replyToId = match[2];
            parentEvidence = {
              parentPrimary: parent,
              childPrimary: post.primary,
              labels: labels.filter((text: any) =>
                /^(回复|Replying to) @/.test(text),
              ),
              ...(titleMatchesParent ? { titleRecipient } : {}),
            };
          }
        }
        // Exclude observed nested quote-card text; any remaining ambiguity stays unknown.
        return {
          id: post.id,
          body:
            texts.length === 1
              ? (() => {
                  const root = texts[0] as HTMLElement;
                  // innerText adds layout breaks around inline mentions and URLs.
                  // Reconstruct only observed X permalinks; preserve all other text.
                  const read = (node: Node): string => {
                    if (node.nodeType === 3) return node.textContent ?? "";
                    if (
                      node.nodeType === 1 &&
                      (node as Element).getAttribute("aria-hidden") ===
                        "true" &&
                      getComputedStyle(node as Element).opacity === "0"
                    )
                      return "";
                    if (
                      node.nodeType === 1 &&
                      (node as Element).tagName === "A"
                    ) {
                      const href = (node as Element).getAttribute("href") ?? "";
                      if (/^\/\w{1,15}\/status\/\d+$/.test(href))
                        return `https://x.com${href}`;
                    }
                    return [...node.childNodes].map(read).join("");
                  };
                  return root.childNodes ? read(root) : root.innerText;
                })()
              : null,
          replyToId,
          parentEvidence,
          quoteCards:
            articles.length === 1
              ? [...articles[0].querySelectorAll('[role="link"][tabindex="0"]')]
                  .filter(visible)
                  .map((card: any) => ({
                    text: card.innerText,
                    datetime: card
                      .querySelector?.("time")
                      ?.getAttribute("datetime"),
                  }))
              : [],
        };
      }),
    };
  }
  return base;
}
// CUA accepts a page-function string. Compose the existing read-only parsers,
// rather than running two browser requests or maintaining another tweet parser.
export const atomicObservationCode = `(query) => {
  const readPosts = ${readPosts.toString()};
  const readProfile = ${readProfile.toString()};
  const readComposer = ${readComposer.toString()};
  const readMediaEditor = ${readMediaEditor.toString()};
  const readNavigation = ${readNavigation.toString()};
  const readMenu = ${readMenu.toString()};
  const readXSurface = ${readXSurface.toString()};
  const readers = { posts:readPosts, person:readProfile, composer:readComposer, media:readMediaEditor, navigation:readNavigation, menu:readMenu, account:()=>({}) };
  if (!readers[query.view]) throw new Error('未封装的DOM视图');
  const raw = readers[query.view](query);
  const surface = readXSurface({...query, posts:(raw.posts??[]).map(p=>({id:p.id,primary:p.primary}))});
  return {...raw,...surface,needsStateCheck:Boolean(raw.needsStateCheck)||!surface.accountHandle,
    ...(query.view==='posts'?{posts:raw.posts.map(p=>({...p,...surface.bodies.find(b=>b.id===p.id)}))}: {})};
}`;
