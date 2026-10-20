import { xURL } from "./platform-rules.js";
export async function resolveQuotedSource(
  target: any,
  initial: any,
  { browser, ready, open }: any,
) {
  const incomplete = (value: any) => ({
    ...value,
    complete: false,
    missing: [
      ...new Set([...(value.missing ?? []), "quoted-source-unconfirmed"]),
    ],
  });
  const parent = initial.posts?.find((p: any) => p.id === target.postId);
  if (
    initial.needsStateCheck ||
    initial.alerts?.length ||
    !parent ||
    parent.quoteCards?.length !== 1
  )
    return parent?.quoteCards?.length ? incomplete(initial) : initial;
  const card = parent.quoteCards[0];
  const destination = await browser.act({
    operation: "openQuote",
    postId: target.postId,
    cardText: card.text,
  });
  const id = xURL(destination.url).pathname.match(/\/status\/(\d+)$/)?.[1];
  let source = await ready({ view: "posts", targetId: id });
  let quoted = source.posts?.find((p: any) => p.id === id);
  if (
    !source.needsStateCheck &&
    !source.alerts?.length &&
    quoted?.needsExpansion
  ) {
    await browser.act({ operation: "expandPost", postId: id });
    source = await ready({ view: "posts", targetId: id });
    quoted = source.posts?.find((p: any) => p.id === id);
  }
  const normalize = (text: string) => text.replace(/\s/g, "");
  const excerpt =
    typeof card.body === "string" && /(?:…|\.\.\.)\s*$/.test(card.body)
      ? normalize(card.body.replace(/(?:…|\.\.\.)\s*$/, ""))
      : "";
  const bodyBound =
    quoted?.body &&
    (card.text.endsWith(quoted.body) ||
      (excerpt.length >= 32 && normalize(quoted.body).startsWith(excerpt)) ||
      matchesComposerQuote(
        { author: quoted.author, body: card.body },
        { postId: quoted.id, author: quoted.author, body: quoted.body },
      ));
  const confirmed =
    !source.needsStateCheck &&
    !source.alerts?.length &&
    quoted?.body &&
    !quoted.needsExpansion &&
    quoted.datetime === card.datetime &&
    card.text.includes(`@${quoted.author}`) &&
    bodyBound;
  const back = await open(
    {
      url: target.url,
      evidenceRef: {
        parentId: target.postId,
        cardText: card.text,
        destination: destination.url,
      },
    },
    { view: "posts", targetId: target.postId },
  );
  const fresh = back.posts?.find((p: any) => p.id === target.postId);
  if (
    confirmed &&
    fresh?.quoteCards?.length === 1 &&
    fresh.quoteCards[0].text === card.text
  )
    fresh.quoteSource = {
      id,
      url: destination.url,
      author: quoted.author,
      datetime: quoted.datetime,
      body: quoted.body,
      parentId: target.postId,
      cardText: card.text,
    };
  return fresh?.quoteSource ? back : incomplete(back);
}

// The source was selected by exact observed ID before opening this composer.
export function matchesComposerQuote(context: any, binding: any): boolean {
  if (
    !/^[0-9]+$/.test(binding?.postId ?? "") ||
    typeof binding?.body !== "string" ||
    !binding.body.trim() ||
    typeof context?.body !== "string" ||
    typeof binding?.author !== "string" ||
    typeof context?.author !== "string" ||
    context.author?.toLowerCase() !== binding.author.toLowerCase()
  )
    return false;
  if (context.body.startsWith(binding.body)) return true;
  const tail = context.body.match(
    /\s+(?:https?:\/\/)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/sta…\s*$/,
  );
  if (!tail) return matchesVisibleLinkTail(context.body, binding.body);
  if (tail[1].toLowerCase() !== binding.author.toLowerCase()) return false;
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const prefix = normalize(context.body.slice(0, tail.index));
  return prefix.length >= 80 && normalize(binding.body).startsWith(prefix);
}

// Some long cards end their clipped text with separately rendered URL labels.
// Require the existing substantial prefix and every complete URL, in source order.
function matchesVisibleLinkTail(preview: string, source: string): boolean {
  const start = preview.search(/\nhttps?:\/\/[ \t]*\n/i);
  if (start < 0) return false;
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
  const prefix = normalize(preview.slice(0, start));
  if (prefix.length < 80 || !normalize(source).startsWith(prefix)) return false;
  const tail = preview.slice(start).trim();
  const pattern = /https?:\/\/[ \t]*\n([^\s]+)/gi;
  const links = Array.from(tail.matchAll(pattern), (match) => match[1]);
  if (!links.length || tail.replace(pattern, "").trim()) return false;
  let offset = 0;
  for (const link of links) {
    if (!/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/?#][^\s]*)?$/.test(link))
      return false;
    const escaped = link.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(
      `(?:^|[^A-Za-z0-9._/-])${escaped}(?=$|[^A-Za-z0-9._/-])`,
    ).exec(source.slice(offset));
    if (!match) return false;
    offset += match.index + match[0].length;
  }
  return true;
}
