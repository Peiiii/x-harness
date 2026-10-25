import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { PostMedia } from "../dist/post-media.js";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";
const url = "https://x.com/peer/status/123";
const src = "https://pbs.twimg.com/media/example?format=jpg&name=medium";
function setup(
  t,
  {
    capability = true,
    sourcePatch = {},
    inventoryPatch = {},
    bundlePatch = {},
    onList,
    onBundle,
    clock = () => NOW,
    executor,
  } = {},
) {
  const f = fixture(t);
  const calls = [];
  const source = {
    status: "observed",
    fresh: true,
    complete: true,
    evidenceRef: f.proof,
    post: {
      id: "123",
      author: "peer",
      url,
      body: "来交朋友",
      images: [{ src }],
    },
    ...sourcePatch,
  };
  const cap = {
    async list() {
      calls.push("list");
      await onList?.();
      return {
        id: "inventory",
        pageUrl: url,
        assets: [
          { id: "wanted", kind: "image", url: src },
          {
            id: "other",
            kind: "image",
            url: "https://pbs.twimg.com/media/unrelated",
          },
        ],
        ...inventoryPatch,
      };
    },
    async bundle(options) {
      calls.push(["bundle", options]);
      await onBundle?.();
      return {
        assets: [
          {
            id: "wanted",
            url: src,
            path: "/tmp/media-test/image.jpg",
            contentType: "image/jpeg",
          },
        ],
        failures: [],
        ...bundlePatch,
      };
    },
  };
  const tab = {
    async url() {
      return inventoryPatch.currentURL ?? url;
    },
    ...(capability
      ? {
          capabilities: {
            async get(id) {
              assert.equal(id, "pageAssets");
              return cap;
            },
          },
        }
      : {}),
  };
  const reader = new PostMedia(tab, f.store, clock, executor);
  const target = { postId: "123", url, evidenceRef: f.proof };
  const read = async (args) => {
    calls.push(["read", args]);
    return source;
  };
  return { ...f, source, reader, target, calls, read, tab };
}
test("root media method delegates one fresh read and exports only exact observed image", async (t) => {
  const f = setup(t);
  const api = createBusinessHarness({
    store: f.store,
    platform: {},
    media: f.reader,
  });
  api.readPost = f.read;
  const out = await api.readPostMedia({ target: f.target });
  assert.equal(out.status, "observed");
  assert.equal(out.complete, true);
  assert.equal(out.images[0].src, src);
  assert.equal(out.sourceEvidenceRef, f.proof);
  assert.ok(f.store.evidenceExists(out.evidenceRef));
  assert.deepEqual(f.calls.at(-1), [
    "bundle",
    { inventoryId: "inventory", assetIds: ["wanted"] },
  ]);
});
test("missing host capability and invalid options never read the platform", async (t) => {
  const f = setup(t, { capability: false });
  assert.equal(
    (await f.reader.read({ target: f.target }, f.read)).status,
    "needsCapability",
  );
  assert.deepEqual(f.calls, []);
  for (const maxImages of [0, 5, 1.5, NaN])
    assert.equal(
      (await f.reader.read({ target: f.target, maxImages }, f.read)).reason,
      "media-options-invalid",
    );
  assert.deepEqual(f.calls, []);
});
for (const [label, sourcePatch] of [
  ["partial", { complete: false }],
  ["stale", { fresh: false }],
  ["alert", { status: "needsDecision" }],
  ["proof", { evidenceRef: "/absent-proof" }],
  ["wrong-id", { post: { id: "124", author: "peer", url, images: [{ src }] } }],
  [
    "wrong-author-url",
    { post: { id: "123", author: "other", url, images: [{ src }] } },
  ],
])
  test("unconfirmed source refuses asset access: " + label, async (t) => {
    const f = setup(t, { sourcePatch });
    const out = await f.reader.read({ target: f.target }, f.read);
    assert.equal(out.complete, false);
    assert.equal(out.reason, "media-source-unconfirmed");
    assert.equal(f.calls.length, 1);
  });
