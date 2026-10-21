import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  appendFile,
  rm,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { XNetworkDecoder } from "../dist/network-events.js";
import { XNetworkJournal, shanghaiDay } from "../dist/network-journal.js";
import { XNetworkObserver, readXNetworkReport } from "../dist/diagnostics.js";
import { readXNetworkDiagnostics } from "../dist/browser-dom-network.js";
const url = "https://x.com/i/api/graphql/hash/ViewerBadgeCounts";
const at = Date.parse("2026-10-21T15:59:00Z");
const req = (sequence, id = "r", endpoint = url) => ({
  sequence,
  method: "Network.requestWillBeSent",
  params: {
    requestId: id,
    timestamp: sequence,
    wallTime: at / 1000 + sequence,
    request: {
      url: endpoint + "?token=SECRET",
      method: "GET",
      postData: "SECRET",
      headers: { Cookie: "SECRET" },
    },
  },
});
const res = (sequence, id = "r", status = 200, endpoint = url) => ({
  sequence,
  method: "Network.responseReceived",
  params: {
    requestId: id,
    timestamp: sequence,
    response: {
      url: endpoint + "?secret=SECRET",
      status,
      headers: {
        "X-Rate-Limit-Limit": "50",
        "x-rate-limit-remaining": status === 429 ? "0" : "49",
        "x-rate-limit-reset": "1792592533",
        "Set-Cookie": "SECRET",
      },
    },
  },
});
const raw = (events, cursor = events.at(-1)?.sequence ?? 0, extra = {}) => ({
  events,
  cursor,
  hasMore: false,
  truncated: false,
  ...extra,
});
async function directory(t) {
  const p = await mkdtemp(join(tmpdir(), "xnet-"));
  t.after(() => rm(p, { recursive: true, force: true }));
  return p;
}
function fixture(directory, options = {}) {
  let now = at,
    events = [],
    tabs = [{ id: "one", url: "https://x.com/home" }],
    enabled = 0,
    fail = false;
  const cdp = {
    send: async (method) => {
      assert.equal(method, "Network.enable");
      enabled++;
    },
    readEvents: async ({ afterSequence }) => {
      if (fail) throw Error("SECRET");
      return raw(
        events.filter((e) => e.sequence > afterSequence),
        Math.max(afterSequence, events.at(-1)?.sequence ?? 0),
      );
    },
  };
  const opts = {
    directory,
    context: "synthetic",
    clock: () => now,
    listTabs: async () => tabs,
    getTab: async () => ({ capabilities: { get: async () => cdp } }),
    ...options,
  };
  return {
    opts,
    cdp,
    setEvents: (v) => {
      events = v;
    },
    setNow: (v) => {
      now = v;
    },
    setTabs: (v) => {
      tabs = v;
    },
    setFail: (v) => {
      fail = v;
    },
    enabled: () => enabled,
  };
}

