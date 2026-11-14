# Reply parent receipt recovery

## Observable problem and scope

An observed public reply can match the author, full text, unique ID and absolute intent time while the lightweight detail observation lacks its parent. The exact reply permalink may show the parent as unavailable even while the original root's reply list contains the reply. The original action remains unknown and must never be resubmitted until a fresh parent-bound read confirms it.

## Decision and design review

When exactly one fresh matching receipt still has no parent, reuse the bounded `readPost` path with expansion, context and thread enabled. If its reply card still lacks an explicit parent, use the existing `readPostComments` path against the original reviewed root. Confirm only when that fresh result is alert-free, names the exact original root ID, and includes the observed public reply ID in its root-scoped DOM thread IDs. Keep the exact author, text, ID, time, uniqueness, and alert gates. The prepared action's expected root alone never confirms the reply; a wrong root, absent child, incomplete/failed read, or alert leaves the original action unknown. No new write API, retries, model calls, ledger, or guessed URL.

Same-executor design review: the selected path reuses the existing explicit-parent reader first, then the existing root-scoped reply reader only when X omits the direct edge. The outer verifier rejects changed text, stale time, wrong root, absent reply ID, alerts, or an unreadable thread; a click or prepared action never constitutes public evidence. No private account or operational proof is stored here.

## Validation and recovery

Focused tests cover late parent recovery, wrong/missing parent, changed text, stale time, wrong root, missing child and challenge alerts; none may submit. Run applicable type, build and existing checks. After adoption, recover the original unknown actions read-only; only a fresh matching public receipt present in the exact root-scoped reply list permits settlement. Public verification correctness is the acceptance criterion. This fix alone does not establish overall reply throughput or a claimed speed multiplier.

## Implementation review and evidence

Diff-only review found no new write path, retry loop, state owner or parent inference. The observed candidate URL passes the existing original-account gate before the reused reader. Fresh output is filtered again by original content/time and exact-parent conditions. Complete source check passed: formatting, source/CLI/contract type checks, maintainability, 205 tests, Skill and generated observation consistency. Updated the existing loading fixture to assert the delegated public-reply thread target rather than forbid all reads. Real consumer recovery remains unverified until the published package is exercised.
