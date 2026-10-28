import test from "node:test";
import assert from "node:assert/strict";
import { BrowserReadFallback } from "../dist/browser-read-fallback.js";
import { createXGrowthHarness } from "../dist/index.js";
import { fixture } from "./fixtures.mjs";
import { join, dirname } from "node:path";
function setup(read) {
  const calls = [],
    proofs = [];
  let finish;
  const secondary = {
    observe: async () => ({ page: "rebound", accountHandle: "sample" }),
    act: async () => calls.push("submit"),
    capabilities: () => [],
  };
  const primary = {
    observe:
      read ??
      (() =>
        new Promise((r) => {
          finish = r;
        })),
    act: async () => {
      calls.push("primary-write");
      throw Error("write timeout");
    },
    capabilities: () => [],
  };
  return {
    calls,
    proofs,
    late: () => finish({ page: "old" }),
    port: new BrowserReadFallback(
      primary,
      {
        tabId: "same-owned-tab",
        readTimeoutMs: 100,
        recover: async (id) => {
          calls.push("rebind:" + id);
          return secondary;
        },
      },
      {
        recordProof: async (p) => {
          proofs.push(p);
          return "proof";
        },
      },
    ),
  };
}
test("same-tab rebind replaces a stuck read once and discards its late result", async () => {
  const f = setup();
  assert.equal((await f.port.observe({ view: "account" })).page, "rebound");
  f.late();
  await new Promise(setImmediate);
  assert.equal((await f.port.observe({ view: "posts" })).page, "rebound");
  await f.port.act({ operation: "submitPost" });
  assert.deepEqual(f.calls, ["rebind:same-owned-tab", "submit"]);
  assert.equal(f.proofs.at(-1).status, "rebound");
});
test("working reads do not rebind", async () => {
  const f = setup(async () => ({ page: "primary" }));
  assert.equal((await f.port.observe({ view: "account" })).page, "primary");
  assert.deepEqual(f.calls, []);
});
test("write failures never retry or change transport", async () => {
  const f = setup();
  await assert.rejects(
    f.port.act({ operation: "submitPost" }),
    /write timeout/,
  );
  assert.deepEqual(f.calls, ["primary-write"]);
});
test("policy refusals and ordinary errors do not rebind", async () => {
  for (const message of [
    "security policy rejected",
    "challenge",
    "disconnected",
  ]) {
    const f = setup(async () => {
      throw Error(message);
    });
    await assert.rejects(
      f.port.observe({ view: "account" }),
      (e) => e.message === message,
    );
    assert.deepEqual(f.calls, []);
  }
});
test("a stalled rebind is itself bounded and does not retry writes", async () => {
  const proofs = [];
  const b = new BrowserReadFallback(
    { observe: () => new Promise(() => {}) },
    {
      tabId: "owned",
      readTimeoutMs: 100,
      recover: () => new Promise(() => {}),
    },
    {
      recordProof: async (p) => {
        proofs.push(p);
        return "proof";
      },
    },
  );
  await assert.rejects(
    b.observe({ view: "account" }),
    /browser-read-deadline-exceeded/,
  );
  assert.equal(proofs.at(-1).status, "failed");
});
test("public binding preserves private capability receiver under usage logging", async (t) => {
  const f = fixture(t),
    tab = {
      id: "same-owned-tab",
      playwright: {
        evaluate: async () => ({
          page: "https://x.com/home",
          accountHandle: "Pei",
          accountURL: "https://x.com/Pei",
          alerts: [],
          needsStateCheck: false,
        }),
      },
    };
  const api = createXGrowthHarness({
    tab,
    ledgerPath: join(dirname(f.draft), "binding-ledger.md"),
    proofDirectory: join(dirname(f.draft), "binding-proof"),
    tabReadRecovery: { rebind: async () => tab, readTimeoutMs: 100 },
  });
  const result = await api.inspectAccount({ mode: "decision" });
  assert.equal(result.status, "observed");
  assert.equal(result.accountHandle, "Pei");
});
