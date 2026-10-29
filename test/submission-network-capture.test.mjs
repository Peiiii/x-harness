import test from "node:test";
import assert from "node:assert/strict";
import { SubmissionNetworkCapture } from "../dist/submission-network-capture.js";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

const url = "https://x.com/i/api/graphql/test/CreateTweet?secret=private";
function tabFor({ truncated = false, withRequest = true } = {}) {
  let reads = 0,
    enabled = 0;
  return {
    tab: {
      capabilities: {
        get: async () => ({
          send: async () => {
            enabled++;
          },
          readEvents: async () => {
            reads++;
            return reads === 1
              ? { cursor: 10, hasMore: false, truncated: true, events: [] }
              : {
                  cursor: 12,
                  hasMore: false,
                  truncated,
                  events: withRequest
                    ? [
                        {
                          method: "Network.requestWillBeSent",
                          params: {
                            requestId: "r",
                            wallTime: 10,
                            request: {
                              url,
                              method: "POST",
                              postData: "private body",
                              headers: { Cookie: "private cookie" },
                            },
                          },
                        },
                        {
                          method: "Network.responseReceived",
                          params: {
                            requestId: "r",
                            response: {
                              url,
                              status: 429,
                              headers: {
                                "retry-after": "120",
                                "set-cookie": "private cookie",
                              },
                            },
                          },
                        },
                      ]
                    : [],
                };
          },
        }),
      },
    },
    get reads() {
      return reads;
    },
    get enabled() {
      return enabled;
    },
  };
}
test("captures submission request and numeric response without secrets", async () => {
  const f = tabFor();
  const capture = await SubmissionNetworkCapture.start(f.tab);
  const result = await capture.stop();
  assert.equal(f.enabled, 1);
  assert.equal(result.status, "complete");
  assert.equal(result.events.length, 2);
  assert.equal(result.events[1].status, 429);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.match(result.boundary, /never authorizes resubmission/);
});
test("reports truncated capture as incomplete and does not infer no submission", async () => {
  const f = tabFor({ truncated: true, withRequest: false });
  const result = await (await SubmissionNetworkCapture.start(f.tab)).stop();
  assert.equal(result.status, "incomplete");
  assert.deepEqual(result.events, []);
});
test("missing diagnostic capability does not block normal execution", async () => {
  assert.equal(await SubmissionNetworkCapture.start({}), undefined);
});
test("verification error preserves telemetry while keeping action unknown", async (t) => {
  const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 1] });
  const diagnostic = {
    transport: { status: "complete", events: [{ status: 200 }] },
  };
  let writes = 0;
  f.platform.submitReply = async (a) => {
    await a.beforeSubmit?.();
    writes++;
    return { submissionDiagnostic: diagnostic };
  };
  f.platform.findSubmission = async (_a, context) => {
    if (context?.phase === "baseline")
      return { accountHandle: "Pei", posts: [], verified: false };
    throw Error("verification timed out");
  };
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => NOW,
  });
  const result = await api.replyToPost({
    taskId: "round-1",
    postId: "123",
    text: "有具体贡献的回复",
  });
  const action = (await f.store.load()).state.actions.find(
    (a) => a.kind === "reply",
  );
  assert.equal(result.status, "unknown");
  assert.equal(writes, 1);
  assert.equal(action.status, "unknown");
  const fs = await import("node:fs");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(action.resultEvidence, "utf8")).observation
      .submissionDiagnostic,
    diagnostic,
  );
});

test("unverified receipt preserves submission telemetry without retry", async (t) => {
  const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 1] });
  const diagnostic = { transport: { status: "incomplete", events: [] } };
  let writes = 0;
  f.platform.submitReply = async (a) => {
    await a.beforeSubmit?.();
    writes++;
    return { submissionDiagnostic: diagnostic };
  };
  f.platform.findSubmission = async (_a, context) =>
    context?.phase === "baseline"
      ? { accountHandle: "Pei", posts: [], verified: false }
      : {
          accountHandle: "Pei",
          posts: [],
          verified: false,
          missing: ["unique-public-submission-unconfirmed"],
        };
  const api = createBusinessHarness({
    store: f.store,
    platform: f.platform,
    clock: () => NOW,
  });
  const result = await api.replyToPost({
    taskId: "round-1",
    postId: "123",
    text: "有具体贡献的回复",
  });
  const action = (await f.store.load()).state.actions.find(
    (a) => a.kind === "reply",
  );
  assert.equal(result.status, "unknown");
  assert.equal(writes, 1);
  assert.equal(action.status, "unknown");
  const fs = await import("node:fs");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(action.resultEvidence, "utf8")).observation
      .submissionDiagnostic,
    diagnostic,
  );
});

test("stalled diagnostic startup is bounded and does not block the business action", async () => {
  const begin = Date.now();
  const result = await SubmissionNetworkCapture.start(
    { capabilities: { get: () => new Promise(() => {}) } },
    15,
  );
  assert.equal(result, undefined);
  assert.ok(Date.now() - begin < 500);
});

test("stalled diagnostic drain is bounded and marked incomplete", async () => {
  let calls = 0;
  const tab = {
    capabilities: {
      get: async () => ({
        send: async () => {},
        readEvents: async () =>
          ++calls === 1
            ? { cursor: 1, events: [], hasMore: false, truncated: false }
            : new Promise(() => {}),
      }),
    },
  };
  const capture = await SubmissionNetworkCapture.start(tab, 15);
  const begin = Date.now(),
    result = await capture.stop();
  assert.ok(Date.now() - begin < 500);
  assert.equal(result.status, "incomplete");
});

test("explicit diagnostic capture performs one final snapshot and repeated stop does not poll", async () => {
  const f = tabFor();
  const capture = await SubmissionNetworkCapture.start(f.tab);
  const first = await capture.stop();
  const second = await capture.stop();
  assert.equal(first, second);
  assert.equal(f.reads, 2);
  assert.equal(f.enabled, 1);
  assert.equal(first.scope, "submission-endpoint-events-in-capture-window");
});
