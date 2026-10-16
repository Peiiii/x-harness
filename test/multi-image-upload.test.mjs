import test from "node:test";
import assert from "node:assert/strict";
import { DOMEditing } from "../dist/browser-dom-editing.js";

test("two images retain order, separate ALT values, and never submit", async () => {
  let uploaded = 0,
    selected = -1,
    stage = "composer",
    value = "";
  const alts = [],
    selectedIndices = [];
  const composer = () => ({
    needsStateCheck: false,
    editorText: "",
    images: Array.from({ length: uploaded }, () => ({})),
    buttons: [
      { label: uploaded ? "添加媒体" : "添加照片或视频" },
      ...Array.from({ length: uploaded }, () => ({ label: "编辑" })),
    ],
  });
  const session = {
    current: { query: { view: "composer" }, result: composer() },
  };
  const media = () => ({
    needsStateCheck: false,
    controls: [
      { role: "tab", label: "编辑图片描述" },
      { role: "button", label: "保存" },
    ],
    fields: [{ label: "描述", value }],
  });
  const locator = (role, name) => ({
    count: async () =>
      role === "button" && String(name).includes("编辑") ? uploaded : 1,
    nth: (index) => ({
      waitFor: async () => {},
      click: async () => {
        selected = index;
        selectedIndices.push(index);
        stage = "media";
        value = alts[index] ?? "";
      },
    }),
    waitFor: async () => {},
    fill: async (text) => {
      value = text;
    },
    click: async () => {
      if (name === "保存") {
        alts[selected] = value;
        stage = "composer";
      }
    },
  });
  const tab = {
    playwright: {
      evaluate: async () => composer(),
      getByRole: (r, q) => locator(r, q.name),
      getByLabel: () => locator("textbox", "描述"),
      waitForEvent: async () => ({
        setFiles: async () => {
          uploaded++;
        },
      }),
    },
  };
  const observe = async (query) => {
    const result = stage === "media" ? media() : composer();
    session.current = { query, result };
    return result;
  };
  const editor = new DOMEditing({
    tab,
    session,
    observe,
    locator,
    unique: async (l) => l,
  });
  const assets = [
    { path: "/synthetic/a.png", alt: "first complete ALT" },
    { path: "/synthetic/b.png", alt: "second complete ALT" },
  ];
  const result = await editor.attachAssets({ assets });
  assert.deepEqual(
    alts,
    assets.map((a) => a.alt),
  );
  assert.deepEqual(selectedIndices, [0, 1]);
  assert.deepEqual(result.value.assets, assets);
  assert.equal(result.value.composer.images.length, 2);
});

test("mixed media and missing ALT are rejected before uploads", async () => {
  const editor = new DOMEditing({});
  for (const assets of [
    [{ path: "/x.mp4" }, { path: "/y.png", alt: "image" }],
    [{ path: "/x.png", alt: "one" }, { path: "/y.png" }],
    Array(5).fill({ path: "/x.png", alt: "x" }),
  ]) {
    await assert.rejects(editor.attachAssets({ assets }), /多图|1至4/);
  }
});
