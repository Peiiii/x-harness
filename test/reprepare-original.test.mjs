import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fixture, NOW } from "./fixtures.mjs";
import { createBusinessHarness } from "../dist/diagnostics.js";

function setup(t, scoped, mutate = () => {}, guard = () => null) {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  f.edit((state) => {
    state.actions[0].status = "skipped";
    state.actions[0].quality.approved = true;
    state.actions[0].skipReason = "internal-quality-revision";
    mutate(state.actions[0], state);
  });
  const old = structuredClone(f.read().actions[0]);
  const review = `${f.dir}/fresh-review.json`;
  writeFileSync(review, JSON.stringify({ approved: true }));
  const action = {
    ...old,
    status: "prepared",
    text: "重新审查后的完整正文",
    notBefore: new Date(NOW - 60000).toISOString(),
    notAfter: new Date(NOW + 60000).toISOString(),
    quality: {
      approved: true,
      approvedText: "重新审查后的完整正文",
      evidenceRef: review,
      draftFingerprint: f.store.fingerprint(f.draft),
    },
  };
  delete action.skipReason;
  const api = createBusinessHarness({
    platform: f.platform,
    store: f.store,
    clock: () => NOW,
    originalContentGuard: guard,
    ...(scoped
      ? {
          executor: {
            id: "publisher",
            tabId: "publisher-tab",
            scopeKinds: ["original"],
            evidenceRef: f.proof,
          },
        }
      : {}),
  });
  const decision = {
    type: "prepareActions",
    accountHandle: "Pei",
    ownershipEvidenceRef: f.proof,
    actions: [action],
    reprepareOriginals: [
      { actionId: old.id, expectedAction: old, evidenceRef: review },
    ],
  };
  return { ...f, old, action, api, decision };
}