test("no source images succeeds without inventory or bundle", async (t) => {
  const f = setup(t, {
    sourcePatch: { post: { id: "123", author: "peer", url, images: [] } },
  });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.complete, true);
  assert.deepEqual(out.images, []);
  assert.equal(f.calls.length, 1);
});
for (const [label, inventoryPatch, reason] of [
  [
    "different page",
    { pageUrl: "https://x.com/other/status/124" },
    "media-route-changed",
  ],
  [
    "drift",
    { currentURL: "https://x.com/peer/status/124" },
    "media-route-changed",
  ],
  ["missing image", { assets: [] }, "dom-media-unavailable"],
])
  test("asset scope guard: " + label, async (t) => {
    const f = setup(t, { inventoryPatch });
    const out = await f.reader.read({ target: f.target }, f.read);
    assert.equal(out.reason, reason);
    assert.ok(!f.calls.some((x) => Array.isArray(x) && x[0] === "bundle"));
  });
test("partial exports remain incomplete and keep reviewable partial paths", async (t) => {
  const f = setup(t, { bundlePatch: { failures: [{ reason: "not-loaded" }] } });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.complete, false);
  assert.equal(out.reason, "media-export-incomplete");
  assert.equal(out.images.length, 1);
});
test("never accepts arbitrary image origins or silently truncates", async (t) => {
  const f = setup(t);
  f.source.post.images = [{ src: "https://example.com/private.png" }];
  assert.equal(
    (await f.reader.read({ target: f.target }, f.read)).reason,
    "media-image-origin-unconfirmed",
  );
  f.source.post.images = [{ src }, { src: src + "&two=1" }];
  assert.equal(
    (await f.reader.read({ target: f.target, maxImages: 1 }, f.read)).reason,
    "media-limit-incomplete",
  );
  assert.ok(!f.calls.includes("list"));
});
test("bundle exceptions become original proof, not approval", async (t) => {
  const f = setup(t, {
    onBundle() {
      throw Error("host unavailable");
    },
  });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.complete, false);
  assert.equal(out.reason, "media-read-failed");
  assert.match(out.error, /host unavailable/);
  assert.ok(f.store.evidenceExists(out.evidenceRef));
});
test("crossing midnight after inventory prevents bundle", async (t) => {
  let now = Date.parse("2026-10-11T23:59:59+08:00");
  const f = setup(t, {
    clock: () => now,
    onList() {
      now += 2000;
    },
  });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.reason, "night-platform-boundary");
  assert.ok(!f.calls.some((x) => Array.isArray(x) && x[0] === "bundle"));
});
test("an explicit daytime executor expiry cannot fall back to legacy hours", async (t) => {
  let now = Date.parse("2026-10-11T22:59:59+08:00");
  const executor = { id: "reply-worker", scopeKinds: ["reply"] };
  const f = setup(t, {
    executor,
    clock: () => now,
    onList() {
      now += 2000;
    },
  });
  await f.store.transaction(({ state }) => {
    state.executions = {
      ...state.executions,
      [executor.id]: {
        windowAuthorization: {
          kind: "reply",
          executorId: executor.id,
          userAuthorized: true,
          evidenceRef: f.proof,
          startsAt: "2026-10-11T06:00:00+08:00",
          expiresAt: "2026-10-11T23:00:00+08:00",
        },
      },
    };
    return state;
  });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.reason, "night-platform-boundary");
  assert.ok(!f.calls.some((x) => Array.isArray(x) && x[0] === "bundle"));
});

