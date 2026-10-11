import test from "node:test";
import assert from "node:assert/strict";
import { BusinessHarness, createBusinessHarness } from "../dist/api.js";
import { SerializedBrowser, serialized } from "../dist/browser-common.js";
import { fixture } from "./fixtures.mjs";

test("class constructors perform no browser reads and detached methods retain their owner", async (t) => {
  const f = fixture(t);
  let reads = 0;
  const platform = {
    preflight: () => ({ covered: true }),
    captureProof: ({ observation }) => ({ observation }),
    searchSources: async () => {
      reads++;
      return {
        sources: [
          {
            id: "11",
            body: "full body",
            author: "source",
            url: "https://x.com/source/status/11",
          },
        ],
        complete: true,
      };
    },
  };
  const first = createBusinessHarness({ store: f.store, platform });
  const second = new BusinessHarness({ store: f.store, platform });
  assert.ok(first instanceof BusinessHarness);
  assert.equal(reads, 0);
  const { searchSources } = first;
  const a = await searchSources({ query: "AI", mode: "delta" });
  const b = await searchSources({ query: "AI", mode: "delta" });
  const c = await second.searchSources({ query: "AI", mode: "delta" });
  assert.equal(a.sources.length, 1);
  assert.deepEqual(b.unchangedIds, ["11"]);
  assert.equal(c.sources.length, 1);
  assert.equal(reads, 3);
  assert.ok(!JSON.stringify(first).includes("readCache"));
});

test("browser class keeps a per-instance mutex and releases it after errors", async () => {
  let finish;
  const first = serialized({
    observe: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    act: async () => "acted",
    screenshot: async () => "image",
  });
  const second = new SerializedBrowser({
    observe: async () => "independent",
    act: async () => {
      throw Error("failed");
    },
    screenshot: async () => "image",
  });
  const { observe } = first;
  const pending = observe({});
  await assert.rejects(first.act({}), /禁止并发/);
  assert.equal(await second.observe({}), "independent");
  finish("complete");
  assert.equal(await pending, "complete");
  assert.equal(await first.act({}), "acted");
  await assert.rejects(second.act({}), /failed/);
  assert.equal(await second.screenshot(), "image");
  assert.equal(first.collectCreator, undefined);
});
