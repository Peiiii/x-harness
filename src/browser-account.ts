import { readProfile } from "./readers-profile.js";

export type AccountCounter = {
  value: number;
  text: string;
  precision: "exact" | "rounded";
};
export type BrowserAccountSnapshot = {
  handle: string;
  url: string;
  followers: AccountCounter;
  following: AccountCounter;
  observedAt: string;
};
export type AccountBrowserHost = {
  tabs: {
    create(input: { url: string; active: false }): Promise<{ id?: number }>;
    get(id: number): Promise<{ status?: string; url?: string }>;
    update(id: number, input: { url: string }): Promise<unknown>;
    remove(id: number): Promise<void>;
  };
  scripting: {
    executeScript(input: {
      target: { tabId: number };
      func: (...args: any[]) => any;
      args?: any[];
    }): Promise<{ result?: any }[]>;
  };
};

/** Serializable, read-only identity observation from the account's own navigation. */
export function readBrowserAccountIdentity() {
  const visible = (element: Element) => element.getClientRects().length > 0;
  if (location.hostname !== "x.com") throw Error("unexpected-platform");
  if (/^\/(?:login|i\/flow|account\/access)(?:\/|$)/.test(location.pathname))
    throw Error("login-required");
  const alerts = [...document.querySelectorAll('[role="alert"]')]
    .filter(visible)
    .map((element) => (element as HTMLElement).innerText);
  if (
    alerts.some((text) =>
      /限制|异常|稍后重试|出错|rate limit|something went wrong|try again/i.test(
        text,
      ),
    )
  )
    throw Error("platform-alert");
  const links = [
    ...document.querySelectorAll('a[data-testid="AppTabBar_Profile_Link"]'),
  ]
    .filter(visible)
    .map((element) => element.getAttribute("href"));
  const handles = [
    ...new Set(
      links
        .map((href) => href?.match(/^\/([A-Za-z0-9_]{1,15})$/)?.[1])
        .filter(Boolean),
    ),
  ];
  if (handles.length !== 1) return null;
  return { handle: handles[0]!, path: location.pathname };
}

/** One finite read of the signed-in account; never borrows an existing browser tab. */
export class BrowserAccountReader {
  readonly #host: AccountBrowserHost;
  readonly #beforeRead: () => void;
  #running = false;
  constructor(host: AccountBrowserHost, beforeRead: () => void = () => {}) {
    this.#host = host;
    this.#beforeRead = beforeRead;
  }
  async #execute(
    tabId: number,
    func: (...args: any[]) => any,
    args: any[] = [],
  ) {
    this.#beforeRead();
    const results = await this.#host.scripting.executeScript({
      target: { tabId },
      func,
      args,
    });
    if (results.length !== 1) throw Error("ambiguous-frame");
    return results[0].result;
  }
  async #identity(tabId: number, profile?: string) {
    const deadline = Date.now() + 20000;
    do {
      this.#beforeRead();
      const tab = await this.#host.tabs.get(tabId);
      if (tab.status !== "complete") {
        await new Promise((resolve) => setTimeout(resolve, 400));
        continue;
      }
      const result = await this.#execute(tabId, readBrowserAccountIdentity);
      if (
        result &&
        (!profile || result.path.toLowerCase() === `/${profile.toLowerCase()}`)
      )
        return result;
      await new Promise((resolve) => setTimeout(resolve, 400));
    } while (Date.now() < deadline);
    throw Error("account-page-timeout");
  }
  async read(expectedHandle?: string): Promise<BrowserAccountSnapshot> {
    if (this.#running) throw Error("account-read-busy");
    if (expectedHandle && !/^[A-Za-z0-9_]{1,15}$/.test(expectedHandle))
      throw Error("invalid-account");
    this.#running = true;
    let tabId: number | undefined;
    try {
      this.#beforeRead();
      const tab = await this.#host.tabs.create({
        url: "https://x.com/home",
        active: false,
      });
      if (typeof tab.id !== "number") throw Error("missing-reader-tab");
      tabId = tab.id;
      const identity = await this.#identity(tabId);
      const handle = identity.handle;
      if (
        expectedHandle &&
        handle.toLowerCase() !== expectedHandle.toLowerCase()
      )
        throw Error("account-changed");
      this.#beforeRead();
      await this.#host.tabs.update(tabId, { url: `https://x.com/${handle}` });
      const current = await this.#identity(tabId, handle);
      if (current.handle.toLowerCase() !== handle.toLowerCase())
        throw Error("account-changed");
      const deadline = Date.now() + 20000;
      do {
        const profile = await this.#execute(tabId, readProfile, [{ handle }]);
        if (profile?.alerts?.some((alert: string) => alert !== "missing-main"))
          throw Error("platform-alert");
        if (
          this.#counter(profile?.followers) &&
          this.#counter(profile?.following)
        ) {
          const finalIdentity = await this.#execute(
            tabId,
            readBrowserAccountIdentity,
          );
          if (
            finalIdentity?.handle?.toLowerCase() !== handle.toLowerCase() ||
            finalIdentity?.path?.toLowerCase() !== `/${handle.toLowerCase()}`
          )
            throw Error("account-changed");
          return {
            handle,
            url: `https://x.com/${handle}`,
            followers: profile.followers,
            following: profile.following,
            observedAt: profile.observedAt,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      } while (Date.now() < deadline);
      throw Error("account-counts-unavailable");
    } finally {
      if (tabId !== undefined)
        await this.#host.tabs.remove(tabId).catch(() => {});
      this.#running = false;
    }
  }
  #counter(value: any): value is AccountCounter {
    return (
      Number.isSafeInteger(value?.value) &&
      value.value >= 0 &&
      ["exact", "rounded"].includes(value?.precision)
    );
  }
}
