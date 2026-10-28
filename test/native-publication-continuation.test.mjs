import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";

function scenario(t, { native = true, first = {}, never = false } = {}) {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  let reads = 0;
  const submit = f.platform.submitPost;
  const find = f.platform.findSubmission;
  f.platform.submitPost = async (action) => {
    const result = await submit(action);
    return native ? { ...result, nativeSubmissionCleared: true } : result;
  };
  f.platform.findSubmission = async (action, context) => {
    if (context?.phase === "baseline") return find(action, context);
    reads++;
    if (reads === 1 || never)
      return {
        page: "x.com/Pei",
        accountHandle: "Pei",
        needsStateCheck: false,
        alerts: [],
        verified: false,
        missing: ["unique-public-submission-unconfirmed"],
        ...first,
      };
    return find(action, context);
  };
  return {
    ...f,
    readCount: () => reads,
    publish: () =>
      f.harness.publishPost({ taskId: "round-1", draftPath: f.draft }),
  };
}

test("native publication finishes a transient public lookup in the same call, with one activation", async (t) => {
  const f = scenario(t);
  const result = await f.publish();
  assert.equal(f.read().actions[0].status, "verified", JSON.stringify(result));
  assert.equal(f.readCount(), 2);
  assert.deepEqual(f.writes, ["submitPost"]);
});

test("continuation is bounded to one read and never repeats an unconfirmed submission", async (t) => {
  const f = scenario(t, { never: true });
  await f.publish();
  assert.equal(f.read().actions[0].status, "unknown");
  assert.equal(f.readCount(), 2);
  assert.deepEqual(f.writes, ["submitPost"]);
});

for (const [name, first] of Object.entries({
  alert: { alerts: ["验证身份"] },
  identity: { accountHandle: "other" },
  route: { page: "x.com/other" },
  loading: { needsStateCheck: true },
  missing: { missing: ["unrelated-unconfirmed"] },
  malformed: { page: "invalid" },
}))
  test(`native continuation preserves ${name} boundary`, async (t) => {
    const f = scenario(t, { first });
    await f.publish();
    assert.equal(f.read().actions[0].status, "unknown");
    assert.equal(f.readCount(), 1);
    assert.deepEqual(f.writes, ["submitPost"]);
  });

test("DOM publication keeps its existing read budget", async (t) => {
  const f = scenario(t, { native: false });
  await f.publish();
  assert.equal(f.read().actions[0].status, "unknown");
  assert.equal(f.readCount(), 1);
  assert.deepEqual(f.writes, ["submitPost"]);
});

test("independent native publication uses the same bounded continuation", async (t) => {
  const f = scenario(t);
  const result = await f.harness.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
    independentExecution: {
      tabId: "owned-tab",
      evidenceRef: f.proof,
      scopeEvidenceRef: f.proof,
    },
  });
  assert.equal(result.status, "verified", JSON.stringify(result));
  assert.equal(f.readCount(), 2);
  assert.deepEqual(f.writes, ["submitPost"]);
});

test("native profile continuation accepts the same observed route with a trailing slash", async (t) => {
  const f = scenario(t, { first: { page: "x.com/Pei/" } });
  await f.publish();
  assert.equal(f.read().actions[0].status, "verified");
  assert.equal(f.readCount(), 2);
  assert.deepEqual(f.writes, ["submitPost"]);
});
