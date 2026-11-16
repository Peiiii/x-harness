import { runInNewContext } from "node:vm";
import { atomicObservationCode, createDOMXBrowser } from "../dist/browser.js";
import { createPlatformWriting } from "../dist/platform-writing.js";

export function composerFixture({
  nested = false,
  duplicate = false,
  twoEditors = false,
  truncated = false,
  inline = false,
} = {}) {
  const state = {
    opened: false,
    closed: false,
    truncated,
    fills: 0,
    submits: 0,
    backgroundFills: 0,
    backgroundSubmits: 0,
    expansions: 0,
  };
  const bodyText =
    "Synthetic complete parent question with enough specific context. ".repeat(
      3,
    );
  const all = (node) => [node, ...node.children.flatMap(all)];
  const match = (node, selector) =>
    selector.split(",").some((part) => {
      const s = part.trim();
      if (
        ["main", "button", "a", "img", "video", "textarea", "input"].includes(s)
      )
        return node.tagName.toLowerCase() === s;
      if (s === "a[href]")
        return node.tagName === "A" && node.attrs.href != null;
      const attr = s.match(/^(?:a)?\[([^=\]]+)=([\s\S]+)\]$/);
      return attr
        ? node.attrs[attr[1]] === attr[2].replace(/^['"]|['"]$/g, "")
        : false;
    });
  class Node {
    constructor(tag, attrs = {}, text = "", children = []) {
      this.tagName = tag.toUpperCase();
      this.attrs = attrs;
      this.text = text;
      this.children = children;
      for (const child of children) child.parentElement = this;
    }
    get innerText() {
      return [this.text, ...this.children.map((child) => child.innerText)]
        .filter(Boolean)
        .join("\n");
    }
    get disabled() {
      return false;
    }
    getAttribute(name) {
      return this.attrs[name] ?? null;
    }
    getClientRects() {
      let at = this;
      while (at) {
        if (
          at.attrs.role === "dialog" &&
          (inline || !state.opened || state.closed)
        )
          return [];
        at = at.parentElement;
      }
      return [{}];
    }
    closest(selector) {
      let at = this;
      while (at) {
        if (match(at, selector)) return at;
        at = at.parentElement;
      }
      return null;
    }
    contains(other) {
      let at = other;
      while (at) {
        if (at === this) return true;
        at = at.parentElement;
      }
      return false;
    }
    querySelectorAll(selector) {
      return this.children.flatMap(all).filter((node) => match(node, selector));
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }
  }
  const editor = () =>
    new Node(
      "div",
      { role: "textbox", contenteditable: "true", "aria-label": "Post text" },
      "\n",
    );
  const foreground = editor(),
    background = editor();
  background.text = "Unrelated background draft";
  const foregroundButton = new Node("button", {}, "回复"),
    backgroundButton = new Node("button", {}, "回复");
  const quote = new Node(
    "div",
    { "data-testid": "tweetText" },
    truncated ? bodyText.slice(0, 45) : bodyText,
  );
  const more = new Node("button", {}, "显示更多");
  const makeDialog = (edit = foreground) =>
    new Node("div", { role: "dialog" }, "", [
      new Node("a", { href: "/Peer/status/123" }),
      edit === foreground
        ? quote
        : new Node("div", { "data-testid": "tweetText" }, quote.text),
      new Node("span", {}, "回复 @Peer"),
      edit,
      edit === foreground ? foregroundButton : new Node("button", {}, "回复"),
      ...(truncated && edit === foreground ? [more] : []),
    ]);
  const inner = makeDialog();
  if (twoEditors) {
    const other = editor();
    inner.children.push(other);
    other.parentElement = inner;
  }
  const outer = nested
    ? new Node("div", { role: "dialog" }, "", [inner])
    : inner;
  const articleButton = new Node("button", {}, "1 回复。回复");
  const article = new Node("article", { role: "article" }, "", [
    new Node("a", { href: "/Peer/status/123" }),
    articleButton,
  ]);
  const main = new Node("main", { role: "main" }, "", [
    article,
    background,
    backgroundButton,
  ]);
  const body = new Node("body", {}, "", [
    new Node("a", { href: "/Writer", "aria-label": "个人资料" }, "个人资料"),
    main,
    outer,
  ]);
  if (duplicate) {
    const other = makeDialog(editor());
    body.children.push(other);
    other.parentElement = body;
  }
  if (inline) {
    const recipient = inner.children.find((node) => node.tagName === "SPAN");
    inner.children = [];
    main.children = [article, quote, recipient, foreground, foregroundButton];
    for (const child of main.children) child.parentElement = main;
    body.children.push(background, backgroundButton);
    background.parentElement = body;
    backgroundButton.parentElement = body;
  }
  const page = () =>
    !inline && state.opened && !state.closed
      ? "https://x.com/compose/post"
      : "https://x.com/Peer/status/123";
  const document = {
    body,
    documentElement: body,
    visibilityState: "visible",
    querySelectorAll: (selector) =>
      all(body).filter((node) => match(node, selector)),
    querySelector: (selector) =>
      all(body).find((node) => match(node, selector)) ?? null,
  };
  const location = {
    get href() {
      return page();
    },
    get pathname() {
      return new URL(page()).pathname;
    },
  };
  const program = runInNewContext("(" + atomicObservationCode + ")", {
    document,
    location,
    Date,
    URL,
  });
  const descendants = (node) => node.children.flatMap(all);
  class Locator {
    constructor(get) {
      this.get = get;
    }
    count() {
      return Promise.resolve(this.get().length);
    }
    first() {
      return new Locator(() => this.get().slice(0, 1));
    }
    filter(options) {
      return new Locator(() =>
        this.get().filter(
          (node) =>
            (!options.visible || node.getClientRects().length) &&
            (!options.has ||
              options.has
                .get()
                .some((other) => other !== node && node.contains(other))) &&
            (!options.hasNot ||
              !options.hasNot
                .get()
                .some((other) => other !== node && node.contains(other))) &&
            (!options.hasText || options.hasText.test(node.innerText)),
        ),
      );
    }
    getByRole(role, options = {}) {
      return new Locator(() =>
        this.get()
          .flatMap(descendants)
          .filter((node) => roleMatches(node, role, options)),
      );
    }
    async waitFor(options) {
      if (options.state === "hidden") {
        if (!this.get().length) return;
        throw Error("Timed out waiting for editor to hide");
      }
      if (this.get().length !== 1)
        throw Error("Timed out waiting for unique control");
    }
    async isEnabled() {
      return true;
    }
    async fill(text) {
      const node = this.get()[0];
      if (node === background) state.backgroundFills++;
      else state.fills++;
      node.text = text;
    }
    async click() {
      const node = this.get()[0];
      if (node === articleButton) state.opened = true;
      else if (node === more) {
        quote.text = bodyText;
        state.expansions++;
      } else if (node === foregroundButton) {
        state.submits++;
        foreground.text = "";
        state.closed = true;
      } else if (node === backgroundButton) state.backgroundSubmits++;
    }
    async press() {
      await this.click();
    }
  }
  const roleMatches = (node, role, options = {}) => {
    const actual =
      node.attrs.role ??
      { BUTTON: "button", MAIN: "main", ARTICLE: "article" }[node.tagName];
    const name = node.attrs["aria-label"] ?? node.innerText;
    return (
      actual === role &&
      node.getClientRects().length &&
      (options.name === undefined ||
        (options.name instanceof RegExp
          ? options.name.test(name)
          : options.name === name))
    );
  };
  const tab = {
    url: async () => page(),
    playwright: {
      evaluate: async (_fn, query) =>
        query.view === "posts"
          ? {
              page: page(),
              accountHandle: "Writer",
              alerts: [],
              needsStateCheck: false,
              posts: [
                {
                  id: "123",
                  primary: "/Peer/status/123",
                  author: "Peer",
                  body: bodyText,
                  buttons: [{ label: "1 回复。回复" }],
                },
              ],
            }
          : program(query),
      getByRole: (role, options) =>
        new Locator(() =>
          all(body).filter((node) => roleMatches(node, role, options)),
        ),
      getByText: (text) =>
        new Locator(() =>
          all(body).filter(
            (node) => text.test(node.text) && node.getClientRects().length,
          ),
        ),
      locator: (selector) =>
        new Locator(() =>
          document
            .querySelectorAll(selector)
            .filter((node) => node.getClientRects().length),
        ),
    },
  };
  const browser = createDOMXBrowser(tab);
  const writing = createPlatformWriting({
    browser,
    observed: (query) => browser.observe(query),
    readPost: () => browser.observe({ view: "posts", targetId: "123" }),
  });
  return {
    state,
    browser,
    showModal() {
      inline = false;
      state.opened = true;
    },
    document,
    inner,
    foreground,
    background,
    backgroundButton,
    foregroundButton,
    addIndependentModal() {
      const other = makeDialog(editor());
      body.children.push(other);
      other.parentElement = body;
    },
    removeSubmit() {
      inner.children = inner.children.filter(
        (node) => node !== foregroundButton,
      );
    },
    raw: () => program({ view: "composer" }),
    async submit(beforeSubmit) {
      return writing.submitReply({
        kind: "reply",
        postId: "123",
        text: "Synthetic reviewed reply",
        accountHandle: "Writer",
        activation: "keyboard",
        beforeSubmit,
      });
    },
  };
}
