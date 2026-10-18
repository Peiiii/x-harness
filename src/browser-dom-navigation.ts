import { xURL, handlePattern } from "./platform-rules.js";

import type { DOMDependencies } from "./browser-dom-dependencies.js";
export class DOMNavigation {
  #session!: DOMDependencies["session"];
  #tab!: DOMDependencies["tab"];
  #observe!: DOMDependencies["observe"];
  openQuote!: (command: any) => Promise<any>;
  searchSources!: (command: any) => Promise<void>;
  openExploreRecommendations!: (command: any) => Promise<void>;
  openHomeRecommendations!: (command: any) => Promise<void>;
  waitForFolder!: (command: any) => Promise<void>;
  waitForThreadReplies!: (command: any) => Promise<void>;
  waitForPosts!: (command: any) => Promise<void>;
  openObserved!: (command: any) => Promise<void>;
  refreshPerson!: (command: any) => Promise<void>;
  refreshPosts!: (command: any) => Promise<void>;
  constructor(
    dependencies: Pick<DOMDependencies, "session" | "tab" | "observe">,
  ) {
    const { session, tab, observe } = dependencies;
    this.#session = session;
    this.#tab = tab;
    this.#observe = observe;
    this.openQuote = this.handleOpenQuote.bind(this);
    this.searchSources = this.handleSearchSources.bind(this);
    this.openExploreRecommendations =
      this.handleOpenExploreRecommendations.bind(this);
    this.openHomeRecommendations = async () => {
      this.#session.current = null;
      // Keep the current feed position; the task still freshly checks route/tab.
      if ((await this.#tab.url()) !== "https://x.com/home")
        await this.#tab.goto("https://x.com/home");
    };
    this.waitForFolder = this.handleWaitForFolder.bind(this);
    this.waitForThreadReplies = this.handleWaitForThreadReplies.bind(this);
    this.waitForPosts = this.handleWaitForPosts.bind(this);
    this.openObserved = this.handleOpenObserved.bind(this);
    this.refreshPerson = this.handleRefreshPerson.bind(this);
    this.refreshPosts = this.handleRefreshPosts.bind(this);
  }
  private async handleOpenQuote(command: any) {
    const current = this.#session.current;
    const posts = current?.result?.posts?.filter(
      (p: any) => p.id === command.postId,
    );
    if (
      current?.query?.view !== "posts" ||
      posts?.length !== 1 ||
      posts[0].quoteCards?.length !== 1 ||
      posts[0].quoteCards[0].text !== command.cardText
    )
      throw Error(
        `unique-observed-quote-required:snapshot:${posts?.length ?? 0}:${posts?.[0]?.quoteCards?.length ?? 0}`,
      );
    const article = this.#tab.playwright.getByRole("article").filter({
      has: this.#tab.playwright.locator(
        `a[href=${JSON.stringify(posts[0].primary)}]`,
      ),
    });
    const cards = article
      .locator('[role="link"][tabindex="0"]')
      .filter({ visible: true });
    const count = await cards.count();
    const matches = [];
    for (let i = 0; i < count; i++) {
      const candidate = cards.nth(i);
      if ((await candidate.innerText()) === command.cardText)
        matches.push(candidate);
    }
    if (matches.length !== 1)
      throw Error(
        `unique-observed-quote-required:controls:${count}:matches:${matches.length}`,
      );
    const card = matches[0];
    this.#session.current = null;
    await this.#tab.playwright.expectNavigation(() => card.click(), {
      waitUntil: "commit",
      timeoutMs: 5000,
    });
    const url = await this.#tab.url();
    if (
      !/^\/\w{1,15}\/status\/\d+$/.test(xURL(url).pathname) ||
      url === current.result.page
    )
      throw Error("quote-destination-unconfirmed");
    return { url };
  }
  private async handleSearchSources(command: any) {
    if (
      typeof command.query !== "string" ||
      !command.query.trim() ||
      command.query.length > 300
    )
      throw new Error("需一条有效搜索词");
    this.#session.current = null;
    const destination = `https://x.com/search?q=${encodeURIComponent(command.query)}&src=typed_query&f=live`;
    if (
      typeof this.#tab.url !== "function" ||
      (await this.#tab.url()) !== destination
    )
      await this.#tab.goto(destination);
    return;
  }
  private async handleOpenExploreRecommendations() {
    this.#session.current = null;
    await this.#tab.goto("https://x.com/explore");
  }
  private async handleWaitForFolder(command: any) {
    if (command.selected) {
      await this.#tab.playwright
        .getByRole("heading", { name: command.folder, exact: true })
        .waitFor({ state: "visible", timeoutMs: 5000 });
      return;
    }
    if (command.folderDiscovery) {
      // "All bookmarks" renders before the asynchronously loaded named cards.
      // Wait for any named card inside that specific menu, never an unrelated
      // dialog or arbitrary first clickable control.
      const menu = this.#tab.playwright
        .locator('[role="dialog"],[data-testid="Dropdown"]')
        .filter({ hasText: command.folder });
      await menu
        .locator("span:not(:has(span))", {})
        .filter({
          hasText: /^(?!书签$|Bookmarks$|所有书签$|All bookmarks$).+$/i,
        })
        .first()
        .waitFor({ state: "visible", timeoutMs: 2000 });
      return;
    }
    await this.#tab.playwright
      .getByText(command.folder, { exact: true })
      .waitFor({ state: "visible", timeoutMs: 2000 });
    return;
  }
  private async handleWaitForThreadReplies(command: any) {
    if (
      !Array.isArray(command.excludeIds) ||
      command.excludeIds.some((id: any) => !/^\d+$/.test(id)) ||
      !Number.isInteger(command.timeoutMs) ||
      command.timeoutMs < 1 ||
      command.timeoutMs > 5000
    )
      throw Error("thread-pagination-wait-invalid");
    let articles = this.#tab.playwright.getByRole("article");
    if (command.excludeIds.length)
      articles = articles.filter({
        hasNot: this.#tab.playwright.locator(
          command.excludeIds
            .map((id: string) => `a[href$="/status/${id}"]`)
            .join(","),
        ),
      });
    await articles
      .first()
      .waitFor({ state: "visible", timeoutMs: command.timeoutMs });
  }
  private async handleWaitForPosts(command: any) {
    if (command.ancestorHandle) {
      if (
        !handlePattern.test(command.ancestorHandle) ||
        !/^\d+$/.test(command.targetId)
      )
        throw Error("incoming-ancestor-wait-target-invalid");
      await this.#tab.playwright
        .getByRole("article")
        .filter({
          has: this.#tab.playwright.locator(
            `a[href^=${JSON.stringify("/" + command.ancestorHandle + "/status/")}]`,
          ),
          hasNot: this.#tab.playwright.locator(
            `a[href$=${JSON.stringify("/status/" + command.targetId)}]`,
          ),
        })
        .first()
        .waitFor({ state: "visible", timeoutMs: 5000 });
      return;
    }
    if (command.excludeIds) {
      if (
        !Array.isArray(command.excludeIds) ||
        command.excludeIds.some((id: any) => !/^\d+$/.test(id))
      )
        throw Error("source-pagination-wait-ids-invalid");
      let articles = this.#tab.playwright.getByRole("article");
      if (command.excludeIds.length)
        articles = articles.filter({
          hasNot: this.#tab.playwright.locator(
            command.excludeIds
              .map((id: string) => `a[href$="/status/${id}"]`)
              .join(","),
          ),
        });
      await articles.first().waitFor({ state: "visible", timeoutMs: 5000 });
      return;
    }
    const offset = command.offset ?? 0;
    if (!Number.isInteger(offset) || offset < 0)
      throw Error("帖子等待窗口须为非负整数offset");
    const articles = this.#tab.playwright.getByRole("article");
    await (offset ? articles.nth(offset) : articles.first()).waitFor({
      state: "visible",
      timeoutMs: 5000,
    });
    return;
  }
  private async handleOpenObserved(command: any) {
    xURL(command.url);
    if (!command.evidenceRef) throw new Error("导航缺已观察证据");
    // A direct adapter caller must also preserve a page already at the target.
    // Explicit recovery uses forceNavigation; durable verification uses refreshPerson.
    if (
      !command.forceNavigation &&
      typeof this.#tab.url === "function" &&
      (await this.#tab.url()) === xURL(command.url).href
    ) {
      if (command.view === "person")
        await this.handleWaitProfileContent(
          this.#tab.playwright.locator('[data-testid="UserName"]'),
          command.url,
        );
      else if (command.view === "posts")
        await this.waitObservedPost(command.url);
      return;
    }
    const originalPage =
      typeof this.#tab.url === "function"
        ? await this.#tab.url()
        : this.#session.current?.result?.page;
    this.#session.replyBinding = null;
    this.#session.current = null;
    // Keep the loaded X client when the exact observed permalink is already visible.
    // An ambiguous/missing link retains the existing navigation path, never an arbitrary click.
    const path = xURL(command.url).pathname + xURL(command.url).search;
    let link: any;
    if (
      !command.forceNavigation &&
      command.view !== "posts" &&
      typeof this.#tab.playwright?.locator === "function"
    ) {
      link = this.#tab.playwright
        .locator(`a[href=${JSON.stringify(path)}]`)
        .filter({ visible: true });
      if (
        command.view === "person" &&
        /^[A-Za-z0-9_]{1,15}$/.test(command.handle ?? "") &&
        (await link.count()) > 1
      ) {
        // Avatar and name often share a profile href. Use the exact observed
        // handle token to select the name link, never the arbitrary first match.
        const named = link.filter({
          hasText: new RegExp(`@${command.handle}(?![A-Za-z0-9_])`, "i"),
        });
        if ((await named.count()) === 1) link = named;
      }
    }
    const clickedLink = link && (await link.count()) === 1;
    try {
      if (clickedLink) await link.click();
      else await this.#tab.goto(command.url);
      await this.#tab.playwright.waitForURL(command.url, {
        timeoutMs: command.view === "posts" ? 15000 : 5000,
        ...(command.view === "posts" ? { waitUntil: "commit" as const } : {}),
      });
    } catch (error: unknown) {
      if (
        !/Timed out waiting for URL/.test(
          error instanceof Error ? error.message : "",
        )
      )
        throw error;
      const check = await this.#observe({ view: "account", limit: 1 });
      // Some hosts time out a URL wait even after the exact route committed.
      // Fresh route evidence may continue to content readiness, never acceptance.
      if (
        (command.view === "posts" ||
          (command.view === "person" && !check.needsStateCheck)) &&
        check.page === command.url &&
        !check.alerts?.length
      ) {
        // Exact target content readiness below remains mandatory while loading.
      } else {
        if (
          !clickedLink ||
          !originalPage ||
          check.page !== originalPage ||
          check.needsStateCheck ||
          check.alerts?.length
        )
          throw error;
        await this.#tab.goto(command.url);
        await this.waitFallbackRoute(command);
      }
    }
    if (command.view === "person") {
      // Profile readiness belongs to profile content; self profiles have no Follow button.
      await this.handleWaitProfileContent(
        this.#tab.playwright.locator('[data-testid="UserName"]'),
        command.url,
      );
    } else if (command.view === "people") {
      await this.#tab.playwright
        .locator('main [data-testid="primaryColumn"] [data-testid="UserCell"]')
        .first()
        .waitFor({ state: "visible", timeoutMs: 5000 });
    } else if (command.view === "composer") {
      await this.#tab.playwright
        .getByRole("textbox", { name: /^(帖子文本|Post text)$/i })
        .waitFor({ state: "visible", timeoutMs: 5000 });
    } else if (command.view === "posts") {
      await this.waitObservedPost(command.url);
    }
    return;
  }
  private async waitObservedPost(url: string) {
    // URL commit alone is not content readiness, including same-page reads.
    const path = xURL(url).pathname + xURL(url).search;
    const articles = this.#tab.playwright.getByRole("article");
    const detail = /^\/\w{1,15}\/status\/\d+$/.test(path)
      ? articles.filter({
          has: this.#tab.playwright.locator(
            `a[href=${JSON.stringify(path)}],a[href=${JSON.stringify(path + "/history")}]`,
          ),
        })
      : articles;
    await this.handleWaitTargetContent(detail.first(), url);
  }
  private async waitFallbackRoute(command: any) {
    try {
      await this.#tab.playwright.waitForURL(command.url, {
        timeoutMs: command.view === "posts" ? 15000 : 5000,
        ...(command.view === "posts" ? { waitUntil: "commit" as const } : {}),
      });
    } catch (error: any) {
      if (
        !["posts", "person"].includes(command.view) ||
        !/Timed out waiting for URL/.test(error.message)
      )
        throw error;
      const check = await this.#observe({ view: "account", limit: 1 });
      if (
        check.page !== command.url ||
        check.alerts?.length ||
        (command.view === "person" && check.needsStateCheck)
      )
        throw error;
      // Only a committed exact route is recovered; exact content readiness still follows.
    }
  }
  private async handleWaitProfileContent(target: any, url: string) {
    try {
      await this.handleWaitTargetContent(target, url);
      return;
    } catch (error: any) {
      if (!/timed out|timeout|deadline exceeded/i.test(error.message))
        throw error;
      const check = await this.#observe({ view: "account", limit: 1 });
      if (check.page !== url || check.alerts?.length)
        throw Error("target-readiness-route-or-alert", { cause: error });
      // A loaded X error view does not become a profile by waiting longer.
      // Reload the confirmed document once; same-URL navigation may be inert.
      // This is read-only recovery, never another Follow activation.
      this.#session.current = null;
      await this.#tab.reload();
      await this.handleWaitTargetContent(target, url);
    }
  }
  private async handleWaitTargetContent(detail: any, url: string) {
    const deadline = Date.now() + 15000;
    for (let attempt = 0; attempt < 4; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw Error("target-content-readiness-timeout");
      try {
        await detail.waitFor({
          state: "visible",
          timeoutMs: Math.min(5000, remaining),
        });
        return;
      } catch (error: any) {
        if (
          !/timed out|timeout|deadline exceeded/i.test(error.message) ||
          attempt === 3 ||
          Date.now() >= deadline
        )
          throw error;
        const check = await this.#observe({ view: "account", limit: 1 });
        if (check.page !== url || check.alerts?.length)
          throw Error("target-readiness-route-or-alert", { cause: error });
      }
    }
  }
  private async handleRefreshPerson(command: any) {
    const at = xURL(await this.#tab.url());
    this.#session.replyBinding = null;
    if (
      at.href !== xURL(command.url).href ||
      at.pathname.toLowerCase() !== `/${command.handle}`.toLowerCase()
    )
      throw new Error("持久核验页面不匹配");
    this.#session.current = null;
    // Let the actual UI request settle before reloading; optimistic Following is not durable proof.
    let idleTimedOut = false;
    try {
      await this.#tab.playwright.waitForLoadState({
        state: "networkidle",
        timeoutMs: 8000,
      });
    } catch (error: any) {
      if (!/Timed out waiting for networkidle/i.test(error.message ?? ""))
        throw error;
      // Long-lived X requests can prevent idle; the following reload still
      // must expose the target relationship before any fresh observation.
      idleTimedOut = true;
    }
    await this.#tab.reload();
    await this.handleWaitProfileContent(
      this.#tab.playwright.getByRole("button", {
        name: new RegExp(
          `^(?:正在关注|取消关注|关注|回关) @${command.handle}$`,
          "i",
        ),
      }),
      command.url,
    );
    if (idleTimedOut)
      this.#session.refreshNotice =
        "networkidle超时，已沿真实reload与目标关系控件恢复核验";
    return;
  }
  private async handleRefreshPosts(command: any) {
    this.#session.replyBinding = null;
    if (
      !command.evidenceRef ||
      xURL(await this.#tab.url()).href !== xURL(command.url).href
    )
      throw new Error("公开核验页面不匹配");
    this.#session.current = null;
    await this.#tab.reload();
    // Native observation settles the real loading transition when the tab exposes it.
    if (typeof this.#tab.getAXState === "function")
      await this.#tab.getAXState({ emit: false });
    await this.handleWaitTargetContent(
      this.#tab.playwright.getByRole("article").first(),
      command.url,
    );
    return;
  }
}
export function createDOMNavigation(
  ...args: ConstructorParameters<typeof DOMNavigation>
) {
  return new DOMNavigation(...args);
}
