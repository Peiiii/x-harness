# Follower-network discovery with the real viewer

The existing audit requires the logged-in handle to equal the list owner. That is correct for an own-account relationship audit, but blocks an authorized seed-network read even when the real viewer and exact seed list are both observed.

Flow: standard, L3; active acceptance contract: FOLLOW-NETWORK-20261019. No new write path, scheduler, data store, or platform request backend.

Extend the original `readFollowbackAudit` with optional `viewer:{handle,evidenceRef}`, allowed only with explicit `direction:'followback'`. The viewer is the real logged-in account, independently bound to existing evidence. The following/followers targets still name one exact, unfiltered list owner. Never impersonate that owner or replace the operating account.

Preserve the viewer in the original immutable checkpoint. A different viewer, proof or direction cannot resume that scan. Default own-account audits and existing checkpoints retain their behavior.

In viewer mode, list membership only proves membership in the seed network. A followback candidate requires a positive visible inbound indicator and a confirmed not-following control; membership alone, an unknown button, or an existing following relationship cannot qualify. Negative relationship sets remain empty. Return viewer/list-owner handles to make the coverage explicit; count-matched completeness describes the seed list only.

Required acceptance:

- A1: authorized consumer supplies an observed seed and the real viewer, calls the same root API once, and receives a bounded, deduplicated seed scan with positive-only candidates
- A2: wrong viewer, missing proof, unsupported direction or changed resume identity refuses without new collection or any write
- A3: unknown/non-inbound/previously-followed seed members do not become followback candidates, and an incomplete seed scan cannot imply an own-account negative relationship
- A4: old own-list audits, counter revisions, night boundaries and checkpoint resume still pass
- A5: exact consumer build performs one authorized seed scan while the original write restriction remains intact; source delivery and local adoption are separate from npm publication
- A6: optional `followerSubset:'verified'` is explicit viewer-mode discovery only, accepts the observed `/verified_followers` target with no expected count, always preserves incomplete whole-account coverage, and cannot be changed on resume

Revision 2: the own unfiltered list reached a bounded visible tail before the observed total. The same positive-only reader may therefore scan an explicitly selected verified subset; it is never silently substituted for the all-followers audit. Reject a supplied total counter, missing viewer, or implicit subset. Store the subset in the original checkpoint and label its result. This reuses the same collector and identity guard rather than adding a second scraper.

Design review: reuse the original class, proof and pagination owner; avoid a second list collector or weakening the default ownership check. The only alternate mode is explicit and read-only. Validation uses synthetic accounts, public API tests, types/contracts, then a private live receipt. No real operating evidence is committed to this repository.

## Active acceptance ledger

Parent goal: let the authorized consumer discover and review follower candidates through the original root business API without changing account identity, permission, write restrictions or relationship truth. This is the SDK portion of the consumer's ongoing operating duty; candidate counts and operating success remain separate.
Scope revision: 2, authorized implementation choice; no change to the consumer's operating goal. No new execution plan is needed for this single maintenance batch.

| ID | Required | Status | Current evidence |
| --- | --- | --- | --- |
| A1 | true | passed | Root API seed-network tests and private bounded live seed observation |
| A2 | true | passed | Invalid viewer/proof/direction and resume-identity refusals in followback audit tests |
| A3 | true | passed | Positive-only mixed relationship and counter-revision regression tests |
| A4 | true | passed | Full 624-test check, type/build/contracts/format/maintenance and 13 Skill examples |
| A5 | true | passed | Exact final build returned a bounded seed observation with the real viewer; original write restriction and attempt history preserved |
| A6 | true | passed | Explicit verified-subset root read and same-checkpoint resume returned positive-only observations; unknown subset count and incomplete whole-account coverage preserved |

Open Required: none for this SDK maintenance scope. Private live proof stays with the consumer. Initial current platform read refusal was respected until its recovery point; a later host read timeout was recorded separately and only the evidenced terminated own read claim was released. No write restriction was removed. Implementation review: no findings; full 624-test check and maintainability passed. This is bounded discovery, not a complete follower export or the consumer's daily operating completion.
