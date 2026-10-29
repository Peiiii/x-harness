import { PostMedia } from "./post-media.js";
import { existsSync } from "node:fs";
import { XUsageJournal, currentXUsageTrace } from "./usage.js";
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
  const store = createFileRoundStore({
    ledgerPath,
    proofDirectory,
    referenceRoot: options.referenceRoot,
    lockOwner: executor
      ? {
          executorId: executor.id,
          tabId: taskTabId,
        }
      : undefined,
  });
  if (
    options.originalPostActivation &&
    !["click", "keyboard"].includes(options.originalPostActivation)
  )
    throw new Error("invalid-original-post-activation");
  const domOptions = {
    defaultPostActivation: options.originalPostActivation,
    creatorTrace: usage.creatorStage.bind(usage),
    navigationTrace: usage.browserStage.bind(usage),
  };
  const primary = tab
    ? createDOMXBrowser(tab, domOptions)
    : createNativeXBrowser(app);
  if (
    options.tabReadRecovery &&
    (!tab?.id || typeof options.tabReadRecovery.rebind !== "function")
  )
    throw Error("tab-read-recovery-requires-owned-tab-and-rebind");
  if (
    options.nativeReadFallback &&
    (!tab?.id || typeof options.nativeReadFallback.getApp !== "function")
  )
    throw Error("native-read-fallback-requires-owned-tab-and-app-provider");
  let nativeBrowser: any;
  const nativeRead =
    options.nativeReadFallback && tab
      ? {
          allowed: () =>
            /^(?:read|search|inspectAccount$)/.test(
              currentXUsageTrace()?.rootOperation ?? "",
            ),
          slowThresholdMs: options.nativeReadFallback.slowThresholdMs,
          timeoutMs: options.nativeReadFallback.timeoutMs,
          isolate: () => createDOMXBrowser(tab, domOptions),
          read: async (query: any) => {
            if (typeof tab.url !== "function")
              throw Error("native-read-fallback-url-unavailable");
            const [snapshot, expectedURL] = await Promise.all([
              store.load(),
              tab.url(),
            ]);
            nativeBrowser ??= createNativeXBrowser(
              await options.nativeReadFallback!.getApp(),
            );
            return {
              observation: await nativeBrowser.observe(query),
              expectedURL,
              expectedAccount: snapshot.state.accountHandle,
            };
          },
        }
      : undefined;
  const browser = usage.wrap(
    options.tabReadRecovery || nativeRead
      ? new BrowserReadFallback(
          primary,
          {
            tabId: tab!.id!,
            readTimeoutMs: options.tabReadRecovery?.readTimeoutMs,
            nativeRead,
            legacyRecoveryEnabled: Boolean(options.tabReadRecovery),
            recover: async (tabId: string) => {
              const rebound = options.tabReadRecovery
                ? await options.tabReadRecovery.rebind(tabId)
                : tab!;
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
