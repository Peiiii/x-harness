import type { PlatformDependencies } from "./platform-dependencies.js";
import { xURL } from "./platform-rules.js";

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
    let value = await this.#deps.open(
      { url: args.url, evidenceRef: args.evidenceRef },
      query,
    );
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
