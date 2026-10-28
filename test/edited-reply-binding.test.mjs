import test from "node:test";
import assert from "node:assert/strict";
import { DOMEditing } from "../dist/browser-dom-editing.js";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";

function fixture(primary, observedLabel = "Reply", currentLabel = "Reply") {
  const button = {};
  const adapter = new DOMEditing({
    session: {
      current: {
        query: { targetId: "123" },
        result: {
          posts: [{ primary, buttons: [{ label: observedLabel }] }],
        },
      },
    },
    unique: async (value) => value,
    locator: () => ({
      filter: ({ has, visible }) => {
        assert.equal(has, `a[href=${JSON.stringify(primary)}]`);
        assert.equal(visible, true);
        return {
          getByRole: (role, options) => {
            assert.equal(role, "button");
            assert.equal(options.exact, true);
            if (options.name instanceof RegExp) {
              assert.match(currentLabel, options.name);
              assert.doesNotMatch("159 次转帖。转帖", options.name);
              assert.doesNotMatch("159 回复。删除", options.name);
            } else assert.equal(options.name, currentLabel);
            return button;
          },
        };
      },
    }),
    tab: { playwright: { locator: (selector) => selector } },
    observe: async () => ({}),
  });
  return { adapter, button };
}

test("a changing reply count retains the observed control within the exact target article", async () => {
  const { adapter, button } = fixture(
    "/peer/status/123",
    "158 回复。回复",
    "159 回复。回复",
  );
  assert.equal((await adapter.openReply({ postId: "123" })).loc, button);
});

test("edited and ordinary post links bind the same exact observed article", async () => {
  for (const primary of ["/peer/status/123", "/peer/status/123/history"]) {
    const { adapter, button } = fixture(primary);
    const result = await adapter.openReply({ postId: "123" });
    assert.equal(result.loc, button);
    assert.equal(result.completed, false);
  }
});

test("history links for another post and unrelated suffixes stay rejected", async () => {
  for (const primary of [
    "/peer/status/124/history",
    "/peer/status/123/photo/1",
  ]) {
    const { adapter } = fixture(primary);
    await assert.rejects(
      () => adapter.openReply({ postId: "123" }),
      /永久链接未绑定/,
    );
  }
});

test("exact post readiness admits its edited timestamp link without admitting another ID", async () => {
  let selector;
  const detail = {
    first() {
      return this;
    },
    async waitFor() {
      assert.equal(
        selector,
        'a[href="/peer/status/123"],a[href="/peer/status/123/history"]',
      );
    },
  };
  const nav = new DOMNavigation({
    session: {},
    tab: {
      url: async () => "https://x.com/home",
      goto: async () => {},
      playwright: {
        waitForURL: async () => {},
        locator: (value) => value,
        getByRole: () => ({
          filter: ({ has }) => {
            selector = has;
            return detail;
          },
        }),
      },
    },
    observe: async () => ({}),
  });
  await nav.openObserved({
    url: "https://x.com/peer/status/123",
    view: "posts",
    evidenceRef: "synthetic-proof",
    forceNavigation: true,
  });
});
