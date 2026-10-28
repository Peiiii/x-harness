import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";

test("a healthy mixed workflow completes three writes with zero account-only observations", async (t) => {
  const f = fixture(t);
  f.platform.readAccount = async () => {
    throw Error("routine account inspection");
  };
  const api = createBusinessHarness({
    platform: f.platform,
    store: f.store,
    clock: () => NOW,
  });
  assert.equal(
    (await api.followOne({ taskId: "round-1", handle: "reader" })).status,
    "verified",
  );
  assert.equal(
    (await api.publishPost({ taskId: "round-1", draftPath: f.draft })).status,
    "verified",
  );
  assert.equal(
    (
      await api.replyToPost({
        taskId: "round-1",
        postId: "123",
        text: f.read().actions.find((a) => a.kind === "reply").text,
      })
    ).status,
    "verified",
  );
  assert.deepEqual(f.writes, ["follow", "submitPost", "submitReply"]);
  assert.equal(f.observations.filter((v) => v === "account").length, 0);
});
test("a contradictory business-page identity still stops the independent original before intent", async (t) => {
  const f = fixture(t, { actionKinds: ["original"] });
  f.browser.setAccountHandle("Other");
  f.platform.readAccount = () => {
    throw Error("no independent identity probe");
  };
  const api = createBusinessHarness({
    platform: f.platform,
    store: f.store,
    clock: () => NOW,
  });
  await api.publishPost({
    taskId: "round-1",
    draftPath: f.draft,
    independentExecution: {
      tabId: "own",
      evidenceRef: f.proof,
      scopeEvidenceRef: f.proof,
    },
  });
  assert.deepEqual(f.writes, []);
  assert.equal(f.read().attempts.length, 0);
  assert.equal(f.observations.filter((v) => v === "account").length, 0);
});

for (const route of ["ordinary", "scoped", "independent"])
  test(`${route} publication uses its business observation without a standalone account inspection`, async (t) => {
    const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
    let accountReads = 0;
    f.platform.readAccount = async () => {
      accountReads++;
      throw Error("redundant account inspection");
    };
    const executor =
      route === "scoped"
        ? {
            id: "publisher",
            scopeKinds: ["original"],
            tabId: "own",
            evidenceRef: f.proof,
          }
        : undefined;
    const api = createBusinessHarness({
      platform: f.platform,
      store: f.store,
      clock: () => NOW,
      executor,
    });
    const result = await api.publishPost({
      taskId: "round-1",
      draftPath: f.draft,
      ...(route === "independent"
        ? {
            independentExecution: {
              tabId: "own",
              evidenceRef: f.proof,
              scopeEvidenceRef: f.proof,
            },
          }
        : {}),
    });
    assert.equal(result.status, "verified", JSON.stringify(result));
    assert.equal(accountReads, 0);
    assert.deepEqual(f.writes, ["submitPost"]);
    assert.equal(f.observations.filter((v) => v === "account").length, 0);
  });
test("normal business capabilities do not require a standalone account reader", async (t) => {
  const f = fixture(t);
  delete f.platform.readAccount;
  for (const operation of ["publishPost", "replyToPost", "followOne"])
    assert.equal(f.harness.preflight({ operation }).covered, true, operation);
});
for (const kind of ["follow", "reply"])
  test(`${kind} directly uses the target evidence without an account-only reader`, async (t) => {
    const f = fixture(t, { actionKinds: [kind] });
    delete f.platform.readAccount;
    const api = createBusinessHarness({
      platform: f.platform,
      store: f.store,
      clock: () => NOW,
    });
    const result =
      kind === "follow"
        ? await api.followOne({ taskId: "round-1", handle: "reader" })
        : await api.replyToPost({
            taskId: "round-1",
            postId: "123",
            text: f.read().actions[0].text,
          });
    assert.equal(result.status, "verified", JSON.stringify(result));
    assert.equal(f.observations.filter((v) => v === "account").length, 0);
  });
for (const identity of ["Pei", "Other", null])
  test(`unknown incoming like uses the existing post identity: ${identity}`, async (t) => {
    const f = fixture(t);
    f.edit((s) => {
      s.reactions = [
        { postId: "100", status: "unknown", evidenceRef: f.proof },
      ];
    });
    let accountReads = 0,
      postReads = 0;
    const api = createBusinessHarness({
      store: f.store,
      clock: () => NOW,
      platform: {
        preflight: () => ({ covered: true }),
        likePost: () => {
          throw Error("unknown must never click");
        },
        readAccount: async () => {
          accountReads++;
          throw Error("redundant account inspection");
        },
        readPost: async () => {
          postReads++;
          return {
            complete: true,
            accountHandle: identity,
            needsStateCheck: false,
            alerts: [],
            posts: [
              { id: "100", author: "Reader", buttons: [{ label: "Unlike" }] },
            ],
          };
        },
        captureProof: ({ observation }) => ({ observation }),
      },
    });
    const r = await api.likeIncomingBatch({
      batchId: "old-like",
      sampleRate: 1,
      targets: [
        {
          postId: "100",
          author: "Reader",
          url: "https://x.com/Reader/status/100",
          evidenceRef: f.proof,
          incomingEvidenceRef: f.proof,
        },
      ],
    });
    assert.equal(
      r.results[0].status,
      identity === "Pei" ? "verified" : "unknown",
      JSON.stringify(r),
    );
    assert.equal(accountReads, 0);
    assert.equal(postReads, 1);
  });
