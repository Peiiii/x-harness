import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { XUsageJournal, currentXUsageTrace } from "../dist/usage.js";
import { ActionTrace } from "../dist/action-trace.js";

const fixture = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "usage-context-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const records = (journal) =>
  readdirSync(journal.status().directory)
    .filter((f) => f.endsWith(".json"))
    .map((f) =>
      JSON.parse(readFileSync(join(journal.status().directory, f), "utf8")),
    );

test("interleaved actions join stages and nested browser calls without crossing roots", async (t) => {
  const dir = fixture(t);
  const journal = new XUsageJournal(dir, {
    transport: "dom",
    tabId: "12345",
    executorId: "worker-1",
    runtimeIdentity: {
      sourceCommit: "a".repeat(40),
      artifactSha256: "b".repeat(64),
    },
  });
  const gates = new Map();
  const browser = journal.wrap(
    { observe: (id) => new Promise((resolve) => gates.set(id, resolve)) },
    "browser",
  );
  const proofs = [];
  const store = {
    recordProof: async (proof) => {
      proofs.push(proof);
      return `proof-${proofs.length}`;
    },
  };
  const root = journal.wrap(
    {
      async run(id, ignoredSecret) {
        const trace = new ActionTrace(store, Date.now, { id, kind: "reply" });
        return trace.run("public-read", () => browser.observe(id));
      },
    },
    "harness",
  );
  const alpha = root.run("alpha", "SECRET");
  const beta = root.run("beta", "SECRET");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gates.size, 2);
  gates.get("beta")({ status: "observed" });
  await beta;
  gates.get("alpha")({ status: "observed" });
  await alpha;
  const rows = records(journal),
    roots = rows.filter((r) => r.layer === "harness");
  assert.equal(roots.length, 2);
  assert.notEqual(roots[0].rootCallId, roots[1].rootCallId);
  for (const action of ["alpha", "beta"]) {
    const stages = proofs.filter((p) => p.actionId === action);
    assert.equal(stages.length, 2);
    assert.equal(stages[0].usageTrace.callId, stages[1].usageTrace.callId);
    const parent = roots.find((r) => r.id === stages[0].usageTrace.rootCallId);
    assert.ok(parent);
    const children = rows.filter((r) => r.parentCallId === parent.id);
    assert.equal(children.length, 1);
    assert.equal(children[0].rootCallId, parent.rootCallId);
    assert.equal(children[0].binding.tabId, "12345");
    assert.equal(
      children[0].binding.runtimeIdentity.sourceCommit,
      "a".repeat(40),
    );
  }
  assert.equal(currentXUsageTrace(), undefined);
  assert.equal(JSON.stringify({ rows, proofs }).includes("SECRET"), false);
});

test("foreign journal roots stay separate, invalid metadata is omitted and thrown results are unchanged", async (t) => {
  const dir = fixture(t);
  const a = new XUsageJournal(dir),
    b = new XUsageJournal(dir, {
      transport: "native",
      tabId: "https://SECRET",
      runtimeIdentity: { sourceCommit: "SECRET" },
    });
  const inner = b.wrap(
    {
      read() {
        throw Error("SECRET");
      },
    },
    "browser",
  );
  const outer = a.wrap({ run: () => inner.read() }, "harness");
  assert.throws(() => outer.run(), /SECRET/);
  const row = records(b)[0];
  assert.equal(row.parentCallId, undefined);
  assert.equal(row.rootCallId, row.id);
  assert.equal(row.binding.transport, "native");
  assert.equal(row.binding.runtimeIdentity, undefined);
  assert.equal(row.binding.tabId, undefined);
  assert.equal(row.status, "threw");
  assert.equal(currentXUsageTrace(), undefined);
  assert.equal(JSON.stringify(records(b)).includes("SECRET"), false);
});
