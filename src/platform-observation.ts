import type { PlatformDependencies } from "./platform-dependencies.js";
import { xURL } from "./platform-rules.js";
export class PlatformObservation {
  #browser!: PlatformDependencies["browser"];
  #clock!: PlatformDependencies["clock"];
  #methods!: string[];
  missing!: (operation: any) => any[];
  observed!: (query: any) => Promise<any>;
  open!: (target: any, query: any) => Promise<any>;
  ready!: (query: any) => Promise<any>;
  choose!: (
    value: any,
    pattern: any,
    { activateSelected }?: any,
  ) => Promise<any>;
  constructor(dependencies: Pick<PlatformDependencies, "browser" | "clock">) {
    const { browser, clock } = dependencies;
    this.#browser = browser;
    this.#clock = clock;
    this.#methods = ["observe", "act"];
    this.missing = this.handleMissing.bind(this);
    this.observed = this.handleObserved.bind(this);
    this.open = this.handleOpen.bind(this);
    this.ready = this.handleReady.bind(this);
    this.choose = this.handleChoose.bind(this);
  }
  private async handleObserved(query: any): Promise<any> {
    const value = await this.#browser.observe(query);
    return {
      ...value,
      observedAt: new Date(this.#clock()).toISOString(),
      fresh: true,
    };
  }
  private async handleOpen(target: any, query: any): Promise<any> {
    const url = xURL(target.url);
    if (!target.evidenceRef) throw new Error("目标URL缺已观察证据");
    let value = await this.handleObserved(query);
    let atTarget = false;
    try {
      atTarget = xURL(value.page).href === url.href;
    } catch {
      /* Blank/non-X pages require observed navigation. */
    }
    if (!atTarget) {
      await this.#browser.act({
        operation: "openObserved",
        url: url.href,
        evidenceRef: target.evidenceRef,
        view: query.view,
        handle: query.handle,
      });
      value = await this.handleReady(query);
    }
    if (!value.page || xURL(value.page).href !== url.href)
      return {
        ...value,
        needsStateCheck: true,
        missing: ["target-page-mismatch"],
      };
    return value;
  }
  private async handleReady(query: any): Promise<any> {
    let value = await this.handleObserved(query);
    if (
      value.needsStateCheck &&
      !value.alerts?.length &&
      query.view === "posts"
    ) {
      try {
        await this.#browser.act({ operation: "waitForPosts" });
      } catch (error: any) {
        if (!/timed out|timeout/i.test(error.message)) throw error;
      }
      value = await this.handleObserved(query);
    }
    return value;
  }
  private async handleChoose(
    value: any,
    pattern: any,
    { activateSelected = false }: any = {},
  ): Promise<any> {
    const controls = (value.controls ?? value.items ?? []).filter(
      (c: any) => !c.disabled && pattern(c),
    );
    if (controls.length !== 1) return false;
    if (controls[0].selected && !activateSelected) return true;
    await this.#browser.act({ operation: "openControl", ...controls[0] });
    return true;
  }
  private handleMissing(operation: any) {
    return [
      ...this.#methods.filter(
        (name: any) => typeof this.#browser?.[name] !== "function",
      ),
      ...(typeof this.#browser?.capabilities === "function"
        ? this.#browser.capabilities(operation)
        : ["capabilities"]),
    ];
  }
}
export function createPlatformObservation(
  ...args: ConstructorParameters<typeof PlatformObservation>
) {
  return new PlatformObservation(...args);
}