test("an observed photo route remains bound to the same post", async (t) => {
  const f = setup(t, {
    inventoryPatch: { pageUrl: url + "/photo/1", currentURL: url + "/photo/1" },
  });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.complete, true);
});
test("crossing expiry inside export preserves files but performs no further page read", async (t) => {
  let now = Date.parse("2026-10-11T23:59:59+08:00");
  const f = setup(t, {
    clock: () => now,
    onBundle() {
      now += 2000;
    },
  });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.complete, false);
  assert.equal(out.reason, "night-platform-boundary");
  assert.equal(out.images.length, 1);
});
test("quoted media stays unconfirmed rather than exporting another author image", async (t) => {
  const f = setup(t, {
    sourcePatch: {
      post: {
        id: "123",
        author: "peer",
        url,
        images: [{ src }],
        quoteCards: [{ id: "456" }],
      },
    },
  });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.reason, "quoted-media-scope-unconfirmed");
  assert.ok(!f.calls.includes("list"));
});

function domFallback(
  f,
  {
    count = 1,
    bytes = Buffer.from("ffd8ffe00000000000000000", "hex"),
    onCount,
    onDownload,
  } = {},
) {
  const path = join(dirname(f.proof), "observed-image.jpg");
  writeFileSync(path, bytes);
  f.tab.playwright = {
    locator(selector) {
      f.calls.push(["selector", selector]);
      return {
        async count() {
          await onCount?.();
          return count;
        },
        async downloadMedia(options) {
          f.calls.push(["download", options]);
          await onDownload?.();
          return path;
        },
      };
    },
  };
  return path;
}
test("empty host inventory falls back only to the unique exact source image element", async (t) => {
  const f = setup(t, { inventoryPatch: { assets: [] } });
  const path = domFallback(f);
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.complete, true);
  assert.equal(out.acquisition, "dom-media");
  assert.equal(out.images[0].path, path);
  assert.equal(out.images[0].contentType, "image/jpeg");
  assert.equal(
    f.calls.find((x) => Array.isArray(x) && x[0] === "selector")[1],
    `article:has(a[href="/peer/status/123"]) img[src="${src}"]`,
  );
  assert.deepEqual(
    f.calls.find((x) => Array.isArray(x) && x[0] === "download"),
    ["download", { timeoutMs: 10000 }],
  );
});
test("ambiguous DOM image never downloads", async (t) => {
  const f = setup(t, { inventoryPatch: { assets: [] } });
  domFallback(f, { count: 2 });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.reason, "media-dom-image-unconfirmed");
  assert.ok(!f.calls.some((x) => Array.isArray(x) && x[0] === "download"));
});
test("a downloaded non-image file never receives image approval", async (t) => {
  const f = setup(t, { inventoryPatch: { assets: [] } });
  domFallback(f, { bytes: Buffer.from("not an image") });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.reason, "media-format-unconfirmed");
  assert.equal(out.complete, false);
  assert.deepEqual(out.images, []);
});
test("DOM export still obeys cutoff between lookup and download", async (t) => {
  let now = Date.parse("2026-10-11T23:59:59+08:00");
  const f = setup(t, { inventoryPatch: { assets: [] }, clock: () => now });
  domFallback(f, {
    onCount() {
      now += 2000;
    },
  });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.reason, "night-platform-boundary");
  assert.ok(!f.calls.some((x) => Array.isArray(x) && x[0] === "download"));
});
test("DOM download errors retain proof and never switch to broad acquisition", async (t) => {
  const f = setup(t, { inventoryPatch: { assets: [] } });
  domFallback(f, {
    onDownload() {
      throw Error("host transport refused");
    },
  });
  const out = await f.reader.read({ target: f.target }, f.read);
  assert.equal(out.reason, "media-read-failed");
  assert.equal(
    f.calls.filter((x) => Array.isArray(x) && x[0] === "download").length,
    1,
  );
  assert.ok(!f.calls.some((x) => Array.isArray(x) && x[0] === "bundle"));
});

test("invalid image budgets stop before any platform read", async (t) => {
  const f = setup(t);
  for (const timeoutMs of [0, 999, 30001, Infinity, NaN])
    assert.equal(
      (await f.reader.read({ target: f.target, timeoutMs }, f.read)).reason,
      "media-options-invalid",
    );
  assert.deepEqual(f.calls, []);
});
