import test from "node:test";
import assert from "node:assert/strict";
import { PlatformWriting } from "../dist/platform-writing.js";

function scenario({ postClick = {}, afterRefresh = {}, missing = [] } = {}) {
  const action = {
    id: "follow-1",
    kind: "follow",
    handle: "reader",
    url: "https://x.com/reader",
    accountHandle: "owner",
    beforeSubmit: async () => {},
  };
  let clicked = false,
    refreshed = false,
    reads = 0,
    refreshes = 0,
    now = 1000;
  const person = () => ({
    page: action.url,
    handle: action.handle,
    accountHandle: action.accountHandle,
    needsStateCheck: false,
    alerts: [],
    relationship: clicked ? "following" : "not-following",
    ...(refreshed ? afterRefresh : {}),
  });
  const writer = new PlatformWriting({
    browser: {
      capabilities: () => missing,
      act: async ({ operation }) => {
        if (operation === "follow") clicked = true;
        if (operation === "refreshPerson") {
          refreshed = true;
          refreshes++;
        }
      },
    },
    observed: async () => ({ ...person(), ...postClick }),
    readPerson: async () => {
      reads++;
      return person();
    },
    followStage: async (_action, _stage, run) => run(),
    clock: () => now,
    open: async () => {},
    readPost: async () => {},
  });
  return {
    action,
    writer,
    counts: () => ({ reads, refreshes }),
    advance: (ms) => {
      now += ms;
    },
  };
}

test("reuse the same action's post-click observation and still refresh for persistent follow", async () => {
  const f = scenario();
  await f.writer.submitFollow(f.action);
  const receipt = await f.writer.findSubmission(f.action);
  assert.equal(receipt.verified, true);
  assert.deepEqual(f.counts(), { reads: 2, refreshes: 1 });
});

test("a post-click platform warning survives the durable refresh", async () => {
  const f = scenario({ postClick: { alerts: ["rate limit"] } });
  await f.writer.submitFollow(f.action);
  const receipt = await f.writer.findSubmission(f.action);
  assert.equal(receipt.verified, false);
  assert.deepEqual(receipt.alerts, ["rate limit"]);
  assert.equal(f.counts().refreshes, 1);
});

test("a mismatched post-click identity falls back to the fresh read", async () => {
  const f = scenario({ postClick: { handle: "someone-else" } });
  await f.writer.submitFollow(f.action);
  const receipt = await f.writer.findSubmission(f.action);
  assert.equal(receipt.verified, true);
  assert.deepEqual(f.counts(), { reads: 3, refreshes: 1 });
});

test("the post-click observation cannot be reused for a different action", async () => {
  const f = scenario();
  await f.writer.submitFollow(f.action);
  const receipt = await f.writer.findSubmission({
    ...f.action,
    id: "different-action",
  });
  assert.equal(receipt.verified, true);
  assert.deepEqual(f.counts(), { reads: 3, refreshes: 1 });
});

test("stale post-click evidence triggers a fresh pre-refresh read", async () => {
  const f = scenario();
  await f.writer.submitFollow(f.action);
  f.advance(5001);
  const receipt = await f.writer.findSubmission(f.action);
  assert.equal(receipt.verified, true);
  assert.deepEqual(f.counts(), { reads: 3, refreshes: 1 });
});

test("an observed warning remains evidence when the cached observation expires", async () => {
  const f = scenario({ postClick: { alerts: ["rate limit"] } });
  await f.writer.submitFollow(f.action);
  f.advance(5001);
  const receipt = await f.writer.findSubmission(f.action);
  assert.equal(receipt.verified, false);
  assert.deepEqual(receipt.alerts, ["rate limit"]);
  assert.deepEqual(f.counts(), { reads: 3, refreshes: 1 });
});

test("a wrong account or unfinished observation never substitutes for a fresh read", async () => {
  for (const postClick of [
    { accountHandle: "different" },
    { needsStateCheck: true },
    { page: "https://x.com/other" },
  ]) {
    const f = scenario({ postClick });
    await f.writer.submitFollow(f.action);
    const receipt = await f.writer.findSubmission(f.action);
    assert.equal(receipt.verified, true);
    assert.deepEqual(f.counts(), { reads: 3, refreshes: 1 });
  }
});

test("relationship rollback after refresh remains unverified", async () => {
  const f = scenario({ afterRefresh: { relationship: "not-following" } });
  await f.writer.submitFollow(f.action);
  const receipt = await f.writer.findSubmission(f.action);
  assert.equal(receipt.verified, false);
  assert.equal(f.counts().refreshes, 1);
});

test("a post-click warning is preserved even when refresh capability is unavailable", async () => {
  const f = scenario({
    postClick: { handle: "other", alerts: ["rate limit"] },
    missing: ["refreshPerson"],
  });
  await f.writer.submitFollow(f.action);
  const receipt = await f.writer.findSubmission(f.action);
  assert.equal(receipt.verified, false);
  assert.deepEqual(receipt.alerts, ["rate limit"]);
  assert.deepEqual(receipt.missing, ["refreshPerson"]);
});
