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
      (excerpt.length >= 32 && normalize(quoted.body).startsWith(excerpt)));
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
