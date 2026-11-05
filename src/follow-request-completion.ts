const followPath = "/i/api/1.1/friendships/create.json";
const followNetworkEvents = [
  "Network.requestWillBeSent",
  "Network.responseReceived",
  "Network.loadingFailed",
  "Network.loadingFinished",
];

type FollowRequestOutcome = {
  status: "pending" | "completed" | "failed";
  responseStatus?: number;
  errorText?: string;
  canceled?: boolean;
  requestObserved: boolean;
  elapsedMs: number;
};

export class FollowRequestCompletion {
  #cdp: any;
  #cursor: number;
  #startedAt: number;
  #requestId?: string;
  #responseStatus?: number;
  private constructor(cdp: any, cursor: number) {
    this.#cdp = cdp;
    this.#cursor = cursor;
    this.#startedAt = Date.now();
  }

  static async start(tab: any): Promise<FollowRequestCompletion> {
    const cdp = await tab?.capabilities?.get?.("cdp");
    if (
      typeof cdp?.send !== "function" ||
      typeof cdp?.readEvents !== "function"
    )
      throw new Error("follow-request-observation-unavailable");
    await cdp.send("Network.enable");
    const baseline = await cdp.readEvents({
      limit: 1,
      methods: followNetworkEvents,
    });
    if (baseline.truncated || baseline.hasMore)
      throw new Error("follow-request-observation-incomplete");
    return new FollowRequestCompletion(cdp, baseline.cursor);
  }

  async wait(timeoutMs = 15000): Promise<FollowRequestOutcome> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const batch = await this.#cdp.readEvents({
        afterSequence: this.#cursor,
        limit: 1000,
        methods: followNetworkEvents,
        timeoutMs: deadline - Date.now(),
      });
      this.#cursor = batch.cursor;
      if (batch.truncated)
        throw new Error("follow-request-observation-incomplete");
      for (const event of batch.events ?? []) {
        const params = event.params ?? {};
        if (
          !this.#requestId &&
          event.method === "Network.requestWillBeSent" &&
          params.request?.method === "POST"
        ) {
          try {
            const url = new URL(params.request.url);
            if (url.origin === "https://x.com" && url.pathname === followPath)
              this.#requestId = params.requestId;
          } catch {
            /* An unrelated or malformed URL cannot identify the follow write. */
          }
          continue;
        }
        if (!this.#requestId || params.requestId !== this.#requestId) continue;
        if (event.method === "Network.responseReceived")
          this.#responseStatus = params.response?.status;
        if (event.method === "Network.loadingFailed")
          return {
            status: "failed",
            responseStatus: this.#responseStatus,
            errorText: params.errorText,
            canceled: params.canceled === true,
            requestObserved: true,
            elapsedMs: Date.now() - this.#startedAt,
          };
        if (
          event.method === "Network.loadingFinished" &&
          this.#responseStatus !== undefined
        )
          return {
            status: "completed",
            responseStatus: this.#responseStatus,
            requestObserved: true,
            elapsedMs: Date.now() - this.#startedAt,
          };
      }
      if (!batch.events?.length) break;
    }
    return {
      status: "pending",
      responseStatus: this.#responseStatus,
      requestObserved: Boolean(this.#requestId),
      elapsedMs: Date.now() - this.#startedAt,
    };
  }
}
