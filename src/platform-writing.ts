import type { PlatformDependencies } from "./platform-dependencies.js";
import { publicationTime } from "./publication-time.js";
import {
  xURL,
  sameHandle,
  sameText,
  samePublishedText,
  matchesReviewedAssets,
} from "./platform-rules.js";
export class PlatformWriting {
  #observed!: PlatformDependencies["observed"];
  #browser!: PlatformDependencies["browser"];
  #followStage!: PlatformDependencies["followStage"];
  #readPerson!: PlatformDependencies["readPerson"];
  #open!: PlatformDependencies["open"];
  #clock!: PlatformDependencies["clock"];
  #readPost!: PlatformDependencies["readPost"];
  compose!: (action: any) => Promise<any>;
  findSubmission!: (
    action: any,
    context?: { phase?: "baseline" },
  ) => Promise<any>;
  submitFollow!: (action: any) => Promise<any>;
  submitPost!: (action: any) => Promise<any>;
  submitReply!: (action: any) => Promise<any>;
  constructor(
    dependencies: Pick<
      PlatformDependencies,
      | "observed"
      | "browser"
      | "followStage"
      | "readPerson"
      | "open"
      | "clock"
      | "readPost"
    >,
  ) {
    const {
      observed,
      browser,
      followStage,
      readPerson,
      open,
      clock,
      readPost,
    } = dependencies;
    this.#observed = observed;
    this.#browser = browser;
    this.#followStage = followStage;
    this.#readPerson = readPerson;
    this.#open = open;
    this.#clock = clock;
    this.#readPost = readPost;
    this.compose = this.handleCompose.bind(this);
    this.findSubmission = this.handleFindSubmission.bind(this);
    this.submitFollow = this.handleSubmitFollow.bind(this);
    this.submitPost = this.handleSubmitPost.bind(this);
    this.submitReply = this.handleSubmitReply.bind(this);
  }
  private async handleCompose(action: any): Promise<any> {
    let value = await this.#observed({ view: "composer" });
    if (
      value.needsStateCheck ||
      value.alerts?.length ||
      typeof value.editorText !== "string" ||
      value.editorText.trim() !== "" ||
      (action.kind === "reply" && value.replyToId !== action.postId) ||
      (action.quoteTarget && value.quoteSourceId !== action.quoteTarget.postId)
    )
      throw new Error("编辑器不为空或回复上下文未绑定");
    if (action.assets?.length)
      await this.#browser.act({
        operation: "attachAssets",
        assets: action.assets,
      });
    await this.#browser.act({ operation: "fillComposer", text: action.text });
    value = await this.#observed({ view: "composer" });
    if (
      !sameText(value.editorText, action.text) ||
      value.needsStateCheck ||
      value.alerts?.length ||
      (action.kind === "reply" && value.replyToId !== action.postId) ||
      (action.quoteTarget &&
        value.quoteSourceId !== action.quoteTarget.postId) ||
      (action.accountHandle &&
        !sameHandle(value.accountHandle, action.accountHandle))
    )
      throw new Error(
        `提交前账号/正文/目标未核实 ${JSON.stringify({ textMatches: sameText(value.editorText, action.text), needsStateCheck: value.needsStateCheck, alerts: value.alerts, accountHandle: value.accountHandle, replyToId: value.replyToId })}`,
      );
    return this.#browser.act({
      operation: action.kind === "reply" ? "submitReply" : "submitPost",
      beforeSubmit: action.beforeSubmit,
      ...(action.activation ? { activation: action.activation } : {}),
    });
  }
  private async handleFindSubmission(
    action: any,
    context: { phase?: "baseline" } = {},
  ): Promise<any> {
    if (action.kind === "follow") {
      let value = await this.#followStage(action, "verify-read", () =>
        this.#readPerson(action),
      );
      const verificationAlerts = [...(value.alerts ?? [])];
      if (!value.needsStateCheck) {
        const absent = this.#browser.capabilities?.("refreshPerson") ?? [
          "refreshPerson",
        ];
        if (absent.length)
          return {
            ...value,
            verified: false,
            missing: absent,
            needsStateCheck: true,
          };
        await this.#followStage(action, "verify-refresh", () =>
          this.#browser.act({
            operation: "refreshPerson",
            handle: action.handle,
            url: action.url,
            evidenceRef: action.evidenceRef,
          }),
        );
        value = await this.#followStage(action, "verify-after-refresh", () =>
          this.#readPerson(action),
        );
      }
      value = {
        ...value,
        alerts: [...new Set([...verificationAlerts, ...(value.alerts ?? [])])],
      };
      return {
        ...value,
        verified:
          !value.needsStateCheck &&
          !value.alerts?.length &&
          value.relationship === "following" &&
          (!action.accountHandle ||
            sameHandle(value.accountHandle, action.accountHandle)),
        publicId: null,
      };
    }
    // A bounded window cannot prove absence. Reply receipts use the observed target conversation.
    const observedReceipt =
      ["reply", "original"].includes(action.kind) &&
      action.observedPublicURL &&
      action.observedPublicEvidenceRef;
    const receiptPath = observedReceipt
      ? xURL(action.observedPublicURL).pathname.split("/")
      : [];
    if (
      observedReceipt &&
      (receiptPath.length !== 4 ||
        !sameHandle(receiptPath[1], action.accountHandle) ||
        receiptPath[2] !== "status" ||
        !/^[0-9]+$/.test(receiptPath[3]))
    )
      throw new Error("已观察回复回执须属于原账号");
    const receiptTarget = observedReceipt
      ? {
          url: action.observedPublicURL,
          evidenceRef: action.observedPublicEvidenceRef,
        }
      : action.kind === "reply" && action.url && action.evidenceRef
        ? { url: action.url, evidenceRef: action.evidenceRef }
        : { url: action.accountURL, evidenceRef: action.accountEvidenceRef };
    let value = await this.#open(receiptTarget, { view: "posts", limit: 5 });
    if (
      context.phase !== "baseline" &&
      !(action.kind === "original" && observedReceipt) &&
      !value.needsStateCheck &&
      !(this.#browser.capabilities?.("refreshPosts") ?? ["refreshPosts"]).length
    ) {
      await this.#browser.act({
        operation: "refreshPosts",
        url: receiptTarget.url,
        evidenceRef: receiptTarget.evidenceRef,
      });
      value = await this.#observed({ view: "posts", limit: 5 });
    }
    const matchesContent = (post: any) => this.matchesContent(post, action);
    let matches = (value.posts ?? []).filter(matchesContent);
    const receiptCandidate =
      action.kind === "reply" &&
      matches.length === 1 &&
      !value.needsStateCheck &&
      !value.alerts?.length &&
      matches[0].primary
        ? {
            url: new URL(matches[0].primary, value.page).href,
            id: matches[0].id,
          }
        : undefined;

    if (
      action.kind === "reply" &&
      matches.length === 1 &&
      matches[0].replyToId == null &&
      matches[0].primary
    ) {
      // The candidate URL comes from this fresh public observation, not from a guessed ID path.
      const candidate = matches[0];
      const url = xURL(
        new URL(candidate.primary, xURL(value.page).origin).href,
      );
      if (
        url.pathname.toLowerCase() ===
        `/${action.accountHandle}/status/${candidate.id}`.toLowerCase()
      ) {
        value = await this.readCandidateDetail(
          value,
          url.href,
          candidate,
          action.postId,
          matchesContent,
        );
        matches = (value.posts ?? []).filter(matchesContent);
      }
    }
    if (action.quoteTarget && matches.length === 1) {
      value = await this.readQuotedReceipt(value, action, matches[0]);
      matches = (value.posts ?? [])
        .filter(matchesContent)
        .filter((p: any) => this.matchesQuote(p, action));
    }
    if (action.kind === "reply")
      matches = matches.filter((post: any) => post.replyToId === action.postId);
    return {
      ...value,
      verified:
        !value.needsStateCheck && !value.alerts?.length && matches.length === 1,
      ...(receiptCandidate ? { receiptCandidate } : {}),
      publicId: matches.length === 1 ? matches[0].id : null,
      missing:
        matches.length === 1 ? [] : ["unique-public-submission-unconfirmed"],
    };
  }
  private async readCandidateDetail(
    value: any,
    url: string,
    candidate: any,
    parentId: string,
    matchesContent: (post: any) => boolean,
  ): Promise<any> {
    try {
      const opened = await this.#open(
        {
          url,
          evidenceRef: {
            page: value.page,
            observedAt: value.observedAt,
            publicId: candidate.id,
            primary: candidate.primary,
          },
        },
        {
          view: "posts",
          targetId: candidate.id,
          replyTargetId: parentId,
        },
      );
      return await this.readLoadedReplyReceipt(
        opened,
        candidate.id,
        matchesContent,
      );
    } catch (error: unknown) {
      // Preserve the fresh observed link for the root API’s existing read-only recovery.
      // Missing parent evidence still fails the exact-parent gate below.
      if (
        !/Timed out waiting for URL/.test(
          error instanceof Error ? error.message : "",
        )
      )
        throw error;
    }
    return value;
  }
  private matchesQuote(post: any, action: any) {
    return (
      post.quoteSource?.parentId === post.id &&
      post.quoteSource?.id === action.quoteTarget.postId
    );
  }
  private matchesContent(post: any, action: any) {
    return (
      sameHandle(post.author, action.accountHandle) &&
      samePublishedText(post.body, action.text) &&
      /^\d+$/.test(post.id ?? "") &&
      matchesReviewedAssets(post, action.assets) &&
      !(action.beforeIds ?? []).includes(post.id) &&
      Number.isFinite(publicationTime(post)) &&
      publicationTime(post) >= Date.parse(action.intentAt) &&
      publicationTime(post) <= this.#clock() + 5000 &&
      !post.needsExpansion
    );
  }
  private async readQuotedReceipt(value: any, action: any, candidate: any) {
    return this.#readPost({
      postId: candidate.id,
      url: new URL(candidate.primary, value.page).href,
      evidenceRef: { page: value.page, observedAt: value.observedAt },
      resolveQuote: true,
    });
  }
  private async readLoadedReplyReceipt(
    value: any,
    targetId: string,
    matchesContent: (post: any) => boolean,
  ): Promise<any> {
    const candidates = (value.posts ?? []).filter(matchesContent);
    if (
      value.needsStateCheck ||
      value.alerts?.length ||
      candidates.length !== 1 ||
      candidates[0].id !== targetId ||
      candidates[0].replyToId != null
    )
      return value;
    // Reuse the bounded thread reader; only its explicit parent receipt can confirm a reply.
    return this.#readPost({
      postId: targetId,
      url: value.page,
      evidenceRef: {
        page: value.page,
        observedAt: value.observedAt,
        publicId: targetId,
      },
      expand: true,
      includeContext: true,
      includeThread: true,
    });
  }
  private async handleSubmitFollow(action: any): Promise<any> {
    const value = await this.#followStage(action, "submit-preflight-read", () =>
      this.#readPerson(action),
    );
    if (
      value.needsStateCheck ||
      value.alerts?.length ||
      !["not-following", "follows-you"].includes(value.relationship) ||
      (action.accountHandle &&
        !sameHandle(value.accountHandle, action.accountHandle))
    )
      throw new Error("fresh账号/人物关系不允许关注");
    await this.#followStage(action, "submit-guard", () =>
      action.beforeSubmit?.(),
    );
    // A returned click is not a receipt from X; durable success still requires fresh verification.
    const clicked = await this.#followStage(action, "click", () =>
      this.#browser.act({ operation: "follow", handle: action.handle }),
    );
    try {
      await this.#followStage(action, "click-ui-observation", () =>
        this.#observed({ view: "person", handle: action.handle }),
      );
    } catch {
      /* The click may have committed; retain diagnostic failure and use the original fresh receipt path. */
    }
    return clicked;
  }
  private async handleSubmitPost(action: any): Promise<any> {
    if (action.quoteTarget) {
      const source = await this.#readPost(action.quoteTarget);
      if (
        source.needsStateCheck ||
        source.alerts?.length ||
        source.posts?.length !== 1 ||
        source.posts[0].id !== action.quoteTarget.postId
      )
        throw Error("quote-source-unconfirmed");
      await this.#browser.act({
        operation: "openQuoteComposer",
        postId: action.quoteTarget.postId,
      });
    } else {
      await this.#open(
        { url: action.composeURL, evidenceRef: action.composeEvidenceRef },
        { view: "composer" },
      );
    }
    return this.handleCompose(action);
  }
  private async handleSubmitReply(action: any): Promise<any> {
    const value = await this.#readPost(action);
    if (
      value.needsStateCheck ||
      value.alerts?.length ||
      !(value.posts ?? []).some((p: any) => p.id === action.postId)
    )
      throw new Error("回复主帖身份未核实");
    await this.#browser.act({ operation: "openReply", postId: action.postId });
    return this.handleCompose(action);
  }
}
export function createPlatformWriting(
  ...args: ConstructorParameters<typeof PlatformWriting>
) {
  return new PlatformWriting(...args);
}
