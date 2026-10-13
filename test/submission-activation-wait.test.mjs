import test from "node:test";
import assert from "node:assert/strict";
import { createDOMSubmission } from "../dist/browser-dom-submission.js";
const submitted = {
  page: "https://x.com/peer/status/10",
  accountHandle: "owner",
  editorText: "Reply",
  replyToId: "10",
};
async function run(
  t,
  { activation = "keyboard", fault = "late", native = false } = {},
) {
  let time = 0,
    waits = 0,
    gates = 0,
    presses = 0,
    clicks = 0,
    nativeReads = 0,
    nativeClicks = 0,
    reads = 0,
    idle = 0;
  t.mock.method(Date, "now", () => time);
  const finish = createDOMSubmission({
    session: {},
    submitAX: native
      ? {
          observe: async () => {
            nativeReads++;
            return {
              page: submitted.page,
              alerts: [],
              needsStateCheck: false,
              evidence: [
                { label: "文本输入区域 帖子文本, Value: Reply", index: 1 },
                { label: "按钮 回复", index: 2 },
              ],
            };
          },
          act: async () => {
            nativeClicks++;
          },
        }
      : null,
    tab: {
      playwright: {
        waitForLoadState: async () => {
          idle++;
        },
      },
    },
    observe: async () => {
      reads++;
      return {
        ...submitted,
        alerts: fault === "alert" ? ["challenge"] : [],
        page: fault === "route" ? "https://x.com/home" : submitted.page,
        accountHandle: fault === "account" ? "other" : submitted.accountHandle,
        editorText:
          fault === "draft" ? "different draft" : submitted.editorText,
        replyToId: fault === "parent" ? "99" : submitted.replyToId,
      };
    },
    unique: () => {
      throw Error("No extra locator");
    },
    locator: () => {
      throw Error("No extra locator");
    },
  });
  let error;
  try {
    await finish(
      {
        operation: "submitReply",
        activation,
        beforeSubmit: () => {
          gates++;
        },
      },
      {
        loc: {
          press: async (key) => {
            assert.equal(key, "Enter");
            presses++;
          },
          click: async () => {
            clicks++;
          },
        },
        submittedEditor: {
          waitFor: async ({ state, timeoutMs }) => {
            assert.equal(state, "hidden");
            waits++;
            time += Math.min(3000, timeoutMs);
            if (fault === "none" || (fault === "late" && waits === 3)) return;
            throw Error(
              fault === "interrupted"
                ? "connection interrupted"
                : "Playwright selector deadline exceeded",
            );
          },
        },
      },
      {},
      submitted,
    );
  } catch (e) {
    error = e;
  }
  return {
    error,
    waits,
    gates,
    presses,
    clicks,
    nativeReads,
    nativeClicks,
    reads,
    idle,
    time,
  };
}
test("explicit keyboard bypasses an available native bridge and submits once", async (t) => {
  const r = await run(t, { native: true, fault: "none" });
  assert.equal(r.error, undefined);
  assert.equal(r.gates, 1);
  assert.equal(r.presses, 1);
  assert.equal(r.clicks + r.nativeClicks + r.nativeReads, 0);
});
test("explicit click preserves the verified native bridge", async (t) => {
  const r = await run(t, { activation: "click", native: true, fault: "none" });
  assert.equal(r.error, undefined);
  assert.equal(r.nativeReads, 1);
  assert.equal(r.nativeClicks, 1);
  assert.equal(r.presses + r.clicks, 0);
});
test("host-capped submitted text waits resume without a second submit", async (t) => {
  const r = await run(t);
  assert.equal(r.error, undefined);
  assert.equal(r.waits, 3);
  assert.equal(r.reads, 2);
  assert.equal(r.presses, 1);
  assert.equal(r.gates, 1);
  assert.equal(r.idle, 1);
});
for (const fault of [
  "exhausted",
  "route",
  "account",
  "draft",
  "parent",
  "alert",
  "interrupted",
]) {
  test(`submitted text ${fault} fails closed without resubmission`, async (t) => {
    const r = await run(t, { fault });
    assert.ok(r.error);
    assert.equal(r.gates, 1);
    assert.equal(r.presses, 1);
    assert.equal(r.idle, 0);
    assert.equal(r.waits, fault === "exhausted" ? 4 : 1);
    assert.ok(r.time <= 10000);
  });
}
