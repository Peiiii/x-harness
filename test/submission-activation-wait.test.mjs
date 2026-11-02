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
  {
    activation = "keyboard",
    fault = "late",
    native = false,
    trace = false,
  } = {},
) {
  let time = 0,
    waits = 0,
    gates = 0,
    presses = 0,
    clicks = 0,
    nativeReads = 0,
    nativeClicks = 0,
    reads = 0,
    idle = 0,
    traceReads = 0,
    capabilityReads = 0,
    networkEnables = 0;
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
      capabilities: trace
        ? {
            get: async () => {
              capabilityReads++;
              return {
                send: async () => {
                  networkEnables++;
                },
                readEvents: async ({ afterSequence }) => {
                  traceReads++;
                  const req = (id, url, wallTime) => ({
                    method: "Network.requestWillBeSent",
                    params: {
                      requestId: id,
                      wallTime,
                      request: { url, method: "POST" },
                    },
                  });
                  const res = (id, url) => ({
                    method: "Network.responseReceived",
                    params: {
                      requestId: id,
                      response: {
                        url,
                        status: 429,
                        headers: { "retry-after": "90" },
                      },
                    },
                  });
                  const url = "https://x.com/i/api/graphql/test/CreateTweet";
                  return {
                    cursor: 10,
                    truncated: false,
                    hasMore: false,
                    events: afterSequence
                      ? []
                      : [
                          req("old", url, -1),
                          res("old", url),
                          req(
                            "background",
                            "https://x.com/i/api/graphql/test/ViewerBadgeCounts",
                            1,
                          ),
                          res(
                            "background",
                            "https://x.com/i/api/graphql/test/ViewerBadgeCounts",
                          ),
                          req("current", url, 0.001),
                          res("current", url),
                        ],
                  };
                },
              };
            },
          }
        : undefined,
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
        alerts: ["alert", "deadline-alert"].includes(fault)
          ? ["challenge"]
          : [],
        page: fault === "route" ? "https://x.com/home" : submitted.page,
        accountHandle: fault === "account" ? "other" : submitted.accountHandle,
        editorText:
          fault === "draft"
            ? "different draft"
            : fault === "cleared"
              ? ""
              : submitted.editorText,
        replyToId: fault === "parent" ? "99" : submitted.replyToId,
        editors: [{}],
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
            time +=
              fault === "cleared" || fault === "deadline-alert"
                ? timeoutMs
                : Math.min(3000, timeoutMs);
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
    traceReads,
    capabilityReads,
    networkEnables,
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
  assert.equal(r.idle, 0);
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

test("a deadline timeout still observes the original cleared editor before receipt verification", async (t) => {
  const r = await run(t, { fault: "cleared" });
  assert.equal(r.error, undefined);
  assert.equal(r.reads, 1);
  assert.equal(r.presses, 1);
  assert.equal(r.waits, 1);
  assert.equal(r.idle, 0);
});
test("a deadline timeout retains the original platform alert without retrying submit", async (t) => {
  const r = await run(t, { fault: "deadline-alert" });
  assert.ok(r.error);
  assert.equal(r.reads, 1);
  assert.equal(r.presses, 1);
  assert.equal(r.idle, 0);
  assert.equal(r.error.submissionDiagnostic.editorState, "retained");
  assert.deepEqual(r.error.submissionDiagnostic.alerts, ["challenge"]);
});

test("failure keeps original editor evidence without querying the browser diagnostics channel", async (t) => {
  const r = await run(t, { fault: "exhausted", trace: true });
  assert.ok(r.error);
  assert.equal(r.presses, 1);
  assert.equal(r.gates, 1);
  assert.equal(r.traceReads, 0);
  assert.equal(r.capabilityReads, 0);
  assert.equal(r.networkEnables, 0);
  assert.equal(
    r.error.submissionDiagnostic.code,
    "submitted-editor-clear-unconfirmed",
  );
});
test("normal successful submission does not read optional transport diagnostics", async (t) => {
  const r = await run(t, { fault: "none", trace: true });
  assert.equal(r.error, undefined);
  assert.equal(r.traceReads, 0);
  assert.equal(r.capabilityReads, 0);
  assert.equal(r.networkEnables, 0);
});