test("decoder preserves successful quotas, exact timestamps and no credential payload", () => {
  const d = new XNetworkDecoder();
  const out = d.decode(
    [req(1), res(2)],
    "source",
    new Date(at + 9000).toISOString(),
  );
  assert.equal(out.records.length, 2);
  assert.equal(out.records[1].rateLimit.remaining, 49);
  assert.equal(out.records[1].latencyMs, 1000);
  assert.equal(out.records[1].timeQuality, "derived-request-clock");
  assert.equal(
    out.records[0].endpoint,
    "https://x.com/i/api/graphql/ViewerBadgeCounts",
  );
  assert(!JSON.stringify(out).includes("SECRET"));
  assert(!JSON.stringify(d.checkpoint()).includes("SECRET"));
});
test("decoder correlates failures across polls and restart checkpoints, including after response headers", () => {
  const d = new XNetworkDecoder();
  d.decode([req(1), res(2)], "s", "2026-10-21T00:00:00Z");
  const restored = new XNetworkDecoder(d.checkpoint());
  const out = restored.decode(
    [
      {
        sequence: 3,
        method: "Network.loadingFailed",
        params: {
          requestId: "r",
          timestamp: 3,
          errorText: "net::ERR_ABORTED",
          canceled: true,
        },
      },
      {
        sequence: 4,
        method: "Network.loadingFailed",
        params: { requestId: "foreign", errorText: "SECRET" },
      },
    ],
    "s",
    "2026-10-21T00:00:00Z",
  );
  assert.equal(out.records.length, 1);
  assert.equal(out.records[0].location, url);
  assert.equal(out.unmatchedFailures, 1);
  assert(!JSON.stringify(out).includes("SECRET"));
});
test("redirects are separate response/request events under the same request ID", () => {
  const d = new XNetworkDecoder();
  const second = req(2, "r", url + "/next");
  second.params.redirectResponse = { url, status: 302, headers: {} };
  const out = d.decode(
    [req(1), second, res(3, "r", 200, url + "/next")],
    "s",
    new Date(at).toISOString(),
  );
  assert.equal(
    out.records.filter((x) => x.method === "Network.requestWillBeSent").length,
    2,
  );
  assert.equal(
    out.records.filter((x) => x.method === "Network.responseReceived").length,
    2,
  );
  assert.equal(new Set(out.records.map((x) => x.eventId)).size, 4);
});
test("decoder excludes other domains and challenge paths and retires finished requests", () => {
  const d = new XNetworkDecoder();
  const out = d.decode(
    [
      req(1, "foreign", "https://foreign.example/payment"),
      res(2, "foreign", 429, "https://foreign.example/payment"),
      req(3, "challenge", "https://x.com/cdn-cgi/SECRET"),
      req(4),
      {
        sequence: 5,
        method: "Network.loadingFinished",
        params: { requestId: "r" },
      },
    ],
    "s",
    new Date(at).toISOString(),
  );
  assert.equal(out.records.length, 1);
  assert.equal(d.checkpoint().length, 0);
  assert(!JSON.stringify(out).includes("foreign"));
  assert(!JSON.stringify(out).includes("SECRET"));
});
test("legacy diagnostics now exposes successful GET quota evidence", async () => {
  const out = await readXNetworkDiagnostics({
    capabilities: {
      get: async () => ({ readEvents: async () => raw([req(1), res(2)]) }),
    },
  });
  assert.equal(out.traffic.requests, 1);
  assert.equal(out.traffic.responses, 1);
  assert.equal(out.events[0].status, 200);
  assert.equal(out.events[0].rateLimit.remaining, 49);
});
test("journal protects a living writer, repairs only crash tail, rotates Shanghai dates", async (t) => {
  const p = await directory(t),
    a = new XNetworkJournal(p),
    b = new XNetworkJournal(p);
  await a.acquire();
  await assert.rejects(() => b.acquire(), /already-running/);
  await a.commit(
    {
      schema: "x-network-batch/v1",
      sources: [],
      gaps: [],
      observedAt: new Date(at).toISOString(),
    },
    { schema: "x-network-checkpoint/v1", health: {} },
    at,
  );
  await a.release();
  await appendFile(join(p, shanghaiDay(at) + ".jsonl"), "partial");
  const c = new XNetworkJournal(p);
  assert.equal(await c.acquire(), 7);
  await c.commit({ sources: [] }, { health: {} }, at + 120_000);
  await c.release();
  assert((await readdir(p)).includes("2026-10-22.jsonl"));
  assert(
    !(await readFile(join(p, "2026-10-21.jsonl"), "utf8")).includes("partial"),
  );
});
test("observer samples idempotently and replay ignores append-before-checkpoint duplicates", async (t) => {
  const p = await directory(t),
    f = fixture(p);
  f.setEvents([req(1), res(2)]);
  const observer = new XNetworkObserver(f.opts);
  await observer.start({ automatic: false });
  await observer.poll();
  assert.equal(f.enabled(), 1);
  const file = join(p, shanghaiDay(at) + ".jsonl"),
    existing = await readFile(file, "utf8");
  await appendFile(file, existing);
  const report = await readXNetworkReport(p, { now: at });
  assert.equal(report.totals.requests, 1);
  assert.equal(report.totals.responses, 1);
  assert(report.coverage.duplicateEventsIgnored >= 2);
  assert.equal(report.endpoints[0].lastRate.remaining, 49);
  assert.equal(report.coverage.fullAccountCoverageProven, false);
  await observer.stop();
});
test("observer restart restores source cursor and pending request correlation", async (t) => {
  const p = await directory(t),
    f = fixture(p);
  f.setEvents([req(1)]);
  const a = new XNetworkObserver(f.opts);
  await a.start({ automatic: false });
  await a.stop();
  f.setEvents([req(1), res(2)]);
  f.setNow(at + 3000);
  const b = new XNetworkObserver(f.opts);
  await b.start({ automatic: false });
  const r = await readXNetworkReport(p, { now: at + 3000 });
  assert.equal(r.totals.requests, 1);
  assert.equal(r.totals.responses, 1);
  assert(r.coverage.gaps.some((x) => x.reason === "host-restart"));
  await b.stop();
});
test("observer records paging, truncation, buffer reset and discovery churn", async (t) => {
  const p = await directory(t),
    f = fixture(p);
  let calls = 0;
  f.cdp.readEvents = async () => {
    calls++;
    if (calls === 1)
      return raw([req(1)], 1, { hasMore: true, truncated: true });
    if (calls === 2) return raw([res(2)], 2);
    return raw([], calls === 3 ? 0 : 2);
  };
  const a = new XNetworkObserver(f.opts);
  await a.start({ automatic: false });
  await a.poll();
  f.setTabs([]);
  f.setNow(at + 16_000);
  await a.poll();
  const r = await readXNetworkReport(p, { now: at + 16_000 });
  assert.equal(r.totals.requests, 1);
  assert(r.coverage.gaps.some((x) => x.reason === "buffer-truncated"));
  assert(r.coverage.gaps.some((x) => x.reason === "buffer-reset"));
  assert(r.coverage.gaps.some((x) => x.reason === "source-detached"));
  await a.stop();
});
test("failed partial page never advances a durable cursor or drops collected events", async (t) => {
  const p = await directory(t),
    f = fixture(p);
  let fail = true,
    calls = 0;
  f.cdp.readEvents = async ({ afterSequence }) => {
    calls++;
    if (fail && afterSequence === 1) throw Error("SECRET");
    return afterSequence === 0
      ? raw([req(1)], 1, { hasMore: true })
      : raw([res(2)], 2);
  };
  const a = new XNetworkObserver(f.opts);
  await a.start({ automatic: false });
  assert.equal(a.status().sources[0].cursor, 0);
  fail = false;
  await a.poll();
  const r = await readXNetworkReport(p, { now: at });
  assert.equal(r.totals.requests, 1);
  assert.equal(r.totals.responses, 1);
  assert(r.coverage.gaps.some((x) => x.reason === "source-read-failed"));
  assert(!JSON.stringify(r).includes("SECRET"));
  await a.stop();
});
test("journal checkpoint write failure replays durable events without inflation", async (t) => {
  const p = await directory(t),
    f = fixture(p);
  const a = new XNetworkObserver(f.opts);
  await a.start({ automatic: false });
  await rm(join(p, "checkpoint.json"));
  await mkdir(join(p, "checkpoint.json"));
  f.setEvents([req(1), res(2)]);
  await assert.rejects(() => a.poll(), /poll-failed/);
  await rm(join(p, "checkpoint.json"), { recursive: true });
  await a.poll();
  const r = await readXNetworkReport(p, { now: at });
  assert.equal(r.totals.requests, 1);
  assert.equal(r.totals.responses, 1);
  assert(r.coverage.duplicateEventsIgnored >= 2);
  await a.stop();
});
test("stale or missing health is unknown, not zero-traffic health", async (t) => {
  const p = await directory(t);
  const r = await readXNetworkReport(p, { now: at });
  assert.equal(r.coverage.stale, true);
  assert.equal(r.coverage.healthAgeMs, null);
});
test("finite deadline stops, flushes and releases without browser navigation", async (t) => {
  const p = await directory(t),
    f = fixture(p, { durationMs: 1000 });
  const a = new XNetworkObserver(f.opts);
  await a.start({ automatic: false });
  f.setNow(at + 1000);
  await a.poll();
  assert.equal(a.status().running, false);
  const b = new XNetworkJournal(p);
  await b.acquire();
  await b.release();
});
test("accelerated24h exact-count soak with six tabs, day rotation and a visible overflow", async (t) => {
  const p = await directory(t);
  let now = at;
  const perTab = new Map();
  const ids = Array.from({ length: 6 }, (_, i) => String(i));
  const a = new XNetworkObserver({
    directory: p,
    context: "synthetic-soak",
    clock: () => now,
    intervalMs: 60_000,
    discoverMs: 60_000,
    durationMs: 86_400_000,
    listTabs: async () => ids.map((id) => ({ id, url: "https://x.com/home" })),
    getTab: async (id) => ({
      capabilities: {
        get: async () => ({
          send: async () => {},
          readEvents: async ({ afterSequence }) => {
            const n = (perTab.get(id) ?? 0) + 1;
            perTab.set(id, n);
            const sequence = Math.max(afterSequence + 1, n * 3);
            const request = req(sequence, id),
              response = res(sequence + 1, id, n % 17 === 0 ? 429 : 200);
            request.params.wallTime = now / 1000;
            request.params.timestamp = now / 1000;
            response.params.timestamp = now / 1000 + 0.05;
            return raw([request, response], sequence + 1, {
              truncated: n === 100 && id === "0",
            });
          },
        }),
      },
    }),
  });
  await a.start({ automatic: false });
  for (let minute = 1; minute <= 1440; minute++) {
    now = at + minute * 60_000;
    await a.poll();
  }
  assert.equal(a.status().running, false);
  const r = await readXNetworkReport(p, { now });
  assert.equal(r.totals.requests, 6 * 1441);
  assert.equal(r.totals.responses, 6 * 1441);
  assert.equal(r.totals.rejected429, 6 * Math.floor(1441 / 17));
  assert.equal(r.coverage.malformedLines, 0);
  assert(r.coverage.gaps.some((x) => x.reason === "buffer-truncated"));
  assert((await readdir(p)).includes("2026-10-22.jsonl"));
});

