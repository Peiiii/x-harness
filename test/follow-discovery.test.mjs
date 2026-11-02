import test from "node:test";
import assert from "node:assert/strict";
import { FollowDiscovery } from "../dist/follow-discovery.js";

test("deduplicates list windows, excludes existing follows and carries each original proof", async () => {
  const calls = [];
  const pages = [
    {
      status: "observed",
      fresh: true,
      evidenceRef: "proof-1",
      moreInDOM: true,
      offset: 0,
      people: [
        {
          handle: "One",
          blue: true,
          relationship: "not-following",
          biography: "AI",
        },
        {
          handle: "Old",
          blue: true,
          relationship: "following",
          biography: "AI",
        },
      ],
    },
    {
      status: "observed",
      fresh: true,
      evidenceRef: "proof-2",
      moreInDOM: false,
      offset: 2,
      people: [
        {
          handle: "Two",
          blue: true,
          relationship: "not-following",
          biography: "AI",
        },
        {
          handle: "NoBlue",
          blue: null,
          relationship: "not-following",
          biography: "AI",
        },
      ],
    },
    {
      status: "observed",
      fresh: true,
      evidenceRef: "proof-3",
      moreInDOM: false,
      people: [
        {
          handle: "One",
          blue: true,
          relationship: "not-following",
          biography: "AI",
        },
      ],
    },
    {
      status: "observed",
      fresh: true,
      evidenceRef: "proof-4",
      moreInDOM: false,
      people: [
        {
          handle: "One",
          blue: true,
          relationship: "not-following",
          biography: "AI",
        },
      ],
    },
  ];
  const api = new FollowDiscovery(
    async (a) => {
      calls.push(a);
      return pages.shift();
    },
    { clock: () => Date.parse("2026-10-29T10:00:00+08:00") },
  );
  const r = await api.run({
    target: { url: "https://x.com/sample/following", evidenceRef: "seed" },
    terms: ["ai"],
    requireBlue: true,
    maxWindows: 10,
  });
  assert.deepEqual(
    r.candidates.map((x) => [x.handle, x.evidenceRef]),
    [
      ["One", "proof-1"],
      ["Two", "proof-2"],
    ],
  );
  assert.equal(calls[1].offset, 2);
  assert.equal(calls[1].advance, false);
  assert.equal(calls[2].advance, true);
  assert.equal(r.reason, "list-progress-stalled");
  assert.equal(r.complete, false);
  assert.equal(r.requiresReview, true);
});

test("unconfirmed window stops without inferring more candidates", async () => {
  let count = 0;
  const api = new FollowDiscovery(
    async () => {
      count++;
      return { status: "needsDecision", fresh: false, reason: "unconfirmed" };
    },
    { clock: () => Date.parse("2026-10-29T10:00:00+08:00") },
  );
  const r = await api.run({
    target: { url: "https://x.com/sample/following", evidenceRef: "seed" },
  });
  assert.equal(r.status, "needsDecision");
  assert.equal(count, 1);
  assert.equal(r.reason, "unconfirmed");
  assert.deepEqual(r.candidates, []);
});

test("ASCII topic matches whole words rather than substrings", async () => {
  const api = new FollowDiscovery(
    async () => ({
      status: "observed",
      fresh: true,
      evidenceRef: "proof",
      moreInDOM: false,
      people: [
        {
          handle: "wrong",
          relationship: "not-following",
          biography: "chain airdrops",
        },
        {
          handle: "right",
          relationship: "not-following",
          biography: "分享AI工具",
        },
      ],
    }),
    { clock: () => Date.parse("2026-10-29T10:00:00+08:00") },
  );
  const r = await api.run({
    target: { url: "https://x.com/sample/following", evidenceRef: "seed" },
    terms: ["AI"],
    maxWindows: 1,
  });
  assert.deepEqual(
    r.candidates.map((x) => x.handle),
    ["right"],
  );
});
