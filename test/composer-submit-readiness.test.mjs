import test from "node:test";
import assert from "node:assert/strict";
const { DOMEditing } = await import(
  process.env.X_EDITING_TEST_MODULE || "../dist/browser-dom-editing.js"
);
function fixture({ enabled = true, unique = true } = {}) {
  let filled = "",
    activations = 0;
  const submit = {
    waitFor: async () => {},
    isEnabled: async () => enabled,
    and: () => ({
      waitFor: async () => {
        throw new Error("host composite selector evaluation deadline");
      },
    }),
    click: async () => {
      activations++;
    },
  };
  const session = {
    current: {
      query: { view: "composer" },
      result: {
        editors: [{ label: "帖子文本" }],
        buttons: [{ label: "发帖" }],
      },
    },
  };
  const editing = new DOMEditing({
    session,
    tab: { playwright: { locator: () => ({}) } },
    locator: (role) =>
      role === "textbox"
        ? {
            fill: async (text) => {
              filled = text;
            },
          }
        : submit,
    unique: async (locator) => {
      if (locator === submit && !unique) throw new Error("not unique");
      return locator;
    },
  });
  return { editing, state: () => ({ filled, activations }) };
}
test("text preparation survives a host composite selector deadline without activating submission", async () => {
  const f = fixture();
  assert.equal(
    (await f.editing.fillComposer({ text: "synthetic draft" })).completed,
    true,
  );
  assert.deepEqual(f.state(), { filled: "synthetic draft", activations: 0 });
});
test("disabled submit remains blocked before activation", async () => {
  const f = fixture({ enabled: false });
  await assert.rejects(
    f.editing.fillComposer({ text: "synthetic draft" }),
    /提交按钮尚未启用/,
  );
  assert.equal(f.state().activations, 0);
});
test("ambiguous submit remains blocked before activation", async () => {
  const f = fixture({ unique: false });
  await assert.rejects(
    f.editing.fillComposer({ text: "synthetic draft" }),
    /not unique/,
  );
  assert.equal(f.state().activations, 0);
});
