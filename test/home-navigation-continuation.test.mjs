import test from "node:test";
import assert from "node:assert/strict";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
for (const current of ["https://x.com/home", "https://x.com/peer/status/123"])
  test(`recommendation continuation preserves home position from ${current}`, async () => {
    let goto = 0;
    const session = { current: { stale: true } };
    const nav = new DOMNavigation({
      session,
      tab: {
        url: async () => current,
        goto: async (u) => {
          assert.equal(u, "https://x.com/home");
          goto++;
        },
      },
      observe: async () => ({}),
    });
    await nav.openHomeRecommendations({});
    assert.equal(goto, current === "https://x.com/home" ? 0 : 1);
    assert.equal(session.current, null);
  });
