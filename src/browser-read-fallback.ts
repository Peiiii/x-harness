import { currentXUsageTrace } from "./usage.js";
/** Bound an owned-tab read and rebind that exact tab once. Never replay writes. */
export class BrowserReadFallback {
  #selected: any;
  #rebound = false;
  #needsFreshDOM = false;
  #preferNative = false;
  constructor(
    primary: any,
    private options: {
      tabId: string;
      recover(tabId: string): Promise<any>;
      readTimeoutMs?: number;
      legacyRecoveryEnabled?: boolean;
      nativeRead?: {
        allowed(): boolean;
        read(query: any): Promise<{
          observation: any;
          expectedURL: string;
          expectedAccount: string;
        }>;
        isolate(): any;
        slowThresholdMs?: number;
        timeoutMs?: number;
      };
    },
    private store: { recordProof(value: any): Promise<string> },
  ) {
    const timeout = options.readTimeoutMs ?? 15000;
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000)
      throw Error("invalid-browser-read-timeout");
    for (const value of [
      options.nativeRead?.slowThresholdMs ?? 1500,
      options.nativeRead?.timeoutMs ?? 8000,
    ])
      if (!Number.isInteger(value) || value < 100 || value > 120000)
        throw Error("invalid-native-read-timeout");
    this.#selected = primary;
    this.capabilities = this.capabilities.bind(this);
  }
  capabilities(operation: any) {
    return this.#selected.capabilities(operation);
  }
  private async bounded<T>(
    operation: () => Promise<T>,
    timeout = this.options.readTimeoutMs ?? 15000,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(Error("browser-read-deadline-exceeded")),
            timeout,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async observe(query: any) {
    const native = this.options.nativeRead;
    if (
      native &&
      !native.allowed() &&
      this.options.legacyRecoveryEnabled === false
    ) {
      const value = await this.#selected.observe(query);
      this.#needsFreshDOM = false;
      return value;
    }
    const deadline = Date.now() + (this.options.readTimeoutMs ?? 45000);
    const remaining = () => {
      const value = deadline - Date.now();
      if (value <= 0) throw Error("browser-read-deadline-exceeded");
      return value;
    };
    if (this.#preferNative && native?.allowed()) {
      try {
        return await this.selectNative(
          query,
          await this.readNative(query, remaining()),
        );
      } catch {
        this.#preferNative = false;
      }
    }
    const selected = this.#selected;
    const pending = Promise.resolve().then(() => selected.observe(query));
    try {
      const result = await this.bounded(
        () => pending,
        native?.allowed()
          ? Math.min(native.slowThresholdMs ?? 1500, remaining())
          : undefined,
      );
      this.#needsFreshDOM = false;
      return result;
    } catch (error: any) {
      if (
        error.message === "browser-read-deadline-exceeded" &&
        native?.allowed()
      ) {
        const attempt = this.readNative(query, remaining()).then(
          (value) => ({ native: true, value }),
          (failure) => ({ native: true, failure }),
        );
        const choice: any = await this.bounded(
          () =>
            Promise.race([
              pending.then((value) => ({ native: false, value })),
              attempt,
            ]),
          remaining(),
        );
        if (!choice.failure) {
          if (choice.native) return this.selectNative(query, choice.value);
          this.#needsFreshDOM = false;
          return choice.value;
        }
        const value = await this.bounded(() => pending, remaining());
        this.#needsFreshDOM = false;
        return value;
      }
      if (this.#rebound || error.message !== "browser-read-deadline-exceeded")
        throw error;
      this.#rebound = true;
      const initialEvidenceRef = await this.store.recordProof({
        kind: "browser-read-recovery",
        status: "rebinding",
        capturedAt: new Date().toISOString(),
        tabId: this.options.tabId,
        view: query.view,
        reason: error.message,
        readTimeoutMs: this.options.readTimeoutMs ?? 15000,
        writeRetried: false,
      });
      try {
        const replacement = await this.bounded(() =>
          this.options.recover(this.options.tabId),
        );
        if (replacement === selected)
          throw Error("browser-read-rebind-not-isolated");
        const result: any = await this.bounded(() =>
          replacement.observe(query),
        );
        this.#selected = replacement;
        this.#needsFreshDOM = false;
        await this.store.recordProof({
          kind: "browser-read-recovery",
          status: "rebound",
          capturedAt: new Date().toISOString(),
          tabId: this.options.tabId,
          initialEvidenceRef,
          page: result.page,
          accountHandle: result.accountHandle,
          writeRetried: false,
        });
        return result;
      } catch (recoveryError: any) {
        await this.store.recordProof({
          kind: "browser-read-recovery",
          status: "failed",
          capturedAt: new Date().toISOString(),
          tabId: this.options.tabId,
          initialEvidenceRef,
          reason: String(recoveryError.message).split("\n")[0],
          writeRetried: false,
        });
        throw recoveryError;
      }
    }
  }
  private async readNative(query: any, remainingMs: number) {
    const native = this.options.nativeRead!;
    const { observation, expectedURL, expectedAccount } = await this.bounded(
      () => native.read(query),
      Math.min(native.timeoutMs ?? 8000, remainingMs),
    );
    const normalize = (value: string) => {
      const url = new URL(
        /^x\.com(?:\/|$)/i.test(value) ? `https://${value}` : value,
      );
      if (url.protocol !== "https:" || url.hostname !== "x.com")
        throw Error("native-read-fallback-origin-mismatch");
      return url.href;
    };
    if (
      !expectedAccount ||
      !observation?.page ||
      normalize(observation.page) !== normalize(expectedURL) ||
      String(observation.accountHandle ?? "").toLowerCase() !==
        expectedAccount.toLowerCase()
    )
      throw Error("native-read-fallback-context-mismatch");
    if (observation.needsStateCheck && !observation.alerts?.length)
      throw Error("native-read-fallback-incomplete");
    if (
      query.view === "person" &&
      (observation.blue === null || observation.blueEvidenceSupported === false)
    )
      throw Error("native-read-fallback-person-incomplete");
    return observation;
  }
  private async selectNative(query: any, observation: any) {
    this.#selected = this.options.nativeRead!.isolate();
    this.#needsFreshDOM = true;
    this.#preferNative = true;
    await this.store.recordProof({
      kind: "browser-read-recovery",
      status: "native-read-only",
      capturedAt: new Date().toISOString(),
      usageTrace: currentXUsageTrace(),
      tabId: this.options.tabId,
      page: observation.page,
      accountHandle: observation.accountHandle,
      view: query.view,
      writeRetried: false,
      windowFocused: false,
      controlsReused: false,
    });
    return { ...observation, readTransport: "native-fallback" };
  }
  act(command: any) {
    const navigation = [
      "openObserved",
      "openHomeRecommendations",
      "searchSources",
    ].includes(command.operation);
    if (this.#needsFreshDOM && !navigation)
      throw Error("native-read-fallback-requires-fresh-dom-observation");
    if (navigation) this.#preferNative = false;
    return this.#selected.act(command);
  }
  screenshot() {
    return this.#selected.screenshot();
  }
  collectCreator(args: any) {
    return this.#selected.collectCreator(args);
  }
  collectBookmarks(args: any) {
    return this.#selected.collectBookmarks(args);
  }
}
