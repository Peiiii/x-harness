import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readXSurface } from "../dist/diagnostics.js";

test("body keeps paragraph text and mentions, resolves observed X permalink without layout ellipsis", () => {
  class Element {
    constructor(tagName, children = [], href = "") {
      Object.assign(this, { tagName, childNodes: children, href, nodeType: 1 });
    }
    getAttribute(name) {
      return name === "href" ? this.href : null;
    }
    getClientRects() {
      return [1];
    }
  }
  const text = (value) => ({ nodeType: 3, textContent: value });
  const body = new Element("DIV", [
    text("学 "),
    new Element("A", [text("@AxtonLiu")], "/AxtonLiu"),
    text("\n原帖："),
    new Element(
      "A",
      [text("https://x.com/Axton…")],
      "/AxtonLiu/status/2105734536407781566",
    ),
    text("\n#AI实测"),
  ]);
  const primary = new Element("A", [], "/Pei/status/123");
  const article = new Element("ARTICLE");
  article.querySelectorAll = (query) =>
    query === "time"
      ? [{ getClientRects: () => [1], closest: () => primary }]
      : [body];
  const context = vm.createContext({
    HTMLElement: Element,
    location: { href: "https://x.com/Pei/status/123" },
    document: {
      querySelectorAll: (query) => (query === "article" ? [article] : []),
    },
  });
  vm.runInContext(`var read = ${readXSurface.toString()}`, context);
  context.input = {
    view: "posts",
    posts: [{ id: "123", primary: "/Pei/status/123" }],
  };
  assert.equal(
    vm.runInContext("read(input)", context).bodies[0].body,
    "学 @AxtonLiu\n原帖：https://x.com/AxtonLiu/status/2105734536407781566\n#AI实测",
  );
  body.childNodes[3].href = "https://t.co/unknown";
  assert.equal(
    vm.runInContext("read(input)", context).bodies[0].body,
    "学 @AxtonLiu\n原帖：https://x.com/Axton…\n#AI实测",
  );
});

test("invisible aria-hidden protocol is not code text, while visible protocol remains", () => {
  class Element {
    constructor(tagName, children = [], attrs = {}) {
      Object.assign(this, {
        tagName,
        childNodes: children,
        attrs,
        nodeType: 1,
      });
    }
    getAttribute(name) {
      return this.attrs[name] ?? null;
    }
    getClientRects() {
      return [1];
    }
  }
  const text = (value) => ({ nodeType: 3, textContent: value });
  const protocol = new Element("SPAN", [text("http://")], {
    "aria-hidden": "true",
    opacity: "0",
  });
  const body = new Element("DIV", [
    new Element("A", [protocol, text("memory.search")], {
      href: "https://t.co/observed",
    }),
    text("(query=q)"),
  ]);
  const primary = new Element("A", [], { href: "/owner/status/123" });
  const article = new Element("ARTICLE");
  article.querySelectorAll = (query) =>
    query === "time"
      ? [{ getClientRects: () => [1], closest: () => primary }]
      : [body];
  const context = vm.createContext({
    HTMLElement: Element,
    location: { href: "https://x.com/owner/status/123" },
    getComputedStyle: (el) => ({ opacity: el.attrs.opacity ?? "1" }),
    document: { querySelectorAll: (q) => (q === "article" ? [article] : []) },
  });
  vm.runInContext(`var read=${readXSurface.toString()}`, context);
  context.input = {
    view: "posts",
    posts: [{ id: "123", primary: "/owner/status/123" }],
  };
  assert.equal(
    vm.runInContext("read(input)", context).bodies[0].body,
    "memory.search(query=q)",
  );
  protocol.attrs.opacity = "1";
  assert.equal(
    vm.runInContext("read(input)", context).bodies[0].body,
    "http://memory.search(query=q)",
  );
});
