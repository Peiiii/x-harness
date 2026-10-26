import test from "node:test";
import assert from "node:assert/strict";
import {
  BrowserAccountReader,
  readBrowserAccountIdentity,
} from "../dist/browser-account.js";
function fixture(overrides = {}) {
  const calls = [];
  const profile = {
    followers: { value: 1234, text: "1,234 Followers", precision: "exact" },
    following: { value: 12, text: "12 Following", precision: "exact" },
    observedAt: "2026-10-26T10:00:00Z",
    alerts: [],
  };
  const results = [
    { handle: "sample_user", path: "/home" },
    { handle: "sample_user", path: "/sample_user" },
    profile,
    { handle: "sample_user", path: "/sample_user" },
  ];
  const host = {
    tabs: {
      get: async () => ({ status: "complete" }),
      create: async (input) => {
        calls.push(["create", input]);
        return { id: 77 };
      },
      update: async (id, input) => calls.push(["update", id, input]),
      remove: async (id) => calls.push(["remove", id]),
    },
    scripting: {
      executeScript: async (input) => {
        calls.push(["read", input.target]);
        return [{ result: results.shift() }];
      },
    },
    ...overrides,
  };
  return { calls, host, results };
}
test("reads the authenticated account using its own inactive tab and closes it", async () => {
  const f = fixture();
  const result = await new BrowserAccountReader(f.host).read();
  assert.equal(result.handle, "sample_user");
  assert.equal(result.followers.value, 1234);
  assert.equal(result.following.value, 12);
  assert.deepEqual(f.calls[0], [
    "create",
    { url: "https://x.com/home", active: false },
  ]);
  assert.deepEqual(f.calls.at(-1), ["remove", 77]);
});
test("does not switch a previous binding silently", async () => {
  const f = fixture();
  await assert.rejects(
    new BrowserAccountReader(f.host).read("another_user"),
    /account-changed/,
  );
  assert.equal(f.calls.filter((c) => c[0] === "update").length, 0);
  assert.deepEqual(f.calls.at(-1), ["remove", 77]);
});
test("rechecks identity after reading counters before returning them", async () => {
  const f = fixture();
  f.results[3] = { handle: "other_user", path: "/sample_user" };
  await assert.rejects(
    new BrowserAccountReader(f.host).read(),
    /account-changed/,
  );
  assert.deepEqual(f.calls.at(-1), ["remove", 77]);
});
test("platform refusal stops without replay and preserves tab cleanup", async () => {
  const f = fixture();
  f.results[2].alerts = ["rate limited"];
  await assert.rejects(
    new BrowserAccountReader(f.host).read(),
    /platform-alert/,
  );
  assert.equal(f.calls.filter((c) => c[0] === "create").length, 1);
  assert.deepEqual(f.calls.at(-1), ["remove", 77]);
});
test("window guard runs before navigation and every observation", async () => {
  const f = fixture();
  let n = 0;
  const reader = new BrowserAccountReader(f.host, () => {
    if (++n === 3) throw Error("quiet-hours");
  });
  await assert.rejects(reader.read(), /quiet-hours/);
  assert.equal(f.calls.filter((c) => c[0] === "update").length, 0);
  assert.deepEqual(f.calls.at(-1), ["remove", 77]);
});
test("concurrent calls do not open a second reader tab", async () => {
  const f = fixture();
  let finish;
  f.host.tabs.create = () =>
    new Promise((r) => {
      finish = r;
    });
  const reader = new BrowserAccountReader(f.host);
  const first = reader.read();
  await assert.rejects(reader.read(), /account-read-busy/);
  finish({ id: 77 });
  await first;
});

test("login routes return a serializable refusal without relying on injected exceptions", () => {
  const previous = globalThis.location;
  globalThis.location = { hostname: "x.com", pathname: "/i/flow/login" };
  try {
    assert.deepEqual(readBrowserAccountIdentity(), { error: "login-required" });
  } finally {
    if (previous === undefined) delete globalThis.location;
    else globalThis.location = previous;
  }
});
test("serialized page refusals stop immediately and clean up the reader tab", async () => {
  const f = fixture();
  f.results[0] = { error: "login-required" };
  await assert.rejects(
    new BrowserAccountReader(f.host).read(),
    /login-required/,
  );
  assert.equal(f.calls.filter((c) => c[0] === "read").length, 1);
  assert.deepEqual(f.calls.at(-1), ["remove", 77]);
});
