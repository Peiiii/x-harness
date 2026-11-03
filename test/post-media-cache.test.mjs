import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PostMedia } from "../dist/post-media.js";
import { fixture, NOW } from "./fixtures.mjs";
const url = "https://x.com/peer/status/123",
  src = "https://pbs.twimg.com/media/cache?format=jpg&name=medium";
const bytes = Buffer.from("ffd8ffe00000000000000000", "hex");
function setup(
  t,
  {
    count = 1,
    loaded = {},
    frameURL = url,
    content = { content: bytes.toString("base64"), base64Encoded: true },
    onResource,
    sourcePatch = {},
  } = {},
) {
  const f = fixture(t),
    calls = [];
  let currentURL = url,
    now = NOW;
  const tab = {
    url: async () => currentURL,
    playwright: {
      locator: () => ({
        count: async () => count,
        evaluate: async () => ({
          src,
          complete: true,
          width: 640,
          height: 1200,
          ...loaded,
        }),
      }),
    },
    capabilities: {
      get: async (id) => {
        calls.push(id);
        assert.equal(id, "cdp");
        return {
          send: async (method, params) => {
            calls.push([method, params]);
            if (method === "Page.getFrameTree")
              return { frameTree: { frame: { id: "frame", url: frameURL } } };
            assert.equal(method, "Page.getResourceContent");
            assert.deepEqual(params, { frameId: "frame", url: src });
            onResource?.({
              changeRoute: () => {
                currentURL = "https://x.com/other/status/999";
              },
              expire: () => {
                now = Date.parse("2026-10-11T00:00:00+08:00");
              },
            });
            return content;
          },
        };
      },
    },
  };
  const reader = new PostMedia(tab, f.store, () => now);
  const source = {
    status: "observed",
    fresh: true,
    complete: true,
    evidenceRef: f.proof,
    post: {
      id: "123",
      author: "peer",
      url,
      body: "chat screenshot",
      images: [{ src }],
    },
    ...sourcePatch,
  };
  return {
    ...f,
    calls,
    run: () =>
      reader.read(
        {
          target: { postId: "123", url, evidenceRef: f.proof },
          cacheOnly: true,
        },
        async () => source,
      ),
  };
}
test("explicit cache mode exports exact loaded image bytes without downloads or navigation", async (t) => {
  const f = setup(t);
  const out = await f.run();
  assert.equal(out.complete, true);
  assert.equal(out.acquisition, "page-cache");
  assert.deepEqual(readFileSync(out.images[0].path), bytes);
  assert.equal(out.images[0].contentType, "image/jpeg");
  assert.deepEqual(
    f.calls.map((x) => (Array.isArray(x) ? x[0] : x)),
    ["cdp", "Page.getFrameTree", "Page.getResourceContent"],
  );
});
for (const count of [0, 2])
  test("cache refuses nonunique source image: " + count, async (t) => {
    const f = setup(t, { count });
    const out = await f.run();
    assert.equal(out.reason, "media-dom-image-unconfirmed");
    assert.equal(out.images.length, 0);
    assert.ok(
      !f.calls.some(
        (x) => Array.isArray(x) && x[0] === "Page.getResourceContent",
      ),
    );
  });
for (const loaded of [{ complete: false }, { width: 0 }, { src: src + "x" }])
  test(
    "cache refuses unloaded or changed image: " + JSON.stringify(loaded),
    async (t) => {
      const f = setup(t, { loaded });
      const out = await f.run();
      assert.equal(out.reason, "media-cache-image-not-loaded");
      assert.equal(out.images.length, 0);
    },
  );
test("cache refuses a different document frame", async (t) => {
  const f = setup(t, { frameURL: "https://example.com/private" });
  const out = await f.run();
  assert.equal(out.reason, "media-frame-unconfirmed");
  assert.equal(out.images.length, 0);
});
for (const content of [
  { base64Encoded: false, content: "text" },
  { base64Encoded: true, content: "%%%" },
  { base64Encoded: true, content: Buffer.from("not image").toString("base64") },
])
  test(
    "cache refuses unconfirmed resource bytes: " + JSON.stringify(content),
    async (t) => {
      const f = setup(t, { content });
      const out = await f.run();
      assert.equal(out.complete, false);
      assert.equal(out.images.length, 0);
    },
  );
test("cache route drift after resource read never saves a publishable file", async (t) => {
  const f = setup(t, { onResource: ({ changeRoute }) => changeRoute() });
  const out = await f.run();
  assert.equal(out.reason, "media-route-changed");
  assert.equal(out.images.length, 0);
});
test("cache crossing cutoff preserves incomplete state", async (t) => {
  const f = setup(t, { onResource: ({ expire }) => expire() });
  const out = await f.run();
  assert.equal(out.reason, "night-platform-boundary");
  assert.equal(out.images.length, 0);
});
test("unconfirmed source never accesses cache capability", async (t) => {
  const f = setup(t, { sourcePatch: { fresh: false } });
  const out = await f.run();
  assert.equal(out.reason, "media-source-unconfirmed");
  assert.deepEqual(f.calls, []);
});
