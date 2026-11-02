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

/** Explicit developer capture only. One baseline and one final snapshot; no polling timer. */
export class SubmissionNetworkCapture {
  private finished?: Promise<any>;
  private startedAt = new Date().toISOString();
  private decoder = new XNetworkDecoder();
  private constructor(
    private tab: any,
    private timeoutMs: number,
    private cursor: number,
  ) {}
  static async start(
    tab: any,
    timeoutMs = 1500,
  ): Promise<SubmissionNetworkCapture | undefined> {
    try {
      const baseline = await bounded(
        readXNetworkDiagnostics(tab, { startObserving: true }),
        timeoutMs,
      );
      if (baseline.hasMore) return;
      return new SubmissionNetworkCapture(tab, timeoutMs, baseline.cursor);
    } catch {
      return;
    }
  }
  stop() {
    return (this.finished ??= this.snapshot());
  }
  private async snapshot() {
    let complete = false,
      observedEvents = 0,
      events: any[] = [];
    try {
      const trace = await bounded(
        readXNetworkDiagnostics(this.tab, {
          afterSequence: this.cursor,
          decoder: this.decoder,
          sourceId: "submission",
        }),
        this.timeoutMs,
      );
      observedEvents = trace.records.length;
      complete =
        !trace.truncated && !trace.hasMore && !trace.correlationEvictions;
      events = trace.events.filter((event: any) =>
        /\/(?:CreateTweet|EditTweet)[A-Za-z0-9_]*$/.test(event.location ?? ""),
      );
    } catch {
      /* An unavailable snapshot leaves explicit incomplete evidence. */
    }
    return {
      status: complete ? "complete" : "incomplete",
      observedFrom: this.startedAt,
      observedTo: new Date().toISOString(),
      observedEvents,
      events,
      scope: "submission-endpoint-events-in-capture-window",
      boundary: "Absence of a recorded request never authorizes resubmission.",
    };
  }
}
