import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import type { XNetworkRecord } from "./network-events.js";

type Counts = {
  requests: number;
  responses: number;
  failures: number;
  rejected429: number;
};
const counts = (): Counts => ({
  requests: 0,
  responses: 0,
  failures: 0,
  rejected429: 0,
});
const increment = (row: Counts, r: XNetworkRecord) => {
  if (r.method === "Network.requestWillBeSent") row.requests++;
  if (r.method === "Network.responseReceived") row.responses++;
  if (r.method === "Network.loadingFailed") row.failures++;
  if (r.status === 429) row.rejected429++;
};

/** Deterministic replay; duplicate disk records after a crash never inflate counts. */
export async function readXNetworkReport(
  directory: string,
  {
    from,
    to,
    now = Date.now(),
  }: { from?: string; to?: string; now?: number } = {},
) {
  const lower = from ? Date.parse(from) : -Infinity,
    upper = to ? Date.parse(to) : Infinity;
  if (Number.isNaN(lower) || Number.isNaN(upper) || lower > upper)
    throw new Error("invalid-network-report-range");
  const seen = new Set<string>(),
    gapIds = new Set<string>();
  const endpoints = new Map<string, any>(),
    tabs = new Map<string, Counts>(),
    minutes = new Map<string, Counts>();
  const countedSources = new Set<string>();
  const totals = counts(),
    gaps: any[] = [];
  let duplicates = 0,
    malformedLines = 0,
    unmatchedFailures = 0,
    captureClockEvents = 0,
    firstBatchAt: string | undefined,
    lastBatchAt: string | undefined;
  const files = (await readdir(directory))
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))
    .sort();
  for (const name of files) {
    const lines = createInterface({
      input: createReadStream(join(directory, name)),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      let batch: any;
      try {
        batch = JSON.parse(line);
      } catch {
        malformedLines++;
        continue;
      }
      if (batch.schema !== "x-network-batch/v1") {
        malformedLines++;
        continue;
      }
      const batchTime = Date.parse(batch.observedAt);
      if (batchTime >= lower && batchTime < upper) {
        firstBatchAt =
          !firstBatchAt || batch.observedAt < firstBatchAt
            ? batch.observedAt
            : firstBatchAt;
        lastBatchAt =
          !lastBatchAt || batch.observedAt > lastBatchAt
            ? batch.observedAt
            : lastBatchAt;
        for (const gap of batch.gaps ?? []) {
          const id = JSON.stringify(gap);
          if (!gapIds.has(id)) {
            gapIds.add(id);
            gaps.push(gap);
          }
        }
      }
      for (const source of batch.sources ?? []) {
        if (batchTime >= lower && batchTime < upper) {
          const key = `${source.sourceId}:${source.fromCursor}:${source.cursor}`;
          if (!countedSources.has(key)) {
            unmatchedFailures += source.unmatchedFailures ?? 0;
            countedSources.add(key);
          }
        }
        for (const record of source.records ?? []) {
          const r = record as XNetworkRecord;
          const time = Date.parse(r.occurredAt);
          if (!(time >= lower && time < upper)) continue;
          if (seen.has(r.eventId)) {
            duplicates++;
            continue;
          }
          seen.add(r.eventId);
          if (r.timeQuality === "capture-clock") captureClockEvents++;
          increment(totals, r);
          const tab = tabs.get(source.tabId) ?? counts();
          increment(tab, r);
          tabs.set(source.tabId, tab);
          const minute =
            new Date(time + 8 * 3600_000).toISOString().slice(0, 16) + "+08:00";
          const min = minutes.get(minute) ?? counts();
          increment(min, r);
          minutes.set(minute, min);
          const endpoint = endpoints.get(r.endpoint) ?? {
            endpoint: r.endpoint,
            ...counts(),
            statuses: {},
            windows: {},
            missingRateResponses: 0,
            lastRate: undefined,
          };
          increment(endpoint, r);
          updateEndpoint(endpoint, r);
          endpoints.set(r.endpoint, endpoint);
        }
      }
    }
  }
  let health: any;
  try {
    health = JSON.parse(await readFile(join(directory, "health.json"), "utf8"));
  } catch {
    /* Missing health remains explicitly unknown. */
  }
  const healthAgeMs = health?.lastFlushAt
    ? now - Date.parse(health.lastFlushAt)
    : null;
  return {
    schema: "x-network-report/v1",
    generatedAt: new Date(now).toISOString(),
    context: health?.context,
    range: { from: from ?? null, to: to ?? null, firstBatchAt, lastBatchAt },
    totals,
    endpoints: [...endpoints.values()].sort((a, b) => b.requests - a.requests),
    tabs: [...tabs].map(([tabId, value]) => ({ tabId, ...value })),
    minutes: [...minutes]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([minute, value]) => ({ minute, ...value })),
    coverage: {
      gaps,
      malformedLines,
      duplicateEventsIgnored: duplicates,
      unmatchedFailures,
      captureClockEvents,
      fullAccountCoverageProven: false,
      healthAgeMs,
      degraded: health?.degraded ?? true,
      stale:
        healthAgeMs === null ||
        healthAgeMs > Math.max(10_000, (health?.intervalMs ?? 2000) * 3),
      source:
        "Attached main-tab X HTTP API protocol events; other profiles, unobserved worker targets and pre-attachment traffic are not measured.",
      interpretation:
        "Counts are observed lower bounds when coverage is missing. Header windows are server evidence, not inferred global account limits.",
    },
    health,
  };
}

