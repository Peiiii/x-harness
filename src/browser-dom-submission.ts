import { readXNetworkDiagnostics } from "./browser-dom-network.js";
import { xURL, sameHandle, sameText } from "./platform-rules.js";

import { valueOf } from "./browser-common.js";
import type { DOMDependencies } from "./browser-dom-dependencies.js";
export class DOMSubmission {
  #submitAX!: DOMDependencies["submitAX"];
  #session!: DOMDependencies["session"];
  #tab!: DOMDependencies["tab"];
  #observe!: DOMDependencies["observe"];
  #unique!: DOMDependencies["unique"];
  #locator!: DOMDependencies["locator"];
  constructor(
    dependencies: Pick<
      DOMDependencies,
      "submitAX" | "session" | "tab" | "observe" | "unique" | "locator"
    >,
  ) {
    this.finishDOMAction = this.finishDOMAction.bind(this);
    const { submitAX, session, tab, observe, unique, locator } = dependencies;
    this.#submitAX = submitAX;
    this.#session = session;
    this.#tab = tab;
    this.#observe = observe;
    this.#unique = unique;
    this.#locator = locator;
  }
  public async finishDOMAction(
    command: any,
    prepared: any,
    query: any,
    result: any,
  ) {
    const { loc, submittedEditor } = prepared;
    const binding =
      command.operation === "openReply"
        ? {
            page: result.page,
            postId: command.postId,
            body: result.posts[0].body,
            author: result.posts[0].author,
          }
        : null;
    let nativeSubmitIndex: any;
    if (
      this.#submitAX &&
      command.activation !== "keyboard" &&
      ["submitPost", "submitReply"].includes(command.operation)
    ) {
      const native = await this.#submitAX.observe({ mode: "composer" });
      const editors =
        native.evidence?.filter((e: any) =>
          /^(?:文本输入区(?:域)?|文本区域|文本栏) /.test(e.label),
        ) ?? [];
      const buttons =
        native.evidence?.filter((e: any) =>
          new RegExp(
            command.operation === "submitReply"
              ? "^按钮 (回复|Reply)(?:,|$)"
              : "^按钮 (发帖|发布|Post)(?:,|$)",
            "i",
          ).test(e.label),
        ) ?? [];
      if (
        native.needsStateCheck ||
        native.alerts?.length ||
        xURL(native.page).href !== xURL(result.page).href ||
        editors.length !== 1 ||
        valueOf(editors[0].label)?.trim() !== result.editorText.trim() ||
        buttons.length !== 1
      )
        throw new Error("原生提交缺同页、全文及唯一按钮证据");
      nativeSubmitIndex = buttons[0].index;
    }
    if (["submitPost", "submitReply"].includes(command.operation))
      await command.beforeSubmit?.();
    this.#session.current = null;
    const activationStartedAt = Date.now();
    if (nativeSubmitIndex !== undefined)
      await this.#submitAX.act({
        index: nativeSubmitIndex,
        operation: "click",
        read: { mode: "composer" },
      });
    else if (command.activation === "keyboard") await loc.press("Enter");
    else await loc.click();
    if (binding) {
      this.#session.replyBinding = binding;
      await this.#tab.playwright
        .getByRole("textbox", { name: /^(帖子文本|Post text)$/i })
        .waitFor({ state: "visible", timeoutMs: 5000 });
      if (xURL(await this.#tab.url()).pathname === "/compose/post")
        await this.#tab.playwright
          .getByText(
            new RegExp(`^回复 @${binding.author}(?:$|[\\s,，、])`, "i"),
          )
          .waitFor({ state: "visible", timeoutMs: 5000 });
      const composer = await this.#observe({ view: "composer" });
      const quote =
        composer.replyQuotes?.length === 1 ? composer.replyQuotes[0] : null;
      if (
        !composer.replyToId &&
        !composer.needsStateCheck &&
        !composer.alerts?.length &&
        composer.editorText?.trim() === "" &&
        composer.replyContexts?.length === 1 &&
        composer.replyContexts[0].includes(`回复 @${binding.author}`) &&
        /显示更多|Show more/.test(composer.replyContexts[0]) &&
        quote?.length >= 30 &&
        binding.body?.startsWith(quote)
      ) {
        // Expand the observed quote; the unchanged full-context binding gate must still pass.
        const dialog = await this.#unique(
          this.#locator("dialog").filter({ visible: true }),
        );
        const more = await this.#unique(
          dialog.getByRole("button", { name: /^(显示更多|Show more)$/i }),
        );
        this.#session.current = null;
        await more.click();
        await this.#observe({ view: "composer" });
      }
    }
    // Inline replies keep the editor mounted. Wait for this submitted text to clear before
    // receipt navigation/reload can interrupt the actual submission request.
    if (submittedEditor)
      await this.waitSubmittedEditor(
        submittedEditor,
        result,
        activationStartedAt,
      );
    const receipt =
      command.operation === "submitReply" && command.actionId
        ? await this.captureReplyReceipt(command, result)
        : undefined;
    if (["submitPost", "submitReply"].includes(command.operation)) {
      try {
        await this.#tab.playwright.waitForLoadState({
          state: "networkidle",
          timeoutMs: 8000,
        });
      } catch (error) {
        // X background traffic may never become idle after a successful click.
        // Continue to the caller's fresh receipt verification, never another click.
        if (!/Timed out waiting for networkidle/i.test(String(error)))
          throw error;
      }
    }
    return receipt;
  }
  private async captureReplyReceipt(command: any, submitted: any) {
    const value = await this.#observe({ view: "posts", limit: 1 });
    if (
      value.needsStateCheck ||
      value.alerts?.length ||
      value.page !== submitted.page ||
      !sameHandle(value.accountHandle, submitted.accountHandle)
    )
      return;
    const candidates = new Map<string, any>();
    for (const link of value.submissionLinks ?? []) {
      try {
        const url = xURL(new URL(link.href, value.page).href);
        const match = url.pathname.match(/^\/(\w{1,15})\/status\/(\d+)$/);
        if (
          !url.search &&
          !url.hash &&
          match &&
          sameHandle(match[1], submitted.accountHandle)
        )
          candidates.set(url.href, { id: match[2], url: url.href });
      } catch {
        /* Invalid visible links are not receipts. */
      }
    }
    if (candidates.size !== 1) return;
    return {
      actionId: command.actionId,
      accountHandle: value.accountHandle,
      page: value.page,
      capturedAt: new Date().toISOString(),
      receiptCandidate: [...candidates.values()][0],
      submissionLinks: value.submissionLinks,
    };
  }
  private async waitSubmittedEditor(
    editor: any,
    submitted: any,
    activationStartedAt: number,
  ): Promise<void> {
    let cursor = 0;
    const requests = new Set<string>(),
      transportEvents: any[] = [];
    const deadline = Date.now() + 10000;
    for (let attempt = 0; attempt < 4; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw Error("submitted-editor-clear-timeout");
      try {
        await editor.waitFor({ state: "hidden", timeoutMs: remaining });
        return;
      } catch (error: any) {
        if (!/timed out|timeout|deadline exceeded/i.test(error.message))
          throw error;
        // Capture this original page before receipt recovery can navigate away.
        const current = await this.#observe({ view: "composer" });
        error.submissionDiagnostic = {
          code: "submitted-editor-clear-unconfirmed",
          page: current.page,
          accountHandle: current.accountHandle,
          alerts: current.alerts ?? [],
          needsStateCheck: current.needsStateCheck === true,
          editorState:
            typeof current.editorText !== "string"
              ? "missing"
              : current.editorText.trim() === ""
                ? "empty"
                : sameText(current.editorText, submitted.editorText)
                  ? "retained"
                  : "changed",
        };
        const contextChanged =
          current.needsStateCheck ||
          current.alerts?.length ||
          !current.accountHandle ||
          !submitted.accountHandle ||
          !sameHandle(current.accountHandle, submitted.accountHandle) ||
          xURL(current.page).href !== xURL(submitted.page).href ||
          (typeof current.editorText === "string" &&
            current.editorText.trim() &&
            (!sameText(current.editorText, submitted.editorText) ||
              current.replyToId !== submitted.replyToId));
        // Clearing is only a readiness signal. The caller still verifies exact public content/parent.
        if (
          !contextChanged &&
          typeof current.editorText === "string" &&
          current.editorText.trim() === "" &&
          current.editors?.length === 1 &&
          current.replyToId === submitted.replyToId
        )
          return;
        // Optional read-only diagnostics on failure only. No headers/body or new X request.
        if (typeof this.#tab.capabilities?.get === "function") {
          try {
            const trace = await readXNetworkDiagnostics(this.#tab, {
              afterSequence: cursor,
            });
            cursor = trace.cursor;
            for (const event of trace.events) {
              if (
                event.requestMethod === "POST" &&
                /\/(?:CreateTweet|EditTweet)[A-Za-z0-9_]*$/.test(
                  event.location ?? "",
                ) &&
                typeof event.wallTime === "number" &&
                event.wallTime * 1000 >= activationStartedAt
              )
                requests.add(event.requestId);
              if (requests.has(event.requestId)) transportEvents.push(event);
            }
            if (transportEvents.length)
              error.submissionDiagnostic.transport = {
                activationStartedAt: new Date(
                  activationStartedAt,
                ).toISOString(),
                events: transportEvents,
                scope: "matching-submission-requests-only",
                truncated: trace.truncated,
              };
          } catch {
            /* Optional capability unavailable; original unknown remains unchanged. */
          }
        }
        if (contextChanged) throw error;
        if (attempt === 3 || Date.now() >= deadline) throw error;
      }
    }
  }
}
export function createDOMSubmission(
  ...args: ConstructorParameters<typeof DOMSubmission>
) {
  return new DOMSubmission(...args).finishDOMAction;
}
