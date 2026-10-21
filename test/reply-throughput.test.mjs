import test from "node:test";
import assert from "node:assert/strict";
import { normalInteractionIntervalMs } from "../dist/growth-policy.js";
import { PlatformCollections } from "../dist/platform-collections.js";
import { fixture, NOW } from "./fixtures.mjs";
const config = {
  minimumIntervalMs: 6000,
  notBefore: new Date(NOW - 60000).toISOString(),
  notAfter: new Date(NOW + 60000).toISOString(),
  evidenceRef: "review",
};
test("cadence defaults, active override, expiry and invalid evidence", () => {
  assert.equal(
    normalInteractionIntervalMs({}, NOW, () => true),
    30000,
  );
  assert.equal(
    normalInteractionIntervalMs({ interactionPacing: config }, NOW, () => true),
    6000,
  );
  assert.equal(
    normalInteractionIntervalMs(
      { interactionPacing: config },
      NOW + 60000,
      () => true,
    ),
    30000,
  );
  assert.throws(
    () =>
      normalInteractionIntervalMs(
        { interactionPacing: config },
        NOW,
        () => false,
      ),
    /pacing-invalid/,
  );
  assert.throws(
    () =>
      normalInteractionIntervalMs(
        { interactionPacing: { ...config, minimumIntervalMs: -1 } },
        NOW,
        () => true,
      ),
    /pacing-invalid/,
  );
});
for (const enabled of [false, true])
  test(`actual reply admission uses shared evidenced cadence ${enabled}`, async (t) => {
    const f = fixture(t, { planned: [0, 0, 1], actionKinds: ["reply"] });
    await f.store.transaction(({ state }) => {
      state.actions[0].conversation = {
        recipientHandle: "author",
        rootId: "123",
        round: 1,
      };
      state.reactions = [
        {
          postId: "999",
          status: "verified",
          intentAt: new Date(NOW - 7000).toISOString(),
        },
      ];
      if (enabled)
        state.interactionPacing = {
          ...config,
          evidenceRef: state.actions[0].evidenceRef,
        };
      return state;
    });
    const { api } = f.newExecutor("reply", ["reply"]);
    await api.replyToPost({
      taskId: "round-1",
      postId: "123",
      text: "有具体贡献的回复",
    });
    assert.equal(f.writes.length, enabled ? 1 : 0);
  });
test("excluded authors never expand and do not consume source result capacity", async () => {
  const posts = [
    { id: "101", author: "OLD_AUTHOR", needsExpansion: true },
    {
      id: "102",
      author: "new_author",
      body: "互关",
      datetime: "2026-10-21T12:00:00Z",
      primary: "/new_author/status/102",
      needsExpansion: false,
    },
  ];
  const frame = {
    page: "https://x.com/search?q=example",
    accountHandle: "owner",
    posts,
    needsStateCheck: false,
    alerts: [],
  };
  const acts = [];
  const c = new PlatformCollections({
    ready: async () => frame,
    observed: async () => frame,
    browser: { act: async (x) => acts.push(x) },
    choose: () => {},
  });
  const r = await c.collectSources({
    limit: 1,
    maxPages: 1,
    excludedHandles: ["@old_author"],
  });
  assert.deepEqual(
    r.sources.map((x) => x.id),
    ["102"],
  );
  assert.deepEqual(r.excludedSourceIds, ["101"]);
  assert.deepEqual(acts, []);
  await assert.rejects(
    c.collectSources({ excludedHandles: ["bad handle"] }),
    /handles-invalid/,
  );
});
