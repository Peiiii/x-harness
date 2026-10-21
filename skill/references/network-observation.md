# Passive network observation

Use this when debugging request cost and server quotas. It never opens, reloads or navigates pages and never makes an X API request. It reads the browser host's protocol buffer for already-open X tabs. Keep the host running; a durable health heartbeat makes host loss visible. This is observation, not automatic throttling or permission for business actions.

From the documented browser-enabled JavaScript runtime, reuse the current browser binding:

```js
var { XNetworkObserver, readXNetworkReport } = await import('@nextclaw/x-harness/diagnostics');
var observer = new XNetworkObserver({
  directory: './.local/x-network',
  context: 'selected-browser',
  listTabs: () => browser.tabs.list(),
  getTab: id => browser.tabs.get(id),
});
await observer.start();
observer.status();
// After observing, replay locally without contacting X:
await readXNetworkReport('./.local/x-network');
// To finish early: await observer.stop();
```

Defaults: sample every2s, discover every15s, stop after24h. These are local capture intervals, not platform request rates. `intervalMs`, `discoverMs`, `durationMs` are explicit options. Only one writer may own a directory. An observer has to run in the host that owns the real CUA handles; a shell or a scheduler cannot reconstruct those handles. A host restart needs a new observer in a browser-enabled runtime using the same directory/context. It resumes checkpointed cursors and source epochs, retains original unfinished deadline, and records the interruption. A still-living writer is never stolen because its heartbeat is old.

The local directory contains Shanghai-date JSONL files, an atomic checkpoint and health.json. Successful and failed response quota headers are retained. Reports replay distinct event IDs, so a crash after append but before checkpoint does not inflate totals. Requests, responses, redirects and failures remain separate; websocket messages, resource counts and DOM reads are not HTTP API request counts. GraphQL query hashes are normalized only in endpoint aggregates. Query strings, cookies, bodies, arbitrary errors and unrelated domains are never journaled.

`readXNetworkDiagnostics(tab, {afterSequence, startObserving})` remains a bounded snapshot; its new `records` field contains all sanitized X API events, and `events` also retains successful rate-bearing responses. Fullness means no detected loss in that returned buffer, not whole-account completeness. Continuous observation additionally tracks truncation, source boundaries, host interruption, failed polling and unknown correlation. Unknown traffic stays unknown. Worker targets, other profiles and pre-attachment activity are not proven complete.

Inspect rate windows per endpoint: `limit`, `remaining`, `resetAt`, `retryAfterSeconds`. Do not sum remaining values across tabs or infer a universal quota from one endpoint. An omitted header is unknown. Event clocks explicitly distinguish request wall time, request-derived response time and capture-only time. Endpoint minute totals with capture-only times carry that limitation. `coverage.stale` describes heartbeat freshness, while `health.running` separately describes whether the finite run stopped.

Validation includes synthetic exact counts, cross-poll response/failure correlation, redirects, secret exclusion, pagination/truncation/reset, crash replay, single-writer protection, source lifecycle, a deterministic accelerated24h soak and consumer live passive adoption. A real24h conclusion still requires actual elapsed time and adequate coverage; no test can manufacture it.
