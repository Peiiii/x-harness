import test from "node:test";
import assert from "node:assert/strict";
import { DOMEditing } from "../dist/browser-dom-editing.js";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";

function fixture(
  primary,
  observedControls = [{ label: "Reply", ownerPostId: "123" }],
  currentLabels = ["Reply"],
) {
  const buttons = currentLabels.map((_, index) => ({ index }));
  let selectedIndex;
  const adapter = new DOMEditing({
    session: {
      current: {
        query: { targetId: "123" },
        result: {
          posts: [{ id: "123", primary, buttons: observedControls }],
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
              for (const label of currentLabels)
                assert.match(label, options.name);
              assert.doesNotMatch("159 次转帖。转帖", options.name);
              assert.doesNotMatch("159 回复。删除", options.name);
            } else
              assert(currentLabels.every((label) => label === options.name));
            const matches = currentLabels
              .map((label, index) => ({ label, index }))
              .filter(({ label }) =>
                options.name instanceof RegExp
                  ? options.name.test(label)
                  : label === options.name,
              );
            return {
              filter: ({ visible }) => {
                assert.equal(visible, true);
                return {
                  count: async () => matches.length,
                  nth: (index) => {
                    selectedIndex = matches[index]?.index;
                    return buttons[selectedIndex];
                  },
                };
              },
            };
          },
        };
      },
    }),
    tab: { playwright: { locator: (selector) => selector } },
    observe: async () => ({}),
  });
  return { adapter, buttons, selectedIndex: () => selectedIndex };
}

test("a changing reply count retains the observed control within the exact target article", async () => {
  const { adapter, buttons } = fixture(
    "/peer/status/123",
    [{ label: "158 回复。回复", ownerPostId: "123" }],
    ["159 回复。回复"],
  );
  assert.equal((await adapter.openReply({ postId: "123" })).loc, buttons[0]);
});

test("duplicate reply labels select the exact post's control in observed order", async () => {
  const { adapter, buttons, selectedIndex } = fixture(
    "/peer/status/123",
    [
      { label: "0 回复。回复", ownerPostId: "456" },
      { label: "0 回复。回复", ownerPostId: "123" },
    ],
    ["0 回复。回复", "0 回复。回复"],
  );
  assert.equal((await adapter.openReply({ postId: "123" })).loc, buttons[1]);
  assert.equal(selectedIndex(), 1);
});

test("identical duplicate controls for the exact target retain a safe first match", async () => {
  const { adapter, buttons, selectedIndex } = fixture(
    "/peer/status/123",
    [
      { label: "0 回复。回复", ownerPostId: "123" },
      { label: "0 回复。回复", ownerPostId: "123" },
    ],
    ["0 回复。回复", "0 回复。回复"],
  );
  assert.equal((await adapter.openReply({ postId: "123" })).loc, buttons[0]);
  assert.equal(selectedIndex(), 0);
});

test("reply controls owned by the target with different labels stay rejected", async () => {
  const { adapter } = fixture(
    "/peer/status/123",
    [
      { label: "Reply", ownerPostId: "123" },
      { label: "Reply in thread", ownerPostId: "123" },
    ],
    ["Reply", "Reply in thread"],
  );
  await assert.rejects(
    () => adapter.openReply({ postId: "123" }),
    /回复按钮未唯一观察/,
  );
});

test("edited and ordinary post links bind the same exact observed article", async () => {
  for (const primary of ["/peer/status/123", "/peer/status/123/history"]) {
    const { adapter, buttons } = fixture(primary);
    const result = await adapter.openReply({ postId: "123" });
    assert.equal(result.loc, buttons[0]);
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
