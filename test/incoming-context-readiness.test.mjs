import test from "node:test";
import assert from "node:assert/strict";
import {
  createBusinessHarness,
  createXPlatform,
  createDOMXBrowser,
} from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

for (const mode of ["delayed", "absent", "ready", "alert"]) {
  test(`one incoming business read handles owned ancestor: ${mode}`, async (t) => {
    const f = fixture(t);
    const root = {
      id: "1",
      author: "Pei",
      body: "Our full root",
      datetime: new Date(NOW).toISOString(),
      primary: "/Pei/status/1",
    };
    const reply = {
      id: "2",
      author: "Reader",
      body: "The full received comment",
      datetime: new Date(NOW).toISOString(),
      primary: "/Reader/status/2",
      replyToId: "1",
    };
    let loaded = mode === "ready",
      waits = 0;
    const browser = {
      capabilities: () => [],
      observe: async (query) => ({
        page: "https://x.com/Reader/status/2",
        accountHandle: "Pei",
        needsStateCheck: false,
        alerts: mode === "alert" ? ["Please verify identity"] : [],
        posts: query.targetId ? [reply] : loaded ? [root, reply] : [reply],
        missing: [],
      }),
      act: async (command) => {
        assert.equal(command.operation, "waitForPosts");
        assert.equal(command.ancestorHandle, "Pei");
        assert.equal(command.targetId, "2");
        waits++;
        if (mode === "delayed") loaded = true;
        else throw Error("Timed out waiting for owned ancestor");
      },
    };
    const api = createBusinessHarness({
      store: f.store,
      platform: createXPlatform(browser),
    });
    const result = await api.readIncomingConversations({
      targets: [
        {
          postId: "2",
          url: "https://x.com/Reader/status/2",
          evidenceRef: f.proof,
        },
      ],
    });
    assert.equal(waits, mode === "ready" || mode === "alert" ? 0 : 1);
    assert.equal(
      result.conversations[0].complete,
      mode === "delayed" || mode === "ready",
    );
    if (mode === "absent")
      assert.ok(
        result.conversations[0].missing.includes(
          "incoming-ancestor-wait-exhausted",
        ),
      );
    if (mode === "delayed")
      assert.deepEqual(result.conversations[0].edges, [
        { parentId: "1", childId: "2" },
      ]);
    assert.equal(
      (await f.store.load()).state.actions.length,
      3,
      "read creates no submission intent",
    );
  });
}

test("DOM ancestor wait excludes target article and uses a bounded semantic wait", async () => {
  const calls = [];
  const article = {
    filter(value) {
      calls.push(value);
      return this;
    },
    first() {
      return this;
    },
    async waitFor(options) {
      calls.push(options);
    },
  };
  const tab = {
    playwright: {
      getByRole(role) {
        assert.equal(role, "article");
        return article;
      },
      locator(selector) {
        return { selector };
      },
    },
  };
  const browser = createDOMXBrowser(tab);
  await browser.act({
    operation: "waitForPosts",
    ancestorHandle: "Pei",
    targetId: "2",
  });
  assert.deepEqual(calls[0], {
    has: { selector: 'a[href^="/Pei/status/"]' },
    hasNot: { selector: 'a[href$="/status/2"]' },
  });
  assert.deepEqual(calls[1], { state: "visible", timeoutMs: 5000 });
  await assert.rejects(
    browser.act({
      operation: "waitForPosts",
      ancestorHandle: 'bad"handle',
      targetId: "2",
    }),
    /invalid/,
  );
});
