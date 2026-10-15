import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformObservation } from "../dist/platform-observation.js";

for (const mode of [
  "committed",
  "unchanged",
  "wrong-route",
  "alert",
  "incomplete",
  "wrong-account",
  "other-error",
  "person",
]) {
  test(`one post navigation timeout observation: ${mode}`, async () => {
    const url = "https://x.com/peer/status/123";
    let reads = 0;
    let navigations = 0;
    let forced = false;
    const observation = createPlatformObservation({
      clock: () => Date.parse("2026-10-15T01:00:00Z"),
      browser: {
        observe: async () => {
          reads++;
          return {
            page:
              mode === "wrong-route" && reads > 1
                ? "https://x.com/explore"
                : reads === 1 ||
                    mode === "wrong-account" ||
                    (mode === "unchanged" && !forced)
                  ? "https://x.com/home"
                  : url,
            accountHandle:
              mode === "wrong-account" && reads > 1 ? "other" : "owner",
            needsStateCheck: mode === "incomplete",
            alerts: mode === "alert" ? ["verification needed"] : [],
            posts: [{ id: "123", body: "Observed body" }],
          };
        },
        act: async (command) => {
          assert.equal(command.operation, "openObserved");
          assert.equal(command.url, url);
          navigations++;
          if (command.forceNavigation) {
            assert.equal(mode, "unchanged");
            forced = true;
            return;
          }
          throw Error(
            mode === "other-error"
              ? "transport disconnected"
              : `Timed out waiting for URL ${url}`,
          );
        },
      },
    });
    const run = () =>
      observation.open(
        { url, evidenceRef: "original-observed-proof" },
        { view: mode === "person" ? "person" : "posts", targetId: "123" },
      );
    if (["committed", "unchanged"].includes(mode)) {
      const result = await run();
      assert.equal(result.page, url);
      assert.equal(result.fresh, true);
      assert.equal(result.verified, undefined);
      assert.equal(reads, 3);
    } else {
      await assert.rejects(run());
      assert.equal(reads, ["other-error", "person"].includes(mode) ? 1 : 2);
    }
    assert.equal(navigations, mode === "unchanged" ? 2 : 1);
  });
}

test("thread reads directly open the evidenced root before checking membership", async () => {
  const url = "https://x.com/peer/status/123";
  let page = "https://x.com/home";
  const commands = [];
  const observation = createPlatformObservation({
    clock: () => Date.parse("2026-10-15T01:00:00Z"),
    browser: {
      observe: async () => ({
        page,
        accountHandle: "owner",
        alerts: [],
        needsStateCheck: page !== url,
        threadRootPresent: page === url,
        posts: page === url ? [{ id: "123", body: "Root" }] : [],
      }),
      act: async (command) => {
        commands.push(command);
        // A scoped reader cannot validate an inert visible link on another thread.
        if (!command.forceNavigation)
          throw Error(`Timed out waiting for URL ${url}`);
        page = url;
      },
    },
  });
  const result = await observation.open(
    { url, evidenceRef: "observed-root-proof" },
    { view: "posts", threadRootId: "123" },
  );
  assert.equal(commands.length, 1);
  assert.equal(commands[0].operation, "openObserved");
  assert.equal(commands[0].evidenceRef, "observed-root-proof");
  assert.equal(commands[0].url, url);
  assert.equal(result.threadRootPresent, true);
  assert.equal(result.verified, undefined);
});
