import test from "node:test";
import assert from "node:assert/strict";
import { createPlatformObservation } from "../dist/platform-observation.js";
import { createPlatformTargets } from "../dist/platform-targets.js";
import { createBusinessHarness, createXPlatform } from "../dist/diagnostics.js";
import { fixture as businessFixture, NOW } from "./fixtures.mjs";

test("explicit root inspection always refreshes a primed session", async (t) => {
  const f = businessFixture(t);
  let reads = 0;
  const observe = f.browser.observe.bind(f.browser);
  f.browser.observe = async (query) => {
    if (query.view === "account") reads++;
    return observe(query);
  };
  const platform = createXPlatform(f.browser, { clock: () => NOW });
  const api = createBusinessHarness({
    platform,
    store: f.store,
    clock: () => NOW,
  });
  await platform.readAccount();
  await platform.readAccount();
  assert.equal(reads, 1);
  const result = await api.inspectAccount({ mode: "decision" });
  assert.equal(result.fresh, true);
  assert.equal(result.complete, true);
  assert.equal(reads, 2);
});

function fixture() {
  const calls = [];
  let surface = {
    page: "https://x.com/home",
    accountHandle: "Owner",
    alerts: [],
    needsStateCheck: false,
  };
  const observation = createPlatformObservation({
    clock: () => Date.parse("2026-01-01T00:00:00Z"),
    browser: {
      async observe(query) {
        calls.push(query.view);
        if (surface instanceof Error) throw surface;
        return { ...surface };
      },
    },
  });
  return {
    observation,
    calls,
    set(value) {
      surface = value;
    },
  };
}

test("normal session reuses identity and explicit inspection is fresh", async () => {
  const f = fixture();
  const first = await f.observation.readAccount();
  assert.equal(first.fresh, true);
  for (let i = 0; i < 5; i++) {
    const reused = await f.observation.readAccount();
    assert.equal(reused.accountHandle, "Owner");
    assert.equal(reused.fresh, false);
    assert.equal(reused.identityReused, true);
  }
  assert.deepEqual(f.calls, ["account"]);
  assert.equal((await f.observation.readAccount({ force: true })).fresh, true);
  assert.deepEqual(f.calls, ["account", "account"]);
});

test("ordinary target observation supplies identity without a standalone read", async () => {
  const f = fixture();
  await f.observation.observed({ view: "posts" });
  assert.equal((await f.observation.readAccount()).accountHandle, "Owner");
  assert.deepEqual(f.calls, ["posts"]);
});

for (const invalid of [
  { accountHandle: null, needsStateCheck: true },
  { accountHandle: "Owner", alerts: ["请登录"] },
  { accountHandle: "Owner", needsStateCheck: true },
]) {
  test(`negative fresh evidence invalidates session: ${JSON.stringify(invalid)}`, async () => {
    const f = fixture();
    await f.observation.readAccount();
    f.set({ page: "https://x.com/home", alerts: [], ...invalid });
    await f.observation.observed({ view: "posts" });
    const result = await f.observation.readAccount();
    assert.notEqual(result.identityReused, true);
    assert.deepEqual(f.calls, ["account", "posts", "account"]);
  });
}

test("observation exception invalidates cached identity and bindings do not share it", async () => {
  const f = fixture();
  await f.observation.readAccount();
  f.set(Error("connection interrupted"));
  await assert.rejects(() => f.observation.observed({ view: "posts" }));
  await assert.rejects(() => f.observation.readAccount());
  const other = fixture();
  await other.observation.readAccount();
  assert.deepEqual(other.calls, ["account"]);
});

test("fresh switched account replaces reuse; it is not rewritten to the expected owner", async () => {
  const f = fixture();
  await f.observation.readAccount();
  f.set({ page: "https://x.com/home", accountHandle: "Other", alerts: [] });
  await f.observation.observed({ view: "posts" });
  assert.equal((await f.observation.readAccount()).accountHandle, "Other");
});

for (const accountHandle of ["Owner", "Other", null]) {
  test(`incoming like uses exact target account without a separate identity read: ${accountHandle}`, async () => {
    const activations = [];
    const targets = createPlatformTargets({
      async observed() {
        throw Error("redundant account-only observation");
      },
      async open() {
        return {
          page: "https://x.com/Peer/status/123",
          accountHandle,
          posts: [
            {
              id: "123",
              author: "Peer",
              body: "Hello",
              datetime: "2026-01-01T00:00:00Z",
            },
          ],
          alerts: [],
        };
      },
      browser: {
        async act(command) {
          activations.push(command);
          return {};
        },
      },
      async ready() {
        throw Error("unexpected readiness");
      },
    });
    const action = () =>
      targets.likePost({
        postId: "123",
        url: "https://x.com/Peer/status/123",
        author: "Peer",
        accountHandle: "Owner",
      });
    if (accountHandle === "Owner") await action();
    else await assert.rejects(action, /account|target/);
    assert.equal(activations.length, accountHandle === "Owner" ? 1 : 0);
  });
}
