import { PostMedia } from "./post-media.js";
import { existsSync } from "node:fs";
import { XUsageJournal } from "./usage.js";
import { createBusinessHarness } from "./api.js";
import { AccountScreenshots } from "./account-screenshots.js";
import { createFileRoundStore } from "./store.js";
import { createXPlatform } from "./platform.js";
import { createDOMXBrowser, createNativeXBrowser } from "./browser.js";
import { BrowserReadFallback } from "./browser-read-fallback.js";
import type { HarnessOptions, XGrowthHarness } from "./types.js";

export function bindXGrowthHarness(options: HarnessOptions): XGrowthHarness {
  const { tab, app, ledgerPath, proofDirectory, clock, executor } = options;
  if (Boolean(tab) === Boolean(app))
    throw new Error("需一个已绑定Chrome app或tab，不能两个或零个");
  if (!ledgerPath || !proofDirectory)
    throw new Error("需原台账路径与本地证明目录");
  const taskTabId = tab?.id ?? (app && options.nativeTaskTab?.id);
  if (
    executor &&
    (!taskTabId ||
      (!tab &&
        (!options.nativeTaskTab?.evidenceRef ||
          !existsSync(options.nativeTaskTab.evidenceRef))))
  )
    throw new Error("executor-requires-independent-tab");
  const usage = new XUsageJournal(proofDirectory, {
    transport: tab ? "dom" : "native",
    tabId: taskTabId,
    executorId: executor?.id,
    runtimeIdentity: options.runtimeIdentity,
  });
  const store = createFileRoundStore({ ledgerPath, proofDirectory });
  if (
    options.originalPostActivation &&
    !["click", "keyboard"].includes(options.originalPostActivation)
  )
    throw new Error("invalid-original-post-activation");
  const domOptions = { defaultPostActivation: options.originalPostActivation };
  const primary = tab
    ? createDOMXBrowser(tab, domOptions)
    : createNativeXBrowser(app);
  if (
    options.tabReadRecovery &&
    (!tab?.id || typeof options.tabReadRecovery.rebind !== "function")
  )
    throw Error("tab-read-recovery-requires-owned-tab-and-rebind");
  const browser = usage.wrap(
    options.tabReadRecovery
      ? new BrowserReadFallback(
          primary,
          {
            tabId: tab!.id!,
            readTimeoutMs: options.tabReadRecovery.readTimeoutMs,
            recover: async (tabId: string) => {
              const rebound = await options.tabReadRecovery!.rebind(tabId);
              if (rebound?.id !== tabId)
                throw Error("tab-read-recovery-target-mismatch");
              return createDOMXBrowser(rebound, domOptions);
            },
          },
          store,
        )
      : primary,
    "browser",
    ["observe", "act", "collectCreator", "screenshot"],
  );
  const harness = createBusinessHarness({
    platform: createXPlatform(browser, { clock }),
    store,
    media: tab ? new PostMedia(tab, store, clock, executor) : undefined,
    screenshots: tab
      ? new AccountScreenshots({ tab, store, proofDirectory, clock })
      : undefined,
    clock,
    originalContentGuard: options.originalContentGuard,
    executor: executor ? { ...executor, tabId: taskTabId! } : undefined,
  });
  Object.defineProperty(harness, "usageStatus", {
    value: () => usage.status(),
  });
  return usage.wrap(harness, "harness");
}
