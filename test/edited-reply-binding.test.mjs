import test from "node:test";
import assert from "node:assert/strict";
import { DOMEditing } from "../dist/browser-dom-editing.js";

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
