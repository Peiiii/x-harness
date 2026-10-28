import test from "node:test";
import assert from "node:assert/strict";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
const url = "https://x.com/example_owner/status/123";
async function open(t, fault) {
  const calls = [];
  let page = "https://x.com/example_owner",
    time = 0,
    waits = 0;
  t.mock.method(Date, "now", () => time);
  const permalink = {
    filter() {
      return this;
    },
    count: async () => 0,
  };
  const articles = {
    filter(options) {
      calls.push(["target", options.has]);
      return this;
    },
    first() {
      return {
        waitFor: async (options) => {
          assert.deepEqual(Object.keys(options).sort(), ["state", "timeoutMs"]);
          calls.push(["article", options]);
          waits++;
          time += options.timeoutMs;
          if (
            (fault === "late-article" && waits === 1) ||
            [
              "article-timeout",
              "alert",
              "changed-route",
              "interrupted-article",
            ].includes(fault)
          )
            throw Error(
              fault === "interrupted-article"
                ? "connection interrupted"
                : "Playwright selector deadline exceeded",
            );
        },
      };
    },
  };
  const navigation = new DOMNavigation({
    session: {},
    observe: async () => {
      calls.push(["observe"]);
      return {
        page: fault === "changed-route" ? "https://x.com/home" : page,
        alerts: ["alert", "goto-alert"].includes(fault) ? ["challenge"] : [],
        needsStateCheck: true,
      };
    },
    tab: {
      url: async () => page,
      goto: async (destination) => {
        calls.push(["goto", destination]);
        if (!["url-timeout", "goto-wrong-route", "interrupted"].includes(fault))
          page = destination;
        if (fault?.startsWith("goto-"))
          throw Error(`Timed out waiting for URL ${destination}`);
      },
      playwright: {
        locator: () => permalink,
        getByRole: () => articles,
        waitForURL: async (destination, options) => {
          calls.push(["url", options]);
          assert.equal(destination, url);
          assert.equal(options.waitUntil, "commit");
          if (fault === "interrupted") throw Error("connection interrupted");
          if (["committed-url-timeout", "url-timeout"].includes(fault))
            throw Error("Timed out waiting for URL");
        },
      },
    },
  });
  try {
    await navigation.openObserved({
      url,
      view: "posts",
      evidenceRef: "synthetic-proof",
    });
    return { calls, waits };
  } catch (error) {
    return { calls, waits, error };
  }
}
test("cold detail uses CUA timeoutMs, URL commit and the exact public permalink article", async (t) => {
  const r = await open(t);
  assert.equal(r.error, undefined);
  assert.deepEqual(
    r.calls.map((x) => x[0]),
    ["goto", "target", "article"],
  );
  assert.equal(r.calls.at(-1)[1].timeoutMs, 5000);
});
test("a host URL timeout on the fresh committed target continues to strict article readiness", async (t) => {
  const r = await open(t, "committed-url-timeout");
  assert.equal(r.error, undefined);
  assert.equal(r.calls.filter((x) => x[0] === "goto").length, 1);
  assert.equal(r.waits, 1);
});
test("a host capped article wait resumes only after fresh unchanged alert-free route evidence", async (t) => {
  const r = await open(t, "late-article");
  assert.equal(r.error, undefined);
  assert.equal(r.waits, 2);
  assert.equal(r.calls.filter((x) => x[0] === "observe").length, 1);
});
for (const fault of [
  "url-timeout",
  "interrupted",
  "article-timeout",
  "alert",
  "changed-route",
  "interrupted-article",
])
  test(`detail ${fault} never renavigates or submits`, async (t) => {
    const r = await open(t, fault);
    assert.ok(r.error);
    assert.equal(r.calls.filter((x) => x[0] === "goto").length, 1);
    assert.ok(r.waits <= 3);
    if (fault === "article-timeout") assert.equal(r.waits, 3);
    if (["alert", "changed-route", "interrupted-article"].includes(fault))
      assert.equal(r.waits, 1);
  });

for (const fault of ["goto-committed", "goto-wrong-route", "goto-alert"])
  test(`host goto timeout retains strict detail boundary: ${fault}`, async (t) => {
    const r = await open(t, fault);
    assert.equal(r.calls.filter((x) => x[0] === "goto").length, 1);
    if (fault === "goto-committed") {
      assert.equal(r.error, undefined);
      assert.equal(r.waits, 1);
    } else {
      assert.ok(r.error);
      assert.equal(r.waits, 0);
    }
  });

test("an exact committed route skips URL waiting but never skips target visibility", async (t) => {
  const r = await open(t, "committed-url-timeout");
  assert.equal(r.error, undefined);
  assert.equal(
    r.calls.some((c) => c[0] === "url"),
    false,
  );
  assert.equal(
    r.calls.some((c) => c[0] === "target"),
    true,
  );
  assert.equal(r.waits, 1);
});
