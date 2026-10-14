import test from "node:test";
import assert from "node:assert/strict";
import { PlatformObservation } from "../dist/platform-observation.js";
import { PlatformCollections } from "../dist/platform-collections.js";

async function readLoadingSource(mode) {
  let waits = 0;
  const page = "https://x.com/search?q=example";
  const browser = {
    observe: async () => ({
      page: mode === "route" && waits ? "https://x.com/home" : page,
      accountHandle: "example_owner",
      loading: true,
      posts:
        (mode === "ready" && waits >= 3) || (mode === "route" && waits)
          ? [
              {
                id: "123",
                author: "example_user",
                body: "Example source",
                datetime: "2026-01-01T00:00:00Z",
                primary: "/example_user/status/123",
              },
            ]
          : [],
      alerts: mode === "alert" && waits ? ["Example platform alert"] : [],
      needsStateCheck: false,
    }),
    act: async ({ operation }) => {
      assert.equal(operation, "waitForPosts");
      waits++;
      throw Error("Playwright selector deadline exceeded");
    },
  };
  const observation = new PlatformObservation({ browser, clock: () => 0 });
  const collections = new PlatformCollections({
    browser,
    ready: observation.ready,
    observed: observation.observed,
    choose: observation.choose,
  });
  return { result: await collections.collectSources({ limit: 1 }), waits };
}

test("source loading survives host-capped waits and returns the actual later card", async () => {
  const { result, waits } = await readLoadingSource("ready");
  assert.equal(result.complete, true);
  assert.equal(result.sources[0].id, "123");
  assert.equal(waits, 3);
});

test("persistently loading sources remain unconfirmed after a bounded continuation", async () => {
  const { result, waits } = await readLoadingSource("exhausted");
  assert.equal(result.complete, false);
  assert.deepEqual(result.sources, []);
  assert.equal(waits, 4);
});

for (const mode of ["route", "alert"]) {
  test(`source continuation stops immediately on changed ${mode} evidence`, async () => {
    const { result, waits } = await readLoadingSource(mode);
    assert.equal(result.complete, false);
    assert.deepEqual(result.sources, []);
    assert.equal(waits, 1);
  });
}
