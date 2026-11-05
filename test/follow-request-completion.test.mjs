import test from "node:test";
import assert from "node:assert/strict";
import { createDOMSubmission } from "../dist/browser-dom-submission.js";

function fixture({ events = [], cdp = true } = {}) {
  const order = [];
  let cursor = 0;
  const capability = cdp
    ? {
        send: async (method) => order.push(method),
        readEvents: async (options) => {
          if (options.afterSequence === undefined)
            return { cursor, events: [], hasMore: false, truncated: false };
          const next = events.shift();
          if (!next)
            return { cursor, events: [], hasMore: false, truncated: false };
          cursor = next.sequence;
          order.push(next.method);
          return { cursor, events: [next], hasMore: false, truncated: false };
        },
      }
    : undefined;
  const finish = createDOMSubmission({
    captureSubmissionNetwork: false,
    submitAX: null,
    session: { current: {} },
    tab: { capabilities: { get: async () => capability } },
    observe: async () => ({}),
    unique: async (value) => value,
    locator: () => ({}),
  });
  return {
    finish,
    order,
    events,
    click: async () => order.push("click"),
  };
}

const followAction = { operation: "follow" };
const request = {
  method: "Network.requestWillBeSent",
  sequence: 1,
  params: {
    requestId: "follow-1",
    request: {
      method: "POST",
      url: "https://x.com/i/api/1.1/friendships/create.json",
    },
  },
};

test("follow click waits for the matching request to finish before returning", async () => {
  const f = fixture({
    events: [
      request,
      {
        method: "Network.responseReceived",
        sequence: 2,
        params: { requestId: "follow-1", response: { status: 200 } },
      },
      {
        method: "Network.loadingFinished",
        sequence: 3,
        params: { requestId: "follow-1" },
      },
    ],
  });
  const result = await f.finish(
    followAction,
    { loc: { click: f.click } },
    { view: "person" },
    {},
  );
  assert.deepEqual(f.order, [
    "Network.enable",
    "click",
    "Network.requestWillBeSent",
    "Network.responseReceived",
    "Network.loadingFinished",
  ]);
  assert.equal(result.followDiagnostic.transport.status, "completed");
  assert.equal(result.followDiagnostic.transport.responseStatus, 200);
});

test("HTTP refusal is transport evidence, not a follow success", async () => {
  const f = fixture({
    events: [
      request,
      {
        method: "Network.responseReceived",
        sequence: 2,
        params: { requestId: "follow-1", response: { status: 429 } },
      },
      {
        method: "Network.loadingFinished",
        sequence: 3,
        params: { requestId: "follow-1" },
      },
    ],
  });
  const result = await f.finish(
    followAction,
    { loc: { click: f.click } },
    { view: "person" },
    {},
  );
  assert.equal(result.followDiagnostic.transport.status, "completed");
  assert.equal(result.followDiagnostic.transport.responseStatus, 429);
});

test("an unfinished request can be observed later without another click", async () => {
  const f = fixture();
  const result = await f.finish(
    followAction,
    { loc: { click: f.click } },
    { view: "person" },
    {},
  );
  assert.equal(result.followDiagnostic.transport.status, "pending");
  assert.deepEqual(f.order, ["Network.enable", "click"]);
  f.events.push(
    request,
    {
      method: "Network.responseReceived",
      sequence: 2,
      params: { requestId: "follow-1", response: { status: 200 } },
    },
    {
      method: "Network.loadingFinished",
      sequence: 3,
      params: { requestId: "follow-1" },
    },
  );
  const later = await result.followDiagnostic.continue();
  assert.equal(later.status, "completed");
  assert.deepEqual(
    f.order.filter((entry) => entry === "click"),
    ["click"],
  );
});

test("missing request observation blocks before the follow click", async () => {
  const f = fixture({ cdp: false });
  await assert.rejects(
    f.finish(followAction, { loc: { click: f.click } }, { view: "person" }, {}),
    /follow-request-observation-unavailable/,
  );
  assert.deepEqual(f.order, []);
});
