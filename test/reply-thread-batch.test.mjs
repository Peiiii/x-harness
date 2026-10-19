import test from "node:test";
import assert from "node:assert/strict";
import { ReplyThreadBatch } from "../dist/reply-thread-batch.js";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";
const actions = () =>
  [1, 2, 3].map((n) => ({
    id: "r" + n,
    kind: "reply",
    status: "prepared",
    postId: String(n),
    url: `https://x.com/reader${n}/status/${n}`,
    text: "互关，路过的都来",
    accountHandle: "Pei",
    accountURL: "https://x.com/Pei",
    accountEvidenceRef: "proof",
    evidenceRef: "proof",
    quality: {
      approved: true,
      approvedText: "互关，路过的都来",
      evidenceRef: "proof",
    },
  }));
const result = (a, status = "verified") => ({
  status,
  actionId: a.id,
  taskId: "round-1",
  publicId: "9" + a.postId,
});
function setup({
  rows = actions(),
  statuses = ["verified", "verified", "verified"],
  likeStatus = "verified",
} = {}) {
  const state = {
    batchId: "round-1",
    accountHandle: "Pei",
    actions: rows.map((a, i) => ({
      ...a,
      status: "prepared",
      publicId: "9" + a.postId,
      resultEvidence: "proof",
    })),
    items: [],
    executions: {},
  };
  const calls = [],
    proofs = [],
    store = {
      load: async () => ({ state }),
      evidenceExists: (ref) => ref === "proof",
      recordProof: async (p) => {
        proofs.push(p);
        return "composite-proof";
      },
    };
  const api = {
    replyBatch: async (a) => {
      calls.push({ op: "replies", args: a });
      for (const row of state.actions)
        if (a.actions.some((x) => x.id === row.id) && row.status === "prepared")
          row.status = statuses[rows.findIndex((a) => a.id === row.id)];
      return {
        status: statuses.every((s) => s === "verified")
          ? "verified"
          : "needsDecision",
        results: rows.map((a, i) => result(a, statuses[i])),
      };
    },
    likePostAndComments: async (a) => {
      calls.push({ op: "like", args: a });
      return {
        status: likeStatus,
        batchId: a.batchId,
        url: a.url,
        scopeComplete: false,
        counts: {
          observed: 5,
          selected: 3,
          verified: 2,
          preexisting: 1,
          skipped: 2,
          unknown: 0,
          pending: likeStatus === "verified" ? 0 : 1,
          newLikesThisCall: 2,
        },
      };
    },
  };
  return {
    state,
    calls,
    proofs,
    store,
    api,
    owner: new ReplyThreadBatch({ store, platform: {}, clock: () => NOW }, api),
    args: { taskId: "round-1", actions: rows, threadLikes: {} },
  };
}
test("one batch owns three serial replies and three stable parent-like calls", async () => {
  const f = setup(),
    out = await f.owner.run(f.args);
  assert.equal(f.calls.filter((c) => c.op === "replies").length, 3);
  assert.deepEqual(
    f.calls.filter((c) => c.op === "like").map((c) => c.args.batchId),
    ["reply-thread-likes-1", "reply-thread-likes-2", "reply-thread-likes-3"],
  );
  assert.equal(out.results.length, 3);
  assert.equal(out.threadLikes.length, 3);
  assert.equal(out.interactionStatus, "verified");
  assert.equal(out.interactionEvidenceRef, "composite-proof");
  assert.equal(f.proofs.at(-1).scopeComplete, false);
  assert.equal(f.calls[0].args.threadLikes, undefined);
});
test("unknown replies never trigger likes; other verified original authors do", async () => {
  const f = setup({ statuses: ["verified", "unknown", "verified"] }),
    out = await f.owner.run(f.args);
  assert.deepEqual(
    out.threadLikes.map((l) => l.actionId),
    ["r1", "r3"],
  );
  assert.equal(out.status, "needsDecision");
});
for (const change of ["parent", "text", "proof", "status"])
  test("durable " + change + " mismatch prevents thread writes", async () => {
    const f = setup();
    if (change === "parent")
      f.state.actions[0].url = "https://x.com/other/status/55";
    if (change === "text") f.state.actions[0].text = "changed";
    if (change === "proof") f.state.actions[0].resultEvidence = "missing";
    if (change === "status") f.state.actions[0].status = "unknown";
    const out = await f.owner.run(f.args);
    assert.ok(!out.threadLikes.some((l) => l.actionId === "r1"));
    assert.ok(out.pendingLikeActionIds.includes("r1"));
    assert.equal(
      out.interactionReason,
      "reply-thread-durable-parent-unconfirmed",
    );
  });
