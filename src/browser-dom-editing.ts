import { attachImage } from "./readers-actions.js";

import type { DOMDependencies } from "./browser-dom-dependencies.js";
export class DOMEditing {
  #session!: DOMDependencies["session"];
  #unique!: DOMDependencies["unique"];
  #locator!: DOMDependencies["locator"];
  #tab!: DOMDependencies["tab"];
  #observe!: DOMDependencies["observe"];
  dismissMenu!: (
    command: any,
  ) => Promise<
    | { completed: boolean; loc?: undefined; submittedEditor?: undefined }
    | { completed: boolean; loc: any; submittedEditor: any }
  >;
  openControl!: (
    command: any,
  ) => Promise<
    | { completed: boolean; loc?: undefined; submittedEditor?: undefined }
    | { completed: boolean; loc: any; submittedEditor: any }
  >;
  openOwnPostMenu!: (
    command: any,
  ) => Promise<
    | { completed: boolean; loc?: undefined; submittedEditor?: undefined }
    | { completed: boolean; loc: any; submittedEditor: any }
  >;
  submitEditedPost!: (
    command: any,
  ) => Promise<
    | { completed: boolean; loc?: undefined; submittedEditor?: undefined }
    | { completed: boolean; loc: any; submittedEditor: any }
  >;
  expandPost!: (
    command: any,
  ) => Promise<
    | { completed: boolean; loc?: undefined; submittedEditor?: undefined }
    | { completed: boolean; loc: any; submittedEditor: any }
  >;
  nextPosts!: (
    command: any,
  ) => Promise<
    | { completed: boolean; loc?: undefined; submittedEditor?: undefined }
    | { completed: boolean; loc: any; submittedEditor: any }
  >;
  clearPreparedText!: (command: any) => Promise<
    | {
        completed: boolean;
        value: Promise<any>;
        loc?: undefined;
        submittedEditor?: undefined;
      }
    | { completed: boolean; loc: any; submittedEditor: any; value?: undefined }
  >;
  closePreparedReply!: (command: any) => Promise<
    | {
        completed: boolean;
        value: Promise<any>;
        loc?: undefined;
        submittedEditor?: undefined;
      }
    | { completed: boolean; loc: any; submittedEditor: any; value?: undefined }
  >;
  closePreparedMedia!: (command: any) => Promise<
    | {
        completed: boolean;
        value: Promise<any>;
        loc?: undefined;
        submittedEditor?: undefined;
      }
    | { completed: boolean; loc: any; submittedEditor: any; value?: undefined }
  >;
  removePreparedMedia!: (command: any) => Promise<
    | {
        completed: boolean;
        value: Promise<any>;
        loc?: undefined;
        submittedEditor?: undefined;
      }
    | { completed: boolean; loc: any; submittedEditor: any; value?: undefined }
  >;
  attachAssets!: (command: any) => Promise<
    | {
        completed: boolean;
        value: {
          assets: { path: any; alt: any }[];
          mediaEvidence: any;
          composer: any;
        };
        loc?: undefined;
        submittedEditor?: undefined;
      }
    | { completed: boolean; loc: any; submittedEditor: any; value?: undefined }
  >;
  follow!: (
    command: any,
  ) => Promise<{ completed: boolean; loc: any; submittedEditor: any }>;
  openReply!: (
    command: any,
  ) => Promise<{ completed: boolean; loc: any; submittedEditor: any }>;
  fillComposer!: (
    command: any,
  ) => Promise<
    | { completed: boolean; loc?: undefined; submittedEditor?: undefined }
    | { completed: boolean; loc: any; submittedEditor: any }
  >;
  submitPost!: (
    command: any,
  ) => Promise<{ completed: boolean; loc: any; submittedEditor: any }>;
  submitReply!: (
    command: any,
  ) => Promise<{ completed: boolean; loc: any; submittedEditor: any }>;
  constructor(
    dependencies: Pick<
      DOMDependencies,
      "session" | "unique" | "locator" | "tab" | "observe"
    >,
  ) {
    const { session, unique, locator, tab, observe } = dependencies;
    this.#session = session;
    this.#unique = unique;
    this.#locator = locator;
    this.#tab = tab;
    this.#observe = observe;
    this.dismissMenu = this.handleDismissMenu.bind(this);
    this.openControl = this.handleOpenControl.bind(this);
    this.openOwnPostMenu = this.handleOpenOwnPostMenu.bind(this);
    this.submitEditedPost = this.handleSubmitEditedPost.bind(this);
    this.expandPost = this.handleExpandPost.bind(this);
    this.nextPosts = this.handleNextPosts.bind(this);
    this.clearPreparedText = this.handleClearPreparedText.bind(this);
    this.closePreparedReply = this.handleClosePreparedReply.bind(this);
    this.closePreparedMedia = this.handleClosePreparedMedia.bind(this);
    this.removePreparedMedia = this.handleRemovePreparedMedia.bind(this);
    this.attachAssets = this.handleAttachAssets.bind(this);
    this.follow = this.handleFollow.bind(this);
    this.openReply = this.handleOpenReply.bind(this);
    this.fillComposer = this.handleFillComposer.bind(this);
    this.submitPost = this.handleSubmitPost.bind(this);
    this.submitReply = this.handleSubmitPost.bind(this);
  }
  private async handleDismissMenu(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (
      query.view !== "menu" ||
      result.needsStateCheck ||
      !result.items?.length
    )
      throw new Error("关闭菜单需已有菜单证据");
    const item = result.items[0];
    this.#session.current = null;
    await (
      await this.#unique(this.#locator(item.role, item.label))
    ).press("Escape");
    return { completed: true };
    return { completed: false, loc, submittedEditor };
  }
  private async handleOpenControl(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (!["navigation", "menu"].includes(query.view) || result.needsStateCheck)
      throw new Error("导航控件须先唯一观察");
    const matches = (result.controls ?? result.items ?? []).filter(
      (c: any) =>
        c.role === command.role &&
        c.label === command.label &&
        c.href === command.href &&
        !c.disabled,
    );
    if (matches.length !== 1) throw new Error("导航控件未唯一观察");
    this.#session.current = null;
    await (
      await this.#unique(
        command.role === "text"
          ? this.#tab.playwright.getByText(command.label, { exact: true })
          : this.#locator(command.role, command.label),
      )
    ).click();
    if (command.href?.startsWith("/"))
      await this.#tab.playwright.waitForURL(`https://x.com${command.href}`, {
        timeoutMs: 5000,
      });
    return { completed: true };
    return { completed: false, loc, submittedEditor };
  }
  private async handleOpenOwnPostMenu(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    const post = result.posts?.[0];
    if (
      query.view !== "posts" ||
      result.needsStateCheck ||
      result.posts?.length !== 1 ||
      post.id !== command.postId ||
      post.author?.toLowerCase() !== result.accountHandle?.toLowerCase() ||
      post.primary?.match(/\/status\/(\d+)$/)?.[1] !== command.postId
    )
      throw new Error("编辑需唯一本人原帖");
    const more = post.buttons.filter(
      (b: any) => /^(更多|More)$/.test(b.label) && !b.disabled,
    );
    if (more.length !== 1) throw new Error("原帖更多按钮未唯一观察");
    const article = this.#locator("article").filter({
      has: this.#tab.playwright.locator(
        `a[href=${JSON.stringify(post.primary)}]`,
      ),
      visible: true,
    });
    this.#session.editBinding = {
      postId: post.id,
      accountHandle: result.accountHandle,
      body: post.body,
    };
    this.#session.current = null;
    await (
      await this.#unique(
        (await this.#unique(article)).getByRole("button", {
          name: more[0].label,
          exact: true,
        }),
      )
    ).click();
    return { completed: true };
    return { completed: false, loc, submittedEditor };
  }
  private async handleSubmitEditedPost(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (
      query.view !== "composer" ||
      result.needsStateCheck ||
      result.alerts?.length ||
      !this.#session.editBinding ||
      this.#session.editBinding.postId !== command.postId ||
      result.accountHandle !== this.#session.editBinding.accountHandle ||
      !command.evidenceRef ||
      !command.approvedText?.trim() ||
      result.editorText !== command.approvedText ||
      result.editors?.length !== 1
    )
      throw new Error("编辑提交缺本人原帖绑定或精确审稿证据");
    const updates = result.buttons.filter(
      (b: any) => /^(更新|Update)$/.test(b.label) && !b.disabled,
    );
    if (updates.length !== 1) throw new Error("编辑更新按钮未唯一观察");
    const update = await this.#unique(
      this.#locator("button", updates[0].label),
    );
    await command.beforeSubmit?.();
    this.#session.current = null;
    this.#session.editBinding = null;
    if (command.activation === "keyboard") await update.press("Enter");
    else await update.click();
    await this.#tab.playwright.waitForLoadState({
      state: "networkidle",
      timeoutMs: 8000,
    });
    return { completed: true };
    return { completed: false, loc, submittedEditor };
  }
  private async handleExpandPost(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (
      query.view !== "posts" ||
      result.posts?.length !== 1 ||
      result.posts[0].id !== command.postId
    )
      throw new Error("展开需唯一原帖");
    const primary = result.posts[0].primary;
    const article = this.#locator("article").filter({
      has: this.#tab.playwright.locator(`a[href=${JSON.stringify(primary)}]`),
      visible: true,
    });
    const control = (await this.#unique(article)).getByText(
      /^(显示更多|Show more)$/i,
    );
    this.#session.current = null;
    await (await this.#unique(control)).click();
    return { completed: true };
    return { completed: false, loc, submittedEditor };
  }
  private async handleNextPosts(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (query.view !== "posts" || result.needsStateCheck)
      throw new Error("翻页须先观察原列表");
    const primary = result.posts?.at(-1)?.primary;
    if (!primary) throw new Error("翻页须有已观察原帖链接");
    const anchor = await this.#unique(
      this.#tab.playwright
        .locator(`a[href=${JSON.stringify(primary)}]`)
        .filter({ visible: true }),
    );
    this.#session.current = null;
    await anchor.press("PageDown");
    return { completed: true };
    return { completed: false, loc, submittedEditor };
  }
  private async handleClearPreparedText(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (
      query.view !== "composer" ||
      result.needsStateCheck ||
      !command.evidenceRef ||
      typeof command.text !== "string" ||
      result.editorText?.replace(/\n{3,}/g, "\n\n") !==
        command.text.replace(/\n{3,}/g, "\n\n") ||
      result.editors?.length !== 1
    )
      throw new Error("仅恢复本次已知稿件准备");
    const editor = await this.#unique(
      this.#locator("textbox", result.editors[0].label),
    );
    await editor.press("Meta+A");
    await editor.press("Backspace");
    return { completed: true, value: this.#observe({ view: "composer" }) };
    return { completed: false, loc, submittedEditor };
  }
  private async handleClosePreparedReply(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (
      query.view !== "composer" ||
      result.needsStateCheck ||
      result.editorText?.trim() !== "" ||
      !command.evidenceRef
    )
      throw new Error("仅关闭有准备失败证据的空回复");
    await (await this.#unique(this.#locator("button", "关闭"))).click();
    this.#session.replyBinding = null;
    return {
      completed: true,
      value: this.#observe({ view: "posts", limit: 5 }),
    };
    return { completed: false, loc, submittedEditor };
  }
  private async handleClosePreparedMedia(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (
      query.view !== "media" ||
      result.needsStateCheck ||
      !command.evidenceRef
    )
      throw new Error("媒体恢复须有准备失败证据");
    const backs = result.controls.filter(
      (b: any) =>
        b.role === "button" && /^(返回|Back)$/i.test(b.label) && !b.disabled,
    );
    if (backs.length !== 1) throw new Error("媒体返回入口不唯一");
    await (await this.#unique(this.#locator("button", backs[0].label))).click();
    await this.#tab.playwright
      .getByRole("textbox", { name: /^(帖子文本|Post text)$/i })
      .waitFor({ state: "visible", timeoutMs: 5000 });
    return { completed: true, value: this.#observe({ view: "composer" }) };
    return { completed: false, loc, submittedEditor };
  }
  private async handleRemovePreparedMedia(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (
      query.view !== "composer" ||
      result.needsStateCheck ||
      result.editorText?.trim() !== "" ||
      !command.evidenceRef
    )
      throw new Error("仅恢复有来源证据的空正文媒体准备");
    const removes = result.buttons.filter(
      (b: any) => /^(移除媒体|Remove media)$/i.test(b.label) && !b.disabled,
    );
    if (removes.length !== 1) throw new Error("待恢复媒体不唯一");
    await (
      await this.#unique(this.#locator("button", removes[0].label))
    ).click();
    return { completed: true, value: this.#observe({ view: "composer" }) };
    return { completed: false, loc, submittedEditor };
  }
  private async handleAttachAssets(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (
      query.view !== "composer" ||
      result.needsStateCheck ||
      command.assets?.length !== 1
    )
      throw new Error("仅上传已观察编辑器的一张图片或一个MP4视频");
    const asset = command.assets[0];
    const isVideo = /\.mp4$/i.test(asset.path ?? "");
    if (!isVideo && !asset.alt?.trim()) throw new Error("图片须有完整ALT");
    this.#session.current = null;
    await attachImage(this.#tab, { path: asset.path });
    if (isVideo) {
      await this.#tab.playwright
        .locator('[data-testid="videoPlayer"],video')
        .first()
        .waitFor({ state: "visible", timeoutMs: 60000 });
      const composer = await this.#observe({ view: "composer" });
      if (composer.needsStateCheck || !composer.videos?.length)
        throw new Error("上传视频预览未确认");
      return {
        completed: true,
        value: { assets: [asset], mediaEvidence: composer.videos, composer },
      };
    }
    await this.#tab.playwright
      .getByRole("button", {
        name: /^(?:编辑|Edit)(?:图片|照片|媒体| image| photo| media)?(?: \d+)?$/i,
      })
      .waitFor({ state: "visible", timeoutMs: 5000 });
    const composer = await this.#observe({ view: "composer" });
    const edits = composer.buttons.filter(
      (b: any) =>
        /^(?:编辑|Edit)(?:图片|照片|媒体| image| photo| media)?(?: \d+)?$/i.test(
          b.label,
        ) && !b.disabled,
    );
    if (edits.length !== 1) throw new Error("图片编辑入口未唯一观察");
    await (await this.#unique(this.#locator("button", edits[0].label))).click();
    await this.#tab.playwright
      .getByRole("tab", {
        name: /^(编辑图片描述|Edit image description)$/i,
      })
      .waitFor({ state: "visible", timeoutMs: 5000 });
    let media = await this.#observe({ view: "media" });
    const tabControl = media.controls.find(
      (c: any) =>
        c.role === "tab" &&
        /^(编辑图片描述|Edit image description)$/i.test(c.label),
    );
    if (!tabControl) throw new Error("ALT页签未观察");
    await (await this.#unique(this.#locator("tab", tabControl.label))).click();
    media = await this.#observe({ view: "media" });
    if (media.needsStateCheck || media.fields.length !== 1)
      throw new Error("ALT输入未唯一观察");
    const field = media.fields[0];
    const input = field.label
      ? this.#tab.playwright.getByLabel(field.label, { exact: true })
      : field.placeholder
        ? this.#tab.playwright.getByPlaceholder(field.placeholder, {
            exact: true,
          })
        : this.#locator("textbox");
    await (await this.#unique(input)).fill(asset.alt);
    media = await this.#observe({ view: "media" });
    if (media.fields[0]?.value !== asset.alt) throw new Error("ALT全文不匹配");
    const save = media.controls.filter(
      (c: any) =>
        c.role === "button" && /^(保存|Save)$/i.test(c.label) && !c.disabled,
    );
    if (save.length !== 1) throw new Error("ALT保存入口不唯一");
    await (await this.#unique(this.#locator("button", save[0].label))).click();
    const after = await this.#observe({ view: "composer" });
    if (after.needsStateCheck || !after.images?.length)
      throw new Error("上传图片未回到编辑器");
    return {
      completed: true,
      value: {
        assets: [{ path: asset.path, alt: asset.alt }],
        mediaEvidence: media,
        composer: after,
      },
    };
    return { completed: false, loc, submittedEditor };
  }
  private async handleFollow(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (
      query.view !== "person" ||
      query.handle !== command.handle ||
      result.needsStateCheck
    )
      throw new Error("人物身份未绑定");
    const name =
      result.relationship === "follows-you"
        ? `回关 @${command.handle}`
        : `关注 @${command.handle}`;
    loc = await this.#unique(this.#locator("button", name));
    return { completed: false, loc, submittedEditor };
  }
  private async handleOpenReply(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    this.#session.replyBinding = null;
    if (query.targetId !== command.postId || result.posts?.length !== 1)
      throw new Error("回复主帖未唯一绑定");
    const names = result.posts[0].buttons.filter((b: any) =>
      /回复|Reply/i.test(b.label),
    );
    if (names.length !== 1) throw new Error("回复按钮未唯一观察");
    const primary = result.posts[0].primary;
    if (!primary || primary.match(/\/status\/(\d+)$/)?.[1] !== command.postId)
      throw new Error("回复主帖永久链接未绑定");
    const article = this.#locator("article").filter({
      has: this.#tab.playwright.locator(`a[href=${JSON.stringify(primary)}]`),
      visible: true,
    });
    loc = await this.#unique(
      (await this.#unique(article)).getByRole("button", {
        name: names[0].label,
        exact: true,
      }),
    );
    return { completed: false, loc, submittedEditor };
  }
  private async handleFillComposer(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (query.view !== "composer" || result.editors?.length !== 1)
      throw new Error("编辑器未唯一观察");
    loc = await this.#unique(this.#locator("textbox", result.editors[0].label));
    this.#session.current = null;
    await loc.fill(command.text);
    const submits = result.buttons.filter((b: any) =>
      /^(回复|Reply|发帖|发布|Post|更新|Update)$/i.test(b.label),
    );
    if (submits.length !== 1) throw new Error("编辑后提交入口不唯一");
    await this.#locator("button", submits[0].label)
      .and(
        this.#tab.playwright.locator(
          ':not([disabled]):not([aria-disabled="true"])',
        ),
      )
      .waitFor({ state: "visible", timeoutMs: 5000 });
    return { completed: true };
    return { completed: false, loc, submittedEditor };
  }
  private async handleSubmitPost(command: any) {
    const { query, result } = this.#session.current;
    let loc: any, submittedEditor: any;
    if (query.view !== "composer") throw new Error("未观察编辑器");
    const pattern =
      command.operation === "submitReply"
        ? /^(回复|Reply)$/i
        : /^(发帖|发布|Post)$/i;
    const buttons =
      result.buttons?.filter(
        (b: any) => pattern.test(b.label) && !b.disabled,
      ) ?? [];
    if (buttons.length !== 1) throw new Error("提交按钮未唯一观察");
    loc = await this.#unique(this.#locator("button", buttons[0].label));
    if (
      command.activation !== undefined &&
      !["click", "keyboard"].includes(command.activation)
    )
      throw new Error("提交激活方式无效");
    if (command.activation === "keyboard" && typeof loc.press !== "function")
      throw new Error("缺语义按钮键盘提交能力");
    if (command.operation === "submitReply") {
      if (result.editors?.length !== 1 || !result.editorText?.trim())
        throw new Error("回复提交缺唯一完整编辑器");
      submittedEditor = this.#locator(
        "textbox",
        result.editors[0].label,
      ).filter({
        hasText: new RegExp(
          // Full text and actor are checked by platform.compose before this act.
          // Use a short observed anchor for the retained-text wait: host locator
          // bridges can reject a multi-kilobyte hasText regex on long posts.
          result.editorText
            .trim()
            .split(/\r?\n/)[0]
            .slice(0, 64)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      });
      await this.#unique(submittedEditor);
    } else {
      if (result.editors?.length !== 1 || !result.editorText?.trim())
        throw new Error("发帖提交缺唯一完整编辑器");
      // Publication with media may stay pending after the click. Do not let
      // receipt navigation interrupt it while the submitted text is retained.
      submittedEditor = this.#locator(
        "textbox",
        result.editors[0].label,
      ).filter({
        hasText: new RegExp(
          // Full text and actor are checked by platform.compose before this act.
          // Use a short observed anchor for the retained-text wait: host locator
          // bridges can reject a multi-kilobyte hasText regex on long posts.
          result.editorText
            .trim()
            .split(/\r?\n/)[0]
            .slice(0, 64)
            .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      });
      await this.#unique(submittedEditor);
    }
    return { completed: false, loc, submittedEditor };
  }
}
export function createDOMEditing(
  ...args: ConstructorParameters<typeof DOMEditing>
) {
  return new DOMEditing(...args);
}
