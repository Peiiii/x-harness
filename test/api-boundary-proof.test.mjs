import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBusinessHarness, createXPlatform } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

for (const operation of ["runGrowthRound", "publishPost"]) {
  test(`${operation} preserves a stable boundary exception in local proof`, async (t) => {
    const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
    const before = f.read();
    const transaction = f.store.transaction;
    let calls = 0;
    f.store.transaction = async (...args) => {
      if (++calls === 1) throw Error("synthetic-reservation-conflict");
      return transaction(...args);
    };
    const api = createBusinessHarness({
      store: f.store,
      platform: createXPlatform(f.browser, { clock: () => NOW }),
      clock: () => NOW,
      executor: {
        id: "original-actor",
        tabId: "original-tab",
        scopeKinds: ["original"],
        evidenceRef: f.proof,
      },
    });
    const result = await api[operation]({
      taskId: "round-1",
      draftPath: f.draft,
      maxActions: 1,
    });
    assert.equal(result.status, "needsDecision");
    assert.equal(result.diagnostic?.next, "inspect-local-proof");
    assert.notEqual(result.diagnostic?.evidenceRef, f.ledger);
    const proof = JSON.parse(readFileSync(result.diagnostic.evidenceRef));
    assert.equal(proof.error, "synthetic-reservation-conflict");
    assert.equal(f.writes.length, 0);
    assert.deepEqual(f.read(), before);
  });
}
