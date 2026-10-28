import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileRoundStore } from "../dist/diagnostics.js";
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), "lock-owner-"));
  try {
    const ledger = join(dir, "day.md"),
      lock = join(dir, ".x-harness.lock");
    await writeFile(
      ledger,
      "# Test\n\n```x-round-state\n" +
        JSON.stringify({ batchId: "synthetic", actions: [] }) +
        "\n```\n",
    );
    const store = createFileRoundStore({
      ledgerPath: ledger,
      proofDirectory: join(dir, "proofs"),
      lockOwner: { executorId: "actor-1", tabId: "tab-1" },
    });
    await run({ store, lock, ledger });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
test("new locks identify their unique owner and are released normally", () =>
  fixture(async ({ store, lock }) => {
    let tokens = [];
    for (let i = 0; i < 2; i++)
      await store.withLock(async () => {
        const x = JSON.parse(await readFile(lock, "utf8"));
        assert.equal(x.owner.executorId, "actor-1");
        assert.equal(x.owner.tabId, "tab-1");
        assert.ok(x.storeId);
        assert.ok(x.token);
        tokens.push(x.token);
      });
    assert.notEqual(tokens[0], tokens[1]);
    await assert.rejects(readFile(lock, "utf8"), { code: "ENOENT" });
  }));
test("displaced holder neither saves nor removes a different lock", () =>
  fixture(async ({ store, lock, ledger }) => {
    const original = await readFile(ledger, "utf8");
    await assert.rejects(
      store.withLock(async () => {
        let snap = await store.load();
        await writeFile(lock, JSON.stringify({ token: "different-owner" }));
        await store.save(snap, { ...snap.state, changed: true });
      }),
      /持有权已变化/,
    );
    assert.equal(
      JSON.parse(await readFile(lock, "utf8")).token,
      "different-owner",
    );
    assert.equal(await readFile(ledger, "utf8"), original);
  }));
test("a lock without PID remains blocked rather than guessed dead", () =>
  fixture(async ({ store, lock }) => {
    await writeFile(
      lock,
      JSON.stringify({ pid: null, token: "unknown-owner" }),
    );
    await assert.rejects(store.recoverAbandonedLock(), /锁owner缺失/);
    assert.equal(
      JSON.parse(await readFile(lock, "utf8")).token,
      "unknown-owner",
    );
  }));

test("a wrapped root call gives its lock the matching trace identifiers", () =>
  fixture(async ({ store, lock }) => {
    const { XUsageJournal } = await import("../dist/usage.js");
    const journal = new XUsageJournal(
      join(tmpdir(), "lock-owner-trace-" + Date.now()),
    );
    const api = journal.wrap(
      {
        check: () =>
          store.withLock(async () => JSON.parse(await readFile(lock, "utf8"))),
      },
      "harness",
    );
    const captured = await api.check();
    assert.equal(captured.usageTrace.sessionId, journal.status().sessionId);
    assert.ok(captured.usageTrace.rootCallId);
    assert.equal(captured.usageTrace.callId, captured.usageTrace.rootCallId);
  }));
