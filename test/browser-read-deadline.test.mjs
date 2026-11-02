import test from "node:test";
import assert from "node:assert/strict";
import { BrowserReadDeadline } from "../dist/browser-read-deadline.js";
import { DOMNavigation } from "../dist/browser-dom-navigation.js";
import { DOMXBrowser } from "../dist/browser-dom.js";
import { fixture } from "./fixtures.mjs";

test("a host read ignoring its timeout returns a local diagnostic and does not queue another read", async () => {
  const deadline = new BrowserReadDeadline(10);
  let finish,
    calls = 0;
  const result = deadline.run("observe", () => {
    calls++;
    return new Promise((resolve) => (finish = resolve));
  });
  await assert.rejects(result, /browser-read-timeout:observe:10ms/);
  await assert.rejects(
    deadline.run("next", async () => {
      calls++;
    }),
    /browser-read-pending/,
  );
  assert.equal(calls, 1);
  finish("late");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await deadline.run("fresh", async () => 42), 42);
});
test("a late failed read is consumed without an unhandled rejection", async () => {
  const deadline = new BrowserReadDeadline(5);
  let fail;
  await assert.rejects(
    deadline.run("observe", () => new Promise((_, reject) => (fail = reject))),
    /browser-read-timeout/,
  );
  fail(Error("late transport failure"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await deadline.run("fresh", async () => true), true);
});
test("a timed-out observed-link count cannot navigate later when its read finally resolves", async () => {
  let finish,
    gotos = 0,
    clicks = 0;
  const locator = {
    filter() {
      return this;
    },
    count: () => new Promise((resolve) => (finish = resolve)),
    click: async () => {
      clicks++;
    },
  };
  const nav = new DOMNavigation({
    session: {},
    readDeadline: new BrowserReadDeadline(5),
    observe: async () => ({}),
    tab: {
      url: async () => "https://x.com/home",
      goto: async () => {
        gotos++;
      },
      playwright: { locator: () => locator },
    },
  });
  await assert.rejects(
    nav.openObserved({
      view: "person",
      url: "https://x.com/reader",
      handle: "reader",
      evidenceRef: "review",
    }),
    /browser-read-timeout/,
  );
  finish(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gotos, 0);
  assert.equal(clicks, 0);
});
test("DOM observation times out before host setup returns, never accepting its late value", async () => {
  let finish, options;
  const browser = new DOMXBrowser(
    {
      playwright: {
        evaluate: (_fn, _arg, opt) => {
          options = opt;
          return new Promise((resolve) => (finish = resolve));
        },
      },
    },
    { readTimeoutMs: 5 },
  );
  await assert.rejects(
    browser.observe({ view: "account" }),
    /browser-read-timeout:observe:account/,
  );
  assert.equal(options.timeoutMs, 5);
  finish({ page: "https://x.com/home", accountHandle: "Pei", alerts: [] });
  await new Promise((resolve) => setImmediate(resolve));
});
test("a bounded pre-submit read failure unwinds the original action claim and never activates", async (t) => {
  const f = fixture(t),
    actor = f.newExecutor("follow-recovery", ["follow"]),
    deadline = new BrowserReadDeadline(5);
  actor.platform.readPerson = () =>
    deadline.run("person", () => new Promise(() => {}));
  await actor.api.followOne({ taskId: "round-1", handle: "reader" });
  const a = f.read().actions.find((a) => a.kind === "follow");
  assert.equal(a.claim, undefined);
  assert.equal(a.status, "prepared");
  assert.equal(f.writes.length, 0);
});
