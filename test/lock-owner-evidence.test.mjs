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
test("local edit sessions do not create a persistent owner lock", () =>
  fixture(async ({ store, lock }) => {
    await store.withLock(async () => {
      await assert.rejects(readFile(lock, "utf8"), { code: "ENOENT" });
    });
  }));
test("a legacy owner fences writes until verified migration without being removed", () =>
  fixture(async ({ store, lock, ledger }) => {
    const original = await readFile(ledger, "utf8");
    await writeFile(lock, JSON.stringify({ token: "different-owner" }));
    await assert.rejects(
      store.withLock(async () => {
        const snap = await store.load();
        await store.save(snap, { ...snap.state, changed: true });
      }),
      /旧版账号锁/,
    );
    assert.equal(await readFile(ledger, "utf8"), original);
    assert.equal(
      JSON.parse(await readFile(lock, "utf8")).token,
      "different-owner",
    );
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

test("an abandoned local edit session does not own a persistent filesystem lock", () =>
  fixture(async ({ store, lock }) => {
    await assert.rejects(
      store.withLock(async () => {
        throw Error("interrupted-local-call");
      }),
      /interrupted-local-call/,
    );
    await assert.rejects(readFile(lock, "utf8"), { code: "ENOENT" });
  }));
