import { BrowserReadDeadline } from "./browser-read-deadline.js";
import { matchesComposerQuote } from "./platform-quote.js";
import { createAXHarness } from "./readers-ax-host.js";

import { readXObservation } from "./observation.js";

import { collectCreatorDOM } from "./creator.js";
import { serialized } from "./browser-common.js";
import { createDOMCapabilities } from "./browser-dom-capabilities.js";
import { createDOMNavigation } from "./browser-dom-navigation.js";
import { createDOMEditing } from "./browser-dom-editing.js";
import { createDOMSubmission } from "./browser-dom-submission.js";
import { compatibleTab } from "./browser-tab-compat.js";
import type { DOMSession } from "./browser-dom-dependencies.js";
export { readXNetworkDiagnostics } from "./browser-dom-network.js";
export class DOMXBrowser {
  #readDeadline: BrowserReadDeadline;
  readonly #tab!: any;
  readonly #readDOM!: any;
  readonly #nativeSubmit!: any;
  #session!: DOMSession;
  #submitAX!: any;
  #navigation!: ReturnType<typeof createDOMNavigation>;
  #editing!: ReturnType<typeof createDOMEditing>;
  #finishDOMAction!: ReturnType<typeof createDOMSubmission>;
  #defaultPostActivation?: "click" | "keyboard";
  #creatorTrace?: <T>(stage: string, run: () => Promise<T>) => Promise<T>;
  capabilities!: (operation: any) => any;
  observe!: (query: any) => Promise<any>;
  constructor(
    tab: any,
    {
      readDOM = readXObservation,
      readTimeoutMs = 5000,
      nativeSubmit = false,
      defaultPostActivation,
      creatorTrace,
      navigationTrace,
      captureSubmissionNetwork = false,
    }: any = {},
  ) {
    this.#readDeadline = new BrowserReadDeadline(readTimeoutMs);
    this.act = this.act.bind(this);
    this.screenshot = this.screenshot.bind(this);
    this.collectCreator = this.collectCreator.bind(this);
    this.#tab = compatibleTab(tab);
    this.#readDOM = readDOM;
    this.#nativeSubmit = nativeSubmit;
    this.#defaultPostActivation = defaultPostActivation;
    this.#creatorTrace = creatorTrace;
    this.#session = {};
    this.#submitAX = this.#nativeSubmit
      ? createAXHarness({
          getAXState: (options: any) => this.#tab.getAXState(options),
          click: (index: any) => this.#tab.click(index),
        })
      : null;
    this.#navigation = createDOMNavigation({
      trace: navigationTrace,
      readDeadline: this.#readDeadline,
      session: this.#session,
      tab: this.#tab,
      observe: this.handleObserve.bind(this),
    });
    this.#editing = createDOMEditing({
      session: this.#session,
      unique: this.unique.bind(this),
      locator: this.locator.bind(this),
      tab: this.#tab,
      observe: this.handleObserve.bind(this),
    });
    this.#finishDOMAction = createDOMSubmission({
      captureSubmissionNetwork,
      submitAX: this.#submitAX,
      session: this.#session,
      tab: this.#tab,
      observe: this.handleObserve.bind(this),
      unique: this.unique.bind(this),
      locator: this.locator.bind(this),
    });
    Object.assign(
      this,
      createDOMCapabilities({
        tab: this.#tab,
        nativeSubmit: this.#nativeSubmit,
      }),
    );
    this.observe = this.handleObserve.bind(this);
    Object.assign(
      this,
      serialized({
        ...createDOMCapabilities({
          tab: this.#tab,
          nativeSubmit: this.#nativeSubmit,
        }),
        observe: this.handleObserve.bind(this),
        collectCreator: this.collectCreator,
        screenshot: () => {
          this.#session.current = null;
          return this.#readDeadline.run("screenshot", () =>
            this.#tab.screenshot(),
          );
        },
        act: this.act,
      }),
    );
  }
  private async handleObserve(query: any): Promise<any> {
    this.#session.current = null;
    const evaluate = this.#tab?.playwright?.evaluate?.bind(
      this.#tab.playwright,
    );
    if (!evaluate) throw new Error("缺playwright.evaluate能力");
    const hostStartedAtMs = Date.now();
    const result = await this.#readDeadline.run<any>(
      "observe:" + query.view,
      () =>
        evaluate(
          this.#readDOM,
          { ...query, limit: query.limit ?? 1 },
          // The local read deadline also bounds host-side scope setup.
          { timeoutMs: this.#readDeadline.timeoutMs },
        ),
    );
    const hostFinishedAtMs = Date.now();
    if (result.domReadTiming)
      result.domReadTiming = {
        ...result.domReadTiming,
        hostStartedAtMs,
        hostFinishedAtMs,
      };
    const raw = result;
    this.#session.composerScope =
      query.view === "composer" ? raw.composerScope : undefined;
    // Exact informational messages are retained; any added refusal text stays
    // an alert. A send toast alone never proves publication.
    const informational = (text: string) =>
      text.trim() === "检测到 AI 生成内容" ||
      text.trim() === "你的帖子已发送。\n查看" ||
      text.trim() === "你的帖子已发送。你有 1 小时时间进行任何编辑。\n查看";
    result.notices = (result.alerts ?? []).filter(informational);
    if (this.#session.refreshNotice) {
      result.notices.push(this.#session.refreshNotice);
      this.#session.refreshNotice = null;
    }
    result.alerts = (result.alerts ?? []).filter(
      (text: string) => !informational(text),
    );
    if (query.view === "composer") {
      const observedParentId = raw.replyToId;
      const binding = this.#session.replyBinding;
      const replyComposer =
        binding &&
        (!observedParentId || observedParentId === binding.postId) &&
        raw.buttons?.filter((b: any) => /^(回复|Reply)$/i.test(b.label))
          .length === 1 &&
        !raw.buttons?.some((b: any) => /^(发帖|发布|Post)$/i.test(b.label));
      // A status link alone can occur in an original/quote composer.
      result.replyToId = null;
      if (this.#session.quoteBinding && raw.quoteContexts?.length === 1) {
        const q = raw.quoteContexts[0],
          b = this.#session.quoteBinding;
        if (matchesComposerQuote(q, b)) result.quoteSourceId = b.postId;
      }
      result.editorText =
        raw.editors?.length === 1 ? raw.editors[0].text : null;
      if (
        replyComposer &&
        result.inlineComposer &&
        raw.editors?.length === 1 &&
        this.#session.replyBinding?.page === result.page &&
        result.page.match(/\/status\/(\d+)$/)?.[1] ===
          this.#session.replyBinding.postId
      )
        result.replyToId = this.#session.replyBinding.postId;
      if (
        replyComposer &&
        !result.inlineComposer &&
        raw.editors?.length === 1 &&
        this.#session.replyBinding?.body &&
        this.#session.replyBinding?.author &&
        result.replyContexts?.length === 1 &&
        (result.replyContexts[0].includes(this.#session.replyBinding.body) ||
          (result.replyQuotes?.length === 1 &&
            result.replyQuotes[0].length >= 80 &&
            this.#session.replyBinding.body.startsWith(
              result.replyQuotes[0],
            ))) &&
        new RegExp(`回复 @${binding.author}(?:$|[\\s,，、])`, "i").test(
          result.replyContexts[0],
        )
      )
        result.replyToId = this.#session.replyBinding.postId;
    }
    this.#session.current = { query, result };
    return result;
  }
  private composerDialogs() {
    const dialogs = this.#tab.playwright
      .getByRole("dialog")
      .filter({ visible: true });
    return dialogs.filter({
      hasNot: this.#tab.playwright
        .getByRole("dialog")
        .filter({ visible: true }),
    });
  }
  private composerRoot() {
    return this.#session.composerScope === "main"
      ? this.#tab.playwright.getByRole("main").filter({ visible: true })
      : this.composerDialogs();
  }
  private locator(role: any, label: any = undefined) {
    const options = label ? { name: label, exact: true } : {};
    if (this.#session.composerScope) {
      const root = this.composerRoot();
      if (role === this.#session.composerScope) return root;
      return root.getByRole(role, options);
    }
    return this.#tab.playwright.getByRole(role, options);
  }
  private async unique(loc: any) {
    if (this.#session.composerScope) {
      if (
        (await this.composerRoot().count()) !== 1 ||
        (this.#session.composerScope === "main" &&
          (await this.composerDialogs().count()) !== 0)
      )
        throw new Error("composer-scope-not-unique");
    }
    const count = await loc.count();
    if (count !== 1) throw new Error(`DOM语义控件不唯一 count=${count}`);
    return loc;
  }
  public async collectCreator({
    handle,
    ...options
  }: import("./types.js").CreatorOptions) {
    this.#session.current = null;
    return collectCreatorDOM(this.#tab, handle, options, this.#creatorTrace);
  }
  public screenshot() {
    this.#session.current = null;
    return this.#readDeadline.run("screenshot", () => this.#tab.screenshot());
  }
  public async act(command: any) {
    if (
      command.operation === "submitPost" &&
      command.activation === undefined &&
      this.#defaultPostActivation
    )
      command = { ...command, activation: this.#defaultPostActivation };
    if (Object.hasOwn(this.#navigation, command.operation)) {
      this.#session.composerScope = undefined;
      return (
        this.#navigation as unknown as Record<
          string,
          (command: any) => Promise<any>
        >
      )[command.operation](command);
    }
    if (!this.#session.current) throw new Error("DOM语义操作必须先observe");
    const { query, result } = this.#session.current;
    const handler = Object.hasOwn(this.#editing, command.operation)
      ? (
          this.#editing as unknown as Record<
            string,
            (command: any) => Promise<any>
          >
        )[command.operation]
      : undefined;
    if (!handler) throw new Error("未封装的DOM动作");
    let prepared;
    try {
      prepared = await handler(command);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("DOM语义控件不唯一")
      )
        throw new Error(`${command.operation}: ${error.message}`, {
          cause: error,
        });
      throw error;
    }
    if (prepared.completed) return prepared.value;
    return this.#finishDOMAction(command, prepared, query, result);
  }
}
export function createDOMXBrowser(
  ...args: ConstructorParameters<typeof DOMXBrowser>
): any {
  return new DOMXBrowser(...args);
}
