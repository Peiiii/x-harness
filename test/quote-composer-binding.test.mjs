import test from "node:test";
import assert from "node:assert/strict";
import { matchesComposerQuote } from "../dist/platform-quote.js";
const body =
  "Specific reviewed source detail and ordinary-language costs. ".repeat(4);
const binding = { postId: "12345", author: "ExampleUser", body };
const context = {
  author: "ExampleUser",
  body: body.slice(0, 120) + " x.com/ExampleUser/sta…",
};
test("long composer card binds through exact author and substantial source prefix with visible self-link truncation", () => {
  assert.equal(matchesComposerQuote(context, binding), true);
  assert.equal(
    matchesComposerQuote({ author: binding.author, body }, binding),
    true,
  );
});
test("wrong author, link author, content, short prefix and missing exact-source binding remain rejected", () => {
  for (const q of [
    { ...context, author: "AnotherUser" },
    {
      ...context,
      body: context.body.replace("/ExampleUser/", "/AnotherUser/"),
    },
    { ...context, body: "Different " + context.body },
    { ...context, body: "Short x.com/ExampleUser/sta…" },
    { ...context, body: body.slice(0, 120) + "…" },
  ])
    assert.equal(matchesComposerQuote(q, binding), false);
  assert.equal(
    matchesComposerQuote(context, { ...binding, postId: "" }),
    false,
  );
});

test("clipped composer URL labels require source prefix and complete links in source order", () => {
  const full = body + "\nAPI: api.example.test\nPlan: example.test/plan";
  const reviewed = { ...binding, body: full };
  const prefix = body.slice(0, 120);
  const links = "\nhttp://\napi.example.test\nhttps://\nexample.test/plan";
  const card = { author: binding.author, body: prefix + links };
  assert.equal(matchesComposerQuote(card, reviewed), true);
  for (const changed of [
    { ...card, author: "AnotherUser" },
    { ...card, body: "Changed " + prefix + links },
    { ...card, body: "Short" + links },
    { ...card, body: prefix + links + " unrelated text" },
    { ...card, body: prefix + links.replace("api.example.test", "other.test") },
    {
      ...card,
      body:
        prefix +
        links.replace("api.example.test", "api.example.test.evil.test"),
    },
    {
      ...card,
      body: prefix + "\nhttps://\nexample.test/plan\nhttp://\napi.example.test",
    },
  ])
    assert.equal(matchesComposerQuote(changed, reviewed), false);
  assert.equal(matchesComposerQuote(card, { ...reviewed, postId: "" }), false);
});

test("public quote recovery preserves parent, exact observed source ID and date when a self-link is truncated", async () => {
  const { resolveQuotedSource } = await import("../dist/platform-quote.js");
  const date = "2026-10-01T12:00:00.000Z";
  const source = {
    id: binding.postId,
    primary: "/ExampleUser/status/" + binding.postId,
    author: binding.author,
    body,
    datetime: date,
    needsExpansion: false,
  };
  const parent = {
    id: "67890",
    author: "Reader",
    body: "Reviewed comment",
    datetime: "2026-10-02T12:00:00.000Z",
    quoteCards: [
      {
        body: context.body,
        text: "Example User\n@ExampleUser\n" + context.body,
        datetime: date,
      },
    ],
    needsExpansion: false,
  };
  const result = await resolveQuotedSource(
    { postId: parent.id, url: "https://x.com/Reader/status/" + parent.id },
    { posts: [parent] },
    {
      browser: {
        act: async () => ({
          url: "https://x.com/ExampleUser/status/" + source.id,
        }),
      },
      ready: async () => ({ posts: [source] }),
      open: async () => ({ posts: [parent] }),
    },
  );
  assert.equal(result.posts[0].quoteSource.id, source.id);
});
