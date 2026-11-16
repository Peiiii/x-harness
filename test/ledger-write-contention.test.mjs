import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { LedgerWriteGate } from "../dist/ledger-write-gate.js";
import { fixture, NOW } from "./fixtures.mjs";

async function holdWriter(t, path) {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import {DatabaseSync} from 'node:sqlite';
    const db=new DatabaseSync(process.argv[1]);
    db.exec('BEGIN IMMEDIATE; UPDATE write_gate SET n=n+1 WHERE id=1');
    process.stdout.write('locked');
    const release=()=>{db.exec('ROLLBACK');db.close();process.exit(0)};
    process.stdin.once('data',release);setTimeout(release,10000);
  `,
      path,
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let released = false;
  const release = () => {
    if (!released && child.exitCode === null) {
      released = true;
      child.stdin.write("release");
    }
  };
  child.stdin.on("error", () => {});
  t.after(() => {
    release();
    if (child.exitCode === null) child.kill();
  });
  await once(child.stdout, "data");
  return { release, exited: once(child, "exit") };
}

test("pre-callback SQLite BUSY uses the existing local CAS retry without repeating durable settlement", async (t) => {
  const f = fixture(t, {
    planned: [5, 0, 1],
    actionKinds: ["follow", "follow", "follow", "follow", "follow", "reply"],
  });
  f.edit((state) => {
    for (const action of state.actions.filter((a) => a.kind === "follow")) {
      action.status = "verified";
      action.intentAt = new Date(NOW).toISOString();
      action.resultEvidence = f.proof;
    }
    state.items[0].verified = 5;
    state.actions[5].status = "unknown";
    state.actions[5].intentAt = new Date(NOW).toISOString();
    state.items[2].unknown = 1;
    state.actions[4].claim = { token: "original-own-token" };
    state.followBatches = [
      { id: "original-batch", status: "RUNNING", verifiedTotal: 0 },
    ];
    state.executions = {
      follow: { runtimeId: "original-runtime", actionId: state.actions[4].id },
      other: { progress: 17 },
    };
    state.localHistory = [];
  });
  await f.store.transaction(({ state }) => state);
  const before = f.read(),
    writer = await holdWriter(t, join(f.dir, ".x-harness-write.sqlite"));
  let recomputations = 0;
  try {
    await f.store.transaction(({ state }) => {
      if (++recomputations === 2) writer.release();
      state.followBatches[0].status = "SETTLED";
      state.followBatches[0].verifiedTotal = state.actions.filter(
        (a) => a.kind === "follow" && a.status === "verified",
      ).length;
      state.localHistory.push("settled-once");
      assert.equal(state.actions[4].claim.token, "original-own-token");
      delete state.actions[4].claim;
      delete state.executions.follow.actionId;
      return state;
    });
  } finally {
    writer.release();
    await writer.exited;
  }
  const after = f.read();
  assert.equal(recomputations, 2);
  assert.equal(after.followBatches[0].status, "SETTLED");
  assert.equal(after.followBatches[0].verifiedTotal, 5);
  assert.deepEqual(after.localHistory, ["settled-once"]);
  assert.deepEqual(after.attempts, before.attempts);
  assert.deepEqual(after.actions[5], before.actions[5]);
  assert.deepEqual(after.executions.other, before.executions.other);
  assert.equal(f.writes.length, 0);
});

test("a BUSY thrown after entering the commit callback is never relabelled or replayed", (t) => {
  const f = fixture(t),
    gate = new LedgerWriteGate(f.ledger),
    marker = join(f.dir, "possible-commit");
  const busy = Object.assign(Error("database is locked"), {
    code: "ERR_SQLITE_ERROR",
    errcode: 5,
  });
  let calls = 0;
  assert.throws(
    () =>
      gate.run(() => {
        calls++;
        writeFileSync(marker, "once");
        throw busy;
      }),
    (error) => error === busy,
  );
  assert.equal(calls, 1);
  assert.equal(readFileSync(marker, "utf8"), "once");
});

test("native acknowledgement failure after the filesystem commit keeps the committed result exactly once", async (t) => {
  const f = fixture(t),
    path = join(f.dir, ".x-harness-write.sqlite");
  await f.store.transaction(({ state }) => state);
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TRIGGER fail_ack AFTER UPDATE ON write_gate BEGIN SELECT RAISE(ABORT, 'synthetic post-commit acknowledgement'); END",
  );
  db.close();
  let calls = 0;
  await f.store.transaction(({ state }) => {
    calls++;
    state.localCommitCount = (state.localCommitCount ?? 0) + 1;
    return state;
  });
  assert.equal(calls, 1);
  assert.equal(f.read().localCommitCount, 1);
});
