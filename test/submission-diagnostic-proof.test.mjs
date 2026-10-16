import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture, NOW } from "./fixtures.mjs";
for (const entry of ["single", "round"])
  test(`original ${entry} unknown proof retains submission diagnostic`, async (t) => {
    const f = fixture(t, { actionKinds: ["reply"], planned: [0, 0, 1] });
    let calls = 0;
    const diagnostic = {
      code: "submitted-editor-clear-unconfirmed",
      page: "https://x.com/source/status/123",
      accountHandle: "Pei",
      alerts: ["challenge"],
      editorState: "retained",
      needsStateCheck: false,
    };
    f.platform.submitReply = async (a) => {
      await a.beforeSubmit?.();
      calls++;
      throw Object.assign(Error("timeout"), {
        submissionDiagnostic: diagnostic,
      });
    };
    const api = createBusinessHarness({
      store: f.store,
      platform: f.platform,
      clock: () => NOW,
    });
    const result =
      entry === "single"
        ? await api.replyToPost({
            taskId: "round-1",
            postId: "123",
            text: "有具体贡献的回复",
          })
        : await api.runGrowthRound({ taskId: "round-1", maxActions: 1 });
    const state = (await f.store.load()).state;
    const a = state.actions.find((a) => a.kind === "reply");
    assert.equal(calls, 1);
    assert.equal(a.status, "unknown");
    assert.deepEqual(
      JSON.parse(readFileSync(a.resultEvidence, "utf8")).observation
        .submissionDiagnostic,
      diagnostic,
    );
  });
