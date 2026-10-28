import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicObservationCode } from "../dist/browser.js";
import { createDOMXBrowser } from "../dist/diagnostics.js";
import { XUsageJournal } from "../dist/usage.js";

test("same DOM observation records page and host boundaries without another browser call", async (t) => {
  let clock = 100,
    calls = 0;
  const dom = runInNewContext("(" + atomicObservationCode + ")", {
    Date: { now: () => clock++ },
    location: { href: "https://x.com/home" },
    document: { visibilityState: "hidden", querySelectorAll: () => [] },
  });
  const result = dom({ view: "account" });
  assert.equal(result.domReadTiming.enteredAtMs, 100);
  assert.equal(result.domReadTiming.finishedAtMs, 101);
  assert.equal(result.domReadTiming.visibilityState, "hidden");
  const dir = mkdtempSync(join(tmpdir(), "x-read-timing-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const usage = new XUsageJournal(dir);
  const browser = usage.wrap(
    createDOMXBrowser({
      playwright: {
        evaluate: async () => {
          calls++;
          return {
            ...result,
            domReadTiming: { ...result.domReadTiming, secret: "DO_NOT_LOG" },
          };
        },
      },
    }),
    "browser",
  );
  const observed = await browser.observe({ view: "account" });
  assert.equal(calls, 1);
  assert.ok(
    observed.domReadTiming.hostFinishedAtMs >=
      observed.domReadTiming.hostStartedAtMs,
  );
  const entries = readdirSync(usage.status().directory).map((f) =>
    JSON.parse(readFileSync(join(usage.status().directory, f))),
  );
  const logged = entries.find((r) => r.finishedAt);
  assert.equal(logged.domReadTiming.visibilityState, "hidden");
  assert.equal(logged.domReadTiming.enteredAtMs, 100);
  assert.ok(Number.isFinite(logged.domReadTiming.hostStartedAtMs));
  assert.equal(JSON.stringify(entries).includes("DO_NOT_LOG"), false);
});

test("timing journal rejects untrusted fields and invalid numbers", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "x-invalid-timing-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const usage = new XUsageJournal(dir);
  await usage
    .wrap(
      {
        observe: async () => ({
          domReadTiming: {
            enteredAtMs: -1,
            finishedAtMs: Infinity,
            hostStartedAtMs: "PRIVATE",
            visibilityState: "PRIVATE",
            secret: "PRIVATE",
          },
        }),
      },
      "browser",
    )
    .observe();
  const text = readdirSync(usage.status().directory)
    .map((f) => readFileSync(join(usage.status().directory, f), "utf8"))
    .join("");
  assert.equal(text.includes("PRIVATE"), false);
  assert.equal(text.includes("domReadTiming"), false);
});
