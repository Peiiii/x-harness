import test from "node:test";
import assert from "node:assert/strict";
import { PlatformCollections } from "../dist/platform-collections.js";
const post = (id, needsExpansion = false) => ({
  id: String(id),
  author: "example_user",
  body: `Source ${id}`,
  datetime: "2026-10-29T00:00:00Z",
  primary: `/example_user/status/${id}`,
  needsExpansion,
});
for (const expansion of [false, true])
  test(`source pagination reuses only an unchanged list snapshot: expansion=${expansion}`, async () => {
    let view = "list",
      restores = 0,
      expands = 0;
    const frame = (posts) => ({
      page: "https://x.com/home",
      accountHandle: "example_owner",
      firstRenderedId: "1",
      posts,
      moreInDOM: posts.length === 5,
      alerts: [],
      needsStateCheck: false,
    });
    const first = [post(1, expansion), post(2), post(3), post(4), post(5)];
    const collections = new PlatformCollections({
      ready: async (query) => {
        if (query.targetId) {
          view = "target";
          return frame([post(1)]);
        }
        if (query.offset === 5) {
          assert.equal(
            view,
            "list",
            "an expansion must restore the list before further paging",
          );
          return frame([post(6)]);
        }
        view = "list";
        return frame(first);
      },
      observed: async (query) => {
        if (query.targetId) {
          view = "target";
          return frame([post(1, true)]);
        }
        restores++;
        view = "list";
        return frame(first);
      },
      browser: {
        act: async (c) => {
          assert.equal(c.operation, "expandPost");
          expands++;
          view = "target";
        },
      },
      choose: async () => {},
    });
    const result = await collections.collectSources({
      processedIds: ["2", "3", "4", "5"],
      limit: 2,
      maxPages: 2,
    });
    assert.equal(result.complete, true);
    assert.deepEqual(
      result.sources.map((x) => x.id),
      ["1", "6"],
    );
    assert.equal(expands, expansion ? 1 : 0);
    assert.equal(restores, expansion ? 1 : 0);
  });