function updateRate(endpoint: any, r: XNetworkRecord) {
  const rate = r.rateLimit!;
  if (!endpoint.lastRate || r.occurredAt >= endpoint.lastRate.occurredAt)
    endpoint.lastRate = {
      ...rate,
      occurredAt: r.occurredAt,
      timeQuality: r.timeQuality,
      status: r.status,
      sourceId: r.sourceId,
    };
  const key = `${rate.limit ?? "unknown"}:${rate.resetAt ?? "unknown"}`;
  const window = endpoint.windows[key] ?? {
    limit: rate.limit ?? null,
    resetAt: rate.resetAt ?? null,
    samples: 0,
    rejected429: 0,
    minRemaining: null,
    maxRemaining: null,
    firstObservedAt: r.occurredAt,
    lastObservedAt: r.occurredAt,
    sources: [],
  };
  window.samples++;
  if (r.status === 429) window.rejected429++;
  if (rate.remaining !== undefined) {
    window.minRemaining = Math.min(
      window.minRemaining ?? rate.remaining,
      rate.remaining,
    );
    window.maxRemaining = Math.max(
      window.maxRemaining ?? rate.remaining,
      rate.remaining,
    );
  }
  window.firstObservedAt = [window.firstObservedAt, r.occurredAt].sort()[0];
  window.lastObservedAt = [window.lastObservedAt, r.occurredAt].sort().at(-1);
  if (!window.sources.includes(r.sourceId)) window.sources.push(r.sourceId);
  endpoint.windows[key] = window;
}

function updateEndpoint(endpoint: any, r: XNetworkRecord) {
  if (r.latencyMs !== undefined) {
    endpoint.latencySamples = (endpoint.latencySamples ?? 0) + 1;
    endpoint.latencyTotalMs = (endpoint.latencyTotalMs ?? 0) + r.latencyMs;
    endpoint.latencyMaxMs = Math.max(endpoint.latencyMaxMs ?? 0, r.latencyMs);
  }
  if (r.status !== undefined)
    endpoint.statuses[r.status] = (endpoint.statuses[r.status] ?? 0) + 1;
  if (r.method === "Network.responseReceived" && !r.rateLimit)
    endpoint.missingRateResponses++;
  if (r.rateLimit) updateRate(endpoint, r);
}
