import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fixture } from "./fixtures.mjs";
import {
  createFileRoundStore,
  createGrowthHarness,
} from "../dist/diagnostics.js";
import { mergeLedgerValue } from "../dist/ledger-merge.js";
const storeFor = (f) =>
  createFileRoundStore({
    ledgerPath: f.ledger,
    proofDirectory: join(f.dir, "proofs"),
  });
test("an awaiting local mutation does not block another page, and independent state is merged", async (t) => {
  const f = fixture(t),
    other = storeFor(f);
  let release, started;
  const ready = new Promise((r) => (started = r)),
    wait = new Promise((r) => (release = r));
  const pending = f.store.transaction(async ({ state }) => {
    state.actions.push({ id: "page-A" });
    started();
    await wait;
    return state;
  });
  await ready;
  await other.transaction(({ state }) => {
    state.actions.push({ id: "page-B" });
    return state;
  });
  assert.ok(f.read().actions.some((a) => a.id === "page-B"));
  release();
  await pending;
  assert.ok(f.read().actions.some((a) => a.id === "page-A"));
  assert.ok(f.read().actions.some((a) => a.id === "page-B"));
  assert.equal(existsSync(join(f.dir, ".x-harness.lock")), false);
});
test("concurrent numeric changes are recomputed from fresh state rather than coalesced or lost", async (t) => {
  const f = fixture(t);
  let release, started;
  const ready = new Promise((r) => (started = r)),
    wait = new Promise((r) => (release = r));
  let calls = 0;
  const first = f.store.transaction(async ({ state }) => {
    state.items[0].verified++;
    if (++calls === 1) {
      started();
      await wait;
    }
    return state;
  });
  await ready;
  await storeFor(f).transaction(({ state }) => {
    state.items[0].verified++;
    return state;
  });
  release();
  await first;
  assert.equal(f.read().items[0].verified, 2);
  assert.equal(calls, 2);
});
test("incompatible changes of the same action reject; independent and append-only state survive", () => {
  const base = { actions: [{ id: "a", status: "prepared" }], attempts: [] };
  assert.throws(
    () =>
      mergeLedgerValue(
        base,
        { actions: [{ id: "a", status: "intent" }], attempts: [] },
        { actions: [{ id: "a", status: "skipped" }], attempts: [] },
      ),
    /同一对象/,
  );
  assert.deepEqual(
    mergeLedgerValue({ a: [] }, { a: [{ x: 1 }] }, { a: [{ x: 2 }] }).a,
    [{ x: 1 }, { x: 2 }],
  );
});
test("read-only root calls do not write the account ledger or depend on its legacy owner lock", async (t) => {
  const f = fixture(t),
    before = readFileSync(f.ledger, "utf8");
  writeFileSync(
    join(f.dir, ".x-harness.lock"),
    JSON.stringify({ pid: null, token: "legacy-interrupted" }),
  );
  let transactions = 0;
  f.store.transaction = () => {
    transactions++;
    throw Error("ledger-must-not-be-written");
  };
  const api = createGrowthHarness({
    store: f.store,
    executor: {
      id: "reader",
      tabId: "independent-page",
      scopeKinds: ["follow"],
      evidenceRef: f.proof,
    },
    platform: {
      preflight: () => ({ covered: true }),
      readAccount: async () => ({
        accountHandle: "Pei",
        accountURL: "https://x.com/Pei",
        complete: true,
      }),
      captureProof: ({ observation }) => ({ observation }),
    },
  });
  const r = await api.inspectAccount();
  assert.equal(r.status, "observed");
  assert.equal(transactions, 0);
  assert.equal(readFileSync(f.ledger, "utf8"), before);
});
test("multiple real processes preserve all independent action IDs and count increments", async (t) => {
  const f = fixture(t),
    worker = join(f.dir, "worker.mjs"),
    moduleURL = new URL("../dist/diagnostics.js", import.meta.url).href;
  writeFileSync(
    worker,
    `import{createFileRoundStore}from ${JSON.stringify(moduleURL)};const s=createFileRoundStore({ledgerPath:process.argv[2],proofDirectory:process.argv[2]+'.proofs'});for(let i=0;i<5;i++)await s.transaction(async({state})=>{state.actions.push({id:process.argv[3]+'-'+i});state.items[0].verified++;await new Promise(r=>setTimeout(r,5));return state});`,
  );
  await Promise.all(
    ["A", "B", "C"].map(
      (id) =>
        new Promise((resolve, reject) => {
          const child = spawn(process.execPath, [worker, f.ledger, id], {
            stdio: ["ignore", "ignore", "pipe"],
          });
          let err = "";
          child.stderr.on("data", (b) => (err += b));
          child.once("error", reject);
          child.once("exit", (code) =>
            code === 0 ? resolve() : reject(Error(err)),
          );
        }),
    ),
  );
  assert.equal(f.read().items[0].verified, 15);
  assert.equal(f.read().actions.filter((a) => /^[ABC]-/.test(a.id)).length, 15);
  assert.equal(existsSync(join(f.dir, ".x-harness-write.sqlite")), true);
});

