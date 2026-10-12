import test from "node:test";
import assert from "node:assert/strict";
import { fixture, NOW } from "./fixtures.mjs";

async function recover(t, change = {}) {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  const sourceLinks = Array.from({ length: 11 }, (_, i) => ({
    href: `https://t.co/link${i}`,
    resolvedURL: `https://github.com/example/tool${i}`,
    renderedText: `github.com/example/tool${i}…`,
    evidenceRef: f.proof,
  }));
  const text = sourceLinks
    .map((l, i) => `${i + 1}. useful reason\n${l.resolvedURL}`)
    .join("\n\n");
  const body = sourceLinks
    .map((l, i) => `${i + 1}. useful reason\n${l.renderedText}`)
    .join("\n\n");
  f.edit((s) => {
    Object.assign(s.actions[0], {
      status: "unknown",
      text,
      intentAt: new Date(NOW).toISOString(),
      beforeIds: [],
      assets: [{ path: "/synthetic/ranking.png", alt: "eleven rows" }],
    });
    s.items.find((i) => i.kind === "original").unknown = 1;
  });
  const post = {
    id: "123",
    author: "Pei",
    body,
    datetime: new Date(NOW).toISOString(),
    links: sourceLinks.map((l) => l.href),
    images: [{ alt: "eleven rows" }],
    ...change.post,
  };
  change.links?.(sourceLinks);
  f.platform.readPost = async () => ({
    posts: [post],
    alerts: [],
    ...change.observation,
  });
  const result = await f.harness.verifyPublishedPost({
    taskId: "round-1",
    draftPath: f.draft,
    publicURL: "https://x.com/Pei/status/123",
    evidenceRef: f.proof,
    sourceLinks,
  });
  assert.equal(f.writes.length, 0);
  return result.status;
}
test("eleven inline shortened links restore exact reviewed text through root API without writes", async (t) =>
  assert.equal(await recover(t), "verified"));
for (const [name, change] of [
  ["missing evidence", { links: (ls) => (ls[3].evidenceRef = "missing") }],
  [
    "wrong target",
    { links: (ls) => (ls[2].resolvedURL = "https://github.com/example/wrong") },
  ],
  ["missing href", { post: { links: [] } }],
  ["duplicate mapping", { links: (ls) => ls.push({ ...ls[0] }) }],
  ["changed body", { post: { body: "Other content" } }],
  ["changed author", { post: { author: "other" } }],
  ["expanded required", { post: { needsExpansion: true } }],
  ["old time", { post: { datetime: new Date(NOW - 1000).toISOString() } }],
  ["missing image", { post: { images: [] } }],
  ["wrong ALT", { post: { images: [{ alt: "wrong" }] } }],
  ["unfresh", { observation: { needsStateCheck: true } }],
])
  test(`multiple links reject ${name}`, async (t) =>
    assert.equal(await recover(t, change), "unknown"));

import { matchesRenderedLinks } from "../dist/source-link-recovery.js";
test("normalization rejects repeated display fragments and overlapping replacements", () => {
  const a = {
    href: "https://t.co/a",
    resolvedURL: "https://example.com/a",
    renderedText: "display",
    evidenceRef: "proof",
  };
  const b = {
    href: "https://t.co/b",
    resolvedURL: "https://example.com/b",
    renderedText: "ispl",
    evidenceRef: "proof",
  };
  assert.equal(
    matchesRenderedLinks(
      "https://example.com/a",
      { body: "display display", links: [a.href] },
      [a],
      () => true,
    ),
    false,
  );
  assert.equal(
    matchesRenderedLinks(
      "https://example.com/a https://example.com/b",
      { body: "display", links: [a.href, b.href] },
      [a, b],
      () => true,
    ),
    false,
  );
  assert.equal(
    matchesRenderedLinks(
      "https://example.com/a https://example.com/a",
      { body: "display", links: [a.href] },
      [a],
      () => true,
    ),
    false,
  );
});
