import { readXNetworkDiagnostics } from "./browser-dom-network.js";
import { XNetworkDecoder } from "./network-events.js";

async function bounded<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("network-diagnostic-timeout")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Optional bounded telemetry. It never decides whether a post can be retried. */
export class SubmissionNetworkCapture {
  private cursor = 0;
  private timer?: ReturnType<typeof setInterval>;
  private pending: Promise<void> = Promise.resolve();
  private reading = false;
  private decoder = new XNetworkDecoder();
  private observedEvents = 0;
  private complete = true;
  private events: any[] = [];
  private startedAt = new Date().toISOString();
  private constructor(
    private tab: any,
    private timeoutMs: number,
  ) {}

  static async start(
    tab: any,
    timeoutMs = 1500,
  ): Promise<SubmissionNetworkCapture | undefined> {
    if (typeof tab?.capabilities?.get !== "function") return;
    try {
      const cdp = (await bounded(
        tab.capabilities.get("cdp"),
        timeoutMs,
      )) as any;
      if (
        typeof cdp?.send !== "function" ||
        typeof cdp?.readEvents !== "function"
      )
        return;
      const baseline = await bounded(
        readXNetworkDiagnostics(tab, {
          startObserving: true,
        }),
        timeoutMs,
      );
      if (baseline.hasMore) return;
      const capture = new SubmissionNetworkCapture(tab, timeoutMs);
      capture.cursor = baseline.cursor;
      capture.timer = setInterval(() => capture.schedule(), 200);
      return capture;
    } catch {
      return;
    }
  }

  private schedule() {
    if (this.reading) return;
    this.reading = true;
    this.pending = this.pending.then(async () => {
      try {
        const trace = await readXNetworkDiagnostics(this.tab, {
          afterSequence: this.cursor,
          decoder: this.decoder,
          sourceId: "submission",
        });
        this.cursor = trace.cursor;
        this.observedEvents += trace.records.length;
        if (trace.truncated || trace.hasMore || trace.correlationEvictions)
          this.complete = false;
        for (const event of trace.events)
          if (
            /\/(?:CreateTweet|EditTweet)[A-Za-z0-9_]*$/.test(
              event.location ?? "",
            )
          )
            this.events.push(event);
      } catch {
        this.complete = false;
      } finally {
        this.reading = false;
      }
    });
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    try {
      await bounded(this.pending, this.timeoutMs);
      this.schedule();
      await bounded(this.pending, this.timeoutMs);
    } catch {
      this.complete = false;
    }
    return {
      status: this.complete ? "complete" : "incomplete",
      observedFrom: this.startedAt,
      observedTo: new Date().toISOString(),
      observedEvents: this.observedEvents,
      events: [...this.events],
      scope: "matching-submission-requests-only",
      boundary: "Absence of a recorded request never authorizes resubmission.",
    };
  }
}
