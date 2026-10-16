import { missingMethods } from "./browser-common.js";
import type { DOMDependencies } from "./browser-dom-dependencies.js";
export class DOMCapabilities {
  #tab!: DOMDependencies["tab"];
  #nativeSubmit!: DOMDependencies["nativeSubmit"];
  constructor(dependencies: Pick<DOMDependencies, "tab" | "nativeSubmit">) {
    this.capabilities = this.capabilities.bind(this);
    const { tab, nativeSubmit } = dependencies;
    this.#tab = tab;
    this.#nativeSubmit = nativeSubmit;
  }
  public capabilities(operation: any): any {
    const base = missingMethods(this.#tab?.playwright, ["evaluate"]);
    if (["likePostAndComments", "readPostComments"].includes(operation))
      return this.threadLikeCapabilities(base);
    if (operation === "resetPeople")
      return [
        ...base,
        ...missingMethods(this.#tab, ["getAXState", "pressKey"]),
      ];
    if (operation === "readPeople") {
      base.push(
        ...missingMethods(this.#tab, ["goto", "url"]),
        ...missingMethods(this.#tab?.playwright, ["locator", "waitForURL"]),
      );
      if (typeof this.#tab?.playwright?.locator === "function")
        base.push(
          ...missingMethods(
            this.#tab.playwright.locator('[data-testid="UserCell"]'),
            ["count", "filter", "press", "first", "waitFor"],
          ),
        );
      return base;
    }
    if (operation === "openQuote") {
      base.push(
        ...missingMethods(this.#tab, ["url"]),
        ...missingMethods(this.#tab?.playwright, [
          "locator",
          "getByRole",
          "expectNavigation",
        ]),
      );
      if (typeof this.#tab?.playwright?.locator === "function")
        base.push(
          ...missingMethods(this.#tab.playwright.locator("div"), [
            "filter",
            "count",
            "nth",
            "click",
            "innerText",
          ]),
        );
      if (typeof this.#tab?.playwright?.getByRole === "function")
        base.push(
          ...missingMethods(this.#tab.playwright.getByRole("article"), [
            "filter",
            "locator",
          ]),
        );
      return base;
    }
    if (operation === "readCreator") {
      return this.creatorCapabilities(base, operation);
    }
    if (
      [
        "readBookmarks",
        "searchSources",
        "readExploreRecommendations",
        "readHomeRecommendations",
        "readFeedback",
      ].includes(operation)
    ) {
      return this.collectionCapabilities(base, operation);
    }
    if (operation !== "read")
      base.push(
        ...missingMethods(this.#tab?.playwright, ["getByRole"]),
        ...missingMethods(this.#tab, ["goto"]),
      );
    if (
      operation !== "read" &&
      typeof this.#tab?.playwright?.getByRole === "function"
    ) {
      base.push(
        ...missingMethods(this.#tab.playwright.getByRole("button"), [
          "count",
          "click",
        ]),
      );
      if (!["submitFollow", "likePost"].includes(operation))
        base.push(
          ...missingMethods(this.#tab.playwright.getByRole("textbox"), [
            "count",
            "fill",
          ]),
        );
      if (["submitPost", "submitReply"].includes(operation)) {
        base.push(
          ...missingMethods(this.#tab.playwright, [
            "locator",
            "waitForLoadState",
          ]),
        );
        base.push(
          ...missingMethods(this.#tab.playwright.getByRole("button"), [
            "and",
            "waitFor",
          ]),
        );
      }
    }
    if (operation === "refreshPerson" || operation === "refreshPosts") {
      base.push(...missingMethods(this.#tab, ["reload"]));
      base.push(...missingMethods(this.#tab?.playwright, ["waitForLoadState"]));
      if (typeof this.#tab?.playwright?.getByRole === "function")
        base.push(
          ...missingMethods(this.#tab.playwright.getByRole("button"), [
            "waitFor",
          ]),
        );
    }
    if (["openOwnPostMenu", "likePost"].includes(operation)) {
      base.push(...missingMethods(this.#tab?.playwright, ["locator"]));
      if (typeof this.#tab?.playwright?.getByRole === "function")
        base.push(
          ...missingMethods(this.#tab.playwright.getByRole("article"), [
            "filter",
            "getByRole",
          ]),
        );
    }
    if (operation === "submitEditedPost") {
      base.push(...missingMethods(this.#tab?.playwright, ["waitForLoadState"]));
      if (typeof this.#tab?.playwright?.getByRole === "function")
        base.push(
          ...missingMethods(this.#tab.playwright.getByRole("button"), [
            "press",
          ]),
        );
    }
    if (operation === "openQuoteComposer") return this.quoteCapabilities(base);
    if (operation === "attachAssets")
      base.push(
        ...missingMethods(this.#tab?.playwright, [
          "waitForEvent",
          "getByLabel",
          "getByPlaceholder",
        ]),
      );
    if (this.#nativeSubmit && ["submitPost", "submitReply"].includes(operation))
      base.push(...missingMethods(this.#tab, ["getAXState", "click"]));
    return base;
  }
  private threadLikeCapabilities(base: string[]) {
    base.push(
      ...missingMethods(this.#tab, ["goto", "url", "getAXState", "click"]),
    );
    base.push(
      ...missingMethods(this.#tab?.playwright, [
        "locator",
        "getByRole",
        "waitForURL",
      ]),
    );
    if (typeof this.#tab?.playwright?.locator === "function") {
      const article = this.#tab.playwright.locator("article");
      base.push(
        ...missingMethods(article, [
          "filter",
          "count",
          "getByRole",
          "first",
          "waitFor",
        ]),
      );
      if (typeof article.getByRole === "function")
        base.push(
          ...missingMethods(article.getByRole("button"), [
            "count",
            "click",
            "press",
          ]),
        );
    }
    return base;
  }
  private quoteCapabilities(base: string[]) {
    base.push(...missingMethods(this.#tab?.playwright, ["getByTestId"]));
    if (typeof this.#tab?.playwright?.getByTestId === "function")
      base.push(
        ...missingMethods(this.#tab.playwright.getByTestId("attachments"), [
          "getByTestId",
          "waitFor",
        ]),
      );
    base.push(
      ...missingMethods(this.#tab?.playwright, ["locator", "getByRole"]),
    );
    if (typeof this.#tab?.playwright?.getByRole === "function") {
      base.push(
        ...missingMethods(this.#tab.playwright.getByRole("article"), [
          "filter",
          "getByRole",
        ]),
      );
      base.push(
        ...missingMethods(this.#tab.playwright.getByRole("button"), [
          "press",
          "waitFor",
        ]),
      );
    }
    return base;
  }
  private creatorCapabilities(base: string[], operation: string): string[] {
    base.push(
      ...missingMethods(this.#tab, [
        "url",
        "goto",
        "reload",
        "getAXState",
        "scroll",
      ]),
    );
    base.push(...missingMethods(this.#tab.playwright, ["locator"]));
    if (typeof this.#tab.playwright?.locator === "function") {
      const article = this.#tab.playwright.locator("article");
      base.push(...missingMethods(article, ["first", "getByRole"]));
      if (typeof article.first === "function")
        base.push(...missingMethods(article.first(), ["waitFor"]));
      if (typeof article.getByRole === "function")
        base.push(
          ...missingMethods(
            article.getByRole("button", { name: "显示更多", exact: true }),
            ["all"],
          ),
        );
    }
    return base;
  }
  private collectionCapabilities(base: string[], operation: string): string[] {
    base.push(...missingMethods(this.#tab, ["goto"]));
    base.push(
      ...missingMethods(this.#tab?.playwright, ["getByRole", "waitForURL"]),
    );
    if (typeof this.#tab?.playwright?.getByRole === "function")
      base.push(
        ...missingMethods(this.#tab.playwright.getByRole("article"), [
          "first",
          "filter",
          "waitFor",
        ]),
      );
    if (
      operation === "readBookmarks" &&
      typeof this.#tab?.playwright?.locator === "function"
    )
      base.push(
        ...missingMethods(this.#tab.playwright.locator("div"), [
          "locator",
          "filter",
          "first",
          "waitFor",
        ]),
      );
    if (operation !== "readFeedback") {
      base.push(
        ...missingMethods(this.#tab?.playwright, [
          "getByRole",
          "getByText",
          "locator",
          "waitForURL",
        ]),
      );
      if (typeof this.#tab?.playwright?.getByRole === "function")
        base.push(
          ...missingMethods(this.#tab.playwright.getByRole("main"), [
            "count",
            "click",
            "first",
            "waitFor",
          ]),
        );
      if (typeof this.#tab?.playwright?.locator === "function")
        base.push(
          ...missingMethods(this.#tab.playwright.locator("a"), [
            "count",
            "filter",
            "press",
          ]),
        );
      if (typeof this.#tab?.playwright?.getByText === "function")
        base.push(
          ...missingMethods(this.#tab.playwright.getByText(""), ["waitFor"]),
        );
    }
    return base;
  }
}
export function createDOMCapabilities(
  ...args: ConstructorParameters<typeof DOMCapabilities>
) {
  return new DOMCapabilities(...args);
}
