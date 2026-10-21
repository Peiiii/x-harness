import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { XUsageJournal, readXUsageReport } from "../dist/usage.js";
import { createXGrowthHarness } from "../dist/index.js";
const fixture = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "xusage-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
test("binding creates no browser calls or files; status is local and every public call is measured", async (t) => {
  const dir = fixture(t);
  writeFileSync(join(dir, "source.json"), "{}");
  let calls = 0;
  const x = createXGrowthHarness({
    tab: {
      id: "test",
      goto: async () => {},
      url: async () => "https://x.com/test/status/1",
      playwright: {
        evaluate: async () => {
          calls++;
          throw Error("HTTP-429 SECRET");
        },
      },
    },
    ledgerPath: join(dir, "ledger.md"),
    proofDirectory: dir,
  });
  assert.equal(calls, 0);
  assert.deepEqual(readdirSync(dir), ["source.json"]);
  assert.equal(x.usageStatus().calls, 0);
  await x.readPost({
    target: {
      postId: "1",
      url: "https://x.com/test/status/1",
      evidenceRef: join(dir, "source.json"),
    },
    mode: "decision",
  });
  const report = readXUsageReport([dir]);
  assert.equal(report.operations["harness:readPost"].calls, 1);
  assert.equal(report.operations["browser:observe"].http429, 1);
  assert.equal(calls, 1); // Logging adds no browser retry.
  assert.equal(report.coverage.httpRequestCountKnown, false);
});
test("parallel calls, crash visibility, exact layer counts, privacy and sync/async return preservation", async (t) => {
  const dir = fixture(t),
    usage = new XUsageJournal(dir);
  let finish;
  const target = {
    value: 3,
    sync() {
      return this.value;
    },
    async read() {
      return { status: "needsDecision", reason: "HTTP-429 token=SECRET" };
    },
    pending() {
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    fail() {
      throw Error("SECRET");
    },
  };
  const x = usage.wrap(target, "harness");
  assert.equal(x.sync(), 3);
  assert.equal(x.read, x.read);
  await Promise.all([x.read({ password: "SECRET" }), x.read()]);
  const pending = x.pending();
  assert.throws(() => x.fail(), /SECRET/);
  const report = readXUsageReport([dir, dir]);
  assert.equal(report.records, 5);
  assert.equal(report.operations["harness:pending"].unfinished, 1);
  assert.equal(report.operations["harness:read"].http429, 2);
  assert.equal(report.operations["harness:fail"].threw, 1);
  const text = readdirSync(usage.status().directory)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readFileSync(join(usage.status().directory, f), "utf8"))
    .join("");
  assert.equal(text.includes("SECRET"), false);
  finish("ok");
  assert.equal(await pending, "ok");
  assert.equal(
    readXUsageReport([dir]).operations["harness:pending"].unfinished,
    0,
  );
});
test("disk failure never repeats or changes a business result and is explicitly visible", (t) => {
  const dir = fixture(t),
    blocked = join(dir, "file");
  writeFileSync(blocked, "x");
  let calls = 0;
  const usage = new XUsageJournal(blocked),
    x = usage.wrap(
      {
        submit() {
          calls++;
          return { status: "verified" };
        },
      },
      "harness",
    );
  assert.deepEqual(x.submit(), { status: "verified" });
  assert.equal(calls, 1);
  assert.equal(usage.status().failedWrites, 2);
  assert.equal(usage.status().lastError, "usage-log-unavailable");
  assert.equal(readXUsageReport([blocked]).gaps.length, 1);
});
test("separate sessions coexist, interrupted temp files are not counted and absent coverage stays unknown", (t) => {
  const dir = fixture(t),
    a = new XUsageJournal(dir),
    b = new XUsageJournal(dir);
  a.wrap(
    {
      read() {
        return 1;
      },
    },
    "harness",
  ).read();
  b.wrap(
    {
      read() {
        return 2;
      },
    },
    "harness",
  ).read();
  writeFileSync(join(a.status().directory, "interrupted.json.tmp"), "{");
  writeFileSync(join(a.status().directory, "broken.json"), "{");
  const report = readXUsageReport([dir]);
  assert.equal(report.records, 2);
  assert.equal(report.gaps.length, 1);
  assert.equal(report.coverage.zeroEventsMeansIdle, false);
  assert.equal(Object.keys(report.minutes).length, 1);
  assert.equal(
    readXUsageReport([dir], { since: "2099-01-01T00:00:00Z" }).records,
    0,
  );
});
