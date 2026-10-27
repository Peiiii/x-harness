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
    const textControl =
      typeof card.locator === "function"
        ? card.locator('[data-testid="tweetText"]').filter({ visible: true })
        : null;
    const target =
      textControl &&
      (await textControl.count()) === 1 &&
      command.cardText.includes(await textControl.innerText())
        ? textControl
        : card;
    const destinations = new Set<string>();
    if (typeof card.locator === "function") {
      const links = card.locator('a[href*="/status/"]');
      for (let i = 0; i < (await links.count()); i++) {
        const href = await links.nth(i).getAttribute("href");
        if (!href) continue;
        const parsed = xURL(new URL(href, current.result.page).href);
        const match = parsed.pathname.match(
          /^\/(\w{1,15})\/status\/(\d+)(?:\/photo\/\d+)?$/,
        );
        if (match && match[2] !== command.postId)
          destinations.add(`https://x.com/${match[1]}/status/${match[2]}`);
      }
    }
    this.#session.current = null;
    // Prefer the unique permalink observed inside this exact card. Text clicks can
    // hit an embedded self-link or image instead of the enclosing quoted source.
    if (command.preferClientNavigation) {
      if (
        destinations.size !== 1 ||
        typeof card.press !== "function" ||
        typeof this.#tab.back !== "function"
      )
        throw Error("quote-client-navigation-unavailable");
      await card.press("Enter");
      this.#session.quoteClientReturn = {
        parent: current.result.page,
        source: [...destinations][0],
      };
    } else if (destinations.size === 1)
      await this.#tab.goto([...destinations][0]);
    else
      await this.#tab.playwright.expectNavigation(() => target.click(), {
        waitUntil: "commit",
        timeoutMs: 5000,
      });
    if (
      destinations.size === 1 &&
      typeof this.#tab.playwright.waitForURL === "function"
    )
      await this.#tab.playwright.waitForURL([...destinations][0], {
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
    const current =
      typeof this.#tab.url === "function" ? await this.#tab.url() : null;
    if (current && this.isSearchRoute(current, command.query, true)) return;
    const check = await this.#observe({
      view: "navigation",
      timelineNavigation: true,
      limit: 1,
    });
    if (check.alerts?.length || check.needsStateCheck)
      throw Error("search-client-session-unconfirmed");
    const input = this.#tab.playwright
      ?.locator?.('input[data-testid="SearchBox_Search_Input"]')
      ?.filter({ visible: true });
    const count = input ? await input.count() : 0;
    if (count > 1) throw Error("search-input-ambiguous");
    if (
      count !== 1 ||
      typeof input.fill !== "function" ||
      typeof input.press !== "function"
    ) {
      await this.#tab.goto(destination);
      return;
    }
    await input.fill(command.query);
    await input.press("Enter");
    await this.waitSearchRoute(command.query, false);
    if (!this.isSearchRoute(await this.#tab.url(), command.query, true)) {
      const latest = this.#tab.playwright
        .getByRole("tab", { name: /^(最新|Latest)$/i })
        .filter({ visible: true });
      await latest.waitFor({ state: "visible", timeoutMs: 5000 });
      if ((await latest.count()) !== 1)
        throw Error("search-latest-tab-unconfirmed");
      await latest.click();
      await this.waitSearchRoute(command.query, true);
    }
  }
  private isSearchRoute(page: string, query: string, latest: boolean) {
    try {
      const url = xURL(page);
      return (
        url.pathname === "/search" &&
        url.searchParams.get("q") === query &&
        (!latest || url.searchParams.get("f") === "live")
      );
    } catch {
      return false;
    }
  }
  private async waitSearchRoute(query: string, latest: boolean) {
    try {
      await this.#tab.playwright.waitForURL(
        latest
          ? "https://x.com/search?*f=live*"
          : `https://x.com/search?q=${encodeURIComponent(query)}*`,
        { timeoutMs: 5000 },
      );
    } catch (error: unknown) {
      if (
        !/timed out|timeout|deadline exceeded/i.test(
          error instanceof Error ? error.message : String(error),
        )
      )
        throw error;
      // A host wait may time out after the client route already committed.
      // Only the exact live route can proceed; never retry via document navigation.
    }
    if (!this.isSearchRoute(await this.#tab.url(), query, latest))
      throw Error("search-client-route-unconfirmed");
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
  private async handleQuoteClientReturn(command: any) {
    const route = this.#session.quoteClientReturn;
    if (
      !command.preferObservedLink ||
      !route ||
      route.parent !== xURL(command.url).href ||
      (await this.#tab.url()) !== route.source
    )
      return false;
    this.#session.quoteClientReturn = undefined;
    this.#session.current = null;
    await this.#tab.back();
    if (typeof this.#tab.getAXState === "function")
      await this.#tab.getAXState({ emit: false });
    if ((await this.#tab.url()) !== command.url) {
      const link = this.#tab.playwright
        .locator(`a[href=${JSON.stringify(xURL(command.url).pathname)}]`)
        .filter({ visible: true });
      if ((await link.count()) !== 1)
        throw Error("quote-client-return-link-unavailable");
      await link.click();
    }
    await this.#tab.playwright.waitForURL(command.url, { timeoutMs: 5000 });
    await this.waitObservedPost(command.url);
    return true;
  }
  private async handleOpenObserved(command: any) {
    xURL(command.url);
    if (!command.evidenceRef) throw new Error("导航缺已观察证据");
    // A direct adapter caller must also preserve a page already at the target.
    // Explicit recovery uses forceNavigation; durable verification uses refreshPerson.
    const originalPage =
      typeof this.#tab.url === "function"
        ? await this.#tab.url()
        : this.#session.current?.result?.page;
    if (
      !command.forceNavigation &&
      typeof this.#tab.url === "function" &&
      originalPage === xURL(command.url).href
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
    if (await this.handleQuoteClientReturn(command)) return;
    this.#session.replyBinding = null;
    this.#session.current = null;
    // Keep the loaded X client when the exact observed permalink is already visible.
    // An ambiguous/missing link retains the existing navigation path, never an arbitrary click.
    const path = xURL(command.url).pathname + xURL(command.url).search;
    let link: any,
      linkCount = 0;
    if (
      !command.forceNavigation &&
      (command.view !== "posts" ||
        ((command.preferObservedLink === true ||
          command.preferClientNavigation === true) &&
          /^\/[A-Za-z0-9_]{1,15}\/status\/\d+$/.test(
            xURL(command.url).pathname,
          ) &&
          !xURL(command.url).search &&
          !xURL(command.url).hash) ||
        (/^\/[A-Za-z0-9_]{1,15}\/?$/.test(xURL(command.url).pathname) &&
          !xURL(command.url).search &&
          !xURL(command.url).hash)) &&
      typeof this.#tab.playwright?.locator === "function"
    ) {
      link = this.#tab.playwright
        .locator(`a[href=${JSON.stringify(path)}]`)
        .filter({ visible: true });
      linkCount = await link.count();
      if (
        command.view === "posts" &&
        /^\/[A-Za-z0-9_]{1,15}\/?$/.test(xURL(command.url).pathname) &&
        linkCount > 1
      ) {
        // Self-profile avatar and navigation links share the same href. Only
        // the unique visible profile navigation anchor is safe to disambiguate.
        const navigation = this.#tab.playwright
          .locator(
            `[data-testid="AppTabBar_Profile_Link"][href=${JSON.stringify(path)}]`,
          )
          .filter({ visible: true });
        if ((await navigation.count()) === 1) {
          link = navigation;
          linkCount = 1;
        }
      }
      if (
        command.view === "person" &&
        /^[A-Za-z0-9_]{1,15}$/.test(command.handle ?? "") &&
        linkCount > 1
      ) {
        // Avatar and name often share a profile href. Use the exact observed
        // handle token to select the name link, never the arbitrary first match.
        const named = link.filter({
          hasText: new RegExp(`@${command.handle}(?![A-Za-z0-9_])`, "i"),
        });
        if ((await named.count()) === 1) {
          link = named;
          linkCount = 1;
        }
      }
    }
    const clickedLink = link && linkCount === 1;
    if (command.preferObservedLink && !clickedLink)
      throw Error("original-receipt-link-not-currently-visible");
    try {
      if (clickedLink) await link.click();
      else await this.#tab.goto(command.url);
      // Live URL readiness does not replace content or caller account checks.
      if (
        command.view !== "composer" ||
        typeof this.#tab.url !== "function" ||
        (await this.#tab.url()) !== command.url
      )
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
          command.preferObservedLink ||
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
  private async rejectUnavailableProfile(url: string) {
    const empty = this.#tab.playwright.locator(
      '[data-testid="primaryColumn"] [data-testid="empty_state_header_text"]',
    );
    const name = this.#tab.playwright.locator('[data-testid="UserName"]');
    // A visible profile name takes precedence over a normal empty timeline.
    // Older adapters without visibility observation retain bounded readiness.
    if (
      typeof empty.isVisible !== "function" ||
      typeof name.isVisible !== "function" ||
      !(await empty.isVisible()) ||
      (await name.isVisible())
    )
      return;
    const check = await this.#observe({ view: "account", limit: 1 });
    if (check.page !== url || check.alerts?.length)
      throw Error("target-readiness-route-or-alert");
    throw Error("profile-content-unavailable");
  }
  private async handleWaitProfileContent(target: any, url: string) {
    await this.rejectUnavailableProfile(url);
    try {
      await this.handleWaitTargetContent(target, url);
      return;
    } catch (error: any) {
      if (!/timed out|timeout|deadline exceeded/i.test(error.message))
        throw error;
      await this.rejectUnavailableProfile(url);
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
    const target = xURL(command.url);
    const profileTab =
      !command.forceNavigation &&
      /^\/[A-Za-z0-9_]{1,15}\/?$/.test(target.pathname) &&
      !target.search &&
      !target.hash &&
      typeof this.#tab.playwright?.locator === "function"
        ? this.#tab.playwright
            .locator(`[role="tab"][href=${JSON.stringify(target.pathname)}]`)
            .filter({ visible: true })
        : undefined;
    const alternateTab =
      profileTab && typeof this.#tab.playwright?.locator === "function"
        ? this.#tab.playwright
            .locator(
              `[role="tab"][href=${JSON.stringify(target.pathname.replace(/\/$/, "") + "/with_replies")}]`,
            )
            .filter({ visible: true })
        : undefined;
    if (
      profileTab &&
      alternateTab &&
      (await profileTab.count()) === 1 &&
      (await alternateTab.count()) === 1 &&
      (await profileTab.getAttribute("aria-selected")) === "true"
    ) {
      // The selected Posts tab opens a menu in current X. Switch to the exact
      // observed adjacent timeline and back instead of clicking that menu or
      // bootstrapping Viewer through a full document reload.
      await alternateTab.click();
      await this.#tab.playwright.waitForURL(
        target.origin + target.pathname.replace(/\/$/, "") + "/with_replies",
        { timeoutMs: 5000 },
      );
      await profileTab.click();
      await this.#tab.playwright.waitForURL(command.url, { timeoutMs: 5000 });
    } else {
      await this.#tab.reload();
      if (typeof this.#tab.getAXState === "function")
        await this.#tab.getAXState({ emit: false });
    }
    const articles = this.#tab.playwright.getByRole("article");
    // A pinned card can render before the timeline. Wait for the reviewed
    // candidate when supplied; only the later full observation can verify it.
    await this.handleWaitTargetContent(
      command.expectedText
        ? articles.filter({ hasText: command.expectedText }).first()
        : articles.first(),
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
