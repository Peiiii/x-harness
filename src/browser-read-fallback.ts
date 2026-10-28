/** Bound an owned-tab read and rebind that exact tab once. Never replay writes. */
export class BrowserReadFallback {
  #selected: any;
  #rebound = false;
  constructor(
    primary: any,
    private options: {
      tabId: string;
      recover(tabId: string): Promise<any>;
      readTimeoutMs?: number;
    },
    private store: { recordProof(value: any): Promise<string> },
  ) {
    const timeout = options.readTimeoutMs ?? 15000;
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000)
      throw Error("invalid-browser-read-timeout");
    this.#selected = primary;
    this.capabilities = this.capabilities.bind(this);
  }
  capabilities(operation: any) {
    return this.#selected.capabilities(operation);
  }
  private async bounded<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(Error("browser-read-deadline-exceeded")),
            this.options.readTimeoutMs ?? 15000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async observe(query: any) {
    try {
      return await this.bounded(() => this.#selected.observe(query));
    } catch (error: any) {
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
        this.#selected = await this.bounded(() =>
          this.options.recover(this.options.tabId),
        );
        const result: any = await this.bounded(() =>
          this.#selected.observe(query),
        );
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
          initialEvidenceRef,
          reason: String(recoveryError.message).split("\n")[0],
          writeRetried: false,
        });
        throw recoveryError;
      }
    }
  }
  act(command: any) {
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
