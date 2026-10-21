/** The single allowlisted protocol decoder shared by snapshots and continuous capture. */
export type NumericRates = {
  limit?: number;
  remaining?: number;
  resetAt?: string;
  retryAfterSeconds?: number;
};
export interface XNetworkRecord {
  eventId: string;
  sequence?: number;
  sourceId: string;
  method: string;
  requestId?: string;
  location: string;
  endpoint: string;
  requestMethod?: string;
  status?: number;
  timestamp?: number;
  wallTime?: number;
  latencyMs?: number;
  occurredAt: string;
  timeQuality:
    | "request-wall-clock"
    | "derived-request-clock"
    | "capture-clock"
    | "browser-wall-clock";
  observedAt: string;
  rateLimit?: NumericRates;
  canceled?: boolean;
  fromCache?: boolean;
  errorText?: string;
}
type Pending = {
  location: string;
  timestamp?: number;
  wallTime?: number;
  requestMethod?: string;
};

export function xAPIPath(value: unknown): string | undefined {
  try {
    const u = new URL(String(value));
    if (!["http:", "https:"].includes(u.protocol)) return;
    if (
      (u.hostname === "x.com" && u.pathname.startsWith("/i/api/")) ||
      u.hostname === "api.x.com"
    )
      return u.origin + u.pathname;
  } catch {
    /* Unrelated event; never serialize its input. */
  }
}

export function networkRates(
  headers: Record<string, unknown> = {},
): NumericRates | undefined {
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if (
      [
        "x-rate-limit-limit",
        "x-rate-limit-remaining",
        "x-rate-limit-reset",
        "retry-after",
      ].includes(name) &&
      /^\d{1,12}$/.test(String(value).trim())
    )
      values[name] = Number(value);
  }
  const out: NumericRates = {};
  if (values["x-rate-limit-limit"] !== undefined)
    out.limit = values["x-rate-limit-limit"];
  if (values["x-rate-limit-remaining"] !== undefined)
    out.remaining = values["x-rate-limit-remaining"];
  if (values["x-rate-limit-reset"] !== undefined)
    out.resetAt = new Date(values["x-rate-limit-reset"] * 1000).toISOString();
  if (values["retry-after"] !== undefined)
    out.retryAfterSeconds = values["retry-after"];
  return Object.keys(out).length ? out : undefined;
}

