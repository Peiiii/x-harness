import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
import { XUsageJournal, readXUsageReport } from "../dist/usage.js";

test("a pending profile content wait has a durable inner-stage record without another browser call", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "navigation-stage-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const usage = new XUsageJournal(dir);
  let release;
  let waits = 0,
    reads = 0;
  const target = {
    waitFor: () => {
      waits++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  const nav = new DOMNavigation({
    session: {},
    trace: (stage, invoke) => usage.browserStage(stage, invoke),
    observe: async () => {
      reads++;
      return {
        page: "https://x.com/reader",
        accountHandle: "owner",
        alerts: [],
      };
    },
    tab: {
      url: async () => "https://x.com/reader",
      playwright: { locator: () => target },
    },
  });
  const pending = nav.openObserved({
    view: "person",
    handle: "reader",
    url: "https://x.com/reader",
    evidenceRef: "synthetic",
  });
  for (let i = 0; i < 20 && !release; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal(waits, 1);
  assert.equal(reads, 0);
  const report = readXUsageReport([dir]);
  const stage = report.navigationSteps?.["navigation:target-content-wait-1"];
  release();
  await pending;
  assert.equal(stage?.unfinished, 1);
  assert.equal(
    readXUsageReport([dir]).navigationSteps["navigation:target-content-wait-1"]
      .unfinished,
    0,
  );
  assert.equal(readXUsageReport([dir]).records, 0);
});

test("the public root binding wires navigation stages into the original read without a precheck", async (t) => {
  const { createXGrowthHarness } = await import("../dist/index.js");
  const { writeFileSync, readdirSync, readFileSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "navigation-root-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, "source.json");
  writeFileSync(source, "{}");
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let release,
    reads = 0,
    waits = 0;
  const url = "https://x.com/reader";
  const target = {
    waitFor: () => {
      waits++;
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  const x = createXGrowthHarness({
    tab: {
      id: "synthetic-tab",
      url: async () => url,
      playwright: {
        locator: () => target,
        evaluate: async () => {
          reads++;
          return {
            page: url,
            accountHandle: "owner",
            handle: "reader",
            url,
            relationship: reads === 1 ? "unknown" : "not-following",
            blue: reads === 1 ? null : true,
            needsStateCheck: reads === 1,
            alerts: [],
            fresh: true,
            observedAt: new Date().toISOString(),
          };
        },
      },
    },
    ledgerPath: join(dir, "ledger.md"),
    proofDirectory: dir,
  });
  const pending = x.readPerson({
    target: { handle: "reader", url, evidenceRef: source },
    mode: "decision",
  });
  await Promise.race([
    started,
    pending.then((value) => {
      throw Error("root-returned-before-target-wait:" + JSON.stringify(value));
    }),
  ]);
  assert.equal(waits, 1);
  assert.equal(reads, 1);
  const before = readXUsageReport([dir]);
  assert.equal(
    before.navigationSteps["navigation:target-content-wait-1"].unfinished,
    1,
  );
  assert.equal(Object.keys(before.creatorSteps).length, 0);
  release();
  await pending;
  assert.equal(reads, 2);
  const records = readdirSync(x.usageStatus().directory)
    .filter((n) => n.endsWith(".json"))
    .map((n) =>
      JSON.parse(readFileSync(join(x.usageStatus().directory, n), "utf8")),
    );
  const root = records.find((v) => v.operation === "readPerson"),
    step = records.find(
      (v) => v.operation === "navigation:target-content-wait-1",
    );
  assert.equal(step.rootCallId, root.id);
  assert.ok(step.parentCallId);
  assert.ok(step.finishedAt);
});
