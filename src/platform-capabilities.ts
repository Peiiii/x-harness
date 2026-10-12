import type { PlatformDependencies } from "./platform-dependencies.js";

export class PlatformCapabilities {
  #missing!: PlatformDependencies["missing"];
  #browser!: PlatformDependencies["browser"];
  preflight!: ({ operation, input }: any) => any;
  constructor(dependencies: Pick<PlatformDependencies, "missing" | "browser">) {
    const { missing, browser } = dependencies;
    this.#missing = missing;
    this.#browser = browser;
    this.preflight = this.handlePreflight.bind(this);
  }
  private handlePreflight({ operation, input = {} }: any): any {
    const absent = this.#missing(operation);
    if (
      operation === "readCreator" &&
      typeof this.#browser.collectCreator !== "function"
    )
      absent.push("browser.collectCreator");
    if (input.resolveQuote)
      absent.push(
        ...(this.#browser.capabilities?.("openQuote") ?? ["openQuote"]),
      );
    if (input.kind === "follow" || operation === "submitFollow")
      absent.push(
        ...(this.#browser.capabilities?.("refreshPerson") ?? ["refreshPerson"]),
      );
    if (operation !== "read" && input.assets?.length)
      absent.push(
        ...(this.#browser.capabilities?.("attachAssets") ?? ["attachAssets"]),
      );
    return {
      covered: absent.length === 0,
      missing: [...new Set(absent)],
      owner: "scripts/x-harness-browser.mjs",
    };
  }
}
export function createPlatformCapabilities(
  ...args: ConstructorParameters<typeof PlatformCapabilities>
) {
  return new PlatformCapabilities(...args);
}
