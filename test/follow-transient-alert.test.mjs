import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.mjs";
import { createXPlatform } from "../dist/platform.js";

test("follow verification preserves a rate warning that disappears on refresh", async (t) => {
  const f = fixture(t, { planned: [1, 0, 0], actionKinds: ["follow"] });
  f.following.add("reader");
  f.browser.alerts = ["抱歉，你受到速度限制。请稍等片刻，然后再试一次。"];
  const act = f.browser.act.bind(f.browser);
  f.browser.act = async (command) => {
    await act(command);
    if (command.operation === "refreshPerson") {
      f.browser.alerts = [];
      f.following.clear();
    }
  };
  const platform = createXPlatform(f.browser);
  const result = await platform.findSubmission({
    kind: "follow",
    handle: "reader",
    url: "https://x.com/reader",
    evidenceRef: f.proof,
    accountHandle: "Pei",
  });
  assert.equal(result.relationship, "not-following");
  assert.equal(result.verified, false);
  assert.deepEqual(result.alerts, [
    "抱歉，你受到速度限制。请稍等片刻，然后再试一次。",
  ]);
});