test("concurrent stale-owner recovery never removes the winning live lease", async (t) => {
  const p = await directory(t);
  await writeFile(
    join(p, "writer.lock"),
    JSON.stringify({ pid: 2147483646, token: "dead-owner" }),
  );
  const a = new XNetworkJournal(p),
    b = new XNetworkJournal(p);
  const results = await Promise.allSettled([a.acquire(), b.acquire()]);
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
  const winner = results[0].status === "fulfilled" ? a : b;
  const lock = JSON.parse(await readFile(join(p, "writer.lock"), "utf8"));
  assert.equal(lock.token, winner.token);
  await winner.release();
});
test("crashed running capture retains its original24h deadline after restart", async (t) => {
  const p = await directory(t),
    f = fixture(p);
  const a = new XNetworkObserver({ ...f.opts, durationMs: 1000 });
  await a.start({ automatic: false });
  await a.stop();
  const cp = JSON.parse(await readFile(join(p, "checkpoint.json"), "utf8"));
  cp.health.running = true;
  cp.health.stopAt = new Date(at + 1000).toISOString();
  await writeFile(join(p, "checkpoint.json"), JSON.stringify(cp));
  f.setNow(at + 2000);
  const b = new XNetworkObserver(f.opts);
  await b.start({ automatic: true });
  assert.equal(b.status().running, false);
  assert.equal(b.status().stopAt, new Date(at + 1000).toISOString());
  const c = new XNetworkJournal(p);
  await c.acquire();
  await c.release();
});

test("a failed deadline flush stays recoverable until a durable final commit", async (t) => {
  const p = await directory(t),
    f = fixture(p, { durationMs: 1000 });
  const a = new XNetworkObserver(f.opts);
  await a.start({ automatic: false });
  await rm(join(p, "checkpoint.json"));
  await mkdir(join(p, "checkpoint.json"));
  f.setNow(at + 1000);
  await assert.rejects(() => a.poll(), /poll-failed/);
  assert.equal(a.status().running, true);
  await rm(join(p, "checkpoint.json"), { recursive: true });
  await a.poll();
  assert.equal(a.status().running, false);
  const lock = new XNetworkJournal(p);
  await lock.acquire();
  await lock.release();
});

test("health records actual flush completion rather than poll start time", async (t) => {
  const p = await directory(t),
    f = fixture(p);
  f.cdp.readEvents = async () => {
    f.setNow(at + 500);
    return raw([req(1), res(2)], 2);
  };
  const a = new XNetworkObserver(f.opts);
  await a.start({ automatic: false });
  assert.equal(a.status().lastFlushAt, new Date(at + 500).toISOString());
  await a.stop();
});
