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

test("video processing waits for enabled submission before the first click", async () => {
  for (const videos of [[{ kind: "video" }], []]) {
    const waits = [];
    const result = {
      needsStateCheck: false,
      editors: [{ label: "帖子文本" }],
      buttons: [{ label: "发帖" }],
      videos,
    };
    const locator = {
      count: async () => 1,
      fill: async () => {},
      and: () => locator,
      waitFor: async (options) => waits.push(options),
    };
    const editor = new DOMEditing({
      session: { current: { query: { view: "composer" }, result } },
      tab: { playwright: { locator: () => locator } },
      locator: () => locator,
      unique: async (value) => value,
    });
    await editor.fillComposer({ text: "reviewed text" });
    assert.deepEqual(waits, [{ state: "visible", timeoutMs: 5000 }]);
  }
});

test("a host-capped video wait resumes observation, never the submission", async () => {
  let attempts = 0;
  const locator = {
    fill: async () => {},
    and: () => locator,
    waitFor: async () => {
      if (++attempts === 1) throw Error("selector deadline exceeded");
    },
  };
  const result = {
    editors: [{ label: "帖子文本" }],
    buttons: [{ label: "发帖" }],
    videos: [{ kind: "video" }],
  };
  const editor = new DOMEditing({
    session: { current: { query: { view: "composer" }, result } },
    tab: { playwright: { locator: () => locator } },
    locator: () => locator,
    unique: async (value) => value,
  });
  await editor.fillComposer({ text: "reviewed text" });
  assert.equal(attempts, 2);
});

test("host-capped video waiting is bounded and non-timeout failures are not retried", async () => {
  for (const message of ["selector deadline exceeded", "host disconnected"]) {
    let attempts = 0;
    const locator = {
      fill: async () => {},
      and: () => locator,
      waitFor: async () => {
        attempts++;
        throw Error(message);
      },
    };
    const result = {
      editors: [{ label: "帖子文本" }],
      buttons: [{ label: "发帖" }],
      videos: [{ kind: "video" }],
    };
    const editor = new DOMEditing({
      session: { current: { query: { view: "composer" }, result } },
      tab: { playwright: { locator: () => locator } },
      locator: () => locator,
      unique: async (value) => value,
    });
    await assert.rejects(
      editor.fillComposer({ text: "reviewed text" }),
      new RegExp(message),
    );
    assert.equal(attempts, message === "host disconnected" ? 1 : 12);
  }
});
