import test from "node:test";
import assert from "node:assert/strict";
import { createDOMSubmission } from "../dist/browser-dom-submission.js";

async function submit({
  operation = "submitReply",
  idleError,
  editorError,
} = {}) {
  let clicks = 0;
  const events = [];
  const finish = createDOMSubmission({
    session: {},
    submitAX: null,
    tab: {
      playwright: {
        waitForLoadState: async () => {
          events.push("idle");
          if (idleError) throw idleError;
        },
      },
    },
    observe: async () => {
      throw Error("unexpected observation");
    },
    unique: () => {
      throw Error("unexpected locator");
    },
    locator: () => {
      throw Error("unexpected locator");
    },
  });
  await finish(
    { operation, beforeSubmit: async () => events.push("gate") },
    {
      loc: {
        click: async () => {
          clicks++;
          events.push("click");
        },
      },
      submittedEditor: {
        waitFor: async () => {
          events.push("editor-hidden");
          if (editorError) throw editorError;
        },
      },
    },
    {},
    {},
  );
  return { clicks, events };
}

test("network idle timeout after one reply click allows fresh receipt verification", async () => {
  const r = await submit({
    idleError: Error("Timed out waiting for networkidle in tab test"),
  });
  assert.equal(r.clicks, 1);
  assert.deepEqual(r.events, ["gate", "click", "editor-hidden", "idle"]);
});
test("post submissions use the same bounded timeout handling", async () => {
  assert.equal(
    (
      await submit({
        operation: "submitPost",
        idleError: Error("Timed out waiting for networkidle"),
      })
    ).clicks,
    1,
  );
});
test("browser disconnection still propagates", async () => {
  await assert.rejects(
    submit({ idleError: Error("No tab with id: test") }),
    /No tab/,
  );
});
test("unconfirmed editor completion is not swallowed", async () => {
  await assert.rejects(
    submit({ editorError: Error("editor did not close") }),
    /editor did not close/,
  );
});
