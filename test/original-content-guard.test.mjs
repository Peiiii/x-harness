import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { createXGrowthHarness } from "../dist/index.js";
import { fixture, NOW } from "./fixtures.mjs";

function scenario(t, guard, executor) {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  f.edit((s) => {
    s.execution.originalContentGuardRequired = true;
  });
  return {
    ...f,
    api: createBusinessHarness({
      platform: f.platform,
      store: f.store,
      clock: () => NOW,
      originalContentGuard: guard,
      executor: executor && {
        id: "publisher",
        tabId: "own-tab",
        scopeKinds: ["original"],
        evidenceRef: f.proof,
      },
    }),
  };
}
const args = (f) => ({ taskId: "round-1", draftPath: f.draft });
for (const [label, guard] of [
  ["missing", undefined],
  ["reject", () => "source-mention-forbidden"],
  [
    "exception",
    () => {
      throw Error("read failed");
    },
  ],
  ["invalid", () => undefined],
  ["async", async () => null],
])
  test(`original admission fails closed for ${label}, even with approved quality`, async (t) => {
    const f = scenario(t, guard);
    await f.api.publishPost(args(f));
    assert.equal(f.read().actions[0].status, "prepared");
    assert.equal(f.read().attempts.length, 0);
    assert.deepEqual(f.writes, []);
  });
for (const route of ["exclusive", "scoped", "independent"])
  test(`${route} admission rechecks the policy immediately before the only click`, async (t) => {
    let rejected = false,
      checks = 0;
    const f = scenario(
      t,
      () => {
        checks++;
        return rejected ? "user-vetoed" : null;
      },
      route === "scoped",
    );
    const submit = f.platform.submitPost;
    f.platform.submitPost = (input) => {
      rejected = true;
      return submit(input);
    };
    await f.api.publishPost({
      ...args(f),
      ...(route === "independent"
        ? {
            independentExecution: {
              tabId: "own-tab",
              evidenceRef: f.proof,
              scopeEvidenceRef: f.proof,
            },
          }
        : {}),
    });
    assert.ok(checks >= 2);
    assert.deepEqual(f.writes, []);
    assert.notEqual(f.read().actions[0].status, "verified");
    assert.ok(f.read().attempts.length <= 1);
  });
test("admitted original publishes once and preserves the normal business result", async (t) => {
  const f = scenario(t, () => null);
  const result = await f.api.publishPost(args(f));
  assert.equal(result.status, "verified");
  assert.deepEqual(f.writes, ["submitPost"]);
});
test("root binding forwards admission and does not read the browser for a rejected draft", async (t) => {
  const f = scenario(t),
    tab = {
      id: "own-tab",
      playwright: {
        evaluate() {
          throw Error("unexpected browser access");
        },
      },
    };
  const api = createXGrowthHarness({
    app: {
      getAXState() {
        throw Error("unexpected browser access");
      },
      click() {},
      pressKey() {},
      paste() {},
    },
    ledgerPath: f.ledger,
    proofDirectory: f.dir,
    clock: () => NOW,
    originalContentGuard: () => "source-mention-forbidden",
  });
  const result = await api.publishPost(args(f));
  assert.equal(result.status, "needsDecision");
  assert.equal(f.read().attempts.length, 0);
});
test("original admission does not forbid a legitimate reply mention", async (t) => {
  const f = fixture(t, { planned: [0, 0, 1], actionKinds: ["reply"] });
  f.edit((s) => {
    s.execution.originalContentGuardRequired = true;
    s.actions[0].text = "@reader 有具体贡献的回复";
    s.actions[0].quality.approvedText = s.actions[0].text;
  });
  const api = createBusinessHarness({
    platform: f.platform,
    store: f.store,
    clock: () => NOW,
    originalContentGuard: () => "source-mention-forbidden",
  });
  await api.replyToPost({
    taskId: "round-1",
    postId: "123",
    text: f.read().actions[0].text,
  });
  assert.deepEqual(f.writes, ["submitReply"]);
});

test("an original content hold takes precedence over approved copy and an accepting guard", async (t) => {
  const f = scenario(t, () => null);
  f.edit((s) => {
    s.execution.originalContentHold = true;
  });
  await f.api.publishPost(args(f));
  assert.equal(f.read().actions[0].status, "prepared");
  assert.deepEqual(f.writes, []);
  assert.equal(f.read().attempts.length, 0);
});
