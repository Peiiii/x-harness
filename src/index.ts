import { createBusinessHarness } from "./api.js";
import { createFileRoundStore } from "./store.js";
import { createXPlatform } from "./platform.js";
import { createDOMXBrowser, createNativeXBrowser } from "./browser.js";
import type { HarnessOptions, XGrowthHarness } from "./types.js";
export type * from "./types.js";

/** Bind a selected real CUA handle once. Construction performs no browser I/O. */
export function createXGrowthHarness(options: HarnessOptions): XGrowthHarness {
  const { tab, app, ledgerPath, proofDirectory, clock, executor } = options;
  if (Boolean(tab) === Boolean(app))
    throw new Error("需一个已绑定Chrome app或tab，不能两个或零个");
  if (!ledgerPath || !proofDirectory)
    throw new Error("需原台账路径与本地证明目录");
  if (executor && (!tab || !tab.id))
    throw new Error("executor-requires-independent-tab");
  const browser = tab ? createDOMXBrowser(tab) : createNativeXBrowser(app);
  const store = createFileRoundStore({ ledgerPath, proofDirectory });
  return createBusinessHarness({
    platform: createXPlatform(browser, { clock }),
    store,
    clock,
    executor: executor ? { ...executor, tabId: tab!.id } : undefined,
  });
}
