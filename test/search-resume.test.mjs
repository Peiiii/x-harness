import test from "node:test";
import assert from "node:assert/strict";
import { PlatformCollections } from "../dist/platform-collections.js";
function fixture(query = "friendship") {
  let page = "https://x.com/search?q=" + encodeURIComponent(query),
    writes = [];
  const observation = () => ({
    page,
    observedAt: new Date().toISOString(),
    posts: [
      {
        id: "1",
        author: "peer",
        datetime: "2026-10-14T04:00:00Z",
        body: "交朋友",
        primary: "/peer/status/1",
        buttons: [],
      },
    ],
    alerts: [],
    needsStateCheck: false,
  });
  const reader = new PlatformCollections({
    browser: {
      act: async (command) => {
        writes.push(command);
      },
    },
    ready: async () => observation(),
    observed: async () => observation(),
    choose: async () => {},
  });
  return { reader, writes };
}
test("exact-query resume collects without reopening or resetting search", async () => {
  const f = fixture();
  const r = await f.reader.searchSources({
    query: "friendship",
    resume: true,
    limit: 1,
  });
  assert.equal(r.sources.length, 1);
  assert.equal(f.writes.length, 0);
});
test("wrong-query resume fails closed without navigation or collection", async () => {
  const f = fixture("other");
  const r = await f.reader.searchSources({
    query: "friendship",
    resume: true,
    limit: 1,
  });
  assert.deepEqual(r.missing, ["search-resume-query-unconfirmed"]);
  assert.equal(f.writes.length, 0);
});