export class XNetworkDecoder {
  #pending: Map<string, Pending>;
  constructor(pending: [string, Pending][] = []) {
    this.#pending = new Map(pending);
  }
  checkpoint(): [string, Pending][] {
    return [...this.#pending];
  }
  decode(events: any[], sourceId: string, observedAt: string) {
    const records: XNetworkRecord[] = [];
    let unmatchedFailures = 0,
      correlationEvictions = 0;
    for (const [index, event] of events.entries()) {
      const p = event.params ?? {},
        id = typeof p.requestId === "string" ? p.requestId : undefined;
      if (event.method === "Network.loadingFinished") {
        if (id) this.#pending.delete(id);
        continue;
      }
      const known = id ? this.#pending.get(id) : undefined;
      const location =
        xAPIPath(p.response?.url ?? p.request?.url) ??
        (event.method === "Network.loadingFailed"
          ? known?.location
          : undefined);
      const sequence = Number.isSafeInteger(event.sequence)
        ? event.sequence
        : undefined;
      const eventId = `${sourceId}:${sequence ?? `sample-${index}`}`;
      if (event.method === "Network.requestWillBeSent") {
        if (p.redirectResponse) {
          const redirected = xAPIPath(p.redirectResponse.url);
          if (redirected)
            records.push(
              this.#record(
                {
                  ...event,
                  method: "Network.responseReceived",
                  params: {
                    ...p,
                    request: undefined,
                    response: p.redirectResponse,
                  },
                },
                redirected,
                known,
                sourceId,
                `${eventId}:redirect`,
                sequence,
                observedAt,
              ),
            );
        }
        if (id) this.#pending.delete(id);
        if (location && id)
          this.#pending.set(id, {
            location,
            timestamp: p.timestamp,
            wallTime: p.wallTime,
            requestMethod: p.request?.method,
          });
      }
      if (!location) {
        if (event.method === "Network.loadingFailed") unmatchedFailures++;
        continue;
      }
      records.push(
        this.#record(
          event,
          location,
          known,
          sourceId,
          eventId,
          sequence,
          observedAt,
        ),
      );
      if (id && event.method === "Network.loadingFailed")
        this.#pending.delete(id);
      if (this.#pending.size > 5000) {
        this.#pending.delete(this.#pending.keys().next().value!);
        correlationEvictions++;
      }
    }
    return { records, unmatchedFailures, correlationEvictions };
  }
  #record(
    event: any,
    location: string,
    known: Pending | undefined,
    sourceId: string,
    eventId: string,
    sequence: number | undefined,
    observedAt: string,
  ): XNetworkRecord {
    const p = event.params ?? {};
    let occurredAt = observedAt,
      timeQuality: XNetworkRecord["timeQuality"] = "capture-clock";
    if (
      event.method === "Network.requestWillBeSent" &&
      Number.isFinite(p.wallTime)
    ) {
      occurredAt = new Date(p.wallTime * 1000).toISOString();
      timeQuality = "request-wall-clock";
    } else if (
      known &&
      Number.isFinite(known.wallTime) &&
      Number.isFinite(known.timestamp) &&
      Number.isFinite(p.timestamp) &&
      p.timestamp >= known.timestamp!
    ) {
      occurredAt = new Date(
        (known.wallTime! + p.timestamp - known.timestamp!) * 1000,
      ).toISOString();
      timeQuality = "derived-request-clock";
    }
    return {
      eventId,
      sourceId,
      sequence,
      method: event.method,
      location,
      endpoint: location.replace(
        /\/i\/api\/graphql\/[^/]+\//,
        "/i/api/graphql/",
      ),
      requestId: typeof p.requestId === "string" ? p.requestId : undefined,
      requestMethod:
        typeof p.request?.method === "string"
          ? p.request.method
          : known?.requestMethod,
      status: Number.isInteger(p.response?.status)
        ? p.response.status
        : undefined,
      timestamp: Number.isFinite(p.timestamp) ? p.timestamp : undefined,
      wallTime: Number.isFinite(p.wallTime) ? p.wallTime : undefined,
      latencyMs:
        event.method === "Network.responseReceived" &&
        known?.timestamp !== undefined &&
        Number.isFinite(p.timestamp) &&
        p.timestamp >= known.timestamp
          ? (p.timestamp - known.timestamp) * 1000
          : undefined,
      occurredAt,
      timeQuality,
      observedAt,
      rateLimit: networkRates(p.response?.headers),
      ...(event.method === "Network.loadingFailed"
        ? {
            canceled: p.canceled === true,
            errorText: /^net::ERR_[A-Z0-9_]+$/.test(p.errorText)
              ? p.errorText
              : "unclassified-network-error",
          }
        : {}),
    };
  }
}

export function summarizeNetworkRecords(records: XNetworkRecord[]) {
  const endpoints = new Map<
    string,
    {
      location: string;
      requests: number;
      responses: number;
      statuses: Record<string, number>;
    }
  >();
  const times: number[] = [];
  for (const r of records) {
    const row = endpoints.get(r.location) ?? {
      location: r.location,
      requests: 0,
      responses: 0,
      statuses: {},
    };
    if (r.method === "Network.requestWillBeSent") row.requests++;
    if (r.method === "Network.responseReceived") {
      row.responses++;
      if (r.status !== undefined)
        row.statuses[r.status] = (row.statuses[r.status] ?? 0) + 1;
    }
    if (r.timestamp !== undefined) times.push(r.timestamp);
    endpoints.set(r.location, row);
  }
  return {
    requests: [...endpoints.values()].reduce((n, r) => n + r.requests, 0),
    responses: [...endpoints.values()].reduce((n, r) => n + r.responses, 0),
    durationSeconds:
      times.length > 1 ? Math.max(...times) - Math.min(...times) : null,
    endpointCount: endpoints.size,
    endpoints: [...endpoints.values()]
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10),
  };
}
