import test from "node:test";
import assert from "node:assert/strict";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
for (const fault of [
  "late",
  "exhausted",
  "changed-route",
  "alert",
  "interrupted",
]) {
  test(`refresh readiness ${fault} reloads once and preserves the public boundary`, async (t) => {
    const url = "https://x.com/example_owner/status/123";
    let time = 0,
      reloads = 0,
      waits = 0,
      observations = 0;
    t.mock.method(Date, "now", () => time);
    const nav = new DOMNavigation({
      session: {},
      observe: async () => {
        observations++;
        return {
          page: fault === "changed-route" ? "https://x.com/home" : url,
          alerts: fault === "alert" ? ["challenge"] : [],
        };
      },
      tab: {
        url: async () => url,
        reload: async () => {
          reloads++;
        },
        playwright: {
          getByRole: () => ({
            first: () => ({
              waitFor: async () => {
                waits++;
                time += 3000;
                if (fault !== "late" || waits === 1)
                  throw Error(
                    fault === "interrupted"
                      ? "connection interrupted"
                      : "Playwright selector deadline exceeded",
                  );
              },
            }),
          }),
        },
      },
    });
    const promise = nav.refreshPosts({ url, evidenceRef: "synthetic-proof" });
    if (fault === "late") {
      await promise;
      assert.equal(waits, 2);
      assert.equal(observations, 1);
    } else {
      await assert.rejects(promise);
      assert.equal(waits, fault === "exhausted" ? 4 : 1);
    }
    assert.equal(reloads, 1);
  });
}
