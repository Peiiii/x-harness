import test from "node:test";
import assert from "node:assert/strict";
import { createXPlatform } from "../dist/platform.js";

test("an observed reply permalink recovers the receipt without changing its original parent", async () => {
  const clock = () => Date.parse("2026-10-11T13:15:07Z");
  const action = {
    kind: "reply",
    postId: "123",
    url: "https://x.com/source/status/123",
    evidenceRef: "root-proof",
    accountHandle: "Pei",
    text: "actual reply",
    intentAt: new Date(clock()).toISOString(),
    observedPublicURL: "https://x.com/Pei/status/456",
    observedPublicEvidenceRef: "public-proof",
  };
  for (const parent of ["123", "999"]) {
    let page = action.url;
    const calls = [];
    const platform = createXPlatform(
      {
        capabilities: () => [],
        async act(c) {
          calls.push(c);
          if (c.url) page = c.url;
        },
        async observe() {
          return {
            page,
            alerts: [],
            needsStateCheck: false,
            posts: [
              {
                id: "456",
                author: "Pei",
                primary: "/Pei/status/456",
                body: action.text,
                datetime: new Date(clock()).toISOString(),
                replyToId: parent,
              },
            ],
          };
        },
      },
      { clock },
    );
    assert.equal(
      (await platform.findSubmission(action)).verified,
      parent === "123",
    );
    assert.equal(calls[0].url, action.observedPublicURL);
    assert.equal(action.url, "https://x.com/source/status/123");
    assert.equal(
      calls.some((c) => /submit/.test(c.operation)),
      false,
    );
  }
  const platform = createXPlatform(
    {
      async observe() {
        throw Error("must reject before UI");
      },
    },
    { clock },
  );
  await assert.rejects(
    platform.findSubmission({
      ...action,
      observedPublicURL: "https://x.com/other/status/456",
    }),
    /原账号/,
  );
});
