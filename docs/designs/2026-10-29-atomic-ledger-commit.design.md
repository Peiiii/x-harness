# Atomic ledger commits without persistent account lock files

Flow bugfix; risk L3; retrospective pending. User requires independent pages and duties to remain independent when one operation fails, and asks for a unified repair rather than another abandoned-lock patch. This branch is isolated from the running consumer and other WIP. No live lock or ledger is modified while developing.

## Verified failure and ownership

The original FileRoundStore accounts for all kinds in one Markdown ledger. Its directory-wide `.x-harness.lock` is acquired before an async callback; reads with executors first mutate execution activity, and legacy whole-round execution holds the same lock during platform I/O. Cancellation can discard the JavaScript cleanup and leave a pid-less file; every duty then refuses the file, including unrelated tabs and read-only operations. Token fencing and trusted abandonment evidence diagnose/recover the artifact but retain the same failure amplifier.

FileRoundStore remains the sole store abstraction; original Markdown remains authoritative. The repair is not a different business database, daemon, scheduler or shared browser editor. Platform actions and per-action claims remain in their original owners. A browser loading failure is separate and is not claimed fixed by a storage repair.

## Chosen storage boundary

Replace persistent lock-file ownership with an OS-backed SQLite write gate located beside each exact ledger. It contains only a counter, no business state. A single synchronous autocommit UPDATE calls a registered synchronous function that checks the current revision and writes a same-directory temporary file followed by atomic rename. No await, platform read, model decision, or user callback is permitted inside that statement. On native error/process death, SQLite releases its statement/OS locks; a leftover file is not evidence of an active owner. Node >=22.13 is required; the actual CUA runtime has been probed for DatabaseSync and user-defined functions.

`withLock` remains only a local edit-session/reentrancy compatibility wrapper, never an account lock held over a callback. Transaction callbacks run optimistically outside the physical write gate. Save applies an exact revision or a conflict-checked three-way merge against the original snapshot. Independent object keys and uniquely keyed collections merge; incompatible modifications of the same field/object reject, and transaction retries recompute from a fresh snapshot within the existing bounded retry budget. Same-path numbers changed on both sides never silently coalesce. Updated timestamps may select the later instant. Append-only observations merge without overwriting prior entries.

Reads do not acquire a physical gate. Per-tab running guards and per-action intent/unknown state continue to prevent actual duplicate writes. Optional execution telemetry must not become an account-wide read gate: read registration checks the original executor/action conflict, while absent activity telemetry cannot be used to infer termination of a writer.

## Compatibility and adoption — revised for minimum disruption

A permanent retired-protocol marker would block still-running old bindings and require a collective cutover barrier. The user's explicit minimum-disruption requirement rejects that approach. Instead, the native gate uses the original compatibility filename only *inside* its synchronous native statement. New writers share one per-account SQLite write gate, and cooperate with old writers via an atomic hard-link of a fully written compatibility record. The record carries this protocol, native gate path and a nonce. It is removed before the statement ends; no await or browser step runs while it exists.

If a new writer is killed and leaves that record, the next new writer first acquires the same native SQLite writer. That OS-backed exclusivity proves the previous new writer is no longer inside its native statement; it may remove only a matching new-protocol artifact, then commit. No PID/age timeout or human unlock is needed. Foreign legacy locks are not stolen, and an old writer racing the compatibility link wins or loses at atomic creation, never writes concurrently. Normal pure reads continue even with a foreign legacy lock. Existing actors finish their current call and upgrade independently; there is no shared rollout stop barrier.

The SQLite file stores only coordination metadata; original Markdown and action IDs remain authoritative. Old bindings may still create legacy locks until they are actually replaced; source/configuration/runtime adoption are therefore tracked separately. The current legacy orphan's trusted recovery remains separate from the new native recovery mechanism.

Mode=design review of the revised transition: passed. The original permanent-marker draft is superseded before live adoption. The compatibility critical section is synchronous and enclosed by a native writer; the source test must kill that real owner and prove automatic successor progress before deployment. This directly addresses both steady-state cancellation and minimal rollout blocking.

## Acceptance contract and plan

- A1: Two independent real processes update different action/execution IDs in the same ledger, with no lost results; no account lock file is acquired across waits or platform I/O.
- A2: An operation paused outside commit does not prevent another process committing. Kill a process inside the native gate and prove a second process can commit without deleting an owner file.
- A3: Conflicting preparation/intent of the same action cannot both authorize platform submission; stale counters are retried or rejected, never silently overwritten.
- A4: Actual CUA root API on an isolated synthetic ledger validates gate support, cancellation recovery, evidence/intent preservation and zero platform writes. This is runtime-boundary evidence, not a claim of public social success.
- A5: Mixed old/new writers cooperate during only the synchronous commit. Original bindings and object IDs survive; fresh real read and original approved business results validate adoption.
- A6: Appropriate type/build, focused regressions, diff maintainability, full regular tests and implementation review pass. Public npm packaging is not required for the verified local consumer.

