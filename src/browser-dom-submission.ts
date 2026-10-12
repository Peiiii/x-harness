import { xURL } from "./platform-rules.js";

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
      await submittedEditor.waitFor({ state: "hidden", timeoutMs: 10000 });
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
  }
}
export function createDOMSubmission(
  ...args: ConstructorParameters<typeof DOMSubmission>
) {
  return new DOMSubmission(...args).finishDOMAction;
}
