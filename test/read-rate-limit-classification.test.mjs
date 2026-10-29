import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import { createXGrowthHarness } from "../dist/index.js";
import { readXUsageReport } from "../dist/usage.js";
async function fail(t, error, mode = "decision") {
  const dir = mkdtempSync(join(tmpdir(), "read-rate-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let reads = 0,
    diagnosticRPCs = 0;
  const x = createXGrowthHarness({
    tab: {
      id: "synthetic",
      playwright: {
        evaluate: async () => {
          reads++;
          throw error;
        },
      },
      dev: {
        logs() {
          diagnosticRPCs++;
          throw Error("unexpected diagnostic RPC");
        },
      },
      capabilities: {
        get() {
          diagnosticRPCs++;
          throw Error("unexpected diagnostic RPC");
        },
      },
    },
    ledgerPath: join(dir, "ledger.md"),
    proofDirectory: dir,
  });
  const result = await x.readPerson({
    target: {
      handle: "reader",
      url: "https://x.com/reader",
      evidenceRef: "synthetic",
    },
    mode,
  });
  assert.equal(reads, 1);
  assert.equal(diagnosticRPCs, 0);
  return { result, dir };
}
for (const mode of ["receipt", "decision"])
  test(`explicit read HTTP429 stays visible in ${mode} without diagnostic browser calls`, async (t) => {
    const { result } = await fail(t, new Error("HTTP-429 PRIVATE BODY"), mode);
    assert.equal(result.diagnostic.category, "http-rate-limit");
    assert.equal(result.diagnostic.code, "http-429");
    assert.equal(result.diagnostic.observedHttp.status, 429);
    assert.equal(result.diagnostic.observedHttp.scope, "failed-read-operation");
    assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  });
test("foreign errors retain numeric response evidence and strip secrets", async (t) => {
  const error = vm.runInNewContext(
    'Object.assign(new Error("request failed PRIVATE"),{response:{status:429,url:"https://x.com/i/api/graphql/hash/Viewer?token=SECRET",headers:{"retry-after":"120","x-rate-limit-reset":"1793286000",authorization:"SECRET"}}})',
  );
  const { result } = await fail(t, error);
  assert.equal(result.diagnostic.category, "platform-rate-limit");
  assert.equal(
    result.diagnostic.observedHttp.endpoint,
    "https://x.com/i/api/graphql/hash/Viewer",
  );
  assert.equal(result.diagnostic.observedHttp.retryAfterSeconds, 120);
  assert.ok(!JSON.stringify(result).includes("SECRET"));
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});
test("selector counts and unlabelled numbers never become an HTTP refusal", async (t) => {
  const { result, dir } = await fail(
    t,
    new Error("selector timed out: matchCount 429"),
  );
  assert.equal(result.diagnostic.category, "ui-not-confirmed");
  assert.equal(result.diagnostic.observedHttp, undefined);
  assert.ok(
    Object.values(readXUsageReport([dir]).operations).every(
      (v) => v.http429 === 0,
    ),
  );
});

test("an unrelated transport429 is visible without claiming an X API quota", async (t) => {
  const error = Object.assign(new Error("upstream request failed"), {
    response: {
      status: 429,
      url: "https://example.com/transport?token=SECRET",
    },
  });
  const { result } = await fail(t, error);
  assert.equal(result.diagnostic.code, "http-429");
  assert.equal(result.diagnostic.category, "http-rate-limit");
  assert.equal(result.diagnostic.observedHttp.endpoint, undefined);
  assert.ok(!JSON.stringify(result).includes("SECRET"));
});

test("an explicit HTTP503 is retained without inventing a rate-limit reset", async (t) => {
  const { result } = await fail(t, new Error("HTTP 503 service unavailable"));
  assert.equal(result.diagnostic.category, "http-error");
  assert.equal(result.diagnostic.code, "http-503");
  assert.equal(result.diagnostic.observedHttp.status, 503);
  assert.equal(result.diagnostic.observedHttp.retryAfterSeconds, undefined);
});
