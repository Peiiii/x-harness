import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/diagnostics.js";

for (const mismatch of [false, true])
  test(`follow persistence reload has no unrelated network-idle dependency; wrong route=${mismatch}`, async () => {
    let idle = 0,
      reloads = 0,
      ready = 0;
    const target = {
      waitFor: async () => {
        ready++;
      },
      count: async () => 1,
    };
    const browser = createDOMXBrowser({
      url: async () =>
        mismatch ? "https://x.com/other" : "https://x.com/reader",
      reload: async () => {
        reloads++;
      },
      playwright: {
        waitForLoadState: async () => {
          idle++;
          throw Error("unrelated traffic must never block persistence");
        },
        getByRole: () => target,
        locator: () => ({ isVisible: async () => false }),
      },
    });
    const run = () =>
      browser.act({
        operation: "refreshPerson",
        url: "https://x.com/reader",
        handle: "reader",
      });
    if (mismatch) await assert.rejects(run(), /页面不匹配/);
    else await run();
    assert.equal(idle, 0);
    assert.equal(reloads, mismatch ? 0 : 1);
    assert.equal(ready, mismatch ? 0 : 1);
  });
