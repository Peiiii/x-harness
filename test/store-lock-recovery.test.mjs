import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fixture } from "./fixtures.mjs";
import { XUsageJournal } from "../dist/usage.js";
const fingerprint = (s) => createHash("sha256").update(s).digest("hex");
const lockPath = (f) => join(f.dir, ".x-harness.lock");
const legacy = (f, pid = null) =>
  writeFileSync(
    lockPath(f),
    JSON.stringify({
      pid,
      acquiredAt: "2020-01-01T00:00:00Z",
      ledgerPath: f.ledger,
    }),
  );
const receipt = async (f, context) => {
  const evidenceRef = join(f.dir, "quiescent.json");
  writeFileSync(evidenceRef, JSON.stringify({ checked: true, ...context }));
  return {
    confirmed: true,
    evidenceRef,
    lockFingerprint: context.lockFingerprint,
    ledgerRevision: context.ledgerRevision,
  };
};

test("a local callback failure leaves no persistent owner artifact", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.store.withLock(() => {
      throw Error("original-failure");
    }),
    /original-failure/,
  );
  assert.equal(existsSync(lockPath(f)), false);
});
test("unmigrated legacy writers remain fenced without changing their lock or ledger", async (t) => {
  const f = fixture(t),
    before = readFileSync(f.ledger, "utf8");
  await f.store.withLock(async () => {
    const snapshot = await f.store.load();
    writeFileSync(
      lockPath(f),
      JSON.stringify({ token: "replacement", pid: process.pid }),
    );
    snapshot.state.updatedAt = "2030-01-01T00:00:00Z";
    await assert.rejects(f.store.save(snapshot, snapshot.state), /旧版账号锁/);
  });
  assert.equal(readFileSync(f.ledger, "utf8"), before);
  assert.equal(
    JSON.parse(readFileSync(lockPath(f), "utf8")).token,
    "replacement",
  );
});
test("old ownerless locks never expire merely by age", async (t) => {
  const f = fixture(t);
  legacy(f);
  await assert.rejects(f.store.recoverAbandonedLock(), /owner缺失/);
  assert.equal(existsSync(lockPath(f)), true);
  assert.equal(existsSync(lockPath(f) + ".recovery"), false);
});

test("verified ownerless recovery runs under guard and preserves the entire original ledger", async (t) => {
  const f = fixture(t);
  legacy(f);
  const before = readFileSync(f.ledger);
  const result = await f.store.recoverAbandonedLock({
    verifyExclusiveRecovery: async (context) => {
      assert.equal(existsSync(lockPath(f) + ".recovery"), true);
      assert.equal(
        context.lockFingerprint,
        fingerprint(readFileSync(lockPath(f))),
      );
      await assert.rejects(
        f.store.transaction(({ state }) => state),
        /(恢复核验进行中|旧版账号锁)/,
      );
      return receipt(f, context);
    },
  });
  assert.equal(result.recovered, true);
  assert.deepEqual(readFileSync(f.ledger), before);
  assert.equal(existsSync(lockPath(f)), false);
  assert.equal(existsSync(lockPath(f) + ".recovery"), false);
  const proof = JSON.parse(readFileSync(result.evidenceRef, "utf8"));
  assert.equal(proof.recovery, "host-verified-exclusive-recovery");
  assert.ok(proof.verificationEvidenceRef);
});

test("a live PID cannot be overridden by a host callback; dead PID recovery remains supported", async (t) => {
  const f = fixture(t);
  legacy(f, process.pid);
  let called = false;
  await assert.rejects(
    f.store.recoverAbandonedLock({
      verifyExclusiveRecovery: async (context) => {
        called = true;
        return receipt(f, context);
      },
    }),
    /原进程仍在/,
  );
  assert.equal(called, false);
  const child = spawnSync(process.execPath, ["-e", ""]);
  assert.equal(child.status, 0);
  legacy(f, child.pid);
  assert.equal((await f.store.recoverAbandonedLock()).recovered, true);
});

for (const variation of [
  "stale-receipt",
  "ledger-changed",
  "lock-changed",
  "guard-changed",
  "missing-proof",
]) {
  test(`ownerless recovery rejects ${variation} without removing the original or replacement lock`, async (t) => {
    const f = fixture(t);
    legacy(f);
    await assert.rejects(
      f.store.recoverAbandonedLock({
        verifyExclusiveRecovery: async (context) => {
          const verified = await receipt(f, context);
          if (variation === "stale-receipt")
            verified.lockFingerprint = "0".repeat(64);
          if (variation === "ledger-changed")
            writeFileSync(f.ledger, readFileSync(f.ledger, "utf8") + "changed");
          if (variation === "lock-changed")
            writeFileSync(lockPath(f), JSON.stringify({ token: "new-owner" }));
          if (variation === "guard-changed")
            writeFileSync(
              lockPath(f) + ".recovery",
              JSON.stringify({ token: "new-recovery" }),
            );
          if (variation === "missing-proof")
            verified.evidenceRef = join(f.dir, "absent.json");
          return verified;
        },
      }),
    );
    assert.equal(existsSync(lockPath(f)), true);
    if (variation === "guard-changed")
      assert.equal(
        JSON.parse(readFileSync(lockPath(f) + ".recovery", "utf8")).token,
        "new-recovery",
      );
  });
}

test("non-object legacy lock data remains closed without verified exclusive recovery", async (t) => {
  const f = fixture(t);
  writeFileSync(lockPath(f), "null");
  await assert.rejects(f.store.recoverAbandonedLock(), /owner缺失/);
  assert.equal(existsSync(lockPath(f)), true);
  assert.equal(
    (
      await f.store.recoverAbandonedLock({
        verifyExclusiveRecovery: (context) => receipt(f, context),
      })
    ).recovered,
    true,
  );
});
