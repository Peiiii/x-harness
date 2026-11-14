import test from "node:test";
import assert from "node:assert/strict";
import { fixture, NOW } from "./fixtures.mjs";
import { createBusinessHarness } from "../dist/diagnostics.js";

function replacement(t, mutate = () => {}, route = "exclusive") {
  const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
  f.edit((state) => {
    const old = state.actions[0];
    state.actions.push({ ...structuredClone(old), id: "replacement" });
    old.status = "skipped";
    old.skipReason = "invalid-preparation";
    mutate(old, state);
  });
  return {
    ...f,
    api: createBusinessHarness({
      platform: f.platform,
      store: f.store,
      clock: () => NOW,
      originalContentGuard: () => null,
      ...(route === "scoped"
        ? {
            executor: {
              id: "publisher",
              tabId: "own-tab",
              scopeKinds: ["original"],
              evidenceRef: f.proof,
            },
          }
        : {}),
    }),
  };
}

for (const route of ["exclusive", "scoped", "independent"])
  test(`publishes the unique prepared replacement after an untouched skipped original: ${route}`, async (t) => {
    const f = replacement(t, () => {}, route);
    const result = await f.api.publishPost({
      taskId: "round-1",
      draftPath: f.draft,
      ...(route === "independent"
        ? {
            independentExecution: {
              tabId: "own-tab",
              evidenceRef: f.proof,
              scopeEvidenceRef: f.proof,
            },
          }
        : {}),
    });
    assert.equal(result.status, "verified");
    assert.equal(result.actionId, "replacement");
    assert.deepEqual(f.writes, ["submitPost"]);
    assert.equal(f.read().actions[0].status, "skipped");
    assert.equal(f.read().actions[0].intentAt, undefined);
    assert.equal(f.read().actions[1].status, "verified");
  });

test("submitted, activated, claimed or attempted history never releases a replacement", async (t) => {
  for (const mutate of [
    (old) => {
      old.status = "unknown";
      old.intentAt = new Date(NOW).toISOString();
    },
    (old) => {
      old.intentAt = new Date(NOW).toISOString();
    },
    (old) => {
      old.activatedAt = new Date(NOW).toISOString();
    },
    (old) => {
      old.claim = { owner: "other" };
    },
    (old) => {
      old.publicId = "existing-public-post";
    },
    (old, state) => {
      state.attempts.push({ actionId: old.id });
    },
    (_, state) => {
      state.actions.push({
        ...structuredClone(state.actions[1]),
        id: "ambiguous",
      });
    },
  ]) {
    const f = replacement(t, mutate);
    await f.api.publishPost({ taskId: "round-1", draftPath: f.draft });
    assert.deepEqual(f.writes, []);
    assert.equal(f.read().actions[1].status, "prepared");
  }
});
