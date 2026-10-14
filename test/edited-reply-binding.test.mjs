import test from "node:test";
import assert from "node:assert/strict";
import { DOMEditing } from "../dist/browser-dom-editing.js";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";

function fixture(primary) {
  const button = {};
  const adapter = new DOMEditing({
    session: {
      current: {
        query: { targetId: "123" },
        result: {
          posts: [{ primary, buttons: [{ label: "Reply" }] }],
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
            assert.deepEqual(options, { name: "Reply", exact: true });
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
