import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { readFile } from "node:fs/promises";
import { NativeObservationStore } from "../.local/observation-extension/store.js";
import { nativeEvent } from "../.local/observation-extension/event-adapter.js";
const endpoint = "https://x.com/i/api/graphql/hash/Viewer";
const now = Date.parse("2026-10-21T00:00:00Z");
const detail = (id, time = now, extra = {}) => ({
  url: endpoint + "?SECRET=SECRET",
  requestId: String(id),
  timeStamp: time,
  tabId: 7,
  method: "GET",
  requestBody: "SECRET",
  requestHeaders: [{ name: "Cookie", value: "SECRET" }],
  ...extra,
});
function fixture() {
  let time = now,
    ids = 0;
  const indexedDB = new IDBFactory();
  const options = {
    indexedDB,
    name: "fixture",
    uuid: () => String(++ids),
    clock: () => time,
  };
  return {
    options,
    setTime: (v) => {
      time = v;
    },
    store: new NativeObservationStore(options),
  };
}

test("native adapter discards query, bodies, credentials, foreign domains and arbitrary error text", () => {
  const context = {
    installId: "i",
    sessionId: "s",
    runId: "r",
    sequence: 1,
    observedAt: new Date(now).toISOString(),
  };
  const r = nativeEvent(
    "response",
    detail("r", now, {
      statusCode: 200,
      responseHeaders: [
        { name: "x-rate-limit-limit", value: "100" },
        { name: "x-rate-limit-remaining", value: "99" },
        { name: "Set-Cookie", value: "SECRET" },
      ],
    }),
    context,
  );
  assert.equal(r.rateLimit.remaining, 99);
  assert(!JSON.stringify(r).includes("SECRET"));
  assert.equal(r.timeQuality, "browser-wall-clock");
  assert.equal(
    nativeEvent(
      "request",
      detail("r", now, { url: "https://foreign.example/SECRET" }),
      context,
    ),
    null,
  );
  assert.equal(
    nativeEvent("failed", detail("r", now, { error: "SECRET" }), context)
      .errorText,
    "unclassified-network-error",
  );
});
test("native transactions record successful quotas exactly once and recover after worker recreation", async () => {
  const f = fixture(),
    s = f.store;
  await s.start("browser-one");
  await s.record("request", detail("a"), "browser-one");
  s.close();
  const restarted = new NativeObservationStore(f.options);
  await restarted.record(
    "response",
    detail("a", now + 5, {
      statusCode: 200,
      responseHeaders: [
        { name: "x-rate-limit-limit", value: "100" },
        { name: "x-rate-limit-remaining", value: "99" },
      ],
    }),
    "browser-one",
  );
  assert.equal(
    await restarted.record("request", detail("a"), "browser-one"),
    false,
  );
  const { health, endpoints } = await restarted.snapshot();
  assert.equal(health.requests, 1);
  assert.equal(health.responses, 1);
  assert.equal(endpoints[0].lastRate.remaining, 99);
  const all = await restarted.export();
  assert.equal(all.records.find((x) => x.status === 200).latencyMs, 5);
  assert(!JSON.stringify(all).includes("SECRET"));
  restarted.close();
});
test("native redirects preserve two requests under one request ID and classify cache completion", async () => {
  const { store: s } = fixture();
  await s.start("b");
  await s.record("request", detail("r"), "b");
  await s.record("response", detail("r", now + 1, { statusCode: 302 }), "b");
  await s.record(
    "request",
    detail("r", now + 2, { url: endpoint + "/next" }),
    "b",
  );
  await s.record(
    "response",
    detail("r", now + 3, { url: endpoint + "/next", statusCode: 200 }),
    "b",
  );
  await s.record(
    "completed",
    detail("r", now + 4, { url: endpoint + "/next", fromCache: true }),
    "b",
  );
  const data = await s.export();
  assert.equal(data.health.requests, 2);
  assert.equal(data.health.responses, 2);
  assert.equal(data.records.find((r) => r.status === 200).fromCache, true);
  s.close();
});
test("native browser restart and delayed heartbeat remain explicit gaps; deadline stops capture", async () => {
  const f = fixture(),
    s = f.store;
  await s.start("b1", 240000);
  f.setTime(now + 200000);
  await s.heartbeat("b2");
  let h = (await s.snapshot()).health;
  assert(h.gaps.some((x) => x.reason === "browser-session-changed"));
  assert(h.gaps.some((x) => x.reason === "browser-heartbeat-gap"));
  f.setTime(now + 240001);
  await s.heartbeat("b2");
  assert.equal((await s.snapshot()).health.running, false);
  assert.equal(
    await s.record("request", detail("late", now + 240002), "b2"),
    false,
  );
  s.close();
});
test("native24h finite soak has exact counts, deduplicates repeated delivery and preserves old runs", async () => {
  const f = fixture(),
    s = f.store;
  await s.start("browser");
  for (let minute = 0; minute < 1440; minute++) {
    f.setTime(now + minute * 60000);
    await s.record("request", detail(minute, now + minute * 60000), "browser");
    await s.record(
      "response",
      detail(minute, now + minute * 60000 + 10, {
        statusCode: minute % 17 === 0 ? 429 : 200,
        responseHeaders: [
          { name: "x-rate-limit-limit", value: "50" },
          {
            name: "x-rate-limit-remaining",
            value: minute % 17 === 0 ? "0" : "49",
          },
        ],
      }),
      "browser",
    );
  }
  let h = (await s.snapshot()).health;
  assert.equal(h.requests, 1440);
  assert.equal(h.responses, 1440);
  assert.equal(h.rejected429, Math.ceil(1440 / 17));
  f.setTime(now + 86400000);
  await s.heartbeat("browser");
  assert.equal((await s.snapshot()).health.running, false);
  await s.start("browser");
  const data = await s.export();
  assert.equal(data.runs.length, 2);
  assert.equal(data.runs[0].requests, 1440);
  assert.equal(data.records.length, 2880);
  s.close();
});
test("native manifest and listeners cannot request blocking, cookies, bodies or external uploads", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../observation-extension/manifest.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(manifest.permissions, ["webRequest", "storage", "alarms"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://x.com/*",
    "https://api.x.com/*",
  ]);
  assert(!manifest.content_scripts);
  assert(!manifest.externally_connectable);
  const worker = await readFile(
    new URL("../observation-extension/worker.js", import.meta.url),
    "utf8",
  );
  assert(
    !/fetch\(|XMLHttpRequest|requestBody|requestHeaders|blocking|extraHeaders|onBeforeSendHeaders/.test(
      worker,
    ),
  );
  for (const name of [
    "onBeforeRequest",
    "onHeadersReceived",
    "onCompleted",
    "onErrorOccurred",
  ])
    assert(worker.includes(name));
});

