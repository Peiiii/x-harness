import type { PlatformDependencies } from "./platform-dependencies.js";
import { xURL, source, sameHandle, emptySearch } from "./platform-rules.js";

const sourcePageMissing = (value: any) => [
  value.loadError ? "source-load-error" : "source-page-unconfirmed",
];

const recommendationNavigationEvidence = (nav: any) => ({
  page: nav.page,
  headings: (nav.headings ?? []).slice(0, 5),
  tabs: (nav.controls ?? [])
    .filter((control: any) => control.role === "tab")
    .slice(0, 8)
    .map((control: any) => ({
      label: control.label,
      selected: control.selected === true,
    })),
});

export class PlatformCollections {
  #ready!: PlatformDependencies["ready"];
  #observed!: PlatformDependencies["observed"];
  #browser!: PlatformDependencies["browser"];
  #choose!: PlatformDependencies["choose"];
  #sourceCursor?: { page: string; offset: number; firstRenderedId?: string };
  collectSources!: ({ processedIds, maxPages, limit }?: any) => Promise<any>;
  readCreator!: (args: import("./types.js").CreatorOptions) => Promise<any>;
  readBookmarks!: ({ folder, ...window }?: any) => Promise<any>;
  readExploreRecommendations!: (
    args?: import("./types.js").ExploreRecommendationOptions,
  ) => Promise<any>;
  readHomeRecommendations!: (
    args?: import("./types.js").HomeRecommendationOptions,
  ) => Promise<any>;
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
    this.readBookmarks = (args = {}) =>
      this.#browser.collectBookmarks
        ? this.#browser.collectBookmarks(args)
        : this.handleReadBookmarks(args);
    this.searchSources = this.handleSearchSources.bind(this);
    this.readExploreRecommendations = this.handleReadRecommendations.bind(this);
    this.readHomeRecommendations = (args = {}) =>
      this.handleReadRecommendations(args, "home");
  }
  private async handleCollectSources({
    processedIds = [],
    excludedHandles = [],
    maxPages = 3,
    limit = 1,
    resume = false,
  }: any = {}): Promise<any> {
    this.validateSourceWindow(processedIds, maxPages, limit);
    const excluded = this.sourceExclusions(excludedHandles);
    const seen = new Set(processedIds),
      excludedSourceIds: string[] = [],
      sources: any[] = [],
      missing: any[] = [];
    let last: any,
      previousIds = "",
      offset = resume ? (this.#sourceCursor?.offset ?? 0) : 0,
      firstDOMId: any = resume
        ? this.#sourceCursor?.firstRenderedId
        : undefined;
    for (let page = 0; page < maxPages && sources.length < limit; page++) {
      last = await this.#ready({ view: "posts", offset, limit: 5 });
      if (page === 0 && resume && this.#sourceCursor?.page !== last.page) {
        offset = 0;
        firstDOMId = undefined;
        last = await this.#ready({ view: "posts", offset, limit: 5 });
      }
      firstDOMId ??= last.firstRenderedId ?? last.posts?.[0]?.id;
      const empty = !offset && emptySearch(last);
      if (last.needsStateCheck || last.alerts?.length || empty)
        return {
          ...last,
          sources,
          complete: empty,
          missing: empty ? ["source-results-empty"] : sourcePageMissing(last),
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
            missing: sourcePageMissing(last),
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
      let windowNarrowed = false;
      for (const candidate of last.posts ?? []) {
        if (!candidate.id || seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        if (this.sourceExcluded(candidate, excluded, excludedSourceIds))
          continue;
        let post = candidate;
        if (candidate.needsExpansion) {
          windowNarrowed = true;
          const expanded = await this.expandSource(candidate, last, offset);
          if (expanded.blocked)
            return {
              ...expanded.observation,
              sources,
              complete: false,
              missing: expanded.missing,
            };
          if (expanded.missing) {
            missing.push(...expanded.missing);
            continue;
          }
          post = expanded.post;
        }
        if (!this.completeSource(post)) {
          missing.push(`incomplete-source:${candidate.id}`);
          continue;
        }
        sources.push(source(post, last.page));
        if (sources.length >= limit) break;
      }
      if (sources.length < limit && page + 1 < maxPages) {
        // Only expansion changes the semantic window; pure filtering retains the fresh list.
        if (windowNarrowed)
          last = await this.#observed({ view: "posts", offset, limit: 5 });
        if (last.moreInDOM) offset += 5;
        else {
          let advanced;
          try {
            advanced = await this.advanceSourceWindow(last, seen);
          } catch (error) {
            if (!this.isSourceControlFailure(error)) throw error;
            missing.push("pagination-control-unconfirmed");
            break;
          }
          if (advanced.needsStateCheck || advanced.alerts?.length)
            return {
              ...advanced,
              sources,
              complete: false,
              missing: sourcePageMissing(advanced),
            };
          if (advanced.missing?.includes("bounded-scroll-window-exhausted")) {
            last = advanced;
            missing.push("bounded-scroll-window-exhausted");
            break;
          }
          if (advanced.paginationBoundary) {
            last = advanced;
            missing.push("stable-rendered-tail");
            break;
          }
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
    this.rememberSourceCursor(last, offset, firstDOMId, sources.length < limit);
    return {
      page: last?.page,
      accountHandle: last?.accountHandle,
      observedAt: last?.observedAt,
      fresh: true,
      sources,
      excludedSourceIds,
      complete: sources.length >= limit,
      pageComplete: false,
      ...(last?.paginationBoundary
        ? { paginationBoundary: last.paginationBoundary }
        : {}),
      missing:
        sources.length >= limit
          ? []
          : [...new Set([...missing, "bounded-source-window-exhausted"])],
    };
  }
  private completeSource(post: any): boolean {
    return Boolean(
      post &&
      !post.needsExpansion &&
      post.body &&
      post.author &&
      Number.isFinite(Date.parse(post.datetime)),
    );
  }
  private sourceExcluded(
    candidate: any,
    excluded: Set<string>,
    ids: string[],
  ): boolean {
    const handle = String(candidate.author ?? "")
      .replace(/^@/, "")
      .toLowerCase();
    if (!excluded.has(handle)) return false;
    ids.push(candidate.id);
    return true;
  }
  private sourceExclusions(excludedHandles: unknown): Set<string> {
    if (
      !Array.isArray(excludedHandles) ||
      excludedHandles.some(
        (handle: unknown) =>
          typeof handle !== "string" || !/^@?[A-Za-z0-9_]{1,15}$/.test(handle),
      )
    )
      throw new Error("source-excluded-handles-invalid");
    return new Set(
      excludedHandles.map((handle: string) =>
        handle.replace(/^@/, "").toLowerCase(),
      ),
    );
  }
  private isSourceControlFailure(error: unknown) {
    if (!(error instanceof Error)) return false;
    return (
      /^(?:(?:expandPost|nextPosts): )?DOM语义控件不唯一(?: count=\d+)?$/.test(
        error.message,
      ) ||
      /^(?:Error: )?Playwright selector deadline exceeded(?:\n|$)/.test(
        error.message,
      )
    );
  }
  private async expandSource(candidate: any, frame: any, offset: number) {
    const target = await this.#observed({
      view: "posts",
      targetId: candidate.id,
      limit: 1,
    });
    if (target.posts?.length !== 1)
      return { missing: ["expansion-target-unconfirmed"] };
    try {
      await this.#browser.act({
        operation: "expandPost",
        postId: candidate.id,
      });
    } catch (error) {
      if (!this.isSourceControlFailure(error)) throw error;
      const fresh = await this.#observed({ view: "posts", offset, limit: 5 });
      if (
        !frame.page ||
        !frame.accountHandle ||
        fresh.page !== frame.page ||
        fresh.accountHandle !== frame.accountHandle ||
        fresh.needsStateCheck ||
        fresh.alerts?.length
      )
        return {
          blocked: true,
          observation: fresh,
          missing: ["source-expansion-page-unconfirmed"],
        };
      return { missing: [`expansion-control-unconfirmed:${candidate.id}`] };
    }
    const expanded = await this.#ready({
      view: "posts",
      targetId: candidate.id,
      limit: 1,
    });
    if (expanded.needsStateCheck || expanded.alerts?.length)
      return {
        blocked: true,
        observation: expanded,
        missing: ["expanded-source-unconfirmed"],
      };
    return { post: expanded.posts?.[0] };
  }
  private validateSourceWindow(
    processedIds: any,
    maxPages: number,
    limit: number,
  ) {
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
  }
  private rememberSourceCursor(
    last: any,
    offset: number,
    firstDOMId: any,
    exhausted: boolean,
  ) {
    if (last?.page)
      this.#sourceCursor = {
        page: last.page,
        offset:
          exhausted && last.moreInDOM
            ? offset + (last.posts?.length ?? 0)
            : offset,
        firstRenderedId: last.firstRenderedId ?? firstDOMId,
      };
  }
  private async advanceSourceWindow(previous: any, seen: Set<any>) {
    const renderedIds = previous.renderedIds ?? [...seen];
    let advanced: any;
    for (let step = 0; step < 10; step++) {
      if (!(advanced ?? previous).posts?.some((post: any) => post.id)) {
        const anchor = await this.#observed({ view: "posts", limit: 5 });
        if (
          anchor.needsStateCheck ||
          anchor.alerts?.length ||
          anchor.page !== previous.page ||
          !anchor.posts?.some((post: any) => post.id)
        )
          return {
            ...anchor,
            needsStateCheck: true,
            missing: ["source-scroll-anchor-unconfirmed"],
          };
      }
      await this.#browser.act({ operation: "nextPosts" });
      advanced = await this.#ready({ view: "posts", limit: 5 });
      if (advanced.needsStateCheck || advanced.alerts?.length) return advanced;
      let timedOut = false;
      try {
        // Wait for a newly rendered card, even if that source was processed on an
        // earlier run. Global processed IDs do not describe the current DOM window.
        await this.#browser.act({
          operation: "waitForPosts",
          excludeIds: renderedIds,
        });
      } catch (error: any) {
        if (!/timed out|timeout/i.test(error.message)) throw error;
        timedOut = true;
      }
      advanced = await this.#ready({ view: "posts", limit: 5 });
      if (
        timedOut &&
        advanced.atRenderedTail &&
        !advanced.loading &&
        advanced.firstRenderedId === previous.firstRenderedId &&
        advanced.renderedArticles === previous.renderedArticles
      )
        advanced.paginationBoundary = {
          kind: "stable-rendered-tail",
          lastId: advanced.renderedIds?.at(-1),
          renderedCount: advanced.renderedArticles,
          waitMs: 5000,
          scopeComplete: false,
        };
      if (
        advanced.paginationBoundary ||
        !Number.isFinite(advanced.viewportScrollTop) ||
        advanced.renderedArticles !== previous.renderedArticles ||
        (advanced.renderedIds ?? advanced.posts?.map((p: any) => p.id))?.some(
          (id: any) => !renderedIds.includes(id),
        )
      )
        return advanced;
    }
    const confirmed =
      advanced.page === previous.page &&
      advanced.accountHandle &&
      advanced.accountHandle === previous.accountHandle &&
      !advanced.loading &&
      advanced.posts?.some((post: any) => post.id);
    return {
      ...advanced,
      needsStateCheck: !confirmed,
      missing: ["bounded-scroll-window-exhausted"],
    };
  }
  private async handleReadCreator(args: import("./types.js").CreatorOptions) {
    if (typeof this.#browser.collectCreator !== "function")
      return {
        status: "needsCapability",
        complete: false,
        missing: ["browser.collectCreator"],
      };
    if (
      args.timeline !== undefined &&
      !["posts", "replies"].includes(args.timeline)
    )
      throw new Error("creator-timeline-invalid");
    const value =
      args.timeline === "replies"
        ? await this.readCreatorReplies(args)
        : await this.#browser.collectCreator(args);
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
      page: value.timeline?.page ?? `https://x.com/${args.handle}`,
      pageComplete: false,
      complete:
        value.complete === true && !absent.length && !value.alerts?.length,
      missing: absent,
    };
  }
  private async readCreatorReplies(args: import("./types.js").CreatorOptions) {
    if (args.navigate !== false) {
      const profile = await this.#browser.collectCreator({
        ...args,
        timeline: "posts",
        target: 1,
        maxScrolls: 0,
        expand: false,
      });
      if (
        profile.alerts?.length ||
        profile.profile?.alerts?.length ||
        profile.meta?.missing?.length ||
        !sameHandle(profile.profile?.handle, args.handle)
      )
        return {
          ...profile,
          complete: false,
          missing: ["creator-profile-unconfirmed"],
        };
    }
    let nav = await this.#ready({
      view: "navigation",
      timelineNavigation: true,
    });
    const base = "/" + args.handle.toLowerCase(),
      path = base + "/with_replies";
    const matches = (c: any) => {
      if (c.role !== "tab" || c.disabled || !/^(回复|Replies)$/i.test(c.label))
        return false;
      try {
        return (
          xURL(new URL(c.href, nav.page).href).pathname.toLowerCase() === path
        );
      } catch {
        return false;
      }
    };
    const failed = () => ({
      ...nav,
      complete: false,
      missing: ["creator-replies-tab-unconfirmed"],
    });
    if (
      nav.needsStateCheck ||
      nav.alerts?.length ||
      !nav.accountHandle ||
      (nav.controls ?? []).filter(matches).length !== 1 ||
      ![base, path].includes(xURL(nav.page).pathname.toLowerCase())
    )
      return failed();
    if (!(nav.controls ?? []).some((c: any) => matches(c) && c.selected)) {
      if (args.navigate === false || !(await this.#choose(nav, matches)))
        return failed();
      nav = await this.#ready({ view: "navigation", timelineNavigation: true });
    }
    const selected = (nav.controls ?? []).filter(
      (c: any) => matches(c) && c.selected,
    );
    if (
      nav.needsStateCheck ||
      nav.alerts?.length ||
      !nav.accountHandle ||
      xURL(nav.page).pathname.toLowerCase() !== path ||
      selected.length !== 1 ||
      (nav.controls ?? []).filter(matches).length !== 1
    )
      return failed();
    const value = await this.#browser.collectCreator({
      ...args,
      navigate: false,
    });
    return {
      ...value,
      timeline: {
        kind: "replies",
        page: nav.page,
        selectedTab: selected[0].label,
      },
    };
  }
  private async handleReadBookmarks({
    folder,
    discoverOnly = false,
    resume = false,
    ...window
  }: any = {}): Promise<any> {
    if (!discoverOnly && (typeof folder !== "string" || !folder.trim()))
      throw new Error("需指定收藏文件夹；不以全部书签冒充命名文件夹");
    let nav = await this.#ready({
      view: "navigation",
      targetLabel: folder,
      bookmarkNavigation: true,
    });
    if (resume && discoverOnly)
      throw Error("bookmark-resume-discovery-conflict");
    if (resume) return this.resumeBookmarks(folder, window, nav.page);
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
        if (
          !(await this.#choose(
            nav,
            (c: any) => bookmark(c) || /^(历史|History)$/i.test(c.label),
          ))
        ) {
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
    const selected = await this.confirmBookmarkFolder(folder);
    if (selected.status) return selected;
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
  private async resumeBookmarks(
    folder: string,
    window: any,
    entryPage: string,
  ) {
    const selected = await this.confirmBookmarkFolder(folder);
    if (selected.status) return selected;
    const value = await this.handleCollectSources({ ...window, resume: true });
    return {
      ...value,
      folder,
      folderEvidence: { entryPage, selectedPage: selected.page, name: folder },
    };
  }
  private bookmarkFolderNamed(nav: any, folder: string) {
    const tabs = (nav.controls ?? []).filter(
      (c: any) => c.role === "tab" && c.selected === true,
    );
    return (
      nav.headings?.includes(folder) ||
      (tabs.length === 1 && tabs[0].label.split("\n")[0] === folder)
    );
  }
  private async confirmBookmarkFolder(folder: string) {
    let selected = await this.#ready({ view: "navigation" });
    if (!this.bookmarkFolderNamed(selected, folder)) {
      try {
        await this.#browser.act({
          operation: "waitForFolder",
          folder,
          selected: true,
        });
      } catch (error: any) {
        if (!/timed out|timeout/i.test(error.message)) throw error;
      }
      selected = await this.#ready({ view: "navigation" });
    }
    if (
      !this.bookmarkFolderNamed(selected, folder) ||
      !/\/i\/(?:history\/)?bookmarks\//.test(selected.page ?? "") ||
      selected.needsStateCheck ||
      selected.alerts?.length
    )
      return {
        status: "needsDecision",
        complete: false,
        missing: ["folder-selection-unconfirmed"],
        folder,
        page: selected.page,
      };
    return selected;
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
    excludedHandles = [],
    resume = false,
  }: any = {}): Promise<any> {
    if (resume) {
      const nav = await this.#observed({ view: "navigation" });
      if (
        !nav.page ||
        xURL(nav.page).pathname !== "/search" ||
        xURL(nav.page).searchParams.get("q") !== query ||
        nav.alerts?.length ||
        nav.needsStateCheck
      )
        return {
          page: nav.page,
          sources: [],
          complete: false,
          missing: ["search-resume-query-unconfirmed"],
        };
    } else await this.#browser.act({ operation: "searchSources", query });
    const value = await this.handleCollectSources({
      limit,
      maxPages,
      processedIds,
      excludedHandles,
      resume,
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
  private async waitRecommendationNavigation(nav: any) {
    if (
      !nav.alerts?.length &&
      (nav.needsStateCheck ||
        (!(nav.controls ?? []).some((c: any) => c.role === "tab") &&
          !nav.headings?.length))
    ) {
      try {
        await this.#browser.act({ operation: "waitForPosts" });
      } catch (error: any) {
        if (!/timed out|timeout/i.test(error.message)) throw error;
      }
      return this.#ready({ view: "navigation" });
    }
    return nav;
  }
  private async settleHomeNavigation(
    nav: any,
    isPage: (value: any) => unknown,
  ) {
    if (!nav.needsStateCheck || nav.alerts?.length) return nav;
    // A mounted article can precede the Home tab header. Observe readiness
    // once, then confirm fresh navigation before any attributed collection.
    const content = await this.#ready({ view: "posts", limit: 1 });
    if (content.alerts?.length || !isPage(content.page)) return content;
    return content.needsStateCheck ? nav : this.#ready({ view: "navigation" });
  }
  private async handleReadRecommendations(
    {
      limit = 3,
      maxPages = 1,
      processedIds = [],
      excludedHandles = [],
    }: import("./types.js").ExploreRecommendationOptions = {},
    surface: "explore" | "home" = "explore",
  ): Promise<any> {
    await this.#browser.act({
      operation:
        surface === "home"
          ? "openHomeRecommendations"
          : "openExploreRecommendations",
    });
    let nav = await this.#ready({ view: "navigation" });
    const page = (value: any) => {
      try {
        const url = xURL(value);
        return url.pathname.replace(/\/+$/, "") === "/" + surface ? url : null;
      } catch {
        return null;
      }
    };
    const entryPage = page(nav.page);
    if (!entryPage)
      return {
        status: "needsDecision",
        fresh: true,
        complete: false,
        page: nav.page,
        missing: [`${surface}-page-unconfirmed`],
        sources: [],
        navigationEvidence: recommendationNavigationEvidence(nav),
      };
    nav = await this.waitRecommendationNavigation(nav);
    if (surface === "home") nav = await this.settleHomeNavigation(nav, page);
    if (!page(nav.page) || nav.alerts?.length)
      return {
        status: "needsDecision",
        fresh: true,
        complete: false,
        page: nav.page,
        missing: [
          nav.alerts?.length
            ? "platform-alert"
            : `${surface}-page-changed-during-read`,
        ],
        sources: [],
        navigationEvidence: recommendationNavigationEvidence(nav),
      };
    if (nav.needsStateCheck) {
      const diagnosticRead = await this.handleCollectSources({
        limit,
        maxPages,
        processedIds,
        excludedHandles,
      });
      const sameExplorePage = page(diagnosticRead.page);
      return {
        ...diagnosticRead,
        status: "needsDecision",
        complete: false,
        missing: [
          ...new Set([
            `${surface}-navigation-unconfirmed`,
            ...(!sameExplorePage
              ? [`${surface}-page-changed-during-read`]
              : []),
            ...(diagnosticRead.missing ?? []),
          ]),
        ],
        sources: sameExplorePage ? (diagnosticRead.sources ?? []) : [],
        navigationEvidence: recommendationNavigationEvidence(nav),
      };
    }
    const recommended = (nav.controls ?? []).filter(
      (control: any) =>
        control.role === "tab" &&
        ["为你推荐", "For you"].includes(control.label.split("\n")[0]),
    );
    if (recommended.length !== 1)
      return {
        status: "needsDecision",
        fresh: true,
        complete: false,
        page: entryPage.href,
        missing: [`${surface}-recommended-tab-unconfirmed`],
        sources: [],
        navigationEvidence: recommendationNavigationEvidence(nav),
      };
    const expectedLabel = recommended[0].label.split("\n")[0] as
      "为你推荐" | "For you";
    if (
      !recommended[0].selected &&
      !(await this.#choose(
        nav,
        (control: any) =>
          control.role === "tab" &&
          control.label.split("\n")[0] === expectedLabel,
      ))
    )
      return {
        status: "needsDecision",
        fresh: true,
        complete: false,
        page: entryPage.href,
        missing: [`${surface}-recommended-tab-selection-unavailable`],
        sources: [],
        navigationEvidence: recommendationNavigationEvidence(nav),
      };
    nav = await this.#ready({ view: "navigation" });
    const selected = (nav.controls ?? []).filter(
      (control: any) =>
        control.role === "tab" &&
        control.label.split("\n")[0] === expectedLabel &&
        control.selected,
    );
    if (
      !page(nav.page) ||
      nav.needsStateCheck ||
      nav.alerts?.length ||
      selected.length !== 1
    )
      return {
        status: "needsDecision",
        fresh: true,
        complete: false,
        page: nav.page,
        missing: [`${surface}-recommended-tab-selection-unconfirmed`],
        sources: [],
        navigationEvidence: recommendationNavigationEvidence(nav),
      };
    const value = await this.handleCollectSources({
      limit,
      maxPages,
      processedIds,
      excludedHandles,
    });
    if (!page(value.page))
      return {
        ...value,
        status: "needsDecision",
        complete: false,
        missing: [`${surface}-page-changed-during-read`],
      };
    return {
      ...value,
      sourceOrigin: {
        kind:
          surface === "home"
            ? "home-recommendations"
            : `${surface}-recommendations`,
        page: entryPage.href,
        selectedTab: expectedLabel,
      },
    };
  }
}
export function createPlatformCollections(
  ...args: ConstructorParameters<typeof PlatformCollections>
) {
  return new PlatformCollections(...args);
}
