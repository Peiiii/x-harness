import type { PlatformDependencies } from "./platform-dependencies.js";
import { source, xURL } from "./platform-rules.js";

/** One thread stays open; exact-target checks never navigate to each commenter. */
export class PlatformThreadLikes {
  #deps: Pick<PlatformDependencies, "browser" | "open" | "ready" | "observed">;
  #rootSeen = false;
  #url = "";
  constructor(
    deps: Pick<PlatformDependencies, "browser" | "open" | "ready" | "observed">,
  ) {
    this.#deps = deps;
  }
  public async readThreadLikeWindow(args: any) {
    if (args.reset || this.#url !== args.url) {
      this.#rootSeen = false;
      this.#url = args.url;
    }
    const query = {
      view: "posts",
      limit: 1000,
      threadRootId: args.rootId,
      threadRootSeen: this.#rootSeen,
    };
    let value: any;
    try {
      value = await this.#deps.open(
        { url: args.url, evidenceRef: args.evidenceRef },
        query,
      );
    } catch (error: any) {
      if (!/timed out|timeout|deadline exceeded/i.test(String(error)))
        throw error;
      // A committed route can finish rendering after its locator wait expired.
      // Reobserve this exact page once; never navigate another URL or submit.
      value = await this.#deps.observed(query);
      if (value.page !== args.url || value.alerts?.length) throw error;
    }
    if (!this.#rootSeen && !value.threadRootPresent && !value.alerts?.length)
      value = await this.#deps.ready(query);
    if (!this.#rootSeen && !value.threadRootPresent && !value.alerts?.length) {
      await this.#deps.browser.act({
        operation: "openObserved",
        url: args.url,
        evidenceRef: args.evidenceRef,
        view: "posts",
        forceNavigation: true,
      });
      value = await this.#deps.ready(query);
    }
    if (value.threadRootPresent) this.#rootSeen = true;
    return this.checked(value, args);
  }
  private checked(value: any, args: any) {
    const safe =
      this.#rootSeen &&
      value.threadConfirmed &&
      xURL(value.page).href === args.url;
    return {
      ...value,
      needsStateCheck: value.needsStateCheck || !safe,
      posts: safe
        ? (value.posts ?? []).filter((p: any) =>
            value.threadIds?.includes(p.id),
          )
        : [],
    };
  }
  public async advanceThreadLikes(args: any) {
    const query = {
      view: "posts",
      limit: 1000,
      threadRootId: args.rootId,
      threadRootSeen: this.#rootSeen,
    };
    // Restore the full semantic window after any narrowed click/verification.
    let value = await this.#deps.observed(query);
    if (
      value.alerts?.length ||
      value.needsStateCheck ||
      !value.threadConfirmed ||
      value.page !== args.url
    )
      return this.checked(value, args);
    const previous = value;
    if (value.threadExpandControls?.length) {
      const control = value.threadExpandControls.find(
        (c: any) =>
          value.threadExpandControls.filter(
            (other: any) => other.label === c.label,
          ).length === 1,
      );
      if (!control)
        return {
          ...this.checked(value, args),
          needsStateCheck: true,
          missing: ["thread-expand-ambiguous"],
        };
      await this.#deps.browser.act({
        operation: "expandThreadReplies",
        label: control.label,
        rootId: args.rootId,
      });
    } else {
      if (value.threadBoundary)
        return { ...this.checked(value, args), stableTail: true };
      await this.#deps.browser.act({ operation: "nextPosts" });
    }
    value = await this.#deps.ready(query);
    if (
      value.atRenderedTail &&
      !value.threadBoundary &&
      !(value.threadIds ?? []).some(
        (id: string) => !previous.threadIds?.includes(id),
      ) &&
      !value.alerts?.length &&
      !value.needsStateCheck
    ) {
      try {
        await this.#deps.browser.act({
          operation: "waitForThreadReplies",
          excludeIds: previous.renderedIds ?? [],
          timeoutMs: Math.min(5000, Math.max(1, args.remainingMs ?? 5000)),
        });
      } catch (error: any) {
        if (!/timed out|timeout|deadline exceeded/i.test(String(error)))
          throw error;
      }
      value = await this.#deps.ready(query);
    }
    return this.checked(value, args);
  }
  public async readPostComments({
    target,
    maxPages = 10,
    timeBudgetMs = 60000,
    processedIds = [],
  }: any) {
    const url = xURL(target?.url);
    if (
      !target?.evidenceRef ||
      !/^\d+$/.test(target?.postId ?? "") ||
      !new RegExp(`^/[A-Za-z0-9_]{1,15}/status/${target.postId}/?$`).test(
        url.pathname,
      ) ||
      url.search ||
      url.hash ||
      !Number.isInteger(maxPages) ||
      maxPages < 1 ||
      maxPages > 100 ||
      !Number.isInteger(timeBudgetMs) ||
      timeBudgetMs < 1 ||
      timeBudgetMs > 120000 ||
      !Array.isArray(processedIds) ||
      processedIds.some(
        (id: any) => typeof id !== "string" || !/^\d+$/.test(id),
      )
    )
      throw Error("post-comments-input-invalid");
    const args = {
      rootId: target.postId,
      url: url.href,
      evidenceRef: target.evidenceRef,
    };
    const started = Date.now(),
      seen = new Set<string>(processedIds),
      sources: any[] = [],
      windows: any[] = [];
    let value: any,
      pages = 0,
      kind = "page-limit",
      missing: string[] = [],
      stagnant = 0,
      previousIds = "";
    while (pages < maxPages) {
      if (Date.now() - started >= timeBudgetMs) {
        kind = "time-limit";
        break;
      }
      try {
        value =
          pages === 0
            ? await this.readThreadLikeWindow({ ...args, reset: true })
            : await this.advanceThreadLikes({
                ...args,
                remainingMs: timeBudgetMs - (Date.now() - started),
              });
      } catch (error: any) {
        kind = "read-unconfirmed";
        missing = [String(error.message ?? error)];
        break;
      }
      pages++;
      windows.push(value);
      if (
        value.alerts?.length ||
        value.needsStateCheck ||
        !value.threadConfirmed ||
        value.page !== args.url
      ) {
        kind = value.alerts?.length
          ? "platform-alert"
          : "thread-scope-unconfirmed";
        missing = value.missing?.length ? value.missing : [kind];
        break;
      }
      for (const post of value.posts ?? []) {
        if (post.id === target.postId || seen.has(post.id)) continue;
        seen.add(post.id);
        sources.push(source(post, value.page));
      }
      const ids = JSON.stringify(value.threadIds ?? []);
      stagnant = ids === previousIds ? stagnant + 1 : 0;
      previousIds = ids;
      if (
        value.stableTail ||
        (value.threadBoundary && !value.threadExpandControls?.length) ||
        (value.atRenderedTail &&
          stagnant >= 2 &&
          !value.threadExpandControls?.length)
      ) {
        kind = "rendered-tail";
        break;
      }
    }
    return {
      page: args.url,
      sources,
      windows,
      complete: !missing.length,
      pageComplete: false,
      needsStateCheck: !!missing.length,
      missing,
      alerts: value?.alerts ?? [],
      paginationBoundary: {
        kind,
        rootId: target.postId,
        pages,
        lastId: sources.at(-1)?.id,
        scopeComplete: false,
        hiddenOrUnavailable: "unknown",
      },
    };
  }
  public async likeThreadPost(args: any) {
    const query = {
      view: "posts",
      targetId: args.postId,
      limit: 1,
      threadRootId: args.rootId,
      threadRootSeen: this.#rootSeen,
    };
    const value = await this.#deps.observed(query);
    const post = value.posts?.[0];
    if (
      !this.#rootSeen ||
      value.page !== args.url ||
      !value.threadConfirmed ||
      !value.threadIds?.includes(args.postId) ||
      value.needsStateCheck ||
      value.alerts?.length ||
      post?.id !== args.postId ||
      post?.author?.toLowerCase() !== args.author.toLowerCase() ||
      value.accountHandle?.toLowerCase() !== args.accountHandle.toLowerCase()
    )
      throw Error("thread-like-target-unconfirmed");
    return this.#deps.browser.act({
      operation: "likePost",
      postId: args.postId,
      beforeSubmit: args.beforeSubmit,
    });
  }
}
