import test from "node:test";
import assert from "node:assert/strict";
import { PlatformCollections } from "../dist/platform-collections.js";
import { readResult } from "../dist/results.js";
function fixture(folders) {
  let opened = false,
    postReads = 0;
  const adapter = new PlatformCollections({
    ready: async (q) => {
      if (q.view === "posts") {
        postReads++;
        throw Error("Discovery must not read posts");
      }
      return {
        page: "https://x.com/i/history",
        controls: [{ role: "tab", label: "书签", selected: true }],
        bookmarkFolders: opened ? folders : [],
        observedAt: "2026-01-01T08:00:00Z",
      };
    },
    observed: async () => ({}),
    browser: { act: async () => {} },
    choose: async (value, predicate) => {
      const found = value.controls.filter(predicate);
      if (found.length !== 1) return false;
      opened = true;
      return true;
    },
  });
  return { adapter, postReads: () => postReads };
}
test("discover bookmark folder names through selected dropdown without collecting all posts", async () => {
  const f = fixture(["Remakes", "Learning"]);
  const raw = await f.adapter.readBookmarks({ discoverOnly: true });
  assert.deepEqual(raw.folders, ["Remakes", "Learning"]);
  assert.equal(raw.complete, true);
  assert.equal(f.postReads(), 0);
  const projected = readResult("readBookmarks", raw, "decision");
  assert.deepEqual(projected.folders, raw.folders);
  assert.equal(projected.sources, undefined);
});
test("missing folder menu remains an explicit incomplete observation", async () => {
  const f = fixture([]);
  const r = await f.adapter.readBookmarks({ discoverOnly: true });
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ["bookmark-folder-menu-unconfirmed"]);
  assert.equal(f.postReads(), 0);
});
test("normal bookmark read still requires a named folder", async () => {
  const f = fixture([]);
  await assert.rejects(f.adapter.readBookmarks({}), /需指定/);
  assert.equal(f.postReads(), 0);
});

test("selected folder binding is retained in compact business result", () => {
  const r = readResult(
    "readBookmarks",
    {
      folder: "Remakes",
      folderEvidence: {
        name: "Remakes",
        selectedPage: "https://x.com/i/bookmarks/folder/example",
        noise: "omit",
      },
      sources: [],
    },
    "decision",
  );
  assert.equal(r.folder, "Remakes");
  assert.equal(r.folderEvidence.name, "Remakes");
  assert.equal(r.folderEvidence.noise, undefined);
});

test("discovery never activates an unrelated selected subscription tab", async () => {
  const selected = [];
  const adapter = new PlatformCollections({
    ready: async () => ({
      page: "https://x.com/i/premium-business",
      controls: [
        { role: "tab", label: "Annually", selected: true },
        { role: "link", label: "历史", href: "/i/history" },
      ],
      bookmarkFolders: [],
    }),
    observed: async () => ({}),
    browser: { act: async () => {} },
    choose: async (value, p) => {
      const matches = value.controls.filter(p);
      if (matches.length !== 1) return false;
      selected.push(matches[0].label);
      return true;
    },
  });
  await adapter.readBookmarks({ discoverOnly: true });
  assert.equal(selected.includes("Annually"), false);
  assert.deepEqual(selected, ["历史"]);
});