for (const scoped of [false, true]) {
  test(`explicit same-ID skipped original revision retains history and publishes once: ${scoped}`, async (t) => {
    const f = setup(t, scoped);
    const prepared = await f.api.runGrowthRound({
      taskId: "round-1",
      maxActions: 0,
      decision: f.decision,
    });
    assert.equal(prepared.status, "checkpoint", prepared.error);
    assert.equal(f.read().actions.length, 1);
    assert.equal(f.read().actions[0].text, f.action.text);
    assert.deepEqual(f.read().actions[0].preparationHistory[0].action, f.old);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.observations, []);
    const published = await f.api.publishPost({
      taskId: "round-1",
      draftPath: f.draft,
    });
    assert.equal(published.status, "verified", published.reason);
    assert.deepEqual(f.writes, ["submitPost"]);
    assert.deepEqual(f.read().actions[0].preparationHistory[0].action, f.old);
  });

  for (const [name, mutate, propose, guard] of [
    [
      "intent",
      (a) => {
        a.intentAt = new Date(NOW).toISOString();
      },
    ],
    [
      "activation",
      (a) => {
        a.activatedAt = new Date(NOW).toISOString();
      },
    ],
    [
      "claim",
      (a) => {
        a.claim = { owner: "other" };
      },
    ],
    [
      "public ID",
      (a) => {
        a.publicId = "123";
      },
    ],
    [
      "attempt",
      (a, s) => {
        s.attempts.push({ actionId: a.id });
      },
    ],
    [
      "unknown",
      (a) => {
        a.status = "unknown";
      },
    ],
    [
      "user denial",
      (a) => {
        a.userRejected = true;
      },
    ],
    [
      "history intent",
      (a) => {
        a.preparationHistory = [
          { action: { ...a, intentAt: new Date(NOW).toISOString() } },
        ];
      },
    ],
    [
      "history user denial",
      (a) => {
        a.preparationHistory = [{ action: { ...a, userRejected: true } }];
      },
    ],
    [
      "revoked",
      (a) => {
        a.revoked = true;
      },
    ],
    [
      "same-call attempt",
      undefined,
      (f) => {
        f.decision.sharedAttempts = [
          {
            actionId: f.old.id,
            kind: "original",
            at: new Date(NOW).toISOString(),
          },
        ];
      },
    ],
    [
      "expired window",
      undefined,
      (f) => {
        f.action.notBefore = new Date(NOW - 120000).toISOString();
        f.action.notAfter = new Date(NOW - 60000).toISOString();
      },
    ],
    [
      "stale CAS",
      undefined,
      (f) => {
        f.decision.reprepareOriginals[0].expectedAction = {
          ...f.old,
          text: "stale",
        };
      },
    ],
    [
      "no explicit request",
      undefined,
      (f) => {
        delete f.decision.reprepareOriginals;
      },
    ],
    [
      "different draft",
      undefined,
      (f) => {
        f.action.draftPath = f.proof;
      },
    ],
    [
      "unreviewed body",
      undefined,
      (f) => {
        f.action.text = "未审正文";
      },
    ],
    [
      "stale fingerprint",
      undefined,
      (f) => {
        f.action.quality.draftFingerprint = "bad";
      },
    ],
    [
      "missing review",
      undefined,
      (f) => {
        f.action.quality.evidenceRef = "missing";
      },
    ],
    [
      "same review",
      undefined,
      (f) => {
        f.action.quality.evidenceRef = f.proof;
        f.decision.reprepareOriginals[0].evidenceRef = f.proof;
      },
    ],
    [
      "invalid window",
      undefined,
      (f) => {
        f.action.notAfter = f.action.notBefore;
      },
    ],
    [
      "content hold",
      (a, s) => {
        s.execution.originalContentHold = true;
      },
    ],
    ["content guard", undefined, undefined, () => "content-rejected"],
  ]) {
    test(`refuses unsafe same-ID revision ${name}: ${scoped}`, async (t) => {
      const f = setup(t, scoped, mutate, guard);
      propose?.(f);
      const before = f.read();
      const result = await f.api.runGrowthRound({
        taskId: "round-1",
        maxActions: 0,
        decision: f.decision,
      });
      assert.equal(result.status, "needsDecision", result.error);
      assert.deepEqual(f.read().actions, before.actions);
      assert.deepEqual(f.read().attempts, before.attempts);
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.observations, []);
    });
  }
}

for (const scoped of [false, true]) {
  test(`future revision only prepares and a later revision appends history: ${scoped}`, async (t) => {
    const f = setup(t, scoped);
    f.action.notBefore = new Date(NOW + 60000).toISOString();
    f.action.notAfter = new Date(NOW + 120000).toISOString();
    const first = await f.api.runGrowthRound({
      taskId: "round-1",
      maxActions: 0,
      decision: f.decision,
    });
    assert.equal(first.status, "checkpoint", first.error);
    const waiting = await f.api.publishPost({
      taskId: "round-1",
      draftPath: f.draft,
    });
    assert.equal(waiting.reason, "draft-not-before-not-reached");
    assert.deepEqual(f.writes, []);
    const reviewed = `${f.dir}/second-review.json`;
    writeFileSync(reviewed, "{}");
    f.edit((s) => {
      s.actions[0].status = "skipped";
    });
    const expected = structuredClone(f.read().actions[0]);
    const next = {
      ...f.action,
      quality: { ...f.action.quality, evidenceRef: reviewed },
    };
    f.decision.actions = [next];
    f.decision.reprepareOriginals = [
      {
        actionId: expected.id,
        expectedAction: expected,
        evidenceRef: reviewed,
      },
    ];
    const second = await f.api.runGrowthRound({
      taskId: "round-1",
      maxActions: 0,
      decision: f.decision,
    });
    assert.equal(second.status, "checkpoint", second.error);
    assert.equal(f.read().actions[0].preparationHistory.length, 2);
    assert.deepEqual(f.read().actions[0].preparationHistory[0].action, f.old);
    assert.deepEqual(f.writes, []);
  });
}
