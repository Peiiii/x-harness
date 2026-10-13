import test from "node:test";
import assert from "node:assert/strict";
const root =
  process.env.HARNESS_TEST_BASE ?? new URL("../dist/", import.meta.url).href;
const { readPeople } = await import(root + "readers-profile.js");
const { createXPlatform } = await import(root + "platform.js");
const { createBusinessHarness } = await import(root + "api.js");
const visible = { getClientRects: () => [{}] };
function cell(
  handle,
  color = "rgb(29, 155, 240)",
  labels = [`关注 @${handle}`],
  bio = "完整中文简介\n关注\n第三行正文",
) {
  const links = [
    { ...visible, innerText: "Fixture", getAttribute: () => "/" + handle },
    { ...visible, innerText: "@" + handle, getAttribute: () => "/" + handle },
  ];
  const buttons = labels.map((label) => ({
    ...visible,
    disabled: false,
    innerText: label,
    getAttribute: () => label,
  }));
  const badge = { ...visible, color };
  return {
    ...visible,
    innerText: `Fixture\n@${handle}\n关注\n${bio}`,
    querySelectorAll: (s) =>
      s === "a[href]"
        ? links
        : s === "button"
          ? buttons
          : s.startsWith("svg")
            ? color === null
              ? []
              : [badge]
            : [],
  };
}
test("visible cell evidence distinguishes blue, missing badges and exact relationship controls", () => {
  const saved = [
    globalThis.document,
    globalThis.location,
    globalThis.getComputedStyle,
  ];
  try {
    globalThis.document = {
      querySelectorAll: (s) =>
        s.includes("UserCell")
          ? [
              cell("fixture_a"),
              cell("fixture_b", "rgb(201, 169, 90)", ["回关 @fixture_b"]),
              cell("fixture_c", null),
            ]
          : [],
    };
    globalThis.location = {
      href: "https://x.com/fixture_owner/verified_followers",
    };
    globalThis.getComputedStyle = (e) => ({ color: e.color, fill: e.color });
    const r = readPeople({ limit: 5 });
    assert.equal(r.people[0].blue, true);
    assert.equal(r.people[1].blue, false);
    assert.equal(r.people[2].blue, null);
    assert.equal(r.people[1].relationship, "follows-you");
    assert.equal(r.people[0].biography, "完整中文简介\n关注\n第三行正文");
    assert.throws(() => readPeople({ limit: 6 }));
  } finally {
    [globalThis.document, globalThis.location, globalThis.getComputedStyle] =
      saved;
  }
});
const target = {
  url: "https://x.com/fixture_owner/verified_followers",
  evidenceRef: "synthetic:list",
};
const row = {
  handle: "fixture_a",
  url: "https://x.com/fixture_a",
  blue: true,
  relationship: "not-following",
  biography: "完整中文简介",
};
test("same loaded list window reads without navigation or refresh", async () => {
  const acts = [];
  const browser = {
    capabilities: () => [],
    observe: async (q) => ({
      page: target.url,
      accountHandle: "fixture_self",
      people: [row],
      offset: q.offset,
      renderedPeople: 10,
      moreInDOM: true,
      alerts: [],
      needsStateCheck: false,
    }),
    act: async (c) => acts.push(c),
  };
  const p = createXPlatform(browser);
  const r = await p.readPeople({ target, offset: 5 });
  assert.equal(r.people[0].handle, "fixture_a");
  assert.equal(r.offset, 5);
  assert.equal(r.complete, true);
  assert.deepEqual(acts, []);
});
test("advance is stopped by alerts and rejects changed target after scrolling", async () => {
  let page = target.url;
  const acts = [];
  let alerts = ["synthetic platform refusal"];
  const browser = {
    capabilities: () => [],
    observe: async () => ({
      page,
      accountHandle: "fixture_self",
      people: [row],
      alerts,
      needsStateCheck: false,
    }),
    act: async (c) => {
      acts.push(c.operation);
      page = "https://x.com/fixture_other/followers";
    },
  };
  const p = createXPlatform(browser);
  assert.equal((await p.readPeople({ target, advance: true })).complete, false);
  assert.deepEqual(acts, []);
  alerts = [];
  const r = await p.readPeople({ target, advance: true });
  assert.equal(r.complete, false);
  assert.ok(r.missing.includes("target-page-mismatch"));
  assert.deepEqual(acts, ["nextPeople"]);
  await assert.rejects(() =>
    p.readPeople({ target: { ...target, url: "https://x.com/home" } }),
  );
});
test("root read proof and delta preserve complete evidence without approving or writing", async () => {
  const proofs = [];
  let reads = 0;
  const platform = {
    preflight: () => ({ covered: true, missing: [] }),
    readPeople: async () => {
      reads++;
      return {
        people: [row],
        fresh: true,
        complete: true,
        offset: 0,
        moreInDOM: false,
        alerts: [],
      };
    },
    captureProof: async (x) => x,
  };
  const store = {
    recordProof: async (p) => {
      proofs.push(p);
      return "synthetic:proof-" + proofs.length;
    },
  };
  const x = createBusinessHarness({ platform, store });
  const r = await x.readPeople({ target, mode: "decision" });
  assert.equal(r.status, "observed");
  assert.deepEqual(r.people, [row]);
  assert.equal(r.evidenceRef, "synthetic:proof-1");
  const d = await x.readPeople({ target, mode: "delta" });
  assert.deepEqual(d.people, []);
  assert.deepEqual(d.unchangedIds, ["fixture_a"]);
  assert.equal(reads, 2);
  assert.equal(proofs.length, 2);
});

