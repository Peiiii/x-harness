import { randomUUID } from "node:crypto";
import { XNetworkDecoder } from "./network-events.js";
import { XNetworkJournal } from "./network-journal.js";

const methods = [
  "Network.requestWillBeSent",
  "Network.responseReceived",
  "Network.loadingFailed",
  "Network.loadingFinished",
];
export interface XNetworkObserverOptions {
  directory: string;
  context: string;
  listTabs: () => Promise<Array<{ id: string; url?: string }>>;
  getTab: (id: string) => Promise<any>;
  intervalMs?: number;
  discoverMs?: number;
  durationMs?: number;
  clock?: () => number;
}
type Source = {
  tabId: string;
  sourceId: string;
  cursor: number;
  decoder: XNetworkDecoder;
  active: boolean;
  cdp?: any;
  lastSuccessAt?: string;
  failures: number;
};

/** A passive observer lives in the browser host; no navigation or business API exists here. */
export class XNetworkObserver {
  #options: XNetworkObserverOptions;
  #journal: XNetworkJournal;
  #sources = new Map<string, Source>();
  #timer?: ReturnType<typeof setInterval>;
  #running = false;
  #busy?: Promise<void>;
  #nextDiscovery = 0;
  #startedAt = 0;
  #deadline = 0;
  #lastFlushAt?: string;
  #lastError?: string;
  #gaps: any[] = [];
  #lastPollAt = 0;
  #runId = randomUUID();
  constructor(options: XNetworkObserverOptions) {
    if (!options.context || !options.directory)
      throw new Error("observer-context-and-directory-required");
    for (const [name, value, minimum] of [
      ["intervalMs", options.intervalMs ?? 2000, 100],
      ["discoverMs", options.discoverMs ?? 15_000, 100],
      ["durationMs", options.durationMs ?? 86_400_000, 1],
    ] as const)
      if (!Number.isFinite(value) || value < minimum)
        throw new Error(`invalid-observer-${name}`);
    this.#options = options;
    this.#journal = new XNetworkJournal(options.directory);
  }
  #now() {
    return (this.#options.clock ?? Date.now)();
  }
  async start({ automatic = true }: { automatic?: boolean } = {}) {
    if (this.#running) return this.status();
    const repairedBytes = await this.#journal.acquire();
    try {
      const previous = await this.#journal.loadCheckpoint();
      if (previous && previous.context !== this.#options.context)
        throw new Error("observer-context-mismatch");
      this.#startedAt = this.#now();
      this.#deadline =
        this.#startedAt + (this.#options.durationMs ?? 86_400_000);
      if (previous) {
        if (previous.health.running) {
          this.#startedAt = Date.parse(previous.health.startedAt);
          this.#deadline = Date.parse(previous.health.stopAt);
        }
        for (const s of previous.sources)
          this.#sources.set(s.tabId, {
            ...s,
            decoder: new XNetworkDecoder(s.pending),
            cdp: undefined,
          });
        this.#gaps.push({
          reason: "host-restart",
          from: previous.health.lastFlushAt,
          to: new Date(this.#startedAt).toISOString(),
          lostEvents: null,
        });
      }
      if (repairedBytes)
        this.#gaps.push({
          reason: "crash-tail-repaired",
          repairedBytes,
          lostEvents: null,
        });
      this.#running = true;
      await this.poll();
      if (automatic && this.#running)
        this.#timer = setInterval(() => {
          void this.poll().catch(() => {});
        }, this.#options.intervalMs ?? 2000);
      return this.status();
    } catch (error) {
      this.#running = false;
      await this.#journal.release();
      throw error;
    }
  }
  status() {
    const now = this.#now();
    return {
      schema: "x-network-health/v1",
      runId: this.#runId,
      context: this.#options.context,
      running: this.#running,
      degraded:
        !!this.#lastError ||
        [...this.#sources.values()].some((s) => s.active && s.failures > 0),
      pid: process.pid,
      startedAt: new Date(this.#startedAt).toISOString(),
      stopAt: new Date(this.#deadline).toISOString(),
      checkedAt: new Date(now).toISOString(),
      lastFlushAt: this.#lastFlushAt,
      lastError: this.#lastError,
      intervalMs: this.#options.intervalMs ?? 2000,
      discoverMs: this.#options.discoverMs ?? 15_000,
      sources: [...this.#sources.values()].map(
        ({ tabId, sourceId, cursor, active, lastSuccessAt, failures }) => ({
          tabId,
          sourceId,
          cursor,
          active,
          lastSuccessAt,
          failures,
        }),
      ),
      transportScope:
        "Main-tab X HTTP API events; workers, websockets and other profiles are not proven complete",
      coverageMeaning:
        "Observed attached sources only; pre-attachment and explicit gaps are unknown, never zero.",
    };
  }
  async poll(): Promise<void> {
    if (!this.#running) return;
    if (this.#busy) return this.#busy;
    this.#busy = this.#poll().finally(() => {
      this.#busy = undefined;
    });
    return this.#busy;
  }
  async #discover(now: number) {
    if (now < this.#nextDiscovery) return;
    const tabs = await this.#options.listTabs();
    const ids = new Set<string>();
    for (const tab of tabs) {
      let isX = false;
      try {
        isX = new URL(tab.url ?? "").hostname === "x.com";
      } catch {
        /* Local inventory only. */
      }
      if (!isX) continue;
      ids.add(tab.id);
      let source = this.#sources.get(tab.id);
      if (!source || !source.active) {
        source = {
          tabId: tab.id,
          sourceId: randomUUID(),
          cursor: 0,
          decoder: new XNetworkDecoder(),
          active: true,
          failures: 0,
        };
        this.#sources.set(tab.id, source);
        this.#gaps.push({
          reason: "attachment-boundary",
          sourceId: source.sourceId,
          tabId: tab.id,
          at: new Date(now).toISOString(),
          lostEvents: null,
        });
      }
    }
    for (const source of this.#sources.values())
      if (source.active && !ids.has(source.tabId)) {
        source.active = false;
        source.cdp = undefined;
        this.#gaps.push({
          reason: "source-detached",
          sourceId: source.sourceId,
          tabId: source.tabId,
          at: new Date(now).toISOString(),
          lostEvents: null,
        });
      }
    this.#nextDiscovery = now + (this.#options.discoverMs ?? 15_000);
  }
  async #readSource(source: Source, now: number) {
    if (!source.cdp) {
      const tab = await this.#options.getTab(source.tabId);
      source.cdp = await tab.capabilities.get("cdp");
      await source.cdp.send("Network.enable", {}, { timeoutMs: 5000 });
    }
    const fromCursor = source.cursor,
      records: any[] = [];
    let pages = 0,
      unmatchedFailures = 0;
    for (;;) {
      const result = await source.cdp.readEvents({
        afterSequence: source.cursor,
        limit: 1000,
        timeoutMs: 0,
        methods,
      });
      if (!Number.isSafeInteger(result.cursor) || result.cursor < 0)
        throw new Error("invalid-network-cursor");
      if (result.cursor < source.cursor) {
        this.#gaps.push({
          reason: "buffer-reset",
          sourceId: source.sourceId,
          tabId: source.tabId,
          at: new Date(now).toISOString(),
          lostEvents: null,
        });
        source.sourceId = randomUUID();
        source.decoder = new XNetworkDecoder();
        source.cursor = 0;
        if (++pages > 1) throw new Error("repeated-buffer-reset");
        continue;
      }
      if (result.truncated)
        this.#gaps.push({
          reason: "buffer-truncated",
          sourceId: source.sourceId,
          tabId: source.tabId,
          fromCursor: source.cursor,
          toCursor: result.cursor,
          lostEvents: null,
        });
      if (result.events.some((e: any) => !Number.isSafeInteger(e.sequence)))
        throw new Error("network-sequence-missing");
      const decoded = source.decoder.decode(
        result.events,
        source.sourceId,
        new Date(this.#now()).toISOString(),
      );
      records.push(...decoded.records);
      unmatchedFailures += decoded.unmatchedFailures;
      if (decoded.correlationEvictions)
        this.#gaps.push({
          reason: "correlation-evicted",
          sourceId: source.sourceId,
          count: decoded.correlationEvictions,
        });
      const previous = source.cursor;
      source.cursor = result.cursor;
      if (!result.hasMore) break;
      if (source.cursor <= previous || ++pages >= 100)
        throw new Error("network-paging-not-complete");
    }
    source.lastSuccessAt = new Date(this.#now()).toISOString();
    source.failures = 0;
    return {
      tabId: source.tabId,
      sourceId: source.sourceId,
      fromCursor,
      cursor: source.cursor,
      records,
      unmatchedFailures,
    };
  }
  async #poll() {
    const now = this.#now(),
      from = this.#lastPollAt || now;
    const previouslyRunning = this.#running;
    const snapshots = new Map(
      [...this.#sources].map(([id, s]) => [
        id,
        { ...s, decoder: new XNetworkDecoder(s.decoder.checkpoint()) },
      ]),
    );
    try {
      if (
        this.#lastPollAt &&
        now - this.#lastPollAt >
          Math.max(10_000, (this.#options.intervalMs ?? 2000) * 3)
      )
        this.#gaps.push({
          reason: "sampling-interrupted",
          from: new Date(from).toISOString(),
          to: new Date(now).toISOString(),
          lostEvents: null,
        });
      await this.#discover(now);
      const sources = [];
      for (const source of this.#sources.values()) {
        if (!source.active) continue;
        const beforeRead = {
          ...source,
          decoder: new XNetworkDecoder(source.decoder.checkpoint()),
        };
        try {
          sources.push(await this.#readSource(source, now));
        } catch {
          Object.assign(source, beforeRead);
          source.failures++;
          source.cdp = undefined;
          this.#gaps.push({
            reason: "source-read-failed",
            sourceId: source.sourceId,
            tabId: source.tabId,
            from: source.lastSuccessAt,
            to: new Date(now).toISOString(),
            lostEvents: null,
          });
        }
      }
      const wasRunning = this.#running;
      const flushedAt = this.#now();
      if (flushedAt >= this.#deadline) this.#running = false;
      this.#lastError = undefined;
      this.#lastFlushAt = new Date(flushedAt).toISOString();
      const health = this.status();
      await this.#journal.commit(
        {
          schema: "x-network-batch/v1",
          runId: this.#runId,
          observedAt: new Date(flushedAt).toISOString(),
          from: new Date(from).toISOString(),
          sources,
          gaps: this.#gaps,
          stopped: !this.#running,
        },
        {
          schema: "x-network-checkpoint/v1",
          context: this.#options.context,
          health,
          sources: [...this.#sources.values()].map(
            ({ cdp: _cdp, decoder, ...s }) => ({
              ...s,
              pending: decoder.checkpoint(),
            }),
          ),
        },
        flushedAt,
      );
      this.#gaps = [];
      this.#lastPollAt = now;
      if (wasRunning && !this.#running) {
        clearInterval(this.#timer);
        await this.#journal.release();
      }
    } catch {
      this.#sources = snapshots;
      this.#running = previouslyRunning;
      this.#nextDiscovery = 0;
      this.#lastError = "capture-or-journal-failed";
      this.#lastFlushAt = undefined;
      throw new Error("network-observation-poll-failed");
    }
  }
  async stop() {
    clearInterval(this.#timer);
    if (this.#busy) await this.#busy;
    if (!this.#running) return this.status();
    this.#deadline = this.#now();
    await this.poll();
    return this.status();
  }
}