Plan: implement gate and conflict merge; replace only the store's write coordination; exercise real multiprocess/native-host interruption before consumer adoption; perform the controlled original-owner cutover; verify original business and document remaining page-loader uncertainty. Do not force completion by deleting a live lock or reducing the acceptance contract.

## Design review

Passed for implementation. Real CUA cancellation, actual native orphan recovery, multi-process updates and same-action/cadence conflicts are now verified. Consumer adoption is the remaining live acceptance boundary.

### Prototype evidence and design freeze

The isolated native prototype passed two actual interruption boundaries: SIGKILL while its SQLite write callback was running allowed another real process to commit in 85ms; a real CUA tool timeout reset the kernel during the same callback, and a separate process then committed in 244ms without deleting any owner artifact. The original synthetic value remained 0 until the successor committed 1. Receipts remain local, not public business evidence.

The read path will no longer write/remove activity in the account ledger. It performs only a fresh read of actual same-tab write ownership, then uses the already shared local session guard; different tabs are not excluded by a reused executor name or unrelated persistent telemetry. Actual writing claims and original unknowns are untouched. Short writes merge independent keys/keyed records, reject intersecting changed primitive fields, and retry the original mutation from fresh state. This avoids treating two equal numeric counters from different operations as the same event.

Mode=design review passed for isolated implementation: native cancellation feasibility is now observed, the original Markdown owner and normal task API remain intact, no service or recurring action is added, and old clients are coordinated during only the native commit rather than blocked for the rollout. Live cutover remains an acceptance step, not a design assumption. Type/runtime support, multi-process merge/claims, exact old/new compatibility handling and real consumer adoption remain to be validated by implementation.

### Invariant-read correction during implementation

A real existing simultaneous cadence-reservation regression exposed that merging disjoint action writes alone is insufficient: both reservations had read the same account cadence. Therefore all transaction snapshots use strict revision validation and recompute the whole mutation from fresh state after a conflict; they never three-way merge past a changed read dependency. Compatibility withLock/save can reconcile independent edits, but is a local optimistic session, not the API for serializable invariants. The original simultaneous cadence reservation now has exactly one accepted activation. This finding is part of the unified repair, not a suppressed test.

### Implementation review and native references

The persistent lock lifetime, all 32 transaction callback sites and their retry-sensitive response flags/claims were reviewed together. Read telemetry no longer creates a durable account-wide claim. A discarded optimistic claim must not survive a callback retry; response flags, pin claims and page claims reset on each evaluation. Account cadence always uses strict serializable retry, including calls from the former heldLock compatibility path. No browser write occurs inside the native statement or a retry callback.

Native coordination uses the documented synchronous SQLite interface (Node https://nodejs.org/docs/latest-v22.x/api/sqlite.html) and statement-scoped implicit transactions (https://www.sqlite.org/lang_transaction.html). The gate stores only a counter and coordinates the existing atomic file rename; it does not introduce another business-state owner. Rollout updates existing runtime/SDK resolution, preserving public task IDs and active calls. Real actor adoption and business verification remain separate from source review.

The old same-executor-ID exclusion is also narrowed to the actual tab. An older action's claim remains on its original action ID, but a distinct tab can continue a different approved action under the same role. Per-action tokens and existing target checks remain the submission boundary; execution telemetry is not an executor-wide lock. A regression preserves an old unresolved action while an independent approved target succeeds.

### Validation and implementation review result

The final real CUA kernel-reset probe interrupted the native commit while its compatibility artifact existed. A separate SDK process then recovered that exact new-protocol artifact and committed in 7ms, without manual unlock; the compatibility filename was absent afterward. A separate real process-kill regression exercises the same mechanism. All 1,116 regular tests and type/build/CLI/contracts/format/maintainability checks passed at the reviewed candidate. Same-ID different-page work continues while the old unresolved action remains byte-for-byte protected.

Implementation review: no remaining source findings after strict snapshot validation, retry-local claim resets, native compatibility recovery and read-path isolation corrections. No active consumer was stopped or edited during development. Source readiness is not business recovery; adoption of the frozen build and original-role output are still required in the private incident record.