test("DOM list advance uses one unique freshly observed handle and rejects stale reuse", async () => {
  const { createDOMXBrowser } = await import(root + "browser-dom.js");
  const presses = [];
  const locatorPresses = [];
  let count = 1;
  const link = {
    filter() {
      return this;
    },
    count: async () => count,
    press: async (key) => locatorPresses.push(key),
  };
  const tab = {
    pressKey: async (target, key) => {
      assert.equal(target, null);
      presses.push(key);
    },
    playwright: {
      evaluate: async () => ({
        page: target.url,
        people: [row],
        accountHandle: "fixture_self",
        alerts: [],
        needsStateCheck: false,
      }),
      locator: () => link,
    },
  };
  const browser = createDOMXBrowser(tab);
  await browser.observe({ view: "people", limit: 1 });
  await browser.act({ operation: "nextPeople" });
  assert.deepEqual(presses, ["PageDown"]);
  assert.deepEqual(locatorPresses, []);
  await assert.rejects(() => browser.act({ operation: "nextPeople" }));
  count = 2;
  await browser.observe({ view: "people", limit: 1 });
  await assert.rejects(() => browser.act({ operation: "nextPeople" }));
  assert.deepEqual(presses, ["PageDown"]);
});

test("native list badge evidence is explicitly unavailable without browser I/O", async () => {
  const { createNativeXBrowser } = await import(root + "browser-native.js");
  let observed = false;
  const browser = createNativeXBrowser({
    getAXState: async () => {
      observed = true;
      return "";
    },
  });
  assert.ok(
    browser.capabilities("readPeople").includes("native-people-blue-evidence"),
  );
  assert.equal(observed, false);
});

test("sidebar recommendations never masquerade as a loaded follower list", () => {
  const saved = [
    globalThis.document,
    globalThis.location,
    globalThis.getComputedStyle,
  ];
  let primary = [];
  try {
    globalThis.document = {
      querySelectorAll: (s) =>
        s === 'main [data-testid="primaryColumn"] [data-testid="UserCell"]'
          ? primary
          : s.includes("UserCell")
            ? [cell("sidebar_user")]
            : [],
    };
    globalThis.location = { href: target.url };
    globalThis.getComputedStyle = (e) => ({ color: e.color, fill: e.color });
    assert.equal(readPeople().needsStateCheck, true);
    assert.deepEqual(readPeople().people, []);
    primary = [cell("fixture_primary")];
    assert.equal(readPeople().renderedPeople, 1);
    assert.equal(readPeople().people[0].handle, "fixture_primary");
  } finally {
    [globalThis.document, globalThis.location, globalThis.getComputedStyle] =
      saved;
  }
});

test("list identity binds the relationship control instead of a second handle in the biography", () => {
  const saved = [
    globalThis.document,
    globalThis.location,
    globalThis.getComputedStyle,
  ];
  try {
    const entry = cell("fixture_a", "rgb(29, 155, 240)", ["回关 @fixture_a"]);
    const original = entry.querySelectorAll;
    entry.querySelectorAll = (s) =>
      s === "a[href]"
        ? [
            ...original(s),
            {
              ...visible,
              innerText: "@fixture_other",
              getAttribute: () => "/fixture_other",
            },
          ]
        : original(s);
    globalThis.document = {
      querySelectorAll: (s) => (s.includes("UserCell") ? [entry] : []),
    };
    globalThis.location = { href: "https://x.com/fixture_self/followers" };
    globalThis.getComputedStyle = (e) => ({ color: e.color, fill: e.color });
    const r = readPeople({ bulk: true, limit: 100 });
    assert.equal(r.people[0].handle, "fixture_a");
    assert.equal(r.people[0].relationship, "follows-you");
  } finally {
    [globalThis.document, globalThis.location, globalThis.getComputedStyle] =
      saved;
  }
});
