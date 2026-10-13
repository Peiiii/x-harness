import type { BoundaryRecord } from "./boundary.js";
import { collectCreatorNative } from "./creator-native.js";
import { createAXHarness } from "./readers-ax-host.js";
import { readAX } from "./readers-ax-parser.js";
import { xURL } from "./platform-rules.js";
import {
  serialized,
  missingMethods,
  plain,
  valueOf,
} from "./browser-common.js";
export class NativeXBrowser {
  readonly #app!: any;
  #latestAX!: any;
  #delegated!: BoundaryRecord;
  #low!: ReturnType<typeof createAXHarness>;
  #current!: any;
  #modes!: BoundaryRecord;
  observe!: (query: any) => Promise<any>;
  constructor(app: any) {
    this.screenshot = this.screenshot.bind(this);
    this.act = this.act.bind(this);

    this.capabilities = this.capabilities.bind(this);
    this.collectCreator = this.collectCreator.bind(this);
    this.#app = app;
    this.#delegated = {};
    for (const name of [
      "getAXState",
      "click",
      "pressKey",
      "paste",
      "scroll",
      "performSecondaryAction",
      "getScreenshot",
    ]) {
      Object.defineProperty(this.#delegated, name, {
        get: (): any => {
          if (typeof this.#app?.[name] !== "function") return undefined;
          return name === "getAXState"
            ? async (options: any) => {
                this.#latestAX = await this.#app.getAXState(options);
                return this.#latestAX;
              }
            : (...args: any[]) => this.#app[name](...args);
        },
      });
    }
    this.#low = createAXHarness(this.#delegated);
    this.#modes = {
      account: "navigation",
      person: "profile",
      posts: "posts",
      composer: "composer",
    };
    this.observe = this.handleObserve.bind(this);
    Object.assign(
      this,
      serialized({
        collectCreator: (args: import("./types.js").CreatorOptions) =>
          collectCreatorNative(this.#low, args),
        capabilities: this.capabilities,
        observe: this.handleObserve.bind(this),
        act: this.act,
        screenshot: () => {
          this.#current = null;
          return this.#low.screenshot();
        },
      }),
    );
  }
  private async navigateNativeTarget(command: any): Promise<any> {
    xURL(command.url);
    if (!command.evidenceRef) throw new Error("导航URL缺原观察证据");
    await this.#low.observe({ mode: "navigation" }).then((raw: any) => {
      this.#current = { raw };
    });
    let index = this.one((e: any) => /^文本栏 .*地址和搜索栏/.test(e.label));
    await this.#low
      .act({
        index,
        operation: "fill",
        value: command.url,
        read: { mode: "navigation" },
      })
      .then((raw: any) => {
        this.#current = { raw };
      });
    index = this.one((e: any) => /^文本栏 .*地址和搜索栏/.test(e.label));
    await this.#low.act({
      index,
      operation: "pressKey",
      value: "Return",
      read: { mode: "navigation" },
    });
    this.#current = null;
    return;
  }
  private async handleObserve(query: any): Promise<any> {
    this.#current = null;
    if (!this.#modes[query.view]) throw new Error("未封装的业务视图");
    const raw = await this.#low.observe({
      mode: this.#modes[query.view],
      ...(query.targetId ? { targetId: query.targetId } : {}),
      limit: query.limit ?? 1,
    });
    this.#current = { query, raw };
    const entries = raw.evidence ?? [];
    // Bind actor and target to the SAME suppressed observation; no additional tool round trip.
    const ownLinks = readAX(this.#latestAX, {
      mode: "navigation",
    }).evidence.filter((e: any) =>
      /^link 个人资料, Value: x\.com\/\w+$/.test(e.label),
    );
    const base: BoundaryRecord = {
      page: raw.page,
      alerts: raw.alerts,
      needsStateCheck: raw.needsStateCheck,
      missing: raw.missing ?? [],
      accountHandle:
        ownLinks.length === 1
          ? ownLinks[0].label.match(/x\.com\/(\w+)$/)[1]
          : null,
    };
    if (query.view === "account") {
      const own = entries.filter((e: any) =>
        /^link 个人资料, Value: x\.com\/\w+$/.test(e.label),
      );
      return {
        ...base,
        accountHandle:
          own.length === 1 ? own[0].label.match(/x\.com\/(\w+)$/)[1] : null,
        accountURL:
          own.length === 1 ? `https://${valueOf(own[0].label)}` : null,
      };
    }
    if (query.view === "person") {
      const labels = entries.map((e: any) => plain(e.label));
      return {
        ...base,
        handle: query.handle,
        relationship:
          labels.includes(`正在关注 @${query.handle}`) ||
          labels.includes(`取消关注 @${query.handle}`)
            ? "following"
            : labels.includes(`回关 @${query.handle}`)
              ? "follows-you"
              : labels.includes(`关注 @${query.handle}`)
                ? "not-following"
                : "unknown",
        blue: null,
        blueEvidenceSupported: false,
      };
    }
    if (query.view === "composer") {
      const editors = entries.filter((e: any) =>
        /^(?:文本输入区(?:域)?|文本区域|文本栏) /.test(e.label),
      );
      const ids = [
        ...new Set(
          entries.flatMap(
            (e: any) =>
              e.label.match(/x\.com\/\w+\/status\/(\d+)(?:,|$)/)?.[1] ?? [],
          ),
        ),
      ];
      return {
        ...base,
        editorText: editors.length === 1 ? valueOf(editors[0].label) : null,
        replyToId: ids.length === 1 ? ids[0] : null,
      };
    }
    return {
      ...base,
      posts: (raw.posts ?? []).map((p: any) => ({
        ...p,
        body: p.text,
        replyToId: null,
      })),
    };
  }
  private one(predicate: any) {
    const entries = (this.#current?.raw.evidence ?? [])
      .concat(this.#current?.raw.navigation ?? [])
      .filter(predicate);
    if (entries.length !== 1)
      throw new Error("语义控件未唯一观察：先补能力/证据");
    return entries[0].index;
  }
  public collectCreator(args: import("./types.js").CreatorOptions) {
    return collectCreatorNative(this.#low, args);
  }
  public capabilities(operation: any): any {
    if (operation === "readPeople") return ["native-people-blue-evidence"];
    if (
      ["readBookmarks", "searchSources", "readFeedback", "likePost"].includes(
        operation,
      )
    )
      return [`native.${operation}`];
    const names =
      operation === "read"
        ? ["getAXState"]
        : ["getAXState", "click", "pressKey", "paste"];
    return operation === "attachAssets"
      ? ["native.attachAssets"]
      : operation === "refreshPosts"
        ? ["native.refreshPosts"]
        : missingMethods(this.#app, names);
  }
  public async act(command: any): Promise<any> {
    if (command.operation === "waitForPosts") {
      this.#current = null;
      return this.#low.observe({ mode: "posts", limit: 5 });
    }
    if (command.operation === "openObserved") {
      return this.navigateNativeTarget(command);
    }
    if (command.operation === "refreshPerson") {
      xURL(command.url);
      await this.#low.observe({ mode: "navigation" }).then((raw: any) => {
        this.#current = { raw };
      });
      const index = this.one((e: any) =>
        /^按钮 (重新加载|刷新)(?:,|$)/.test(e.label),
      );
      this.#current = null;
      return this.#low.act({
        index,
        operation: "click",
        read: { mode: "profile" },
      });
    }
    if (!this.#current) throw new Error("语义操作必须先observe");
    let index: any,
      operation = "click",
      value: any;
    if (command.operation === "follow")
      index = this.one((e: any) =>
        [
          `按钮 关注 @${command.handle}`,
          `按钮 回关 @${command.handle}`,
        ].includes(e.label),
      );
    else if (command.operation === "openReply") {
      if (this.#current.query?.targetId !== command.postId)
        throw new Error("回复目标不匹配");
      const target = this.#current.raw.posts?.filter(
        (p: any) => p.id === command.postId,
      );
      if (target?.length !== 1) throw new Error("回复主帖不唯一");
      const buttons = target[0].evidence.filter((e: any) =>
        /^按钮 .*回复/.test(e.label),
      );
      if (buttons.length !== 1) throw new Error("回复按钮不唯一");
      index = buttons[0].index;
    } else if (command.operation === "fillComposer") {
      index = this.one((e: any) =>
        /^(?:文本输入区(?:域)?|文本区域|文本栏) /.test(e.label),
      );
      operation = "fill";
      value = command.text;
    } else if (["submitPost", "submitReply"].includes(command.operation)) {
      index = this.one((e: any) =>
        new RegExp(
          command.operation === "submitReply"
            ? "^按钮 (回复|Reply)(?:,|$)"
            : "^按钮 (发帖|发布|Post)(?:,|$)",
          "i",
        ).test(e.label),
      );
    } else throw new Error("未封装的原生动作");
    const read: BoundaryRecord = {
      mode: command.operation === "follow" ? "profile" : "composer",
    };
    if (["submitPost", "submitReply"].includes(command.operation))
      await command.beforeSubmit?.();
    this.#current = null;
    return this.#low.act({ index, operation, value, read });
  }
  public screenshot() {
    this.#current = null;
    return this.#low.screenshot();
  }
}
export function createNativeXBrowser(
  ...args: ConstructorParameters<typeof NativeXBrowser>
): any {
  return new NativeXBrowser(...args);
}
