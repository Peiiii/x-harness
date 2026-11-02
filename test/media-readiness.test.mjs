import test from "node:test";
import assert from "node:assert/strict";
import { DOMEditing } from "../dist/browser-dom-editing.js";

function setup({ uploadDelay = 0, afterSave = [] } = {}) {
  let uploaded = 0,
    stage = "composer",
    value = "",
    saves = 0;
  const composer = () => ({
    needsStateCheck: false,
    images: uploaded ? [{}] : [],
    buttons: [
      { label: "添加照片或视频" },
      ...(uploaded ? [{ label: "编辑媒体" }] : []),
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
    count: async () => 1,
    nth: () => locator(role, name),
    waitFor: async ({ timeoutMs }) => {
      if (stage === "composer" && timeoutMs < uploadDelay)
        throw Error("media still uploading");
    },
    fill: async (text) => {
      value = text;
    },
    click: async () => {
      if (name === "保存") {
        stage = "composer";
        saves++;
      } else if (role === "button" && /编辑/.test(String(name)))
        stage = "media";
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
    const result =
      stage === "media"
        ? media()
        : saves && afterSave.length
          ? afterSave.shift()
          : composer();
    session.current = { query, result };
    return result;
  };
  return {
    editor: new DOMEditing({
      tab,
      session,
      observe,
      locator,
      unique: async (l) => l,
    }),
    counts: () => ({ uploaded, saves }),
  };
}
const asset = {
  path: "/synthetic/portrait.png",
  alt: "complete image description",
};
test("slow media preview becomes ready within the bounded upload wait", async () => {
  const x = setup({ uploadDelay: 14000 });
  const result = await x.editor.attachAssets({ assets: [asset] });
  assert.equal(result.completed, true);
  assert.deepEqual(x.counts(), { uploaded: 1, saves: 1 });
});
test("ALT save gets one fresh composer observation without reupload", async () => {
  const x = setup({
    afterSave: [{ needsStateCheck: true, images: [], buttons: [] }],
  });
  const result = await x.editor.attachAssets({ assets: [asset] });
  assert.equal(result.completed, true);
  assert.deepEqual(x.counts(), { uploaded: 1, saves: 1 });
});
test("persistent unconfirmed composer is rejected", async () => {
  const bad = { needsStateCheck: true, images: [], buttons: [] };
  const x = setup({ afterSave: [bad, bad] });
  await assert.rejects(
    x.editor.attachAssets({ assets: [asset] }),
    /上传图片未回到编辑器/,
  );
  assert.deepEqual(x.counts(), { uploaded: 1, saves: 1 });
});
test("visible alerts do not trigger the composer continuation", async () => {
  const x = setup({
    afterSave: [
      {
        needsStateCheck: true,
        images: [],
        buttons: [],
        alerts: [{ text: "upload rejected" }],
      },
    ],
  });
  await assert.rejects(
    x.editor.attachAssets({ assets: [asset] }),
    /上传图片未回到编辑器/,
  );
  assert.deepEqual(x.counts(), { uploaded: 1, saves: 1 });
});
