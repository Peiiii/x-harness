import test from "node:test";
import assert from "node:assert/strict";
import { attachImage } from "../dist/readers-actions.js";
function fixture(count = 1) {
  const events = [];
  const tab = {
    playwright: {
      evaluate: async () => ({
        needsStateCheck: false,
        alerts: [],
        buttons: [{ label: "添加照片或视频" }],
      }),
      getByRole: () => ({
        count: async () => 1,
        click: async () => events.push("button"),
      }),
      locator: (s) => {
        assert.equal(s, 'input[type="file"][accept*="image"]');
        return {
          count: async () => count,
          click: async () => events.push("input"),
        };
      },
      waitForEvent: async (kind) => {
        assert.equal(kind, "filechooser");
        events.push("armed");
        return {
          setFiles: async (paths) => {
            events.push(paths);
          },
        };
      },
    },
  };
  return { tab, events };
}
test("unique observed file input is clicked after arming one chooser", async () => {
  let f = fixture();
  await attachImage(f.tab, { path: "/synthetic/post.png" });
  assert.deepEqual(f.events, ["armed", "input", ["/synthetic/post.png"]]);
});
test("ambiguous file inputs retain unique semantic upload button", async () => {
  let f = fixture(2);
  await attachImage(f.tab, { path: "/synthetic/post.png" });
  assert.deepEqual(f.events, ["armed", "button", ["/synthetic/post.png"]]);
});
test("unconfirmed composer never opens file input", async () => {
  let f = fixture();
  f.tab.playwright.evaluate = async () => ({ needsStateCheck: true });
  await assert.rejects(
    attachImage(f.tab, { path: "/synthetic/post.png" }),
    /未确认/,
  );
  assert.deepEqual(f.events, []);
});
