# X network observation — 2026-10-21

## User result and evidence

The user asks for accurate continuous request logs first, adequate validation, and a day of real evidence before optimizing business throughput. Consumer evidence shows startup429 and shared background read quotas. Existing readXNetworkDiagnostics reads a bounded per-tab buffer, drops ordinary successful GET rate headers, has no durable account-context journal, and cannot reconstruct gaps. Reusing snapshots alone cannot meet this result.

Operator path: start the observer from the existing CUA Chrome session → it discovers existing X tabs without opening/navigating them → a local heartbeat exposes attached tabs, cursor progress and errors → a replayable local report shows counts, limits/windows, 429 sequences and coverage → after 24 wall-clock hours, analyze the actual evidence and clearly retain unknowns. A stale heartbeat means missing coverage, never zero traffic. No new browser profile, login, page requests, business actions or throttling policy is introduced.

## Owner and choice

Generic implementation belongs to x-harness, diagnostics entry. Consumer bootstrap and private journals belong to ai-content-studio. Keep the existing normal root API unchanged. Extend the canonical network decoder used by old diagnostics; add one persistent journal and one observer, plus deterministic report replay. No parallel wire decoder, database, server, browser extension or action scheduler.

A heartbeat automation alone cannot drain the small browser buffer reliably. Browser extension changes expand access and duplicate the existing transport. The chosen observer uses the supported CUA CDP capability in its persistent REPL, proven with a timer surviving tool calls. Its real lifetime remains host-dependent: persistent health, restart gaps and local checkpoint recovery are Required. A one-day result requires actual elapsed time; tests cannot prove that day has occurred.

## Canonical event and durable collection

Observe Network.requestWillBeSent/responseReceived/loadingFailed only. Filter X API origins before serialization; strip query, fragment, credentials and bodies, retain only explicit numeric rate headers. Preserve successful responses, method, status, request ID, redirect response, source epoch, CDP sequence, monotonic time and request wall-time. Failure correlation spans batches; unmatched failures remain coverage counters without unrelated endpoint attribution. Never persist arbitrary error strings.

An observer discovers existing X tabs periodically, samples them serially on a short configurable interval, drains hasMore pages with a progress guard, and emits explicit gaps for truncation, lost/replaced tab, buffer reset, errors and host restart. A monotonic-derived request wall-time is labeled; missing event time uses observation time only with an explicit timing-quality field. Cursor advances only after durable journal commit. Counts are distinct canonical event IDs; request ID alone cannot deduplicate redirects. The journal is append-only JSONL rotated by Shanghai date, with a single writer lease, crash-tail repair, atomic checkpoints and replay deduplication after append-before-checkpoint crashes. Existing source epochs continue across ordinary process restarts; buffer reset creates a new epoch.

Discovery is local inventory, never page navigation or content reads. New/unseen sources start at a recorded boundary and report pre-attachment unknown coverage. Capture contexts may group tabs, but no claim is made about the platform's hidden account/IP bucket scope. No shared business ledger is mutated.

## Health and analysis

Health includes observer/runtime identity, start/last successful flush, last error, per-tab attachment/cursor/gaps, sampling/discovery configuration and stop deadline. Startup fails clearly if another living writer owns the journal. Restart preserves existing files and reports interruption; no stale live PID is silently stolen. Capture automatic stop is finite (24h by default consumer configuration), flushes and releases its own lease; it does not close tabs or alter another observer's Network domain.

Reports stream journals, deduplicate event IDs and expose observed request/response/failure/429 totals, per-endpoint/minute/per-tab counts, server rate-header samples and distinct reset windows, response latency only when correlated, and coverage intervals/gaps/unknown loss counts. Do not sum response rate remaining as independent per-tab budgets. No fabricated limit/window, historical zero filling, extrapolated daily count or guaranteed zero429 throughput. LoadingFinished/body/CDP screenshot events are not request counts. Reports remain usable on partial/truncated journals and explicitly disclose incompleteness.

## Acceptance and validation

Active IDs live in the consumer acceptance contract. Synthetic exact-count fixtures cover cross-batch failures, redirects, duplicate replay, successful headers, excluded domains/secrets, overflow/paging/reset, tab lifecycle, crash/restart, concurrent start/stop, clock quality and day rotation. A 24h accelerated deterministic soak spans source churn and gaps without X traffic; it proves mechanisms, not one real day. Existing network/submission regression, TypeScript, formatting/maintainability and affected package checks remain required. Live CUA adoption must produce continuously advancing files and fresh health from existing page traffic; compare direct sanitized protocol samples with replay counts for one known window. Capturing metadata sends zero X requests. Final 24h interpretation remains pending until real evidence matures.

## Scope and review

Risk L3: persistence, long-running runtime and data integrity. flow standard, stable design required, plan required through the active acceptance record. Retrospective pending. Design review: passed after checking that health/recovery, full successful response metadata and day-boundary evidence are explicit. Existing business actions and limits are not changed. Running source checkout has unrelated WIP; all SDK edits use an isolated worktree from current origin/main. Source changes are precisely committed and ordinarily pushed; verified local artifact can be adopted before any applicable consolidated npm release. Actual runtime adoption and one-day analysis are separately recorded.

## Real-host correction and review

The actual CUA sandbox rejects node:process and provides no global process. Initial0.2.72 adoption failed before browser discovery. The validated macOS consumer therefore uses a Darwin advisory file lease (open2 O_EXLOCK|O_NONBLOCK), with a held descriptor and persistent inode. It needs no process access and cannot steal a live lease; kernel release on abrupt process death is tested. Normal Node hosts retain the PID mode, with serialized dead-writer recovery. Lock modes cannot be mixed in a directory. Health exposes null PID rather than guessing. This is an actual host boundary, not a reason to relax ownership or bypass the denied module. SDK options, journal acquisition/release, health, installed guide, consumer bootstrap and host tests propagate the new lock mode. Real sandbox start/stop without any browser calls passed before final capture adoption.

Protocol reference: https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/open.2.html . Design review rerun for lock lifecycle and crash boundaries: passed.
