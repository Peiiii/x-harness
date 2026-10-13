# Reply parent receipt recovery

## Observable problem and scope

An observed public reply can match the author, full text, unique ID and absolute intent time while the lightweight detail observation lacks its parent. The existing complete thread reader can confirm that explicit parent, but submission verification does not reuse it. The original action remains unknown and must never be resubmitted.

## Decision and design review

When exactly one fresh matching receipt still has no parent, reuse the existing bounded readPost path with expansion, context and thread enabled. Use only the actual observed candidate page. Keep all original author, text, ID, time, uniqueness, alert and exact-parent gates. Reject a different or absent parent. No new API, business policy, retries, model calls, ledger or guessed URL.

Same-executor design review: the selected path removes a redundant lightweight fallback and reuses the existing explicit-parent reader. The outer verifier still rejects changed text, stale time and mismatched parent; a click never constitutes evidence. No private account or operational proof is stored here.

## Validation and recovery

Focused tests cover late parent recovery, wrong/missing parent, changed text, stale time and challenge alerts; none may submit. Run applicable type, build and existing checks. After release, recover the original unknown action read-only; only a fresh matching public receipt with the precise parent permits settlement. Public verification correctness is the acceptance criterion. This fix alone does not establish overall reply throughput or a claimed speed multiplier.

## Implementation review and evidence

Diff-only review found no new write path, retry loop, state owner or parent inference. The observed candidate URL passes the existing original-account gate before the reused reader. Fresh output is filtered again by original content/time and exact-parent conditions. Complete source check passed: formatting, source/CLI/contract type checks, maintainability, 205 tests, Skill and generated observation consistency. Updated the existing loading fixture to assert the delegated public-reply thread target rather than forbid all reads. Real consumer recovery remains unverified until the published package is exercised.
