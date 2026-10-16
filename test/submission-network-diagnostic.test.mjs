import test from "node:test";
import assert from "node:assert/strict";
import { readXNetworkDiagnostics } from "../dist/browser-dom-network.js";
const request = (id, url, wallTime = 10) => ({
  method: "Network.requestWillBeSent",
  params: {
    requestId: id,
    wallTime,
    timestamp: 2,
    request: {
      url,
      method: "POST",
      headers: { Cookie: "private" },
      postData: "private-body",
    },
  },
});
const response = (id, url) => ({
  method: "Network.responseReceived",
  params: {
    requestId: id,
    timestamp: 3,
    response: {
      url,
      status: 429,
      headers: {
        "retry-after": "120",
        "x-rate-limit-remaining": "0",
        "set-cookie": "private",
      },
    },
  },
});
test("network diagnostic keeps numeric submission time and X API rate evidence only", async () => {
  const api =
    "https://x.com/i/api/graphql/test/CreateTweet?private-token=secret";
  const events = [
    request("write", api),
    response("write", api),
    request("foreign", "https://other.example/checkout/private-path"),
    request("challenge", "https://x.com/cdn-cgi/opaque-token"),
    {
      method: "Network.loadingFailed",
      params: {
        requestId: "write",
        errorText: "net::ERR_ABORTED",
        canceled: true,
      },
    },
    {
      method: "Network.loadingFailed",
      params: { requestId: "foreign", errorText: "other" },
    },
  ];
  const r = await readXNetworkDiagnostics({
    capabilities: {
      get: async () => ({
        readEvents: async () => ({
          cursor: 5,
          truncated: false,
          hasMore: false,
          events,
        }),
      }),
    },
  });
  assert.equal(r.events.length, 3);
  assert.equal(r.events[0].wallTime, 10);
  assert.deepEqual(r.events[1].rateLimit, {
    remaining: 0,
    retryAfterSeconds: 120,
  });
  assert.ok(
    r.events.every(
      (e) => e.location === "https://x.com/i/api/graphql/test/CreateTweet",
    ),
  );
  assert.ok(!JSON.stringify(r).includes("private"));
  assert.ok(!JSON.stringify(r).includes("secret"));
});
