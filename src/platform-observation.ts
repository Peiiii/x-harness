import type { PlatformDependencies } from "./platform-dependencies.js";
import { xURL } from "./platform-rules.js";
export class PlatformObservation {
  #browser!: PlatformDependencies["browser"];
  #clock!: PlatformDependencies["clock"];
  #methods!: string[];
  #account: any = null;
  readAccount!: (options?: { force?: boolean }) => Promise<any>;
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
    this.readAccount = this.handleReadAccount.bind(this);
  }
  private async handleObserved(query: any): Promise<any> {
    try {
      const value = {
        ...(await this.#browser.observe(query)),
        observedAt: new Date(this.#clock()).toISOString(),
        fresh: true,
      };
      this.#account = null;
      if (
        value.accountHandle &&
        !value.needsStateCheck &&
        !value.alerts?.length &&
        !value.diagnostic &&
        value.page
      ) {
        try {
          xURL(value.page);
          this.#account = {
            page: value.page,
            accountHandle: value.accountHandle,
            accountURL: value.accountURL,
            observedAt: value.observedAt,
            alerts: [],
            needsStateCheck: false,
          };
        } catch {
          /* A non-X surface never establishes the account session. */
        }
      }
      return value;
    } catch (error) {
      this.#account = null;
      throw error;
    }
  }
  private async handleReadAccount({ force = false } = {}): Promise<any> {
    if (!force && this.#account)
      return { ...this.#account, fresh: false, identityReused: true };
    return this.handleObserved({ view: "account" });
  }
  private async handleOpen(target: any, query: any): Promise<any> {
    const url = xURL(target.url);
    if (!target.evidenceRef) throw new Error("目标URL缺已观察证据");
    let value = await this.handleObserved(query);
    if (query.threadRootId && value.alerts?.length)
      return { ...value, needsStateCheck: true };
    let atTarget = false;
    try {
      atTarget = xURL(value.page).href === url.href;
    } catch {
      /* Blank/non-X pages require observed navigation. */
    }
    const incompletePerson =
      atTarget &&
      query.view === "person" &&
      !value.alerts?.length &&
      (value.needsStateCheck ||
        (value.blue === null && value.blueEvidenceSupported !== false) ||
        value.relationship === "unknown");
    if (!atTarget || incompletePerson) {
      try {
        await this.#browser.act({
          operation: "openObserved",
          url: url.href,
          evidenceRef: target.evidenceRef,
          view: query.view,
          handle: query.handle,
          ...(query.preferObservedLink === true
            ? { preferObservedLink: true }
            : {}),
          ...(query.preferClientNavigation === true
            ? { preferClientNavigation: true }
            : {}),
          // Thread membership is scoped to its root. An in-page permalink can
          // leave an unrelated thread mounted; open the evidenced route once.
          ...(query.view === "posts" && query.threadRootId
            ? { forceNavigation: true }
            : {}),
        });
      } catch (error: unknown) {
        if (query.preferObservedLink) throw error;
        // A URL wait may expire just before the committed document is observable.
        // Observe once; an inert unchanged page may navigate the same evidenced
        // URL directly once. Never repeat a submission. Exact post and
        // account/content/parent verification remain owned by the caller.
        if (
          query.view !== "posts" ||
          !/Timed out waiting for URL/.test(
            error instanceof Error ? error.message : "",
          )
        )
          throw error;
        const committed = await this.handleObserved(query);
        if (committed.needsStateCheck || committed.alerts?.length) throw error;
        if (committed.page !== url.href) {
          if (
            committed.page !== value.page ||
            !value.accountHandle ||
            committed.accountHandle !== value.accountHandle
          )
            throw error;
          await this.#browser.act({
            operation: "openObserved",
            url: url.href,
            evidenceRef: target.evidenceRef,
            view: "posts",
            forceNavigation: true,
          });
        }
      }
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
    const waitingForOffset =
      query.view === "posts" &&
      Number.isInteger(query.offset) &&
      query.offset > 0 &&
      !value.posts?.length;
    const waitingForList =
      query.view === "posts" && !query.targetId && !value.posts?.length;
    if (
      (value.needsStateCheck || waitingForOffset || waitingForList) &&
      !value.alerts?.length &&
      query.view === "posts"
    ) {
      const page = value.page;
      const deadline = Date.now() + 15000;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await this.#browser.act({
            operation: "waitForPosts",
            ...(waitingForOffset ? { offset: query.offset } : {}),
          });
        } catch (error: any) {
          if (!/timed out|timeout|deadline exceeded/i.test(error.message))
            throw error;
        }
        value = await this.handleObserved(query);
        if (value.page !== page) {
          value = { ...value, needsStateCheck: true };
          break;
        }
        if (
          !waitingForList ||
          value.posts?.length ||
          value.loading !== true ||
          value.alerts?.length ||
          Date.now() >= deadline
        )
          break;
      }
      if (waitingForList && !query.offset && !value.posts?.length)
        value = { ...value, needsStateCheck: true };
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
