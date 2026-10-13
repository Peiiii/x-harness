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

test("discovery waits for delayed menu render without toggling the selected tab twice", async () => {
  let opened = false,
    rendered = false,
    clicks = 0;
  const adapter = new PlatformCollections({
    ready: async () => ({
      page: "https://x.com/i/history",
      controls: [{ role: "tab", label: "书签", selected: true }],
      bookmarkFolders: opened && rendered ? ["Remakes"] : [],
    }),
    observed: async () => ({}),
    browser: {
      act: async (c) => {
        assert.equal(c.operation, "waitForFolder");
        assert.equal(c.folder, "所有书签");
        rendered = true;
      },
    },
    choose: async (v, p) => {
      if (v.controls.filter(p).length !== 1) return false;
      opened = !opened;
      clicks++;
      return true;
    },
  });
  const result = await adapter.readBookmarks({ discoverOnly: true });
  assert.deepEqual(result.folders, ["Remakes"]);
  assert.equal(result.complete, true);
  assert.equal(clicks, 1);
});

test("DOM folder discovery waits for a named card rather than the static all-bookmarks option", async () => {
  const { DOMNavigation } = await import("../dist/browser-dom-navigation.js");
  const calls = [];
  const first = { waitFor: async (options) => calls.push(["wait", options]) };
  const cards = {
    filter: (opts) => {
      calls.push(["card-filter", String(opts.hasText)]);
      return { first: () => first };
    },
  };
  const menu = {
    filter: (opts) => {
      calls.push(["menu-filter", opts.hasText]);
      return {
        locator: (selector) => {
          calls.push(["cards", selector]);
          return cards;
        },
      };
    },
  };
  const nav = new DOMNavigation({
    session: {},
    tab: {
      playwright: {
        locator: (selector) => {
          calls.push(["menu", selector]);
          return menu;
        },
      },
    },
    observe: async () => ({}),
  });
  await nav.waitForFolder({ folderDiscovery: true, folder: "所有书签" });
  assert.equal(calls[1][1], "所有书签");
  assert.equal(calls[2][1], "span:not(:has(span))");
  assert.equal(calls.at(-1)[1].state, "visible");
});
