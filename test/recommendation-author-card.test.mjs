import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readPosts } from "../dist/readers-posts.js";
import { source as platformSource } from "../dist/platform-rules.js";
import { readResult } from "../dist/results.js";
class Element {
  constructor(attrs = {}, text = "", children = {}) {
    this.attrs = attrs;
    this.innerText = text;
    this.children = children;
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  getClientRects() {
    return this.attrs.hidden ? [] : [1];
  }
  querySelectorAll(q) {
    return this.children[q] ?? [];
  }
}
function header(
  handle,
  {
    blue = true,
    hidden = false,
    badges = 1,
    label = "认证账号",
    opacity = "1",
    visibility = "visible",
  } = {},
) {
  const links = [
    new Element({ href: "/" + handle }, handle + " name"),
    new Element({ href: "/" + handle }, "@" + handle),
  ];
  const icons = Array.from(
    { length: badges },
    () =>
      new Element({
        "aria-label": label,
        opacity,
        visibility,
        hidden,
        color: blue ? "rgb(29, 155, 240)" : "rgb(130, 154, 171)",
      }),
  );
  return new Element({}, "", {
    "a[href]": links,
    'svg[data-testid="icon-verified"]': icons,
  });
}
function article(handle, id, headers) {
  const link = new Element({ href: `/${handle}/status/${id}` });
  const time = new Element({ datetime: "2026-10-19T12:00:00.000Z" });
  time.closest = () => link;
  return new Element({}, "original body", {
    time: [time],
    "a[href]": [link],
    '[data-testid="User-Name"]': headers,
  });
}
function observe(cards) {
  const context = vm.createContext({
    document: {
      querySelectorAll: (q) => (q === "article" ? cards : []),
      scrollingElement: null,
    },
    getComputedStyle: (e) => ({
      color: e.attrs.color,
      fill: e.attrs.color,
      visibility: "visible",
      opacity: e.attrs.opacity ?? "1",
      visibility: e.attrs.visibility ?? "visible",
    }),
    location: { href: "https://x.com/home" },
  });
  return JSON.parse(
    JSON.stringify(
      vm.runInContext(`(${readPosts.toString()})({limit:5})`, context),
    ),
  );
}
test("one DOM batch binds each badge and name to its exact primary author", () => {
  const out = observe([
    article("alpha", "101", [header("alpha")]),
    article("bravo", "102", [header("bravo", { blue: false })]),
  ]);
  assert.equal(out.posts[0].authorIdentity.blue, true);
  assert.equal(out.posts[0].authorIdentity.handle, "alpha");
  assert.equal(out.posts[0].authorIdentity.name, "alpha name");
  assert.equal(out.posts[0].authorIdentity.profileURL, "https://x.com/alpha");
  assert.equal(out.posts[1].authorIdentity.blue, null);
  assert.deepEqual(out.posts[1].authorIdentity.missing, [
    "blue-check-unconfirmed",
  ]);
});
for (const [name, headers] of [
  ["foreign quoted author only", [header("quoted")]],
  ["duplicate matching headers", [header("alpha"), header("alpha")]],
  ["hidden badge", [header("alpha", { hidden: true })]],
  ["transparent badge", [header("alpha", { opacity: "0" })]],
  ["visibility-hidden badge", [header("alpha", { visibility: "hidden" })]],
  ["ambiguous badges", [header("alpha", { badges: 2 })]],
  [
    "generic verification label",
    [header("alpha", { label: "Verified organization" })],
  ],
  ["absent badge", [header("alpha", { badges: 0 })]],
  ["missing header", []],
])
  test(name + " cannot establish blue verification", () => {
    assert.equal(
      observe([article("alpha", "101", headers)]).posts[0].authorIdentity.blue,
      null,
    );
  });
test("a quoted author does not replace a separately matched primary author", () => {
  const p = observe([
    article("alpha", "101", [header("quoted"), header("alpha")]),
  ]).posts[0];
  assert.equal(p.authorIdentity.handle, "alpha");
  assert.equal(p.authorIdentity.blue, true);
});
test("platform and public recommendation projection retain matching card proof with provenance", () => {
  const identity = observe([article("alpha", "101", [header("alpha")])])
    .posts[0].authorIdentity;
  const raw = platformSource(
    {
      id: "101",
      author: "alpha",
      primary: "/alpha/status/101",
      body: "完整互关原文",
      authorIdentity: identity,
    },
    "https://x.com/home",
  );
  const projected = readResult(
    "readHomeRecommendations",
    {
      status: "observed",
      page: "https://x.com/home",
      fresh: true,
      complete: true,
      evidenceRef: "synthetic-proof",
      sources: [raw],
      sourceOrigin: {
        kind: "home-recommendations",
        page: "https://x.com/home",
        selectedTab: "For you",
      },
    },
    "decision",
  );
  assert.deepEqual(projected.sources[0].authorIdentity, identity);
  assert.equal(projected.sources[0].body, "完整互关原文");
  assert.equal(projected.sourceOrigin.kind, "home-recommendations");
  assert.equal(projected.evidenceRef, "synthetic-proof");
});
test("public evidence rejects a foreign handle or nonmatching profile URL", () => {
  const base = {
    id: "101",
    author: "alpha",
    body: "full body",
    authorIdentity: {
      handle: "bravo",
      profileURL: "https://x.com/bravo",
      blue: true,
      source: "post-card",
      missing: [],
    },
  };
  for (const identity of [
    base.authorIdentity,
    { ...base.authorIdentity, handle: "alpha" },
    {
      ...base.authorIdentity,
      handle: "alpha",
      profileURL: "https://evil.example/alpha",
    },
  ]) {
    const r = readResult(
      "readHomeRecommendations",
      { status: "observed", sources: [{ ...base, authorIdentity: identity }] },
      "decision",
    );
    assert.equal(r.sources[0].authorIdentity, undefined);
  }
});
