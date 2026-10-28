import test from "node:test";
import assert from "node:assert/strict";
import { createXGrowthHarness } from "../dist/index.js";
import { fixture } from "./fixtures.mjs";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { BrowserReadFallback } from "../dist/browser-read-fallback.js";
const setup = (changes = {}) => {
  let late,
    reads = 0,
    nativeReads = 0,
    writes = 0;
  const proofs = [];
  const primary = {
    observe: () => {
      reads++;
      return new Promise((resolve) => {
        late = resolve;
      });
    },
    act: async () => {
      writes++;
    },
    capabilities: () => [],
  };
  const isolated = {
    observe: async () => ({
      page: "https://x.com/synthetic/status/1",
      accountHandle: "actor",
    }),
    act: async () => {
      writes++;
    },
    capabilities: () => [],
  };
  const native = {
    allowed: () => true,
    slowThresholdMs: 100,
    timeoutMs: 100,
    isolate: () => isolated,
    read: async () => {
      nativeReads++;
      return {
        observation: {
          page: "https://x.com/synthetic/status/1",
          accountHandle: "actor",
          needsStateCheck: false,
          posts: [{ id: "1", body: "synthetic" }],
        },
        expectedURL: "https://x.com/synthetic/status/1",
        expectedAccount: "actor",
      };
    },
    ...changes,
  };
  const port = new BrowserReadFallback(
    primary,
    {
      tabId: "owned",
      readTimeoutMs: 500,
      legacyRecoveryEnabled: false,
      recover: async () => isolated,
      nativeRead: native,
    },
    {
      recordProof: async (p) => {
        proofs.push(p);
        return "proof";
      },
    },
  );
  return {
    port,
    proofs,
    late: (value) => late(value),
    counts: () => ({ reads, nativeReads, writes }),
    primary,
    isolated,
  };
};
test("stuck DOM read uses matching native snapshot, retires old controls and prefers native only for reads", async () => {
  const f = setup();
  const first = await f.port.observe({ view: "posts" });
  assert.equal(first.readTransport, "native-fallback");
  assert.equal(first.posts[0].id, "1");
  f.late({ page: "old", accountHandle: "wrong" });
  await new Promise(setImmediate);
  assert.equal(
    (await f.port.observe({ view: "posts" })).readTransport,
    "native-fallback",
  );
  assert.equal(f.counts().reads, 1);
  assert.throws(
    () => f.port.act({ operation: "submitPost" }),
    /requires-fresh-dom/,
  );
  assert.equal(f.counts().writes, 0);
  assert.equal(f.proofs.at(-1).windowFocused, false);
  assert.equal(f.proofs.at(-1).writeRetried, false);
});
for (const reason of ["wrong-page", "wrong-account", "incomplete", "person"]) {
  test(`invalid native ${reason} never becomes a business observation`, async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const f = setup({
      read: async () => {
        release();
        return {
          observation: {
            page:
              reason === "wrong-page"
                ? "https://x.com/other"
                : "https://x.com/synthetic/status/1",
            accountHandle: reason === "wrong-account" ? "other" : "actor",
            needsStateCheck: reason === "incomplete",
            blue: null,
            blueEvidenceSupported: false,
          },
          expectedURL: "https://x.com/synthetic/status/1",
          expectedAccount: "actor",
        };
      },
    });
    const value = f.port.observe({
      view: reason === "person" ? "person" : "posts",
    });
    await gate;
    f.late({ page: "dom-result" });
    assert.equal((await value).page, "dom-result");
    assert.equal(f.proofs.length, 0);
  });
}
test("late native result cannot change the selected adapter after DOM already won", async () => {
  let releaseNative;
  const nativeGate = new Promise((resolve) => (releaseNative = resolve));
  let entered;
  const ready = new Promise((resolve) => (entered = resolve));
  const f = setup({
    read: async () => {
      entered();
      await nativeGate;
      return {
        observation: {
          page: "https://x.com/synthetic/status/1",
          accountHandle: "actor",
        },
        expectedURL: "https://x.com/synthetic/status/1",
        expectedAccount: "actor",
      };
    },
  });
  const read = f.port.observe({ view: "posts" });
  await ready;
  f.late({ page: "dom-winner" });
  assert.equal((await read).page, "dom-winner");
  releaseNative();
  await new Promise(setImmediate);
  await f.port.act({ operation: "follow" });
  assert.equal(f.counts().writes, 1);
  assert.equal(f.proofs.length, 0);
});
test("write roots never request native fallback and receive the original DOM result", async () => {
  const f = setup({ allowed: () => false });
  const pending = f.port.observe({ view: "person" });
  await new Promise(setImmediate);
  f.late({ page: "dom-write-root" });
  assert.equal((await pending).page, "dom-write-root");
  assert.equal(f.counts().nativeReads, 0);
});
test("real DOM policy refusal is not converted into native recovery", async () => {
  let called = 0;
  const f = setup({
    read: async () => {
      called++;
      throw Error("never");
    },
  });
  f.primary.observe = async () => {
    throw Error("security policy rejected");
  };
  await assert.rejects(
    f.port.observe({ view: "posts" }),
    /security policy rejected/,
  );
  assert.equal(called, 0);
});
test("native restrictions remain in the returned observation", async () => {
  const f = setup({
    read: async () => ({
      observation: {
        page: "https://x.com/synthetic/status/1",
        accountHandle: "actor",
        alerts: ["rate-limit"],
        needsStateCheck: true,
      },
      expectedURL: "https://x.com/synthetic/status/1",
      expectedAccount: "actor",
    }),
  });
  assert.deepEqual((await f.port.observe({ view: "posts" })).alerts, [
    "rate-limit",
  ]);
  assert.equal(f.counts().writes, 0);
});

test("public factory lazily uses the native port and records actual fallback transport", async (t) => {
  const f = fixture(t);
  let nativeReads = 0,
    providerCalls = 0,
    gestures = 0;
  const app = {
    getAXState: async () => {
      nativeReads++;
      return "0 标准窗口 X, URL: x.com/home\n  1 link 个人资料, Value: x.com/Pei";
    },
    click: async () => gestures++,
  };
  const api = createXGrowthHarness({
    tab: {
      id: "owned-lazy",
      url: async () => "https://x.com/home",
      playwright: { evaluate: () => new Promise(() => {}) },
    },
    ledgerPath: f.ledger,
    proofDirectory: join(f.dir, "lazy-proof"),
    nativeReadFallback: {
      getApp: async () => {
        providerCalls++;
        return app;
      },
      slowThresholdMs: 100,
      timeoutMs: 1000,
    },
  });
  assert.equal(providerCalls, 0);
  const result = await api.inspectAccount({ mode: "decision" });
  assert.equal(result.status, "observed");
  assert.equal(result.accountHandle, "Pei");
  assert.equal(nativeReads, 1);
  assert.equal(gestures, 0);
  const rows = readdirSync(api.usageStatus().directory).map((name) =>
    JSON.parse(readFileSync(join(api.usageStatus().directory, name), "utf8")),
  );
  assert.ok(
    rows.some(
      (r) => r.operation === "observe" && r.readTransport === "native-fallback",
    ),
  );
});
