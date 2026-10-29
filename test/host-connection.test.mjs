import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createXGrowthHarness } from "../dist/index.js";
import { fixture } from "./fixtures.mjs";

const policyError =
  "Unable to load browser request-header policy. Retry the browser command.";
function setup(t, { errors = [], openError, proofDirectory } = {}) {
  let f, original;
  t.after(() => assert.equal(readFileSync(f.ledger, "utf8"), original));
  f = fixture(t);
  original = readFileSync(f.ledger, "utf8");
  const calls = [];
  const tab = {
    id: "owned-tab",
    playwright: {
      evaluate: async () => {
        calls.push("business-read");
        return {
          page: "https://x.com/home",
          alerts: [],
          account: { handle: "Pei", url: "https://x.com/Pei" },
        };
      },
    },
  };
  let checks = 0;
  const options = {
    ledgerPath: f.ledger,
    proofDirectory: proofDirectory ?? f.dir,
    connection: {
      check: async () => {
        calls.push("check");
        const error = errors[checks++];
        if (error) throw new Error(error);
      },
      openTab: async () => {
        calls.push("open");
        if (openError) throw new Error(openError);
        return tab;
      },
    },
  };
  return { ...f, options, tab, calls };
}

test("first connection checks once and opens once; factory runs no business and returned binding is reusable", async (t) => {
  const f = setup(t),
    result = await createXGrowthHarness(f.options);
  assert.equal(result.status, "ready");
  assert.deepEqual(f.calls, ["check", "open"]);
  assert.equal(result.tab, f.tab);
  assert.equal(result.connection.recovered, false);
  assert.equal(
    JSON.parse(readFileSync(result.connection.evidenceRef)).outcome,
    "ready",
  );
  await result.harness.inspectAccount();
  await result.harness.inspectAccount();
  assert.deepEqual(f.calls, [
    "check",
    "open",
    "business-read",
    "business-read",
  ]);
});

test("one policy initialization failure is recovered internally and first failure remains in local proof", async (t) => {
  const f = setup(t, { errors: [policyError] });
  const result = await createXGrowthHarness(f.options);
  assert.equal(result.status, "ready");
  assert.deepEqual(f.calls, ["check", "check", "open"]);
  assert.equal(result.connection.recovered, true);
  const proof = JSON.parse(readFileSync(result.connection.evidenceRef));
  assert.equal(proof.outcome, "recovered");
  assert.equal(proof.attempts[0].error, policyError);
  assert.equal(proof.underlyingHttpStatus, "not-exposed-by-host");
  assert.ok(proof.attempts.every((a) => a.durationMs >= 0));
  assert.equal(result.connection.checkAttempts, 2);
  assert.equal(result.connection.openAttempts, 1);
  assert.ok(
    readdirSync(f.dir).filter((name) => name.endsWith(".json")).length >= 3,
  );
});

test("persistent policy failure stops after two read-only checks; no tab or business", async (t) => {
  const f = setup(t, { errors: [policyError, policyError, policyError] });
  const result = await createXGrowthHarness(f.options);
  assert.equal(result.status, "needsDecision");
  assert.equal(result.reason, "host-policy-initialization-failed");
  assert.deepEqual(f.calls, ["check", "check"]);
  assert.equal(result.connection.openAttempts, 0);
  assert.equal(result.diagnostic.next, "inspect-local-proof");
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 1024);
});

for (const error of [
  "Browser Use rejected this action due to browser security policy.",
  "User took control",
  "Browser request-header gate is unavailable",
  "network timeout " + "PRIVATE_ERROR".repeat(10000),
])
  test(`non-retryable failure does not retry: ${error.slice(0, 60)}`, async (t) => {
    const f = setup(t, { errors: [error] });
    const result = await createXGrowthHarness(f.options);
    assert.equal(result.status, "needsDecision");
    assert.deepEqual(f.calls, ["check"]);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 1024);
    assert.equal(
      JSON.parse(readFileSync(result.diagnostic.evidenceRef)).attempts[0].error,
      error,
    );
    assert.ok(!JSON.stringify(result).includes("PRIVATE_ERROR"));
  });

test("creation failure is never retried even with the policy error", async (t) => {
  const f = setup(t, { openError: policyError });
  const result = await createXGrowthHarness(f.options);
  assert.equal(result.status, "needsDecision");
  assert.equal(result.connection.phase, "open-tab");
  assert.deepEqual(f.calls, ["check", "open"]);
});

test("unwritable proof store stops recovery before a second check", async (t) => {
  const f = setup(t, { errors: [policyError] });
  const notDirectory = join(f.dir, "file-instead-of-directory");
  writeFileSync(notDirectory, "fixture");
  f.options.proofDirectory = notDirectory;
  const result = await createXGrowthHarness(f.options);
  assert.equal(result.status, "needsDecision");
  assert.equal(result.diagnostic.code, "evidence-store-unavailable");
  assert.equal(result.diagnostic.next, "restore-proof-store");
  assert.deepEqual(f.calls, ["check"]);
});

test("invalid binding preserves the returned tab and never reopens it", async (t) => {
  const f = setup(t);
  f.tab.id = "";
  const result = await createXGrowthHarness(f.options);
  assert.equal(result.status, "needsDecision");
  assert.equal(result.connection.phase, "bind");
  assert.equal(result.tab, f.tab);
  assert.deepEqual(f.calls, ["check", "open"]);
});

test("invalid options reject before host I/O", async (t) => {
  const f = setup(t);
  await assert.rejects(
    createXGrowthHarness({ ...f.options, ledgerPath: "" }),
    /options-invalid/,
  );
  assert.deepEqual(f.calls, []);
});

for (const phase of ["check", "open-tab"]) {
  test(`connection persists ${phase} entry before awaiting the host`, async (t) => {
    const f = setup(t);
    let finish;
    let entered;
    const ready = new Promise((resolve) => {
      entered = resolve;
    });
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    const wait = async () => {
      entered();
      return pending;
    };
    if (phase === "check") f.options.connection.check = wait;
    else f.options.connection.openTab = wait;
    const operation = createXGrowthHarness(f.options);
    await ready;
    const proofs = readdirSync(f.dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(readFileSync(join(f.dir, name), "utf8")));
    const started = proofs.find(
      (p) =>
        p.operation === "connect-host" &&
        p.outcome === "started" &&
        p.connection.phase === phase,
    );
    assert.ok(started, "a host reset must leave the entered phase on disk");
    assert.equal(started.completion, "not-recorded");
    finish(phase === "open-tab" ? f.tab : undefined);
    const result = await operation;
    assert.equal(result.status, "ready");
    const final = JSON.parse(
      readFileSync(result.connection.evidenceRef, "utf8"),
    );
    assert.equal(final.outcome, "ready");
    assert.equal(final.completion, "recorded");
  });
}

test("optional start telemetry failure does not block a healthy connection", async (t) => {
  const f = setup(t);
  const blocked = join(f.dir, "not-directory");
  writeFileSync(blocked, "fixture");
  f.options.proofDirectory = blocked;
  const result = await createXGrowthHarness(f.options);
  assert.equal(result.status, "ready");
  assert.deepEqual(f.calls, ["check", "open"]);
});
