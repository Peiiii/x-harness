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
    const stage =
      action.traceStage ?? ((_stage: string, run: () => Promise<any>) => run());
    let value = await stage("composer-read", () =>
      this.#observed({ view: "composer" }),
    );
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
    await stage("composer-fill", () =>
      this.#browser.act({ operation: "fillComposer", text: action.text }),
    );
    value = await stage("composer-validate", () =>
      this.#observed({ view: "composer" }),
    );
    const editorMatches =
      value.editorTextRepresentation === "native-ax-lines"
        ? sameText(
            value.editorText?.replace(/\n{2,}/g, "\n"),
            action.text.replace(/\n{2,}/g, "\n"),
          )
        : sameText(value.editorText, action.text);
    if (
      !editorMatches ||
      value.needsStateCheck ||
      value.alerts?.length ||
      (action.kind === "reply" && value.replyToId !== action.postId) ||
      (action.quoteTarget &&
        value.quoteSourceId !== action.quoteTarget.postId) ||
      (action.accountHandle &&
        !sameHandle(value.accountHandle, action.accountHandle))
    )
      throw new Error(
        `提交前账号/正文/目标未核实 ${JSON.stringify({ textMatches: editorMatches, needsStateCheck: value.needsStateCheck, alerts: value.alerts, accountHandle: value.accountHandle, replyToId: value.replyToId })}`,
      );
    return this.#browser.act({
      operation: action.kind === "reply" ? "submitReply" : "submitPost",
      beforeSubmit: action.beforeSubmit,
      ...(action.traceStage ? { traceStage: action.traceStage } : {}),
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
    const receiptPath = this.observedReceiptPath(action, observedReceipt);
    const receiptTarget = observedReceipt
      ? {
          url: action.observedPublicURL,
          evidenceRef: action.observedPublicEvidenceRef,
        }
      : action.kind === "reply" && action.url && action.evidenceRef
        ? { url: action.url, evidenceRef: action.evidenceRef }
        : { url: action.accountURL, evidenceRef: action.accountEvidenceRef };
    const matchesContent = (post: any) => this.matchesContent(post, action);
    let value =
      (await this.readVisibleOriginalReceipt(
        action,
        receiptPath,
        receiptTarget,
        matchesContent,
      )) ??
      (await this.#open(
        receiptTarget,
        this.receiptQuery(action, observedReceipt, receiptPath),
      ));
    if (context.phase !== "baseline")
      value = await this.readOriginalCandidate(action, value);
    let receiptCandidate = this.replyReceiptCandidate(
      action,
      value,
      matchesContent,
    );
    if (action.kind === "reply")
      value = await this.readReplyCandidate(action, value, matchesContent);
    const observedOriginal =
      action.kind === "original" &&
      !value.needsStateCheck &&
      !value.alerts?.length &&
      (value.posts ?? []).filter(matchesContent).length === 1;
    const observedReply = this.isObservedReplyReceipt(
      action,
      value,
      matchesContent,
    );
    if (
      context.phase !== "baseline" &&
      !observedOriginal &&
      !observedReply &&
      !(action.kind === "original" && observedReceipt) &&
      !value.needsStateCheck &&
      !value.alerts?.length &&
      !(this.#browser.capabilities?.("refreshPosts") ?? ["refreshPosts"]).length
    ) {
      await this.#browser.act({
        operation: "refreshPosts",
        ...(action.kind === "original" ? { expectedText: action.text } : {}),
        url: receiptTarget.url,
        evidenceRef: receiptTarget.evidenceRef,
      });
      value = await this.#open(
        receiptTarget,
        this.receiptQuery(action, observedReceipt, receiptPath),
      );
      if (action.kind === "original")
        value = await this.readOriginalCandidate(action, value);
      if (action.kind === "reply")
        value = await this.readReplyCandidate(action, value, matchesContent);
    }
    let matches = (value.posts ?? []).filter(matchesContent);
    receiptCandidate ??= this.replyReceiptCandidate(
      action,
      value,
      matchesContent,
    );
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
  private receiptQuery(
    action: any,
    observedReceipt: any,
    receiptPath: string[],
  ) {
    return {
      view: "posts",
      limit: 5,
      ...(action.kind === "original" && !observedReceipt
        ? { identityRoute: true }
        : {}),
      ...(action.kind === "original" && observedReceipt
        ? { preferObservedLink: true, targetId: receiptPath[3] }
        : action.kind === "reply" && observedReceipt
          ? { preferClientNavigation: true, targetId: receiptPath[3] }
          : {}),
    };
  }
  private async readOriginalCandidate(action: any, value: any) {
    if (
      action.kind !== "original" ||
      value.needsStateCheck ||
      value.alerts?.length
    )
      return value;
    const candidates = (value.posts ?? []).filter(
      (p: any) =>
        sameHandle(p.author, action.accountHandle) &&
        samePublishedText(p.body, action.text) &&
        /^\d+$/.test(p.id ?? "") &&
        !(action.beforeIds ?? []).includes(p.id) &&
        !p.needsExpansion,
    );
    if (
      candidates.length !== 1 ||
      Number.isFinite(publicationTime(candidates[0]))
    )
      return value;
    const post = candidates[0];
    if (
      !post.primary ||
      xURL(post.primary).pathname.toLowerCase() !==
        `/${action.accountHandle}/status/${post.id}`.toLowerCase()
    )
      return value;
    // A relative timeline label is insufficient; open only its unique observed permalink.
    return this.#readPost({
      postId: post.id,
      url: post.primary,
      evidenceRef: {
        page: value.page,
        publicId: post.id,
        observedAt: value.observedAt,
      },
    });
  }
  private replyReceiptCandidate(
    action: any,
    value: any,
    matchesContent: (post: any) => boolean,
  ) {
    const matches = (value.posts ?? []).filter(matchesContent);
    return action.kind === "reply" &&
      matches.length === 1 &&
      !value.needsStateCheck &&
      !value.alerts?.length &&
      matches[0].primary
      ? { url: new URL(matches[0].primary, value.page).href, id: matches[0].id }
      : undefined;
  }
  private isObservedReplyReceipt(
    action: any,
    value: any,
    matchesContent: (post: any) => boolean,
  ): boolean {
    const matches = (value.posts ?? []).filter(matchesContent);
    return !!(
      action.kind === "reply" &&
      sameHandle(value.accountHandle, action.accountHandle) &&
      !value.needsStateCheck &&
      !value.alerts?.length &&
      matches.length === 1 &&
      value.page?.toLowerCase() ===
        `https://x.com/${action.accountHandle}/status/${matches[0].id}`.toLowerCase()
    );
  }
  private async readReplyCandidate(
    action: any,
    value: any,
    matchesContent: (post: any) => boolean,
  ): Promise<any> {
    const matches = (value.posts ?? []).filter(matchesContent);
    if (
      value.needsStateCheck ||
      value.alerts?.length ||
      matches.length !== 1 ||
      !matches[0].primary
    )
      return value;
    const candidate = matches[0];
    const url = xURL(new URL(candidate.primary, xURL(value.page).origin).href);
    if (
      url.pathname.toLowerCase() !==
      `/${action.accountHandle}/status/${candidate.id}`.toLowerCase()
    )
      return value;
    return this.readCandidateDetail(
      value,
      url.href,
      candidate,
      action.postId,
      matchesContent,
    );
  }
  private observedReceiptPath(action: any, observedReceipt: any): string[] {
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
    return receiptPath;
  }
  private async readVisibleOriginalReceipt(
    action: any,
    receiptPath: string[],
    receiptTarget: any,
    matchesContent: (post: any) => boolean,
  ) {
    const observedReceipt =
      action.observedPublicURL && action.observedPublicEvidenceRef;
    const currentReceipt =
      action.kind === "original" && observedReceipt
        ? await this.#observed({
            view: "posts",
            targetId: receiptPath[3],
            limit: 5,
          })
        : null;
    const currentPath = currentReceipt?.page
      ? xURL(currentReceipt.page).pathname.toLowerCase()
      : "";
    const reusableReceipt =
      currentReceipt &&
      !currentReceipt.needsStateCheck &&
      !currentReceipt.alerts?.length &&
      sameHandle(currentReceipt.accountHandle, action.accountHandle) &&
      [
        xURL(action.accountURL).pathname.toLowerCase(),
        xURL(receiptTarget.url).pathname.toLowerCase(),
      ].includes(currentPath) &&
      currentReceipt.posts?.some(
        (p: any) => p.id === receiptPath[3] && matchesContent(p),
      );
    return reusableReceipt ? currentReceipt : null;
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
          preferClientNavigation: true,
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
          error instanceof Error ? error.message : String(error),
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
    const card =
      candidate.quoteCards?.length === 1 ? candidate.quoteCards[0] : null;
    const expected = xURL(action.quoteTarget.url);
    const identities = new Map<string, string>();
    for (const link of card?.links ?? []) {
      try {
        const url = xURL(new URL(link, value.page).href);
        const m = url.pathname.match(
          /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:\/photo\/\d+)?$/,
        );
        if (m) identities.set(m[2], `https://x.com/${m[1]}/status/${m[2]}`);
      } catch {
        /* Non-X links do not identify the quote card. */
      }
    }
    const observedURL = identities.get(action.quoteTarget.postId);
    if (
      action.kind === "original" &&
      card &&
      identities.size === 1 &&
      observedURL &&
      observedURL.toLowerCase() === expected.href.toLowerCase() &&
      sameHandle(card.author, expected.pathname.split("/")[1]) &&
      Number.isFinite(Date.parse(card.datetime))
    ) {
      candidate.quoteSource = {
        id: action.quoteTarget.postId,
        url: observedURL,
        author: card.author,
        datetime: card.datetime,
        parentId: candidate.id,
        cardText: card.text,
        binding: "observed-card-permalink",
        bodyComplete: false,
      };
      return value;
    }
    return this.#readPost({
      postId: candidate.id,
      url: new URL(candidate.primary, value.page).href,
      evidenceRef: { page: value.page, observedAt: value.observedAt },
      resolveQuote: true,
      preferClientNavigation: action.kind === "original",
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
