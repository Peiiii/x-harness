import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/browser-dom.js";
import { createDOMSubmission } from "../dist/browser-dom-submission.js";

const expected = {
  page: "https://x.com/compose/post",
  accountHandle: "Writer",
  editorText: "Reviewed reply",
  replyToId: "123",
  editors: [{ label: "Post text", text: "Reviewed reply" }],
  buttons: [{ label: "Reply", disabled: false }],
  alerts: [],
  needsStateCheck: false,
};

test("a bare dialog status link does not bind an independent composer to a parent", async () => {
  const browser = createDOMXBrowser({
    playwright: {
      evaluate: async () => ({
        ...expected,
        replyContexts: ["ordinary post includes a link"],
        inlineComposer: false,
      }),
    },
  });
  assert.equal((await browser.observe({ view: "composer" })).replyToId, null);
});

for (const activation of ["click", "keyboard"]) {
  for (const [name, change] of [
    [
      "standalone composer",
      (value) => {
        value.replyToId = null;
        value.buttons = [{ label: "Post" }];
      },
    ],
    [
      "wrong parent",
      (value) => {
        value.replyToId = "999";
      },
    ],
    [
      "navigation",
      (value) => {
        value.page = "https://x.com/home";
      },
    ],
    [
      "unconfirmed navigation",
      (value) => {
        value.needsStateCheck = true;
      },
    ],
    [
      "changed text",
      (value) => {
        value.editorText = "Another draft";
      },
    ],
    [
      "changed actor",
      (value) => {
        value.accountHandle = "Other";
      },
    ],
  ]) {
    test(`final reply boundary rejects ${name} before ${activation}`, async () => {
      let activations = 0;
      const fresh = structuredClone(expected);
      const finish = createDOMSubmission({
        session: {},
        submitAX: null,
        tab: {},
        observe: async () => fresh,
      });
      await assert.rejects(
        finish(
          {
            operation: "submitReply",
            replyToId: "123",
            activation,
            beforeSubmit: async () => change(fresh),
          },
          {
            loc: {
              click: async () => activations++,
              press: async () => activations++,
            },
          },
          { view: "composer" },
          expected,
        ),
        /reply-submit-context-unconfirmed/,
      );
      assert.equal(activations, 0);
    });
  }
  test(`final reply boundary retains the exact parent and submits once: ${activation}`, async () => {
    let activations = 0,
      reads = 0;
    const finish = createDOMSubmission({
      session: {},
      submitAX: null,
      tab: {},
      observe: async () => {
        reads++;
        return structuredClone(expected);
      },
    });
    await finish(
      { operation: "submitReply", replyToId: "123", activation },
      {
        loc: {
          click: async () => activations++,
          press: async () => activations++,
        },
      },
      { view: "composer" },
      expected,
    );
    assert.equal(activations, 1);
    assert.equal(reads, 1);
  });
}

async function submitThroughDOM({
  inline = false,
  mutate = () => {},
  beforeSubmit,
} = {}) {
  const { createPlatformWriting } = await import("../dist/platform-writing.js");
  let opened = false,
    submits = 0;
  const targetPage = "https://x.com/Peer/status/123";
  const raw = {
    ...structuredClone(expected),
    page: inline ? targetPage : expected.page,
    editorText: undefined,
    editors: [{ label: "Post text", text: "" }],
    replyContexts: inline ? [] : ["Source question\n回复 @Peer"],
    replyQuotes: inline ? [] : ["Source question"],
    inlineComposer: inline,
  };
  mutate(raw);
  const locator = {
    count: async () => 1,
    filter() {
      return this;
    },
    getByRole() {
      return this;
    },
    waitFor: async () => {},
    isEnabled: async () => true,
    fill: async (text) => {
      raw.editors[0].text = text;
    },
    click: async () => {
      if (!opened) opened = true;
      else submits++;
    },
    press: async () => {
      submits++;
    },
  };
  const tab = {
    url: async () => raw.page,
    playwright: {
      evaluate: async (_reader, query) =>
        query.view === "posts"
          ? {
              page: targetPage,
              accountHandle: "Writer",
              alerts: [],
              needsStateCheck: false,
              posts: [
                {
                  id: "123",
                  primary: "/Peer/status/123",
                  body: "Source question",
                  author: "Peer",
                  buttons: [{ label: "1 回复。回复" }],
                },
              ],
            }
          : structuredClone(raw),
      getByRole: () => locator,
      locator: () => locator,
      getByText: () => locator,
    },
  };
  const browser = createDOMXBrowser(tab);
  const writing = createPlatformWriting({
    browser,
    observed: (query) => browser.observe(query),
    readPost: () => browser.observe({ view: "posts", targetId: "123" }),
  });
  let error;
  try {
    await writing.submitReply({
      kind: "reply",
      postId: "123",
      text: "Reviewed reply",
      accountHandle: "Writer",
      activation: "keyboard",
      beforeSubmit: async () => beforeSubmit?.(raw),
    });
  } catch (caught) {
    error = caught;
  }
  return { submits, error };
}

for (const inline of [false, true])
  test(`normal exact-parent platform DOM reply stays usable: inline=${inline}`, async () => {
    const result = await submitThroughDOM({ inline });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.submits, 1);
  });
for (const [name, mutate] of [
  [
    "wrong direct parent cannot fall back to matching source text",
    (raw) => {
      raw.replyToId = "999";
    },
  ],
  [
    "quote composer with incidental target link",
    (raw) => {
      raw.buttons = [{ label: "Post" }];
    },
  ],
  [
    "recipient prefix",
    (raw) => {
      raw.replyContexts = ["Source question\n回复 @PeerExtra"];
    },
  ],
])
  test(name, async () => {
    const result = await submitThroughDOM({ mutate });
    assert.ok(result.error);
    assert.equal(result.submits, 0);
  });
test("normal platform DOM reply rechecks parent after the async authorization boundary", async () => {
  const result = await submitThroughDOM({
    beforeSubmit: (raw) => {
      raw.replyToId = "999";
    },
  });
  assert.match(result.error?.message, /reply-submit-context-unconfirmed/);
  assert.equal(result.submits, 0);
});
