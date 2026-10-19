import type { DOMDependencies } from "./browser-dom-dependencies.js";

/** Read-only recovery for a confirmed list's own visible loading error. */
export class DOMPeopleReadRecovery {
  #attempted = new Set<string>();
  constructor(private tab: DOMDependencies["tab"]) {}

  async retry(current: any, ax: string): Promise<boolean> {
    const observed = current?.result;
    const page = observed?.page;
    const handle =
      observed?.scrollAnchor?.handle ?? observed?.people?.at(-1)?.handle;
    if (
      current?.query?.view !== "people" ||
      observed?.needsStateCheck ||
      observed?.alerts?.length ||
      !observed?.accountHandle ||
      typeof page !== "string" ||
      !/^https:\/\/(?:www\.)?x\.com\/\w+\/(?:followers|following|verified_followers)\/?$/.test(
        page,
      ) ||
      !/^[A-Za-z0-9_]{1,15}$/.test(handle ?? "") ||
      !/^.*?\d+ button (?:重试|Retry|Try again)\s*$/m.test(ax)
    )
      return false;

    const primary = this.tab.playwright.locator(
      'main [data-testid="primaryColumn"]',
    );
    const errors = primary.locator('[data-testid="cellInnerDiv"]').filter({
      hasText:
        /^(?:出错了。请尝试重新加载。|Something went wrong\. Try reloading\.)\s*(?:重试|Retry|Try again)$/i,
    });
    const retry = errors
      .getByRole("button", {
        name: /^(?:重试|Retry|Try again)$/i,
      })
      .filter({ visible: true });
    const count = await retry.count();
    if (!count) return false;
    if (count !== 1 || (await primary.count()) !== 1)
      throw new Error("people-retry-control-ambiguous");
    if (typeof this.tab.url !== "function" || (await this.tab.url()) !== page)
      throw new Error("people-retry-page-changed");
    const boundary = `${page}|${handle.toLowerCase()}`;
    if (this.#attempted.has(boundary))
      throw new Error("people-retry-already-attempted");
    this.#attempted.add(boundary);
    await retry.click();
    await this.tab.getAXState({ emit: false, disableDiffing: true });
    return true;
  }
}
