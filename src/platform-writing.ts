import type { PlatformDependencies } from "./platform-dependencies.js";
import {
  xURL,
  sameHandle,
  sameText,
  samePublishedText,
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
  findSubmission!: (action: any) => Promise<any>;
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
      (action.kind === "reply" && value.replyToId !== action.postId)
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
  private async handleFindSubmission(action: any): Promise<any> {
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
    const matchesContent = (post: any) =>
      sameHandle(post.author, action.accountHandle) &&
      samePublishedText(post.body, action.text) &&
      /^\d+$/.test(post.id ?? "") &&
      (!action.assets?.length ||
        action.assets.every((asset: any) =>
          post.images?.some((image: any) => image.alt === asset.alt),
        )) &&
      !(action.beforeIds ?? []).includes(post.id) &&
      Number.isFinite(Date.parse(post.datetime)) &&
      Date.parse(post.datetime) >= Date.parse(action.intentAt) &&
      Date.parse(post.datetime) <= this.#clock() + 5000 &&
      !post.needsExpansion;
    let matches = (value.posts ?? []).filter(matchesContent);
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
        value = await this.#open(
          {
            url: url.href,
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
            replyTargetId: action.postId,
          },
        );
        matches = (value.posts ?? []).filter(matchesContent);
      }
    }
    if (action.kind === "reply")
      matches = matches.filter((post: any) => post.replyToId === action.postId);
    return {
      ...value,
      verified:
        !value.needsStateCheck && !value.alerts?.length && matches.length === 1,
      publicId: matches.length === 1 ? matches[0].id : null,
      missing:
        matches.length === 1 ? [] : ["unique-public-submission-unconfirmed"],
    };
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
    await this.#open(
      { url: action.composeURL, evidenceRef: action.composeEvidenceRef },
      { view: "composer" },
    );
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
