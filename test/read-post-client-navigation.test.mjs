import test from "node:test";
import assert from "node:assert/strict";
import { createDOMXBrowser } from "../dist/browser-dom.js";
import { createPlatformObservation } from "../dist/platform-observation.js";
import { createPlatformTargets } from "../dist/platform-targets.js";

function fixture(mode) {
  const target = "https://x.com/peer/status/123";
  let page = mode === "same" ? target : "https://x.com/peer";
  const calls = [];
  const link = {
    filter() {
      return this;
    },
    first() {
      return this;
    },
    count: async () => (mode === "missing" ? 0 : mode === "ambiguous" ? 2 : 1),
    click: async () => {
      calls.push("client-click");
      page = mode === "changed-route" ? "https://x.com/home" : target;
    },
    waitFor: async () => {},
  };
  const browser = createDOMXBrowser({
    url: async () => page,
    goto: async (url) => {
      calls.push("goto");
      page = url;
    },
    playwright: {
      locator: () => link,
      getByRole: () => link,
      waitForURL: async (url) => {
        if (page !== url) throw Error("Timed out waiting for URL");
      },
      evaluate: async () => ({
        page,
        accountHandle: "Writer",
        needsStateCheck: false,
        alerts: mode === "alert" ? ["HTTP429 transient refusal"] : [],
        posts: [
          ...(mode === "missing-parent-body"
            ? [
                {
                  id: "122",
                  author: "root",
                  body: null,
                  datetime: "2026-11-01T00:00:00Z",
                },
              ]
            : []),
          {
            id: "123",
            author: "peer",
            body: mode === "missing-body" ? "" : "Exact observed body",
            datetime: "2026-11-01T00:00:00Z",
          },
        ],
      }),
    },
  });
  const observation = createPlatformObservation({ browser, clock: () => 0 });
  const api = createPlatformTargets({
    browser,
    open: observation.open,
    observed: observation.observed,
    ready: observation.ready,
  });
  return {
    api,
    calls,
    input: {
      postId: "123",
      url: target,
      evidenceRef: "synthetic-observed-proof",
    },
  };
}
for (const [mode, calls] of [
  ["unique", ["client-click"]],
  ["same", []],
  ["missing", ["goto"]],
  ["ambiguous", ["goto"]],
]) {
  test(`ordinary readPost reuses safe client navigation: ${mode}`, async () => {
    const f = fixture(mode);
    const result = await f.api.readPost(f.input);
    assert.deepEqual(f.calls, calls);
    assert.equal(result.page, f.input.url);
    assert.equal(result.posts[0].id, "123");
  });
}
test("wrong client destination never authorizes another navigation retry", async () => {
  const f = fixture("changed-route");
  await assert.rejects(f.api.readPost(f.input));
  assert.deepEqual(f.calls, ["client-click"]);
});
test("actual platform alerts remain visible without a reload or another click", async () => {
  const f = fixture("alert");
  const result = await f.api.readPost(f.input);
  assert.deepEqual(result.alerts, ["HTTP429 transient refusal"]);
  assert.deepEqual(f.calls, ["client-click"]);
});
test("explicit strict observed-link requirement retains its original refusal", async () => {
  const f = fixture("missing");
  await assert.rejects(
    f.api.readPost({ ...f.input, preferClientNavigation: true }),
    /original-receipt-link-not-currently-visible/,
  );
  assert.deepEqual(f.calls, []);
});

for (const mode of ["missing-body", "missing-parent-body"]) {
  test(`client navigation does not complete incomplete content: ${mode}`, async () => {
    const f = fixture(mode);
    const result = await f.api.readPost({
      ...f.input,
      expand: true,
      includeContext: mode === "missing-parent-body",
    });
    assert.equal(result.complete, false);
    assert.ok(
      result.missing.includes(
        mode === "missing-body"
          ? "exact-body-unconfirmed"
          : "conversation-context-incomplete",
      ),
    );
    assert.deepEqual(f.calls, ["client-click"]);
  });
}
