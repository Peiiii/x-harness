# Request observation

For operational intensity and efficiency decisions, start with [built-in Harness call logs](usage-observation.md). They need no extension or background collector. The following full-network mechanisms are optional diagnostics, not prerequisites.

## Optional full-network capture in Codex CUA

Use the packaged `observation-extension/` MV3 extension, or `npm run extension:build` from source. Review manifest permissions before installation; adding site access requires explicit approval. It observes only X API routes through webRequest, stores sanitized events and counters transactionally in local IndexedDB, and uses local alarms for health. It sends no requests and changes no traffic. The dashboard starts a finite24h run, stops it, shows quotas/gaps and exports local JSON. `importNativeXNetworkExport(inputPath,directory)` from diagnostics converts the export for `readXNetworkReport`. Browser request events include cached responses; cache markers prevent treating old cached quota headers as current server budget. Other profiles and browser-off intervals are not claimed complete.

CUA rejects browser calls after an active tool invocation ends. Automatic CDP polling therefore refuses a process-free host; a JavaScript timer is not a supported24h collector there. User-owned tabs can also be held by other sessions. The native extension avoids claiming tabs. Real native lifecycle validation and the day-long analysis follow approved installation; no synthetic test proves either happened.

## Bounded CDP or background-capable Node hosts

Use this when debugging request cost and server quotas. It never opens, reloads or navigates pages and never makes an X API request. It reads the browser host's protocol buffer for already-open X tabs. Keep the host running; a durable health heartbeat makes host loss visible. This is observation, not automatic throttling or permission for business actions.

From the documented browser-enabled JavaScript runtime, reuse the current browser binding:

```js
var { XNetworkObserver, readXNetworkReport } = await import('@nextclaw/x-harness/diagnostics');
var observer = new XNetworkObserver({
  directory: './.local/x-network',
  context: 'selected-browser',
  lockMode: 'darwin-advisory', // validated macOS CUA host; no process global required
  listTabs: () => browser.tabs.list(),
  getTab: id => browser.tabs.get(id),
});
await observer.start({automatic:false});
await observer.poll();
observer.status();
// After observing, replay locally without contacting X:
await readXNetworkReport('./.local/x-network');
// To finish early: await observer.stop();
```

Background-capable Node hosts may use automatic start. Defaults: sample every2s, discover every15s, stop after24h. These are local capture intervals, not platform request rates. `intervalMs`, `discoverMs`, `durationMs` are explicit options. Only one writer may own a directory. The validated macOS CUA host uses `lockMode: 'darwin-advisory'`: Darwin O_EXLOCK holds a persistent file inode until stop/process exit; never delete that lock file. Node hosts may use the default PID lease. Do not mix modes in one directory. An observer has to run in the host that owns the real CUA handles; a shell or a scheduler cannot reconstruct those handles. A host restart needs a new observer in a browser-enabled runtime using the same directory/context. It resumes checkpointed cursors and source epochs, retains original unfinished deadline, and records the interruption. A still-living writer is never stolen because its heartbeat is old. A Darwin lease is released by the kernel on process death even when the sandbox exposes no PID.

The local directory contains Shanghai-date JSONL files, an atomic checkpoint and health.json. Successful and failed response quota headers are retained. Reports replay distinct event IDs, so a crash after append but before checkpoint does not inflate totals. Requests, responses, redirects and failures remain separate; websocket messages, resource counts and DOM reads are not HTTP API request counts. GraphQL query hashes are normalized only in endpoint aggregates. Query strings, cookies, bodies, arbitrary errors and unrelated domains are never journaled.

`readXNetworkDiagnostics(tab, {afterSequence, startObserving})` remains a bounded snapshot; its new `records` field contains all sanitized X API events, and `events` also retains successful rate-bearing responses. Fullness means no detected loss in that returned buffer, not whole-account completeness. Continuous observation additionally tracks truncation, source boundaries, host interruption, failed polling and unknown correlation. Unknown traffic stays unknown. Worker targets, other profiles and pre-attachment activity are not proven complete.

Inspect rate windows per endpoint: `limit`, `remaining`, `resetAt`, `retryAfterSeconds`. Do not sum remaining values across tabs or infer a universal quota from one endpoint. An omitted header is unknown. Event clocks explicitly distinguish request wall time, request-derived response time and capture-only time. Endpoint minute totals with capture-only times carry that limitation. `coverage.stale` describes heartbeat freshness, while `health.running` separately describes whether the finite run stopped.

Validation includes synthetic exact counts, cross-poll response/failure correlation, redirects, secret exclusion, pagination/truncation/reset, crash replay, single-writer protection, source lifecycle, a deterministic accelerated24h soak and consumer live passive adoption. A real24h conclusion still requires actual elapsed time and adequate coverage; no test can manufacture it.