test("native exports replay through the SDK importer without duplicate counts or leaked fields", async (t) => {
  const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { importNativeXNetworkExport, readXNetworkReport } =
    await import("../dist/diagnostics.js");
  const directory = await mkdtemp(join(tmpdir(), "native-replay-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const f = fixture();
  await f.store.start("browser");
  await f.store.record("request", detail("r"), "browser");
  await f.store.record(
    "response",
    detail("r", now + 1, {
      statusCode: 429,
      responseHeaders: [
        { name: "x-rate-limit-limit", value: "100" },
        { name: "x-rate-limit-remaining", value: "0" },
      ],
    }),
    "browser",
  );
  const data = await f.store.export();
  data.records[0].Cookie = "SECRET";
  const input = join(directory, "export.json"),
    output = join(directory, "replay");
  await writeFile(input, JSON.stringify(data));
  await importNativeXNetworkExport(input, output);
  await importNativeXNetworkExport(input, output);
  const report = await readXNetworkReport(output, { now });
  assert.equal(report.totals.requests, 1);
  assert.equal(report.totals.responses, 1);
  assert.equal(report.totals.rejected429, 1);
  assert(report.coverage.source.includes("Chrome-profile"));
  assert(!JSON.stringify(report).includes("SECRET"));
  f.store.close();
});

test("native export paging has a stable sequence boundary during concurrent capture", async () => {
  const f = fixture(),
    s = f.store;
  await s.start("b");
  for (let i = 0; i < 1002; i++)
    await s.record("request", detail(i, now + i), "b");
  const meta = await s.exportMetadata();
  await s.record("request", detail("later", now + 5000), "b");
  const first = await s.exportPage(0, meta.health.sequence),
    second = await s.exportPage(1000, meta.health.sequence);
  assert.equal(first.length, 1000);
  assert.equal(second.length, 2);
  assert.equal(new Set([...first, ...second].map((x) => x.eventId)).size, 1002);
  s.close();
});

test("response-start cache metadata confirms quota freshness before a stream completes", async () => {
  const { store: s } = fixture();
  await s.start("b");
  await s.record("request", detail("r"), "b");
  await s.record(
    "response",
    detail("r", now + 1, {
      statusCode: 200,
      responseHeaders: [
        { name: "x-rate-limit-limit", value: "50" },
        { name: "x-rate-limit-remaining", value: "49" },
      ],
    }),
    "b",
  );
  await s.record("cache", detail("r", now + 2, { fromCache: false }), "b");
  const { health, endpoints } = await s.snapshot();
  assert.equal(health.responses, 1);
  assert.equal(endpoints[0].lastRate.fromCache, false);
  assert.equal(
    (await s.export()).records.find((x) => x.status === 200).fromCache,
    false,
  );
  s.close();
});

test("an aborted native transaction cannot advance counters or retain partial events", async () => {
  const { store: s } = fixture();
  await s.start("b");
  const db = s.database,
    original = db.transaction.bind(db);
  db.transaction = (...args) => {
    const tx = original(...args);
    if (args[1] === "readwrite") {
      const store = tx.objectStore("events"),
        put = store.put.bind(store);
      store.put = (...values) => {
        const r = put(...values);
        r.addEventListener("success", () => tx.abort());
        return r;
      };
    }
    return tx;
  };
  await assert.rejects(() => s.record("request", detail("aborted"), "b"));
  db.transaction = original;
  const data = await s.export();
  assert.equal(data.health.requests, 0);
  assert.equal(data.records.length, 0);
  s.close();
});
test("assembled native worker listeners and messages capture only approved metadata", async () => {
  const previousChrome = globalThis.chrome,
    previousIDB = globalThis.indexedDB;
  const callbacks = {},
    session = {},
    local = {};
  let message;
  const event = (name) => ({
    addListener: (fn) => {
      callbacks[name] = fn;
    },
  });
  globalThis.indexedDB = new IDBFactory();
  globalThis.chrome = {
    webRequest: Object.fromEntries(
      [
        "onBeforeRequest",
        "onHeadersReceived",
        "onResponseStarted",
        "onCompleted",
        "onErrorOccurred",
      ].map((name) => [name, event(name)]),
    ),
    storage: {
      session: {
        get: async (key) => ({ [key]: session[key] }),
        set: async (obj) => Object.assign(session, obj),
      },
      local: {
        get: async (key) => ({ [key]: local[key] }),
        set: async (obj) => Object.assign(local, obj),
      },
    },
    alarms: { create: async () => {}, onAlarm: event("alarm") },
    runtime: {
      id: "test-extension",
      onInstalled: event("installed"),
      onStartup: event("startup"),
      onMessage: {
        addListener: (fn) => {
          message = fn;
        },
      },
    },
  };
  try {
    await import("../.local/observation-extension/worker.js?assembled-worker");
    const call = (type) =>
      new Promise((resolve) =>
        message(
          typeof type === "string" ? { type } : type,
          { id: "test-extension" },
          resolve,
        ),
      );
    assert.equal(
      message({ type: "start" }, { id: "another-extension" }, () => {}),
      false,
    );
    assert((await call("start")).ok);
    const time = Date.now();
    callbacks.onBeforeRequest(detail("worker", time));
    await new Promise((r) => setTimeout(r, 10));
    callbacks.onHeadersReceived(
      detail("worker", time + 1, {
        statusCode: 200,
        responseHeaders: [{ name: "x-rate-limit-remaining", value: "49" }],
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    callbacks.onResponseStarted(
      detail("worker", time + 2, { fromCache: false }),
    );
    await new Promise((r) => setTimeout(r, 10));
    const snapshot = await call("snapshot");
    assert.equal(snapshot.value.health.requests, 1);
    assert.equal(snapshot.value.health.responses, 1);
    assert.equal(snapshot.value.endpoints[0].lastRate.remaining, 49);
    assert.equal(snapshot.value.endpoints[0].lastRate.fromCache, false);
    const page = await call({ type: "exportPage", offset: 0, through: 100 });
    assert.equal(page.value.length, 3);
    assert(!JSON.stringify(page).includes("SECRET"));
    assert((await call("stop")).ok);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.indexedDB = previousIDB;
  }
});

test("concurrent events after worker recreation share one database open and exact counters", async () => {
  const f = fixture();
  await f.store.start("b");
  f.store.close();
  let opens = 0;
  const original = f.options.indexedDB.open.bind(f.options.indexedDB);
  f.options.indexedDB.open = (...args) => {
    opens++;
    return original(...args);
  };
  const resumed = new NativeObservationStore(f.options);
  await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      resumed.record("request", detail(i, now + i), "b"),
    ),
  );
  assert.equal(opens, 1);
  assert.equal((await resumed.snapshot()).health.requests, 20);
  resumed.close();
});
