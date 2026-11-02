import { executionHoldsPage } from "./executor-actionability.js";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RoundStore } from "./store.js";
import type {
  AccountScreenshotOptions,
  AccountScreenshotResult,
  CuaTab,
} from "./types.js";

/** Read-only, visible DOM evidence. No hidden analytics state or invented data. */
function accountSurface({ surface }: { surface: string }) {
  const visible = (node: Element) => node.getClientRects().length > 0;
  const profiles = [
    ...document.querySelectorAll<HTMLAnchorElement>("nav a[href]"),
  ]
    .filter(
      (a) =>
        visible(a) &&
        /^(Profile|个人资料)$/.test(
          a.getAttribute("aria-label") || a.innerText.trim(),
        ),
    )
    .map((a) => a.getAttribute("href")!.match(/^\/(\w{1,15})$/)?.[1])
    .filter(Boolean);
  const main =
    document.querySelector('[data-testid="primaryColumn"]') ||
    document.querySelector("main");
  const headings = [
    ...(main?.querySelectorAll<HTMLElement>('h1,h2,[role="heading"]') || []),
  ]
    .filter(visible)
    .map((h) => h.innerText.trim())
    .slice(0, 12);
  const text = (main as HTMLElement | null)?.innerText || "";
  const match =
    surface === "analytics"
      ? /Account overview|账号概览|账户概览|Impressions|展示次数|Analytics|分析/
      : /Creator revenue|Ad revenue sharing|创作者收益|广告收益共享|创作者收益共享/i;
  const error = /Something went wrong|Try again|出错了|请尝试重新加载/.test(
    text,
  );
  const metricReady =
    surface === "analytics"
      ? /(?:Impressions|展示次数)[^\d]{0,40}\d[\d,.]*(?:\s*[KMB])?/i.test(text)
      : /(?:Creator revenue|Revenue sharing|收益|收入)[\s\S]{0,80}(?:[$¥€]\s?\d[\d,.]*|\d[\d,.]*\s?(?:USD|美元|元)|eligible|not eligible|符合资格|未符合资格|暂不可用)/i.test(
          text,
        );
  return {
    page: location.href,
    accountHandle: profiles.length === 1 ? profiles[0] : null,
    headings,
    surfaceConfirmed:
      match.test(headings.join("\n") + "\n" + text) &&
      metricReady &&
      !error &&
      text.trim().length > 20,
    error,
    labels: [
      ...new Set(
        text.match(
          /Account overview|Impressions|Daily|Revenue sharing|Creator revenue|Ad revenue sharing|创作者收益|广告收益共享|展示次数|过去\s*\d+\s*天/g,
        ) || [],
      ),
    ].slice(0, 15),
  };
}

export class AccountScreenshots {
  #tab: CuaTab;
  #store: RoundStore;
  #directory: string;
  #clock: () => number;
  #busy = false;
  #runtimeId = randomUUID();
  constructor(options: {
    tab: CuaTab;
    store: RoundStore;
    proofDirectory: string;
    clock?: () => number;
  }) {
    this.#tab = options.tab;
    this.#store = options.store;
    this.#directory = resolve(options.proofDirectory);
    this.#clock = options.clock || Date.now;
    this.capture = this.capture.bind(this);
  }
  async capture(
    options: AccountScreenshotOptions,
  ): Promise<AccountScreenshotResult> {
    if (!["analytics", "revenue"].includes(options.surface))
      throw new Error("Unsupported account screenshot surface");
    if (!this.#tab.screenshot)
      return { status: "needsCapability", missing: ["tab.screenshot"] };
    if (this.#busy)
      return { status: "needsDecision", reason: "same-tab-operation-running" };
    this.#busy = true;
    const id = `account-screenshot-${this.#tab.id}`;
    let claimed = false;
    try {
      let accountHandle = "";
      await this.#store.transaction(({ state }) => {
        claimed = false;
        accountHandle = state.accountHandle;
        if (!accountHandle) throw new Error("ledger-account-unconfirmed");
        state.executions ??= {};
        if (
          Object.values(state.executions).some(
            (e: any) =>
              e.tabId === this.#tab.id &&
              executionHoldsPage(e) &&
              this.#store.ownerAlive(e.pid),
          )
        )
          throw new Error("same-tab-operation-running");
        state.executions[id] = {
          id,
          tabId: this.#tab.id,
          runtimeId: this.#runtimeId,
          pid: this.#store.processId,
          activity: "captureAccountScreenshot",
          status: "RUNNING",
        };
        claimed = true;
        return state;
      });
      const before = await this.#tab.playwright.evaluate(accountSurface, {
        surface: options.surface,
      });
      const valid = (value: typeof before) =>
        value.accountHandle?.toLowerCase() ===
          accountHandle.replace(/^@/, "").toLowerCase() &&
        value.surfaceConfirmed &&
        new URL(value.page).hostname === "x.com";
      if (!valid(before))
        return {
          status: "needsDecision",
          reason: "account-surface-unconfirmed",
          evidenceRef: await this.#store.recordProof({
            operation: "captureAccountScreenshot",
            observation: before,
          }),
        };
      const bytes = await this.#tab.screenshot();
      const after = await this.#tab.playwright.evaluate(accountSurface, {
        surface: options.surface,
      });
      if (!valid(after) || after.page !== before.page)
        return {
          status: "needsDecision",
          reason: "account-surface-changed",
          evidenceRef: await this.#store.recordProof({
            operation: "captureAccountScreenshot",
            observation: after,
          }),
        };
      if (!(bytes instanceof Uint8Array) || bytes.length < 8)
        throw new Error("screenshot-image-unconfirmed");
      const image = Buffer.from(bytes);
      const png = image
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg =
        image.subarray(0, 3).equals(Buffer.from([255, 216, 255])) &&
        image.subarray(-2).equals(Buffer.from([255, 217]));
      if (!png && !jpeg) throw new Error("screenshot-image-unconfirmed");
      const imageMimeType: "image/png" | "image/jpeg" = png
        ? "image/png"
        : "image/jpeg";
      await mkdir(this.#directory, { recursive: true });
      const imagePath = join(
        this.#directory,
        `account-${options.surface}-${randomUUID()}.${png ? "png" : "jpg"}`,
      );
      await writeFile(imagePath, bytes, { flag: "wx" });
      const result = {
        surface: options.surface,
        accountHandle,
        page: after.page,
        capturedAt: new Date(this.#clock()).toISOString(),
        imagePath,
        imageMimeType,
        imageSha256: createHash("sha256").update(bytes).digest("hex"),
        headings: after.headings,
        labels: after.labels,
        dataScope: "visible-viewport-only" as const,
        imageKind: "real-screenshot" as const,
      };
      return {
        status: "captured",
        ...result,
        evidenceRef: await this.#store.recordProof({
          operation: "captureAccountScreenshot",
          observation: result,
        }),
      };
    } catch (error) {
      return {
        status: "needsDecision",
        reason: error instanceof Error ? error.message : "screenshot-failed",
      };
    } finally {
      if (claimed)
        await this.#store.transaction(({ state }) => {
          if (state.executions?.[id]?.runtimeId === this.#runtimeId)
            state.executions[id].activity = null;
          return state;
        });
      this.#busy = false;
    }
  }
}