for (const threadLikes of [{ sampleRate: 2 }, { maxLikes: 101 }, true, []])
  test(
    "invalid like configuration refuses before any reply " +
      JSON.stringify(threadLikes),
    async () => {
      const f = setup(),
        out = await f.owner.run({ ...f.args, threadLikes });
      assert.equal(out.reason, "reply-thread-like-config-invalid");
      assert.equal(f.calls.length, 0);
    },
  );
test("a real like wait leaves replies verified and remaining roots pending", async () => {
  const f = setup({ likeStatus: "waiting" }),
    out = await f.owner.run(f.args);
  assert.equal(out.status, "needsDecision");
  assert.equal(out.interactionStatus, "waiting");
  assert.equal(f.calls.filter((c) => c.op === "like").length, 1);
  assert.deepEqual(out.pendingLikeActionIds, ["r1"]);
  assert.deepEqual(out.pendingReplyActionIds, ["r2", "r3"]);
});
test("same original arguments retain per-root sampling IDs on resume", async () => {
  const f = setup();
  await f.owner.run(f.args);
  await f.owner.run(f.args);
  const ids = f.calls.filter((c) => c.op === "like").map((c) => c.args.batchId);
  assert.deepEqual(ids.slice(0, 3), ids.slice(3));
  assert.equal(
    f.state.actions.filter((a) => a.status === "verified").length,
    3,
  );
});
test("two replies to one exact parent produce one thread call", async () => {
  const rows = actions();
  rows[1] = { ...rows[0], id: "r2" };
  const f = setup({ rows }),
    out = await f.owner.run(f.args);
  assert.equal(out.threadLikes.length, 2);
});
test("finite like checkpoint is separate from completed reply status", async () => {
  const f = setup({ likeStatus: "checkpoint" }),
    out = await f.owner.run(f.args);
  assert.equal(out.status, "verified");
  assert.equal(out.interactionStatus, "checkpoint");
  assert.equal(out.threadLikes.length, 3);
  assert.equal(out.pendingLikeActionIds.length, 3);
});
test("ready original follow yields before another thread begins", async () => {
  const f = setup();
  f.state.attemptsCoverage = {
    complete: true,
    since: new Date(NOW - 7200000).toISOString(),
    evidenceRef: "proof",
  };
  f.state.executions.follow = {
    id: "follow",
    tabId: "owned-tab",
    scopeKinds: ["follow"],
    evidenceRef: "proof",
  };
  f.state.items = [
    { kind: "follow", planned: 10, verified: 0, actionable: true },
  ];
  const out = await f.owner.run({
    ...f.args,
    followPriorityExecutorId: "follow",
  });
  assert.equal(out.interactionReason, "follow-priority-ready");
  assert.equal(out.threadLikes.length, 0);
  assert.equal(out.pendingLikeActionIds.length, 1);
});
test("public root uses explicit opt-in and fresh per-new-reply admission without caller loops", async (t) => {
  const f = fixture(t);
  const api = createBusinessHarness({
    store: f.store,
    platform: {},
    clock: () => NOW,
  });
  const rows = actions().map((a) => ({
    ...a,
    accountEvidenceRef: f.proof,
    evidenceRef: f.proof,
    quality: { ...a.quality, evidenceRef: f.proof },
  }));
  const attempted = [],
    admissions = [],
    liked = [];
  api.replyToPost = async (q) => {
    attempted.push(q.postId);
    await f.store.transaction(({ state }) => {
      state.actions.push({
        ...q.preparedAction,
        status: "verified",
        publicId: "9" + q.postId,
        resultEvidence: f.proof,
      });
      return state;
    });
    return result(q.preparedAction);
  };
  api.likePostAndComments = async (q) => {
    liked.push(q.batchId);
    return {
      status: "verified",
      url: q.url,
      batchId: q.batchId,
      scopeComplete: false,
      counts: {},
    };
  };
  const out = await api.replyBatch({
    taskId: "round-1",
    actions: rows,
    threadLikes: {},
    beforeReply: async (a) => {
      admissions.push(a.id);
      return { allowed: a.id !== "r2" };
    },
  });
  assert.deepEqual(attempted, ["1"]);
  assert.deepEqual(admissions, ["r1", "r2"]);
  assert.deepEqual(liked, ["reply-thread-likes-1"]);
  assert.equal(out.results[1].reason, "reply-project-admission-denied");
});
test("default public replyBatch never implicitly invokes thread likes", async (t) => {
  const f = fixture(t);
  const api = createBusinessHarness({
    store: f.store,
    platform: {},
    clock: () => NOW,
  });
  let likes = 0;
  api.replyToPost = async (q) => result(q.preparedAction);
  api.likePostAndComments = async () => {
    likes++;
    throw Error("unexpected");
  };
  const out = await api.replyBatch({ taskId: "round-1", actions: actions() });
  assert.equal(out.status, "verified");
  assert.equal(likes, 0);
  assert.equal(out.threadLikes, undefined);
});

