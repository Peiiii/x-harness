import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture } from "./fixtures.mjs";

const options = {
  target: { url: "https://x.com/sample/following", evidenceRef: "seed" },
  maxWindows: 2,
};
for (const mode of [
  "valid",
  "permit-expires",
  "not-authorized",
  "absent",
  "expired",
  "future",
  "wrong-executor",
  "wrong-kind",
  "missing-proof",
  "wrong-scope",
  "daytime",
  "cross-midnight",
]) {
  test(`discovery uses original executor window and injected clock: ${mode}`, async (t) => {
    const f = fixture(t);
    let now = Date.parse(
      mode === "daytime"
        ? "2026-10-29T10:00:00+08:00"
        : mode === "cross-midnight"
          ? "2026-10-29T23:59:59+08:00"
          : "2026-10-29T06:30:00+08:00",
    );
    const executor = {
      id: "discovery",
      tabId: "synthetic-discovery-tab",
      scopeKinds: mode === "wrong-scope" ? ["reply"] : ["follow"],
      evidenceRef: f.proof,
    };
    f.edit((s) => {
      s.executions = { discovery: { id: "discovery" } };
      if (!["absent", "daytime", "cross-midnight"].includes(mode))
        s.executions.discovery.windowAuthorization = {
          executorId: mode === "wrong-executor" ? "other" : executor.id,
          kind: mode === "wrong-kind" ? "reply" : "follow",
          userAuthorized: mode !== "not-authorized",
          evidenceRef:
            mode === "missing-proof" ? "/missing-synthetic-proof" : f.proof,
          startsAt: new Date(
            now + (mode === "future" ? 60000 : -60000),
          ).toISOString(),
          expiresAt: new Date(
            now + (mode === "expired" ? -1 : 60000),
          ).toISOString(),
        };
    });
    let loads = 0;
    const load = f.store.load.bind(f.store);
    f.store.load = async () => {
      loads++;
      return load();
    };
    const api = createBusinessHarness({
      platform: f.platform,
      store: f.store,
      clock: () => now,
      executor,
    });
    let reads = 0;
    api.readPeople = async () => {
      reads++;
      if (mode === "cross-midnight") now += 2000;
      if (mode === "permit-expires") now += 120000;
      return {
        status: "observed",
        fresh: true,
        evidenceRef: f.proof,
        people: [{ handle: `reader${reads}`, relationship: "not-following" }],
      };
    };
    const result = await api.discoverFollowCandidates(options);
    const allowed = [
      "valid",
      "permit-expires",
      "daytime",
      "cross-midnight",
    ].includes(mode);
    assert.equal(
      reads,
      ["cross-midnight", "permit-expires"].includes(mode) ? 1 : allowed ? 2 : 0,
    );
    assert.equal(result.candidates.length, reads);
    assert.equal(result.status, allowed ? "observed" : "needsDecision");
    if (mode === "daytime")
      assert.equal(loads, 0, "no extra healthy-hour ledger check");
    if (mode === "cross-midnight")
      assert.equal(result.reason, "night-read-boundary");
    assert.equal(f.writes.length, 0);
  });
}
