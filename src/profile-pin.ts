import type { XGrowthHarness, PostTarget } from "./types.js";
import type { RoundStore } from "./store.js";
interface PinLocator {
  first(): PinLocator;
  count(): Promise<number>;
  click(): Promise<unknown>;
  waitFor(options: unknown): Promise<unknown>;
  filter(options: { has: PinLocator }): PinLocator;
  getByRole(role: string, options?: unknown): PinLocator;
  allTextContents(options?: unknown): Promise<string[]>;
}
export interface PinTab {
  url(): Promise<string>;
  goto(url: string): Promise<unknown>;
  playwright: {
    evaluate<T, A>(fn: (arg: A) => T, arg: A): Promise<T>;
    getByRole(role: string, options?: unknown): PinLocator;
    locator(selector: string): PinLocator;
  };
}
export interface PinOptions {
  taskId: string;
  target: PostTarget;
  userAuthorized: boolean;
  authorizationEvidenceRef: string;
  verifyOnly?: boolean;
}
export interface PinResult {
  status: "verified" | "unknown" | "needsDecision";
  publicId?: string;
  evidenceRef: string;
  reason?: string;
}
/** Pin an owned, explicitly authorized public post; recovery never republishes content. */
export class ProfilePin {
  constructor(
    private tab: PinTab,
    private store: RoundStore,
    private api: XGrowthHarness,
  ) {}
  private async finish(
    options: PinOptions,
    status: PinResult["status"],
    reason?: string,
    submissionStarted = true,
  ): Promise<PinResult> {
    const evidenceRef = await this.store.recordProof({
      operation: "pinPost",
      options,
      status,
      reason,
      observedAt: new Date().toISOString(),
    });
    await this.store.transaction(({ state }) => {
      state.profilePins ??= {};
      state.profilePins[options.taskId] = {
        postId: options.target.postId,
        status,
        submissionStarted,
        evidenceRef,
      };
      return state;
    });
    return {
      status,
      publicId: status === "verified" ? options.target.postId : undefined,
      evidenceRef,
      reason,
    };
  }
  private async verify(
    options: PinOptions,
    profileURL: string,
  ): Promise<PinResult> {
    if ((await this.tab.url()) !== profileURL) await this.tab.goto(profileURL);
    const pinned = await this.tab.playwright.evaluate(
      (id: string) =>
        [...document.querySelectorAll("article")].some(
          (a) =>
            /Pinned|已置顶|置顶/.test(
              a.querySelector('[data-testid="socialContext"]')?.textContent ||
                "",
            ) &&
            a
              .querySelector("time[datetime]")
              ?.closest("a")
              ?.getAttribute("href")
              ?.match(/\/status\/(\d+)$/)?.[1] === id,
        ),
      options.target.postId,
    );
    return this.finish(
      options,
      pinned ? "verified" : "unknown",
      pinned ? undefined : "pinned-profile-result-unconfirmed-do-not-repeat",
    );
  }
  async pin(options: PinOptions): Promise<PinResult> {
    if (
      !options.userAuthorized ||
      !options.taskId ||
      !/^\d+$/.test(options.target?.postId || "") ||
      !this.store.evidenceExists(options.authorizationEvidenceRef)
    )
      return {
        status: "needsDecision",
        evidenceRef: await this.store.recordProof({
          operation: "pinPost",
          reason: "explicit-pin-authorization-required",
        }),
        reason: "explicit-pin-authorization-required",
      };
    const account = await this.api.inspectAccount({ mode: "decision" });
    if (!account.complete || !account.accountHandle || !account.accountURL)
      return {
        status: "needsDecision",
        evidenceRef: account.evidenceRef || "",
        reason: "account-unconfirmed",
      };
    const prior = (await this.store.load()).state.profilePins?.[options.taskId];
    if (prior && prior.postId !== options.target.postId)
      return {
        status: "needsDecision",
        evidenceRef: prior.evidenceRef,
        reason: "pin-task-target-conflict",
      };
    if (options.verifyOnly || (prior && prior.status !== "unknown"))
      return this.verify(options, account.accountURL);
    if ((await this.tab.url()) !== options.target.url) {
      const read = await this.api.readPost({
        target: options.target,
        mode: "decision",
      });
      return {
        status: "needsDecision",
        evidenceRef: read.evidenceRef || "",
        reason: "target-navigation-check-again",
      };
    }
    const owned = await this.tab.playwright.evaluate(
      ({ id, handle }: { id: string; handle: string }) => {
        const candidates = [...document.querySelectorAll("article")].filter(
          (a) =>
            a
              .querySelector("time[datetime]")
              ?.closest("a")
              ?.getAttribute("href")
              ?.match(/\/status\/(\d+)$/)?.[1] === id,
        );
        if (candidates.length !== 1) return false;
        const a = candidates[0];
        return (
          !!a.querySelector("time[datetime]") &&
          a
            .querySelector('[data-testid="User-Name"] a[href]')
            ?.getAttribute("href")
            ?.toLowerCase() ===
            "/" + handle.toLowerCase()
        );
      },
      { id: options.target.postId, handle: account.accountHandle },
    );
    if (!owned)
      return {
        status: "needsDecision",
        evidenceRef: await this.store.recordProof({
          operation: "pinPost",
          reason: "owned-post-unconfirmed",
        }),
        reason: "owned-post-unconfirmed",
      };
    let claimed = false;
    await this.store.transaction(({ state }) => {
      claimed = false;
      state.profilePins ??= {};
      if (
        !state.profilePins[options.taskId] ||
        state.profilePins[options.taskId].status === "unknown"
      ) {
        state.profilePins[options.taskId] = {
          postId: options.target.postId,
          status: "intent",
          evidenceRef: options.authorizationEvidenceRef,
        };
        claimed = true;
      }
      return state;
    });
    if (!claimed) return this.verify(options, account.accountURL);
    try {
      const pending = this.tab.playwright.locator(
        '[role="dialog"],[role="alertdialog"]',
      );
      if (
        (await pending.count()) === 1 &&
        (await pending.allTextContents()).some((x) =>
          /将帖子置顶到个人资料|Pin post to your profile/i.test(x),
        )
      ) {
        await pending
          .getByRole("button", { name: /^(Pin|置顶)$/, exact: true })
          .click();
        return this.verify(options, account.accountURL);
      }
      const article = this.tab.playwright.getByRole("article").filter({
        has: this.tab.playwright.locator(
          `a[href$="/status/${options.target.postId}"]`,
        ),
      });
      if ((await article.count()) !== 1)
        return this.finish(options, "unknown", "unique-owned-post-unconfirmed");
      if ((await this.tab.playwright.getByRole("menuitem").count()) === 0)
        await article.getByRole("button", { name: /^(More|更多)$/ }).click();
      await this.tab.playwright
        .getByRole("menuitem")
        .first()
        .waitFor({ state: "visible", timeoutMs: 5000 });
      const labels = await this.tab.playwright
        .getByRole("menuitem")
        .allTextContents({ timeoutMs: 5000 });
      const unpin = labels.find((x: string) =>
        /Unpin from|取消.*置顶|从.*取消置顶/i.test(x),
      );
      if (unpin) return this.verify(options, account.accountURL);
      const pin = labels.find((x: string) =>
        /Pin to your profile|置顶到.*个人|置顶到.*资料/i.test(x),
      );
      if (!pin)
        return this.finish(options, "unknown", "pin-menu-unconfirmed", false);
      await this.tab.playwright
        .getByRole("menuitem", { name: pin, exact: true })
        .click();
      const dialog = this.tab.playwright.locator(
        '[role="dialog"],[role="alertdialog"]',
      );
      await dialog.waitFor({ state: "visible", timeoutMs: 5000 });
      if ((await dialog.count()) === 1) {
        const buttons = await dialog
          .getByRole("button")
          .allTextContents({ timeoutMs: 5000 });
        const confirm = buttons.find((x: string) =>
          /^(Pin|置顶)$/.test(x.trim()),
        );
        if (!confirm)
          return this.finish(
            options,
            "unknown",
            "pin-confirmation-unconfirmed",
          );
        await dialog
          .getByRole("button", { name: confirm, exact: true })
          .click();
      }
      return this.verify(options, account.accountURL);
    } catch (error) {
      return this.finish(options, "unknown", String(error));
    }
  }
}