test("a verified original reply resumes unfinished likes without another submission or admission", async (t) => {
  const f = fixture(t);
  const api = createBusinessHarness({
    store: f.store,
    platform: {},
    clock: () => NOW,
  });
  let submissions = 0,
    admissions = 0,
    likes = 0;
  const row = actions()[0];
  row.accountEvidenceRef = f.proof;
  row.evidenceRef = f.proof;
  row.quality.evidenceRef = f.proof;
  api.replyToPost = async (q) => {
    submissions++;
    await f.store.transaction(({ state }) => {
      state.actions.push({
        ...row,
        status: "verified",
        publicId: "901",
        resultEvidence: f.proof,
      });
      return state;
    });
    return result(row);
  };
  api.likePostAndComments = async (q) => ({
    status: ++likes === 1 ? "checkpoint" : "verified",
    url: q.url,
    batchId: q.batchId,
    scopeComplete: false,
    counts: {},
  });
  const args = {
    taskId: "round-1",
    actions: [row],
    threadLikes: {},
    beforeReply: async () => {
      admissions++;
      return { allowed: true };
    },
  };
  const first = await api.replyBatch(args),
    second = await api.replyBatch(args);
  assert.equal(first.interactionStatus, "checkpoint");
  assert.equal(second.interactionStatus, "verified");
  assert.equal(submissions, 1);
  assert.equal(admissions, 1);
  assert.equal(likes, 2);
});
test("a mismatched reply post ID and parent permalink refuses before comments", async () => {
  const f = setup();
  f.args.actions[0].postId = "999";
  const out = await f.owner.run(f.args);
  assert.equal(out.reason, "reply-thread-like-config-invalid");
  assert.equal(f.calls.length, 0);
});

test("a local unconfirmed thread target stays a decision, does not mask it as an earlier checkpoint or block other roots", async () => {
  const f = setup();
  let n = 0;
  f.api.likePostAndComments = async (q) => {
    n++;
    return {
      status: n === 1 ? "checkpoint" : n === 2 ? "needsDecision" : "verified",
      reason: n === 2 ? "Error: thread-like-target-unconfirmed" : undefined,
      batchId: q.batchId,
      url: q.url,
      scopeComplete: false,
      counts: {},
    };
  };
  const out = await f.owner.run(f.args);
  assert.equal(n, 3);
  assert.equal(out.interactionStatus, "needsDecision");
  assert.equal(out.interactionReason, "Error: thread-like-target-unconfirmed");
  assert.deepEqual(out.pendingLikeActionIds, ["r1", "r2"]);
});

test("thread work is interleaved after each verified reply and reuses exact current pages", async () => {
  const f = setup();
  await f.owner.run(f.args);
  assert.deepEqual(
    f.calls.map((c) =>
      c.op === "replies"
        ? "reply:" + c.args.actions[0].id
        : "like:" + c.args.batchId,
    ),
    [
      "reply:r1",
      "like:reply-thread-likes-1",
      "reply:r2",
      "like:reply-thread-likes-2",
      "reply:r3",
      "like:reply-thread-likes-3",
    ],
  );
  assert.ok(
    f.calls
      .filter((c) => c.op === "like")
      .every((c) => c.args.reuseCurrentPage === true),
  );
});
test("target-only and whole-thread modes cannot both create scheduling branches", async () => {
  const f = setup();
  const out = await f.owner.run({ ...f.args, likeTargetAfterVerified: true });
  assert.equal(out.reason, "reply-thread-like-config-invalid");
  assert.equal(f.calls.length, 0);
});

test("a different original task cannot reuse verified replies to trigger likes", async () => {
  const f = setup();
  const out = await f.owner.run({ ...f.args, taskId: "another-task" });
  assert.equal(out.reason, "reply-batch-task-mismatch");
  assert.equal(f.calls.length, 0);
});
test("stored verified replies from a different account never authorize thread likes", async () => {
  const f = setup();
  f.state.accountHandle = "Other";
  const out = await f.owner.run(f.args);
  assert.equal(out.threadLikes.length, 0);
  assert.equal(out.interactionStatus, "needsDecision");
});
