import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountScreenshots } from "../dist/account-screenshots.js";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=",
  "base64",
);
async function fixture(t, observations, existing = {}) {
  const directory = await mkdtemp(join(tmpdir(), "account-shot-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let state = { accountHandle: "testowner", executions: existing },
    calls = 0,
    proofs = [];
  const store = {
    processId: 1,
    ownerAlive: () => true,
    transaction: async (fn) => {
      state = await fn({ state });
      return { state };
    },
    recordProof: async (p) => {
      proofs.push(p);
      return "proof";
    },
  };
  const good = {
    page: "https://x.com/i/account_analytics",
    accountHandle: "testowner",
    surfaceConfirmed: true,
    headings: ["Account overview"],
    labels: ["Impressions"],
  };
  const tab = {
    id: "synthetic",
    playwright: {
      evaluate: async () => ({ ...good, ...observations.shift() }),
    },
    screenshot: async () => {
      calls++;
      return png;
    },
  };
  return {
    capture: new AccountScreenshots({
      tab,
      store,
      proofDirectory: directory,
      clock: () => 0,
    }),
    get calls() {
      return calls;
    },
    get state() {
      return state;
    },
    proofs,
  };
}
test("保存原始PNG、本人/页面/时间和指纹；释放本次claim", async (t) => {
  const f = await fixture(t, [{}, {}]);
  const r = await f.capture.capture({ surface: "analytics" });
  assert.equal(r.status, "captured");
  assert.deepEqual(await readFile(r.imagePath), png);
  assert.equal(r.imageSha256.length, 64);
  assert.equal(r.dataScope, "visible-viewport-only");
  assert.equal(r.capturedAt, "1970-01-01T00:00:00.000Z");
  assert.equal(Object.values(f.state.executions)[0].activity, null);
  assert.equal(f.proofs[0].observation.imageKind, "real-screenshot");
});
test("不截错账号、错误/未加载页面，截图过程中页面改变不落图", async (t) => {
  for (const observation of [
    { accountHandle: "someoneelse" },
    { surfaceConfirmed: false },
    { page: "https://example.com/i/account_analytics" },
  ]) {
    const f = await fixture(t, [observation]);
    assert.equal(
      (await f.capture.capture({ surface: "analytics" })).status,
      "needsDecision",
    );
    assert.equal(f.calls, 0);
  }
  const changed = await fixture(t, [{}, { page: "https://x.com/home" }]);
  assert.equal(
    (await changed.capture.capture({ surface: "analytics" })).reason,
    "account-surface-changed",
  );
  assert.equal(changed.calls, 1);
});
test("同Tab正在提交时不截图、不改对方claim", async (t) => {
  const f = await fixture(t, [], {
    other: {
      tabId: "synthetic",
      activity: "publishPost",
      pid: 2,
      actionId: "original",
    },
  });
  assert.equal(
    (await f.capture.capture({ surface: "revenue" })).reason,
    "same-tab-operation-running",
  );
  assert.equal(f.calls, 0);
  assert.equal(f.state.executions.other.actionId, "original");
});
