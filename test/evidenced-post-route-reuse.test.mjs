import test from "node:test";
import assert from "node:assert/strict";
import { PlatformObservation } from "../dist/platform-observation.js";
const first = "https://x.com/alice/status/100000000001";
const next = "https://x.com/bob/status/100000000002";
const query = { view: "posts", targetId: "100000000002" };
function fixture() {
  let page = first,
    observations = 0,
    acts = 0;
  let overrides = {},
    fail = false;
  const api = new PlatformObservation({
    clock: () => Date.now(),
    browser: {
      observe: async () => {
        observations++;
        return {
          page,
          accountHandle: "alice",
          accountURL: "https://x.com/alice",
          needsStateCheck: false,
          alerts: [],
          posts: [{ id: page.split("/").at(-1), body: "fresh destination" }],
          ...overrides,
        };
      },
      act: async (command) => {
        acts++;
        if (fail) throw Error("navigation failed");
        page = command.url;
      },
    },
  });
  return {
    api,
    counts: () => ({ observations, acts }),
    override: (x) => {
      overrides = x;
    },
    fail: () => {
      fail = true;
    },
  };
}
const target = { url: next, evidenceRef: "synthetic-proof" };
test("trusted previous route removes one previous-page observe but returns fresh target", async () => {
  const f = fixture();
  await f.api.observed({ view: "posts" });
  const before = f.counts();
  const r = await f.api.open(target, query);
  assert.equal(f.counts().observations - before.observations, 1);
  assert.equal(f.counts().acts, 1);
  assert.equal(r.page, next);
  assert.equal(r.posts[0].body, "fresh destination");
  assert.equal(r.fresh, true);
});
test("same target and absent trusted route still observe current content", async () => {
  const f = fixture();
  await f.api.open(target, query);
  const before = f.counts();
  await f.api.open(target, query);
  assert.equal(f.counts().observations - before.observations, 1);
  assert.equal(f.counts().acts, before.acts);
});
test("thread read observes current alerts and must not navigate through them", async () => {
  const f = fixture();
  await f.api.observed({ view: "posts" });
  f.override({ alerts: ["captcha"] });
  const r = await f.api.open(target, {
    ...query,
    threadRootId: "100000000002",
  });
  assert.deepEqual(r.alerts, ["captcha"]);
  assert.equal(r.needsStateCheck, true);
  assert.equal(f.counts().acts, 0);
});
test("destination alert and identity failure propagate, never cached identity/content", async () => {
  const f = fixture();
  await f.api.observed({ view: "posts" });
  f.override({
    alerts: ["login required"],
    accountHandle: null,
    needsStateCheck: true,
    posts: [],
  });
  const r = await f.api.open(target, query);
  assert.deepEqual(r.alerts, ["login required"]);
  assert.equal(r.accountHandle, null);
  assert.deepEqual(r.posts, []);
});
test("navigation failure stays failure with no cached success", async () => {
  const f = fixture();
  await f.api.observed({ view: "posts" });
  f.fail();
  await assert.rejects(f.api.open(target, query), /navigation failed/);
});
test("invalidated identity cache and mismatched target retain the existing observation path", async () => {
  const f = fixture();
  f.override({ accountHandle: null });
  await f.api.observed({ view: "posts" });
  f.override({});
  const n = f.counts().observations;
  await f.api.open(target, query);
  assert.equal(f.counts().observations - n, 2);
  const g = fixture();
  await g.api.observed({ view: "posts" });
  const b = g.counts().observations;
  await g.api.open(target, { ...query, targetId: "100000000003" });
  assert.equal(g.counts().observations - b, 2);
});
