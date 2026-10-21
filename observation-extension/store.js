import { nativeEvent } from "./event-adapter.js";
const request = (r) =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error ?? Error("transaction-aborted"));
    tx.onerror = () => {};
  });
const iso = (time) => new Date(time).toISOString();

/** IndexedDB is the only native capture owner, including correlation and counters. */
export class NativeObservationStore {
  constructor({
    indexedDB,
    name = "x-harness-network",
    uuid = () => crypto.randomUUID(),
    clock = () => Date.now(),
  }) {
    this.indexedDB = indexedDB;
    this.name = name;
    this.uuid = uuid;
    this.clock = clock;
    this.database = null;
  }
  async open() {
    if (this.database) return;
    if (!this.opening) {
      const r = this.indexedDB.open(this.name, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore("meta");
        db.createObjectStore("events", { keyPath: "eventId" }).createIndex(
          "sequence",
          "sequence",
          { unique: true },
        );
        db.createObjectStore("pending");
        db.createObjectStore("endpoints");
        db.createObjectStore("runs");
      };
      this.opening = request(r).then(
        (db) => {
          this.database = db;
        },
        (error) => {
          this.opening = null;
          throw error;
        },
      );
    }
    await this.opening;
  }
  async transaction(write, fn) {
    await this.open();
    const tx = this.database.transaction(
      ["meta", "events", "pending", "endpoints", "runs"],
      write ? "readwrite" : "readonly",
      { durability: write ? "strict" : "default" },
    );
    const completion = done(tx);
    try {
      const value = await fn(tx);
      await completion;
      return value;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await completion.catch(() => {});
      throw error;
    }
  }
  async saveHealth(tx, health) {
    await request(tx.objectStore("meta").put(health, "health"));
    await request(tx.objectStore("runs").put(health, health.runId));
  }
  async start(sessionId, durationMs = 86400000) {
    if (!Number.isFinite(durationMs) || durationMs <= 0)
      throw Error("invalid-duration");
    return this.transaction(true, async (tx) => {
      const meta = tx.objectStore("meta"),
        old = await request(meta.get("health"));
      const now = this.clock();
      if (old?.running && now < Date.parse(old.stopAt)) return old;
      const health = {
        schema: "x-network-health/v1",
        transport: "chrome-webRequest",
        context: "approved-chrome-profile",
        installId: old?.installId ?? this.uuid(),
        runId: this.uuid(),
        sessionId,
        running: true,
        degraded: false,
        startedAt: iso(now),
        stopAt: iso(now + durationMs),
        lastFlushAt: iso(now),
        intervalMs: 60000,
        sequence: old?.sequence ?? 0,
        requests: 0,
        responses: 0,
        failures: 0,
        rejected429: 0,
        gaps: [
          {
            reason: "installation-or-run-boundary",
            at: iso(now),
            lostEvents: null,
          },
        ],
      };
      await this.saveHealth(tx, health);
      return health;
    });
  }
  async stop() {
    return this.transaction(true, async (tx) => {
      const meta = tx.objectStore("meta"),
        h = await request(meta.get("health"));
      if (h) {
        h.running = false;
        h.stoppedAt = iso(this.clock());
        h.lastFlushAt = iso(this.clock());
        await this.saveHealth(tx, h);
      }
      return h;
    });
  }
  #advance(h, sessionId, now) {
    if (h.sessionId !== sessionId) {
      h.gaps.push({
        reason: "browser-session-changed",
        from: h.lastFlushAt,
        to: iso(now),
        lostEvents: null,
      });
      h.sessionId = sessionId;
    }
    if (now - Date.parse(h.lastFlushAt) > 180000)
      h.gaps.push({
        reason: "browser-heartbeat-gap",
        from: h.lastFlushAt,
        to: iso(now),
        lostEvents: null,
      });
    if (now >= Date.parse(h.stopAt)) {
      h.running = false;
      h.stoppedAt = iso(now);
    }
    h.lastFlushAt = iso(now);
    return h;
  }
  async heartbeat(sessionId) {
    return this.transaction(true, async (tx) => {
      const meta = tx.objectStore("meta"),
        h = await request(meta.get("health"));
      if (!h) return null;
      if (h.running) this.#advance(h, sessionId, this.clock());
      await this.saveHealth(tx, h);
      return h;
    });
  }
  async record(phase, details, sessionId) {
    return this.transaction(true, async (tx) => {
      const meta = tx.objectStore("meta"),
        events = tx.objectStore("events"),
        pending = tx.objectStore("pending"),
        endpoints = tx.objectStore("endpoints");
      const h = await request(meta.get("health"));
      if (!h?.running) return false;
      const now = this.clock();
      this.#advance(h, sessionId, now);
      if (!h.running) {
        await this.saveHealth(tx, h);
        return false;
      }
      const r = nativeEvent(phase, details, {
        ...h,
        sequence: h.sequence + 1,
        observedAt: iso(now),
      });
      if (!r) return false;
      if (await request(events.get(r.eventId))) return false;
      h.sequence++;
      const key = [h.runId, sessionId, details.requestId].join(":"),
        previous = await request(pending.get(key));
      if (phase === "request") {
        h.requests++;
        await request(
          pending.put({ at: details.timeStamp, location: r.location }, key),
        );
      }
      if (phase === "response") {
        h.responses++;
        if (r.status === 429) h.rejected429++;
        if (previous && details.timeStamp >= previous.at)
          r.latencyMs = details.timeStamp - previous.at;
        else r.orphanResponse = true;
      }
      if (phase === "failed") {
        h.failures++;
        if (!previous) r.orphanFailure = true;
      }
      if (phase === "response") {
        await request(
          pending.put({ ...previous, responseEventId: r.eventId }, key),
        );
      }
      if (
        (phase === "cache" || phase === "completed") &&
        previous?.responseEventId &&
        typeof details.fromCache === "boolean"
      ) {
        const response = await request(events.get(previous.responseEventId));
        if (response) {
          response.fromCache = details.fromCache;
          await request(events.put(response));
        }
      }
      if (phase === "completed" || phase === "failed")
        await request(pending.delete(key));
      const ek = [h.runId, r.endpoint].join(":"),
        e = (await request(endpoints.get(ek))) ?? {
          endpoint: r.endpoint,
          requests: 0,
          responses: 0,
          failures: 0,
          rejected429: 0,
        };
      if (phase === "request") e.requests++;
      if (phase === "response") e.responses++;
      if (phase === "failed") e.failures++;
      if (r.status === 429) e.rejected429++;
      if (r.rateLimit)
        e.lastRate = {
          ...r.rateLimit,
          eventId: r.eventId,
          occurredAt: r.occurredAt,
          fromCache: r.fromCache,
        };
      if (
        (phase === "cache" || phase === "completed") &&
        typeof details.fromCache === "boolean" &&
        e.lastRate?.eventId === previous?.responseEventId
      )
        e.lastRate.fromCache = details.fromCache;
      await request(events.put(r));
      await request(endpoints.put(e, ek));
      await this.saveHealth(tx, h);
      return true;
    });
  }
  async snapshot() {
    return this.transaction(false, async (tx) => {
      const health = await request(tx.objectStore("meta").get("health"));
      const all = await request(tx.objectStore("endpoints").getAll());
      const keys = await request(tx.objectStore("endpoints").getAllKeys());
      return {
        health: health ?? null,
        endpoints: all.filter((_, i) =>
          String(keys[i]).startsWith((health?.runId ?? "missing") + ":"),
        ),
      };
    });
  }
  async exportMetadata() {
    return this.transaction(false, async (tx) => ({
      schema: "x-native-network-export/v1",
      exportedAt: iso(this.clock()),
      health: await request(tx.objectStore("meta").get("health")),
      runs: await request(tx.objectStore("runs").getAll()),
    }));
  }
  async exportPage(offset = 0, through = Infinity) {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw Error("invalid-export-offset");
    return this.transaction(
      false,
      (tx) =>
        new Promise((resolve, reject) => {
          const rows = [],
            r = tx.objectStore("events").index("sequence").openCursor();
          let skipped = false;
          r.onerror = () => reject(r.error);
          r.onsuccess = () => {
            const c = r.result;
            if (!c || c.value.sequence > through) {
              resolve(rows);
              return;
            }
            if (!skipped && offset) {
              skipped = true;
              c.advance(offset);
              return;
            }
            rows.push(c.value);
            if (rows.length === 1000) resolve(rows);
            else c.continue();
          };
        }),
    );
  }
  async export() {
    return this.transaction(false, async (tx) => ({
      schema: "x-native-network-export/v1",
      exportedAt: iso(this.clock()),
      health: await request(tx.objectStore("meta").get("health")),
      records: await request(tx.objectStore("events").getAll()),
      runs: await request(tx.objectStore("runs").getAll()),
    }));
  }
  close() {
    this.database?.close();
    this.database = null;
    this.opening = null;
  }
}
