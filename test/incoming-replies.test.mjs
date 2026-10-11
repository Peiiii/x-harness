import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessHarness } from "../dist/diagnostics.js";
import { fixture } from "./fixtures.mjs";

test("incoming batch uses original identity, excludes settled and uncertain targets, preserves prepared targets", async (t) => {
  const f = fixture(t);
  await f.store.transaction((s) => {
    s.state.actions = [
      ...["verified", "preexisting", "intent", "unknown", "prepared"].map(
        (status, i) => ({
          id: `a${i}`,
          kind: "reply",
          status,
          postId: String(100 + i),
        }),
      ),
      { id: "other", kind: "follow", status: "verified", postId: "999" },
    ];
    return s.state;
  });
  let input;
  const api = createBusinessHarness({
    store: f.store,
    platform: {
      preflight: () => ({ covered: true }),
      captureProof: ({ observation }) => ({ observation }),
      searchSources: async (args) => {
        input = args;
        return {
          sources: [
            {
              id: "104",
              author: "Reader",
              body: "Entire incoming text",
              datetime: "2026-01-01T00:00:00.000Z",
              url: "https://x.com/Reader/status/104",
            },
          ],
          complete: true,
          pageComplete: false,
        };
      },
    },
  });
  const receipt = await api.readIncomingReplies({
    processedIds: ["90"],
    limit: 4,
    maxPages: 2,
  });
  assert.equal(input.query, "to:Pei filter:replies -from:Pei");
  assert.deepEqual(
    new Set(input.processedIds),
    new Set(["90", "100", "101", "102", "103"]),
  );
  assert.equal(input.limit, 4);
  assert.equal(input.maxPages, 2);
  assert.equal(receipt.sources, undefined);
  const detail = await api.readIncomingReplies({ mode: "decision" });
  assert.equal(detail.sources[0].body, "Entire incoming text");
  const delta = await api.readIncomingReplies({ mode: "delta" });
  assert.deepEqual(delta.unchangedIds, ["104"]);
});
