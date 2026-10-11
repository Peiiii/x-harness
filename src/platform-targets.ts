import type { PlatformDependencies } from "./platform-dependencies.js";
import { xURL, sameHandle, handlePattern, source } from "./platform-rules.js";
export class PlatformTargets {
  #observed!: PlatformDependencies["observed"];
  #open!: PlatformDependencies["open"];
  #browser!: PlatformDependencies["browser"];
  #ready!: PlatformDependencies["ready"];
  readAccount!: () => Promise<any>;
  readFeedback!: ({ targets, replyLimit }?: any) => Promise<any>;
  readPerson!: (target: any) => Promise<any>;
  readPost!: (target: any) => Promise<any>;
  constructor(
    dependencies: Pick<
      PlatformDependencies,
      "observed" | "open" | "browser" | "ready"
    >,
  ) {
    const { observed, open, browser, ready } = dependencies;
    this.#observed = observed;
    this.#open = open;
    this.#browser = browser;
    this.#ready = ready;
    this.readAccount = this.handleReadAccount.bind(this);
    this.readFeedback = this.handleReadFeedback.bind(this);
    this.readPerson = this.handleReadPerson.bind(this);
    this.readPost = this.handleReadPost.bind(this);
  }
  private async handleReadFeedback({
    targets,
    replyLimit = 3,
  }: any = {}): Promise<any> {
    if (!Array.isArray(targets) || targets.length < 1 || targets.length > 5)
      throw new Error("反馈窗口须为1–5个已发布ID");
    if (!Number.isInteger(replyLimit) || replyLimit < 0 || replyLimit > 3)
      throw new Error("回复核验窗口须为0–3");
    const feedback: any[] = [];
    for (const target of targets) {
      const value = await this.handleReadPost(target),
        post = value.posts?.find((p: any) => p.id === target.postId);
      if (value.needsStateCheck || value.alerts?.length || !post) {
        feedback.push({
          id: target.postId,
          missing: ["published-post-unconfirmed"],
        });
        continue;
      }
      const thread = await this.#observed({ view: "posts", limit: 5 });
      const replies: any[] = [],
        unconfirmedReplyIds: any[] = [];
      const targetIndex = (thread.posts ?? []).findIndex(
        (p: any) => p.id === post.id,
      );
      const candidates =
        targetIndex < 0
          ? []
          : thread.posts.slice(targetIndex + 1, targetIndex + 1 + replyLimit);
      for (const candidate of candidates) {
        if (!candidate.primary || !candidate.id) continue;
        const url = new URL(candidate.primary, thread.page).href;
        const detail = await this.#open(
          {
            url,
            evidenceRef: {
              page: thread.page,
              observedAt: thread.observedAt,
              publicId: candidate.id,
              primary: candidate.primary,
            },
          },
          {
            view: "posts",
            targetId: candidate.id,
            replyTargetId: target.postId,
            limit: 1,
          },
        );
        const reply = detail.posts?.find((p: any) => p.id === candidate.id);
        if (
          !detail.needsStateCheck &&
          !detail.alerts?.length &&
          reply?.replyToId === target.postId &&
          reply.body &&
          !reply.needsExpansion
        )
          replies.push(source(reply, detail.page));
        else unconfirmedReplyIds.push(candidate.id);
      }
      feedback.push({
        id: post.id,
        author: post.author,
        metrics: [...(post.buttons ?? []), ...(post.metrics ?? [])],
        replies,
        unconfirmedReplyIds,
        pageComplete: false,
        observedAt: value.observedAt,
      });
    }
    return {
      feedback,
      fresh: true,
      complete: feedback.every((f: any) => !f.missing),
      pageComplete: false,
    };
  }
  private async handleReadPerson(target: any): Promise<any> {
    if (!handlePattern.test(target.handle ?? ""))
      throw new Error("无效已观察handle");
    if (
      xURL(target.url).pathname.toLowerCase() !==
      `/${target.handle}`.toLowerCase()
    )
      throw new Error("人物URL与handle不一致");
    const value = await this.#open(target, {
      view: "person",
      handle: target.handle,
    });
    return sameHandle(value.handle, target.handle)
      ? { ...value, url: target.url }
      : {
          ...value,
          needsStateCheck: true,
          missing: ["person-identity-mismatch"],
        };
  }
  private async handleReadPost(target: any): Promise<any> {
    if (
      !/^\d+$/.test(target.postId ?? "") ||
      xURL(target.url).pathname.match(/\/status\/(\d+)$/)?.[1] !== target.postId
    )
      throw new Error("帖子URL与公开ID不一致");
    let value = await this.#open(target, {
      view: "posts",
      targetId: target.postId,
    });
    if (!target.expand) return value;
    let posts = (value.posts ?? []).filter((p: any) => p.id === target.postId);
    if (
      !value.needsStateCheck &&
      !value.alerts?.length &&
      posts.length === 1 &&
      posts[0].needsExpansion
    ) {
      await this.#browser.act({
        operation: "expandPost",
        postId: target.postId,
      });
      value = await this.#ready({ view: "posts", targetId: target.postId });
      posts = (value.posts ?? []).filter((p: any) => p.id === target.postId);
    }
    const missing = [...(value.missing ?? [])];
    if (posts.length !== 1) missing.push("unique-target-post-unconfirmed");
    else {
      if (!posts[0].body) missing.push("exact-body-unconfirmed");
      if (posts[0].needsExpansion) missing.push("post-expansion-unconfirmed");
      if (!posts[0].author) missing.push("post-author-unconfirmed");
      if (!Number.isFinite(Date.parse(posts[0].datetime)))
        missing.push("absolute-time-unconfirmed");
    }
    return {
      ...value,
      posts,
      complete:
        !missing.length && !value.needsStateCheck && !value.alerts?.length,
      missing,
    };
  }
  private handleReadAccount() {
    return this.#observed({ view: "account" });
  }
}
export function createPlatformTargets(
  ...args: ConstructorParameters<typeof PlatformTargets>
) {
  return new PlatformTargets(...args);
}
