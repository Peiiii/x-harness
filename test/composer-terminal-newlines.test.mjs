import test from "node:test";
import assert from "node:assert/strict";
import { PlatformWriting } from "../dist/platform-writing.js";
import { samePublishedText, sameText } from "../dist/platform-rules.js";

test("composer accepts renderer-added terminal newlines without changing body text", async () => {
  let reads = 0;
  const writes = [];
  const writer = new PlatformWriting({
    observed: async () => ({
      editorText:
        reads++ === 0 ? "" : "First paragraph\n\n\nSecond paragraph\n\n",
      accountHandle: "sample",
      alerts: [],
      needsStateCheck: false,
    }),
    browser: {
      act: async ({ operation }) => writes.push(operation),
    },
  });

  await writer.compose({
    kind: "original",
    accountHandle: "sample",
    text: "First paragraph\n\nSecond paragraph\n",
  });

  assert.deepEqual(writes, ["fillComposer", "submitPost"]);
});

test("composer still rejects changed body text", async () => {
  let reads = 0;
  const writes = [];
  const writer = new PlatformWriting({
    observed: async () => ({
      editorText:
        reads++ === 0 ? "" : "First paragraph\n\n\nChanged paragraph\n\n",
      accountHandle: "sample",
      alerts: [],
      needsStateCheck: false,
    }),
    browser: {
      act: async ({ operation }) => writes.push(operation),
    },
  });

  await assert.rejects(
    writer.compose({
      kind: "original",
      accountHandle: "sample",
      text: "First paragraph\n\nSecond paragraph\n",
    }),
    /提交前账号\/正文\/目标未核实/,
  );
  assert.deepEqual(writes, ["fillComposer"]);
});

test("composer keeps structured failure when the post-fill editor read is missing", async () => {
  let reads = 0;
  const writer = new PlatformWriting({
    observed: async () => ({
      ...(reads++ === 0 ? { editorText: "" } : {}),
      accountHandle: "sample",
      alerts: [],
      needsStateCheck: false,
    }),
    browser: { act: async () => {} },
  });

  await assert.rejects(
    writer.compose({
      kind: "original",
      accountHandle: "sample",
      text: "Approved body",
    }),
    /提交前账号\/正文\/目标未核实/,
  );
});

test("public text readback ignores terminal newlines, while general text stays strict", () => {
  assert.equal(samePublishedText("Published text\n\n", "Published text"), true);
  assert.equal(samePublishedText("Published text\r\n", "Published text"), true);
  assert.equal(sameText("Published text\n", "Published text"), false);
  assert.equal(
    samePublishedText("Published changed text", "Published text"),
    false,
  );
});
