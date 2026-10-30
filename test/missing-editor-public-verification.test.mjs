import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
for (const independent of [false, true])
  for (const mode of ["missing", "account", "route", "alert", "retained"])
    test(`post-submit editor ${mode} receipt lookup independent=${independent}`, async (t) => {
      const f = fixture(t, { planned: [0, 1, 0], actionKinds: ["original"] });
      const submit = f.platform.submitPost,
        find = f.platform.findSubmission;
      let lookups = 0;
      f.platform.submitPost = async (a) => {
        await submit(a);
        throw Object.assign(Error("editor disappeared"), {
          submissionDiagnostic: {
            code: "submitted-editor-clear-unconfirmed",
            page: mode === "route" ? "https://x.com/other" : a.composeURL,
            accountHandle: mode === "account" ? "other" : a.accountHandle,
            editorState: mode === "retained" ? "retained" : "missing",
            needsStateCheck: true,
            alerts: mode === "alert" ? ["verify"] : [],
          },
        });
      };
      f.platform.findSubmission = async (a, c) => {
        if (c?.phase !== "baseline") lookups++;
        return find(a, c);
      };
      await f.harness.publishPost({
        taskId: "round-1",
        draftPath: f.draft,
        ...(independent
          ? {
              independentExecution: {
                tabId: "own",
                evidenceRef: f.proof,
                scopeEvidenceRef: f.proof,
              },
            }
          : {}),
      });
      assert.equal(
        f.read().actions[0].status,
        mode === "missing" ? "verified" : "unknown",
      );
      assert.equal(lookups, mode === "missing" ? 1 : 0);
      assert.deepEqual(f.writes, ["submitPost"]);
    });
