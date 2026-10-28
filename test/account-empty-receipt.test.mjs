import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture } from "./fixtures.mjs";

for (const handle of [null, undefined, "", "not a handle"])
  test(`account read cannot report complete without valid actor: ${handle}`, async (t) => {
    const f = fixture(t);
    const api = createBusinessHarness({
      store: f.store,
      platform: {
        preflight: () => ({ covered: true, missing: [] }),
        readAccount: async () => ({
          page: "https://x.com/reader/following",
          accountHandle: handle,
          needsStateCheck: false,
          missing: [],
          alerts: [],
        }),
        captureProof: async (value) => value,
      },
    });
    const result = await api.inspectAccount();
    assert.equal(result.status, "needsDecision");
    assert.equal(result.complete, false);
    assert.ok(result.missing.includes("accountHandle"));
    const proof = JSON.parse(readFileSync(result.evidenceRef, "utf8"));
    assert.equal(proof.observation.needsStateCheck, true);
    assert.equal(f.writes.length, 0);
  });

test("fresh valid account remains complete", async (t) => {
  const f = fixture(t);
  const api = createBusinessHarness({
    store: f.store,
    platform: {
      preflight: () => ({ covered: true, missing: [] }),
      readAccount: async () => ({
        page: "https://x.com/owner",
        accountHandle: "owner",
        accountURL: "https://x.com/owner",
        needsStateCheck: false,
        missing: [],
        alerts: [],
      }),
      captureProof: async (value) => value,
    },
  });
  const result = await api.inspectAccount();
  assert.equal(result.status, "observed");
  assert.equal(result.complete, true);
  assert.equal(result.accountHandle, "owner");
  assert.equal(f.writes.length, 0);
});