test("a retried claim callback cannot submit with a discarded local claim token", async (t) => {
  const f = fixture(t),
    actor = f.newExecutor("retry-actor", ["follow"]),
    originalSave = actor.store.save;
  let forced = false;
  actor.store.save = async (snapshot, state) => {
    const claimed = state.actions.find((a) => a.claim);
    if (claimed && !forced) {
      forced = true;
      await storeFor(f).transaction(({ state: current }) => {
        current.actions.find((a) => a.id === claimed.id).status = "skipped";
        return current;
      });
    }
    return originalSave(snapshot, state);
  };
  await actor.api.followOne({ taskId: "round-1", handle: "reader" });
  assert.equal(forced, true);
  assert.equal(f.writes.length, 0);
  assert.equal(f.read().actions[0].status, "skipped");
});

test("killing the real native commit owner leaves no permanent blocker for its successor", async (t) => {
  const f = fixture(t),
    worker = join(f.dir, "killed-worker.mjs"),
    ready = join(f.dir, "entered");
  const gateURL = new URL("../dist/ledger-write-gate.js", import.meta.url).href;
  writeFileSync(
    worker,
    `import{LedgerWriteGate}from ${JSON.stringify(gateURL)};import{writeFileSync}from'node:fs';new LedgerWriteGate(process.argv[2]).run(()=>{writeFileSync(process.argv[3],'inside-native-commit');const start=Date.now();while(Date.now()-start<10000){};return 1;});`,
  );
  const child = spawn(process.execPath, [worker, f.ledger, ready], {
    stdio: "ignore",
  });
  t.after(() => child.kill("SIGKILL"));
  for (let n = 0; !existsSync(ready); n++) {
    if (n > 500) throw Error("native-owner-not-ready");
    await new Promise((r) => setTimeout(r, 5));
  }
  child.kill("SIGKILL");
  await new Promise((r) => child.once("exit", r));
  assert.equal(existsSync(join(f.dir, ".x-harness.lock")), true);
  await storeFor(f).transaction(({ state }) => {
    state.recoveredByNextNativeWriter = true;
    return state;
  });
  assert.equal(f.read().recoveredByNextNativeWriter, true);
  assert.equal(existsSync(join(f.dir, ".x-harness.lock")), false);
});

test("a different page can continue an independent target without clearing the old action claim", async (t) => {
  const f = fixture(t, { planned: [2, 1, 1] }),
    actor = f.newExecutor("same-role", ["follow"]);
  const old = {
    id: "old-unresolved",
    kind: "follow",
    status: "unknown",
    handle: "otherReader",
    claim: { token: "protected-old-token", pid: null },
  };
  f.edit((s) => {
    s.actions.push(old);
    s.items[0].unknown = 1;
    s.executions = {
      "same-role": {
        id: "same-role",
        tabId: "different-old-page",
        runtimeId: "old-runtime",
        pid: null,
        activity: "round",
        actionId: old.id,
      },
    };
  });
  const result = await actor.api.followOne({
    taskId: "round-1",
    handle: "reader",
  });
  assert.equal(f.read().actions[0].status, "verified", JSON.stringify(result));
  assert.deepEqual(
    f.read().actions.find((a) => a.id === old.id),
    old,
  );
  assert.equal(f.writes.length, 1);
});
