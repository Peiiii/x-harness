import test from "node:test";
import assert from "node:assert/strict";
import { attachImage } from "../dist/readers-actions.js";
import { DOMEditing } from "../dist/browser-dom-editing.js";

function uploadFixture() {
  const calls = [];
  const composer = {
    needsStateCheck: false,
    buttons: [{ label: "添加照片或视频", disabled: false }],
    videos: [{ kind: "video" }],
  };
  const tab = {
    playwright: {
      evaluate: async () => composer,
      getByRole: (role, query) => ({
        count: async () => 1,
        click: async () => calls.push([role, query.name]),
      }),
      waitForEvent: async () => ({
        setFiles: async (files) => calls.push(files),
      }),
      locator: () => ({
        first: () => ({ waitFor: async () => calls.push("video-preview") }),
      }),
    },
  };
  return { calls, composer, tab };
}

test("the observed chooser accepts reviewed absolute MP4 and existing image paths", async () => {
  for (const path of ["/synthetic/clip.MP4", "/synthetic/image.png"]) {
    const f = uploadFixture();
    await attachImage(f.tab, { path });
    assert.deepEqual(f.calls, [["button", "添加照片或视频"], [path]]);
  }
  for (const path of ["relative.mp4", "/synthetic/file.exe"])
    await assert.rejects(
      attachImage(uploadFixture().tab, { path }),
      /绝对图片或MP4路径/,
    );
});

test("MP4 attachment waits for a real preview without image ALT controls or submission", async () => {
  const f = uploadFixture();
  const session = {
    current: { query: { view: "composer" }, result: f.composer },
  };
  const editor = new DOMEditing({
    tab: f.tab,
    session,
    observe: async () => f.composer,
  });
  const asset = { path: "/synthetic/clip.mp4" };
  const result = await editor.attachAssets({ assets: [asset] });
  assert.equal(result.completed, true);
  assert.deepEqual(result.value.assets, [asset]);
  assert.deepEqual(f.calls, [
    ["button", "添加照片或视频"],
    [asset.path],
    "video-preview",
  ]);
});

test("missing video preview and image without ALT still fail before submission", async () => {
  for (const asset of [
    { path: "/synthetic/clip.mp4" },
    { path: "/synthetic/image.png" },
  ]) {
    const f = uploadFixture();
    const session = {
      current: { query: { view: "composer" }, result: f.composer },
    };
    const editor = new DOMEditing({
      tab: f.tab,
      session,
      observe: async () => ({ needsStateCheck: false, videos: [] }),
    });
    await assert.rejects(
      editor.attachAssets({ assets: [asset] }),
      /视频预览未确认|图片须有完整ALT/,
    );
  }
});
