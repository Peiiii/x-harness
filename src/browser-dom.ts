import { createAXHarness } from "./readers-ax-host.js";

import { readXObservation } from "./observation.js";

import { collectCreatorDOM } from "./creator.js";
import { serialized } from "./browser-common.js";
import { createDOMCapabilities } from "./browser-dom-capabilities.js";
import { createDOMNavigation } from "./browser-dom-navigation.js";
import { createDOMEditing } from "./browser-dom-editing.js";
import { createDOMSubmission } from "./browser-dom-submission.js";
import type { DOMSession } from "./browser-dom-dependencies.js";
export { readXNetworkDiagnostics } from "./browser-dom-network.js";
export class DOMXBrowser {
  readonly #tab!: any;
  readonly #readDOM!: any;
  readonly #nativeSubmit!: any;
  #session!: DOMSession;
  #submitAX!: any;
  #navigation!: ReturnType<typeof createDOMNavigation>;
  #editing!: ReturnType<typeof createDOMEditing>;
  #finishDOMAction!: ReturnType<typeof createDOMSubmission>;
  capabilities!: (operation: any) => any;
  observe!: (query: any) => Promise<any>;
  constructor(
    tab: any,
    { readDOM = readXObservation, nativeSubmit = false }: any = {},
  ) {
    this.act = this.act.bind(this);
    this.screenshot = this.screenshot.bind(this);
    this.collectCreator = this.collectCreator.bind(this);
    this.#tab = tab;
    this.#readDOM = readDOM;
    this.#nativeSubmit = nativeSubmit;
    this.#session = {};
    this.#submitAX = this.#nativeSubmit
      ? createAXHarness({
          getAXState: (options: any) => this.#tab.getAXState(options),
          click: (index: any) => this.#tab.click(index),
        })
      : null;
    this.#navigation = createDOMNavigation({
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
          return this.#tab.screenshot();
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
    const result = await evaluate(this.#readDOM, {
      ...query,
      limit: query.limit ?? 1,
    });
    const raw = result;
    // This observed disclosure confirms AI provenance; preserve it without treating it as a rate/login failure.
    result.notices = (result.alerts ?? []).filter(
      (text: any) => text.trim() === "检测到 AI 生成内容",
    );
    if (this.#session.refreshNotice) {
      result.notices.push(this.#session.refreshNotice);
      this.#session.refreshNotice = null;
    }
    result.alerts = (result.alerts ?? []).filter(
      (text: any) => text.trim() !== "检测到 AI 生成内容",
    );
    if (query.view === "composer") {
      if (this.#session.quoteBinding && raw.quoteContexts?.length === 1) {
        const q = raw.quoteContexts[0],
          b = this.#session.quoteBinding;
        if (
          q.author?.toLowerCase() === b.author?.toLowerCase() &&
          q.body?.startsWith(b.body)
        )
          result.quoteSourceId = b.postId;
      }
      result.editorText =
        raw.editors?.length === 1 ? raw.editors[0].text : null;
      if (
        result.inlineComposer &&
        raw.editors?.length === 1 &&
        this.#session.replyBinding?.page === result.page &&
        result.page.match(/\/status\/(\d+)$/)?.[1] ===
          this.#session.replyBinding.postId
      )
        result.replyToId = this.#session.replyBinding.postId;
      if (
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
        result.replyContexts[0].includes(
          `回复 @${this.#session.replyBinding.author}`,
        )
      )
        result.replyToId = this.#session.replyBinding.postId;
    }
    this.#session.current = { query, result };
    return result;
  }
  private locator(role: any, label: any = undefined) {
    return this.#tab.playwright.getByRole(
      role,
      label ? { name: label, exact: true } : {},
    );
  }
  private async unique(loc: any) {
    const count = await loc.count();
    if (count !== 1) throw new Error(`DOM语义控件不唯一 count=${count}`);
    return loc;
  }
  public async collectCreator({
    handle,
    ...options
  }: import("./types.js").CreatorOptions) {
    this.#session.current = null;
    return collectCreatorDOM(this.#tab, handle, options);
  }
  public screenshot() {
    this.#session.current = null;
    return this.#tab.screenshot();
  }
  public async act(command: any) {
    if (Object.hasOwn(this.#navigation, command.operation))
      return (
        this.#navigation as unknown as Record<
          string,
          (command: any) => Promise<any>
        >
      )[command.operation](command);
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
