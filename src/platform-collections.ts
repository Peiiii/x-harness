import type { PlatformDependencies } from "./platform-dependencies.js";
import { xURL, source } from "./platform-rules.js";
export class PlatformCollections {
  #ready!: PlatformDependencies["ready"];
  #observed!: PlatformDependencies["observed"];
  #browser!: PlatformDependencies["browser"];
  #choose!: PlatformDependencies["choose"];
  collectSources!: ({ processedIds, maxPages, limit }?: any) => Promise<any>;
  readCreator!: (args: import("./types.js").CreatorOptions) => Promise<any>;
  readBookmarks!: ({ folder, ...window }?: any) => Promise<any>;
  searchSources!: ({
    query,
    limit,
    maxPages,
    processedIds,
  }?: any) => Promise<any>;
  constructor(
    dependencies: Pick<
      PlatformDependencies,
      "ready" | "observed" | "browser" | "choose"
    >,
  ) {
    const { ready, observed, browser, choose } = dependencies;
    this.#ready = ready;
    this.#observed = observed;
    this.#browser = browser;
    this.#choose = choose;
    this.collectSources = this.handleCollectSources.bind(this);
    this.readCreator = this.handleReadCreator.bind(this);
    this.readBookmarks = this.handleReadBookmarks.bind(this);
    this.searchSources = this.handleSearchSources.bind(this);
  }
  private async handleCollectSources({
    processedIds = [],
    maxPages = 3,
    limit = 1,
  }: any = {}): Promise<any> {
    if (
      !Array.isArray(processedIds) ||
      !Number.isInteger(maxPages) ||
      maxPages < 1 ||
      maxPages > 10 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 5
    )
      throw new Error("来源窗口须为1–5，页面上限1–10及已处理ID数组");
    const seen = new Set(processedIds),
      sources: any[] = [],
      missing: any[] = [];
    let last: any,
      previousIds = "",
      offset = 0,
      firstDOMId: any;
    for (let page = 0; page < maxPages && sources.length < limit; page++) {
      last = await this.#ready({ view: "posts", offset, limit: 5 });
      if (page === 0) firstDOMId = last.posts?.[0]?.id;
      if (last.needsStateCheck || last.alerts?.length)
        return {
          ...last,
          sources,
          complete: false,
          missing: ["source-page-unconfirmed"],
        };
      if (
        offset &&
        firstDOMId &&
        last.firstRenderedId &&
        last.firstRenderedId !== firstDOMId
      ) {
        offset = 0;
        firstDOMId = last.firstRenderedId;
        last = await this.#ready({ view: "posts", offset, limit: 5 });
        if (last.needsStateCheck || last.alerts?.length)
          return {
            ...last,
            sources,
            complete: false,
            missing: ["source-page-unconfirmed"],
          };
      }
      if (offset && !last.posts?.length) {
        missing.push("source-window-not-yet-rendered");
        break;
      }
      const ids = (last.posts ?? []).map((p: any) => p.id).join(",");
      if (page && ids === previousIds) {
        missing.push("pagination-did-not-advance");
        break;
      }
      previousIds = ids;
      for (const candidate of last.posts ?? []) {
        if (!candidate.id || seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        let post = candidate;
        if (candidate.needsExpansion) {
          const target = await this.#observed({
            view: "posts",
            targetId: candidate.id,
            limit: 1,
          });
          if (target.posts?.length !== 1) {
            missing.push("expansion-target-unconfirmed");
            continue;
          }
          await this.#browser.act({
            operation: "expandPost",
            postId: candidate.id,
          });
          const expanded = await this.#ready({
            view: "posts",
            targetId: candidate.id,
            limit: 1,
          });
          if (expanded.needsStateCheck || expanded.alerts?.length)
            return {
              ...expanded,
              sources,
              complete: false,
              missing: ["expanded-source-unconfirmed"],
            };
          post = expanded.posts?.[0];
        }
        if (
          !post ||
          post.needsExpansion ||
          !post.body ||
          !post.author ||
          !Number.isFinite(Date.parse(post.datetime))
        ) {
          missing.push(`incomplete-source:${candidate.id}`);
          continue;
        }
        sources.push(source(post, last.page));
        if (sources.length >= limit) break;
      }
      if (sources.length < limit && page + 1 < maxPages) {
        // Expansion narrowed the semantic window; restore the list before scrolling.
        last = await this.#observed({ view: "posts", offset, limit: 5 });
        if (last.moreInDOM) offset += 5;
        else {
          await this.#browser.act({ operation: "nextPosts" });
          const scrolled = await this.#ready({ view: "posts", limit: 5 });
          if (scrolled.needsStateCheck || scrolled.alerts?.length)
            return {
              ...scrolled,
              sources,
              complete: false,
              missing: ["source-page-unconfirmed"],
            };
          // Scroll and lazy loading settle asynchronously. Existing cards are
          // already visible, so waiting for the first article proves nothing.
          try {
            await this.#browser.act({
              operation: "waitForPosts",
              excludeIds: [...seen],
            });
          } catch (error: any) {
            if (!/timed out|timeout/i.test(error.message)) throw error;
          }
          const advanced = await this.#ready({ view: "posts", limit: 5 });
          // Retained DOM prefixes include a partial final window too; skip
          // exactly the consumed cards, while virtualized replacements restart.
          offset =
            firstDOMId && advanced.posts?.[0]?.id === firstDOMId
              ? offset + (last.posts?.length ?? 0)
              : 0;
          firstDOMId = advanced.posts?.[0]?.id;
        }
      }
    }
    return {
      page: last?.page,
      accountHandle: last?.accountHandle,
      observedAt: last?.observedAt,
      fresh: true,
      sources,
      complete: sources.length >= limit,
      pageComplete: false,
      missing:
        sources.length >= limit
          ? []
          : [...new Set([...missing, "bounded-source-window-exhausted"])],
    };
  }
  private async handleReadCreator(args: import("./types.js").CreatorOptions) {
    if (typeof this.#browser.collectCreator !== "function")
      return {
        status: "needsCapability",
        complete: false,
        missing: ["browser.collectCreator"],
      };
    const value = await this.#browser.collectCreator(args);
    const absent = [
      ...new Set([
        ...(value.missing ?? []),
        ...(value.profile?.alerts ?? []),
        ...(value.meta?.missing ?? []),
      ]),
    ];
    return {
      ...value,
      sources: value.posts,
      page: `https://x.com/${args.handle}`,
      pageComplete: false,
      complete:
        value.complete === true && !absent.length && !value.alerts?.length,
      missing: absent,
    };
  }
  private async handleReadBookmarks({
    folder,
    discoverOnly = false,
    ...window
  }: any = {}): Promise<any> {
    if (!discoverOnly && (typeof folder !== "string" || !folder.trim()))
      throw new Error("需指定收藏文件夹；不以全部书签冒充命名文件夹");
    let nav = await this.#ready({
      view: "navigation",
      targetLabel: folder,
      bookmarkNavigation: true,
    });
    if (discoverOnly && nav.bookmarkFolders?.length)
      return this.bookmarkDiscovery(nav);
    const bookmark = (c: any) => /^(书签|收藏|Bookmarks)$/i.test(c.label);
    const matching = (nav.controls ?? []).filter(bookmark);
    const entered = await this.#choose(nav, bookmark, {
      activateSelected: true,
    });
    const openedTab =
      entered && matching.length === 1 && matching[0].role === "tab";
    if (
      !entered &&
      !(await this.#choose(nav, (c: any) => /^(历史|History)$/i.test(c.label)))
    ) {
      if (
        await this.#choose(nav, (c: any) =>
          /^(更多菜单项|More menu items)$/i.test(c.label),
        )
      ) {
        nav = await this.#ready({ view: "menu" });
        if (!(await this.#choose(nav, bookmark))) {
          if (nav.items?.length)
            await this.#browser.act({ operation: "dismissMenu" });
          nav = await this.#ready({
            view: "navigation",
            targetLabel: folder,
            bookmarkNavigation: true,
          });
          if (
            !(await this.#choose(nav, (c: any) =>
              /^(历史|History)$/i.test(c.label),
            ))
          )
            return {
              status: "needsCapability",
              owner: "scripts/x-harness-browser.mjs",
              missing: ["bookmarks-entry-not-observed"],
            };
        }
      } else if (
        !(await this.#choose(nav, (c: any) =>
          /^(历史|History)$/i.test(c.label),
        ))
      )
        return {
          status: "needsCapability",
          owner: "scripts/x-harness-browser.mjs",
          missing: ["bookmarks-entry-not-observed"],
        };
    }
    nav = await this.#ready({
      view: "navigation",
      targetLabel: folder,
      bookmarkNavigation: true,
    });
    if (
      discoverOnly &&
      !(nav.controls ?? []).some((c: any) => c.role === "tab")
    ) {
      await this.waitForBookmarkLabel(nav, "书签", "Bookmarks");
      nav = await this.#ready({ view: "navigation", bookmarkNavigation: true });
    }
    const tabs = (nav.controls ?? []).filter(
      (c: any) =>
        c.role === "tab" &&
        (bookmark(c) ||
          (discoverOnly &&
            /\/i\/(?:history|bookmarks)(?:\/|$)/.test(nav.page ?? "") &&
            c.selected &&
            !/^(喜欢|Likes)$/i.test(c.label))),
    );
    if (
      !openedTab &&
      tabs.length === 1 &&
      (!tabs[0].selected ||
        !(nav.controls ?? []).some(
          (c: any) => c.label.split("\n")[0] === folder,
        ))
    ) {
      await this.#choose(nav, (c: any) => c === tabs[0], {
        activateSelected: true,
      });
      nav = await this.#ready({
        view: "navigation",
        targetLabel: folder,
        bookmarkNavigation: true,
      });
    }
    if (discoverOnly) {
      if (!nav.bookmarkFolders?.length) {
        await this.waitForBookmarkLabel(nav, "所有书签", "All bookmarks", true);
        nav = await this.#ready({
          view: "navigation",
          bookmarkNavigation: true,
        });
      }
      return this.bookmarkDiscovery(nav);
    }
    if (
      !(nav.controls ?? []).some((c: any) => c.label.split("\n")[0] === folder)
    ) {
      try {
        await this.#browser.act({
          operation: "waitForFolder",
          folder,
        });
      } catch (error: any) {
        if (!/timed out|timeout/i.test(error.message)) throw error;
      }
      nav = await this.#ready({
        view: "navigation",
        targetLabel: folder,
        bookmarkNavigation: true,
      });
    }
    if (
      !(await this.#choose(nav, (c: any) => c.label.split("\n")[0] === folder))
    )
      return {
        status: "needsCapability",
        owner: "scripts/x-harness-browser.mjs",
        page: nav.page,
        missing: ["named-bookmark-folder-not-observed"],
        folder,
        controls: nav.controls,
      };
    const selected = await this.#ready({ view: "navigation" });
    if (selected.page === nav.page && !selected.headings?.includes(folder))
      return {
        status: "needsDecision",
        complete: false,
        missing: ["folder-selection-unconfirmed"],
        folder,
        page: selected.page,
      };
    const value = await this.handleCollectSources(window);
    return {
      ...value,
      folder,
      folderEvidence: {
        entryPage: nav.page,
        selectedPage: selected.page,
        name: folder,
      },
    };
  }
  private bookmarkDiscovery(nav: any) {
    const folders = nav.bookmarkFolders ?? [];
    return {
      page: nav.page,
      accountHandle: nav.accountHandle,
      observedAt: nav.observedAt,
      fresh: true,
      complete: folders.length > 0 && !nav.alerts?.length,
      pageComplete: false,
      folders,
      missing: folders.length ? [] : ["bookmark-folder-menu-unconfirmed"],
    };
  }
  private async waitForBookmarkLabel(
    nav: any,
    chinese: string,
    english: string,
    folderDiscovery = false,
  ) {
    const folder = (nav.controls ?? []).some((c: any) =>
      /^(History|Bookmarks)$/i.test(c.label),
    )
      ? english
      : chinese;
    try {
      await this.#browser.act({
        operation: "waitForFolder",
        folder,
        folderDiscovery,
      });
    } catch (error: any) {
      if (!/timed out|timeout/i.test(error.message)) throw error;
    }
  }
  private async handleSearchSources({
    query,
    limit = 3,
    maxPages = 1,
    processedIds = [],
  }: any = {}): Promise<any> {
    await this.#browser.act({ operation: "searchSources", query });
    const value = await this.handleCollectSources({
      limit,
      maxPages,
      processedIds,
    });
    if (
      !value.page ||
      xURL(value.page).pathname !== "/search" ||
      xURL(value.page).searchParams.get("q") !== query
    )
      return {
        ...value,
        complete: false,
        missing: ["search-query-unconfirmed"],
      };
    return { ...value, query };
  }
}
export function createPlatformCollections(
  ...args: ConstructorParameters<typeof PlatformCollections>
) {
  return new PlatformCollections(...args);
}
