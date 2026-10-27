# Reuse the bound account session and avoid document search reloads

flow: standard; risk: L3; retrospective_state: completed
active-contract: session-identity-reuse-20261027-r1
plan: not-required (one implementation and validation batch)

## User outcome and evidence

On 2026-10-27 the user rejected repeatedly confirming the same logged-in
account during normal commenting. The consumer already persists its expected
account, but ordinary `readAccount` calls independently observe it again.
Some target navigation already uses a visible client link; search changes still
use `tab.goto`, reinitializing the web client. Actual consumer pages have shown
Viewer/settings HTTP429 and missing identity. This does not prove the precise
platform rate-limit trigger, or that DOM identity reads issue HTTP requests.

The operator starts through the existing root binding, confirms the account
once, and continues normal reviewed comments/reactions through the same binding.
Ordinary target observations maintain the session identity without an extra
account-only observation. An explicit recovery inspection, a new binding,
observed missing/mismatched identity, warning or observation exception requires
fresh evidence. No cached value can fill a missing account in a target result.
The existing original action, parent, intent, single-submit and public result
checks remain authoritative.

## Design and alternatives

`PlatformObservation` owns the in-memory account observation because it already
owns every fresh platform observation and its failure lifecycle. `XPlatform`
uses that read for internal account prerequisites. Explicit `inspectAccount`
forces a fresh read, including recovery. Cached metadata is marked reused and
not fresh; it is never a fresh login or recovery proof. Do not persist the cache,
share it between tabs, use a timer, or add a session service/configuration layer.
Remove the duplicate account-only observation before an exact incoming-like
target read; the fresh target's account and alerts decide the action.

Retaining all account-only observations leaves the user's overhead unchanged.
Blindly persisting a handle across missing identity/warnings would conceal real
login/refusal state. Reusing the latest healthy observation in the existing
owner removes overhead while keeping the current target evidence mandatory.

For search, reuse the loaded client through one visible unique search input,
submit the requested query and select the existing Latest tab when needed.
Verify the actual query and live-search route before collecting sources. A
missing/unsupported input retains one existing direct navigation; an attempted
client action that fails does not silently reload or retry. Same semantic live
query reuses its current page even if URL parameter ordering differs. No injected
history/router, private HTTP, browser reset, new account or rate-limit bypass.

## Active acceptance ledger

All IDs are Required. Current status is not-run until evidence is recorded.

| ID | Observable result | Status |
| --- | --- | --- |
| R1 | Healthy bound account followed by repeated internal reads adds zero account-only observations | passed |
| R2 | Missing account, warnings, observation errors and a new binding cannot reuse old identity; explicit inspection remains fresh | passed |
| R3 | Target account mismatch/warnings still block likes/writes; target content/parent and unknown rules remain unchanged | passed |
| R4 | Supported visible search UI changes two queries with zero document navigations, exact requested query and Latest confirmed | passed |
| R5 | Missing input has one direct fallback; ambiguous/inert/wrong-route/warning/transport branches never introduce extra reloads or source success | passed |
| R6 | Type checks, relevant regression tests, implementation review and maintainability pass | passed |
| R7 | Original consumer adopts the verified build; real authorized root read and normal business continuation are recorded separately from theoretical speed or 429 cure | passed |

Scope is the existing task API/Chrome adapter and original consumer adoption.
The public package API, account permissions and platform restrictions do not
expand. The worktree isolates unrelated source/index work. Source delivery is
normal main push; consumer can use the validated local build before consolidated
npm delivery under the original maintenance contract. No website change.

## Design review

Passed for r1: one observation owner, no cross-tab/disk cache, no fabricated
freshness, mandatory current target guard, and no fallback after a failed client
search attempt. Exact query/Latest confirmation and explicit fresh recovery are
required counterexamples. No remaining design findings. Live platform limits
remain external evidence, not a reason to lower these acceptance requirements.

## Implementation verification and review

The original failing baseline covers repeated identity observations and search
document navigations. Current targeted assembly/regression set:105 passed;
TypeScript build, CLI/contracts types,16 Skill examples and observation artifact
check passed. Package maintainability found no findings. Whole-suite916/919
passed before the final search-readiness refinements; the three failures are
unchanged native-network/AX serialization cases, independently reproduced on
the untouched base commit. Whole-tree formatting also has seven unchanged base
violations; changed source/tests are formatted. Do not claim the global check
is green or public release is validated.

Live readonly acceptance immediately found two real UI readiness gaps: profile
content overflow in unscoped navigation and search route commit before Latest
rendered. The implementation reuses existing scoped navigation and a bounded
control readiness wait; no extra document retry. Both are covered by regression
evidence. Two actual consecutive searches then returned complete target batches
in approximately2.7seconds with zero document navigations and zero independent
account observations. This is a source-reading sample, not comment throughput.

Implementation review: no remaining findings in the changed scope. Session
metadata is never inserted into fresh target evidence; missing identity and
warnings invalidate it; explicit root inspection is forced fresh. The duplicate
account-read owner was removed from PlatformTargets. Existing exact target and
public verification remain. R7 remains pending original-consumer adoption and
a normal authorized business result.

## Final integrated delivery

The consumer's newer verified AX compatibility baseline57fd453 was incorporated
before production adoption; it closes the unrelated AX serialization failures.
The isolated worktree recovered the declared fake-indexeddb dependency with
`npm ci --ignore-scripts`. Final `npm run check` is green:938 tests, full
format/type/build/maintainability checks,16 Skill examples and generated-program
consistency. Diff-only source maintenance:7 files, zero findings. The unavailable
local Qingtian installation was not misreported as a passing checker.

R7 passed through the original consumer manifest/executor/two pages: the new
source builda88e61b was actually bound, an original unknown was verified without
resending, a new recommendation-sourced comment was publicly verified, and a
normal received reply was publicly verified. The earlier two-query live result
remains a read-only speed sample. Direct profile document fallback can still
request Viewer; a later reader-only refusal was retained while the healthy writer
completed independent reviewed work. No claim of a stable429 cure or ten
comments/minute.

Implementation review after integration: no findings; the original source
compatibility patch, incoming/unknown/parent guards and changed-scope evidence
are retained. Source main delivery and local consumer adoption are separate from
a public npm release; the latter joins the next related consolidated maintenance
release under the existing maintenance contract. No version/deployment change
is implied.

Retrospective decision: keep the executable call-count/invalidation and delayed
Latest-control regressions in the original owners. Retain explicit cached-versus-
fresh identity metadata and exact query confirmation. No additional global
prompt or parallel account/session store is needed. All Required IDs passed.
