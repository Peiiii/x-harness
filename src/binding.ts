import { XUsageJournal } from "./usage.js";
import { createBusinessHarness } from "./api.js";
import { AccountScreenshots } from "./account-screenshots.js";
import { createFileRoundStore } from "./store.js";
import { createXPlatform } from "./platform.js";
import { createDOMXBrowser, createNativeXBrowser } from "./browser.js";
import type { HarnessOptions, XGrowthHarness } from "./types.js";

export function bindXGrowthHarness(options: HarnessOptions): XGrowthHarness {
  const { tab, app, ledgerPath, proofDirectory, clock, executor } = options;
  if (Boolean(tab) === Boolean(app))
    throw new Error("需一个已绑定Chrome app或tab，不能两个或零个");
  if (!ledgerPath || !proofDirectory)
    throw new Error("需原台账路径与本地证明目录");
  if (executor && (!tab || !tab.id))
    throw new Error("executor-requires-independent-tab");
  const usage = new XUsageJournal(proofDirectory);
  const browser = usage.wrap(
    tab ? createDOMXBrowser(tab) : createNativeXBrowser(app),
    "browser",
    ["observe", "act", "collectCreator", "screenshot"],
  );
  const store = createFileRoundStore({ ledgerPath, proofDirectory });
  const harness = createBusinessHarness({
    platform: createXPlatform(browser, { clock }),
    store,
    screenshots: tab
      ? new AccountScreenshots({ tab, store, proofDirectory, clock })
      : undefined,
    clock,
    executor: executor ? { ...executor, tabId: tab!.id } : undefined,
  });
  Object.defineProperty(harness, "usageStatus", {
    value: () => usage.status(),
  });
  return usage.wrap(harness, "harness");
}
