import test from "node:test";
import assert from "node:assert/strict";
import { ProfilePin } from "../dist/profile-pin.js";
function fixture({ author = "owner", prior, pinned = false } = {}) {
  const state = { profilePins: prior ? { job: prior } : {} };
  const calls = [];
  let at = "https://x.com/owner/status/123";
  const store = {
    evidenceExists: (p) => p === "authorization",
    recordProof: async (p) => {
      calls.push(["proof", p.status]);
      return "proof";
    },
    load: async () => ({ state }),
    transaction: async (fn) => fn({ state }),
  };
  const locator = {
    count: async () => 1,
    filter() {
      return this;
    },
    getByRole() {
      return this;
    },
    allTextContents: async () => [],
    click: async () => calls.push(["click"]),
  };
  const tab = {
    url: async () => at,
    goto: async (url) => {
      at = url;
      calls.push(["goto", url]);
    },
    playwright: {
      evaluate: async (_fn, arg) =>
        typeof arg === "object" ? author === "owner" : pinned,
      getByRole: () => locator,
      locator: () => locator,
    },
  };
  const api = {
    inspectAccount: async () => ({
      complete: true,
      accountHandle: "owner",
      accountURL: "https://x.com/owner",
    }),
    readPost: async () => ({
      complete: true,
      post: { id: "123", author },
      evidenceRef: "read",
    }),
  };
  return {
    pin: new ProfilePin(tab, store, api),
    calls,
    state,
    options: {
      taskId: "job",
      target: { postId: "123", url: at, evidenceRef: "read" },
      userAuthorized: true,
      authorizationEvidenceRef: "authorization",
    },
  };
}
test("pin requires explicit evidence before any browser action", async () => {
  const f = fixture();
  f.options.userAuthorized = false;
  assert.equal((await f.pin.pin(f.options)).status, "needsDecision");
  assert.equal(
    f.calls.some((x) => x[0] === "click" || x[0] === "goto"),
    false,
  );
});
test("similar author names cannot pass ownership", async () => {
  const f = fixture({ author: "fakeowner" });
  assert.equal((await f.pin.pin(f.options)).reason, "owned-post-unconfirmed");
  assert.deepEqual(f.state.profilePins, {});
});
test("uncertain intent is only verified and cannot click again", async () => {
  const f = fixture({
    prior: { postId: "123", status: "intent", evidenceRef: "proof" },
  });
  assert.equal((await f.pin.pin(f.options)).status, "unknown");
  assert.equal(
    f.calls.some((x) => x[0] === "click"),
    false,
  );
});
test("fresh pinned target can settle original intent without repeating write", async () => {
  const f = fixture({
    prior: { postId: "123", status: "unknown", evidenceRef: "proof" },
    pinned: true,
  });
  f.options.verifyOnly = true;
  assert.equal((await f.pin.pin(f.options)).status, "verified");
  assert.equal(
    f.calls.some((x) => x[0] === "click"),
    false,
  );
  assert.equal(f.state.profilePins.job.status, "verified");
});
test("stable task cannot be redirected to another post", async () => {
  const f = fixture({
    prior: { postId: "999", status: "verified", evidenceRef: "proof" },
  });
  assert.equal((await f.pin.pin(f.options)).reason, "pin-task-target-conflict");
  assert.equal(
    f.calls.some((x) => x[0] === "click" || x[0] === "goto"),
    false,
  );
});
