import test from "node:test";
import assert from "node:assert/strict";
import { createDOMSubmission } from "../dist/browser-dom-submission.js";
async function open(label) {
  let opens = 0,
    observations = 0;
  const session = {};
  const wait = (check = () => {}) => ({ waitFor: async () => check() });
  const run = createDOMSubmission({
    session,
    submitAX: null,
    tab: {
      url: async () => "https://x.com/compose/post",
      playwright: {
        getByRole: () => wait(),
        getByText: (matcher) =>
          wait(() => {
            assert.ok(matcher instanceof RegExp);
            if (!matcher.test(label)) throw Error("recipient not matched");
          }),
      },
    },
    observe: async () => {
      observations++;
      return {
        page: "https://x.com/compose/post",
        replyToId: "10",
        editorText: "",
        alerts: [],
        needsStateCheck: false,
        replyContexts: ["Question " + label],
        replyQuotes: ["Question"],
      };
    },
    unique: () => {
      throw Error("No unrelated controls");
    },
    locator: () => {
      throw Error("No unrelated locators");
    },
  });
  await run(
    { operation: "openReply", postId: "10" },
    {
      loc: {
        click: async () => {
          opens++;
        },
      },
    },
    { view: "posts" },
    {
      page: "https://x.com/peer/status/10",
      posts: [{ id: "10", author: "PeerName", body: "Question" }],
    },
  );
  assert.equal(opens, 1);
  assert.equal(observations, 1);
  assert.equal(session.replyBinding.postId, "10");
  return session;
}
test("a nested reply opens with both the target and root author in the recipient label", async () => {
  await open("回复 @PeerName 和 @RootOwner");
});
test("single recipient and comma recipient forms retain exact handle boundaries", async () => {
  await open("回复 @PeerName");
  await open("回复 @PeerName, @RootOwner");
  await open("回复 @peername 和 @RootOwner");
});
test("a handle prefix or unrelated recipient is rejected before composer filling or submitting", async () => {
  for (const label of [
    "回复 @PeerNameExtra 和 @RootOwner",
    "回复 @OtherName 和 @RootOwner",
  ])
    await assert.rejects(() => open(label), /recipient not matched/);
});
