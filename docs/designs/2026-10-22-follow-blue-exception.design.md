# Scoped follow blue-check exception

- flow: bugfix; risk: L3; retrospective_state: completed
- contract-id: FOLLOW-BLUE-EXCEPTION-20261022; scope-revision: 1
- parent-goal: an explicitly authorized source cohort can include a nonblue person through the normal reviewed follow API, without falsifying the observed badge.
- Source: the consumer's existing selected-cohort authorization overrides ordinary blue screening. Real identity, Chinese qualification, original action IDs, account scope, platform refusals and durable verification remain required.
- Current stage: delivered; design-review: passed (binding, expiry, default behavior and producer/consumer propagation reviewed; no open design findings).

## User path and failure

An operator has an observed person and source-membership proof, plus explicit policy authorization to include nonblue members. They review the original action with its actual badge value and a bounded exception. The same followBatch/followOne path checks current identity and relationship, records one intent and verifies the persisted relationship. Existing unknowns remain read-only. Default callers continue requiring an approved blue badge.

The current input guard requires quality.blue=true; the fresh-person guard also rejects blue=false. Existing window permits do not alter qualification. Setting blue=true for an unconfirmed badge or clicking outside the root API would violate the original contract, so no valid zero-change route exists.

## Chosen boundary

Add optional quality.blueCheckException and the matching review-decision field. The object has kind='follow-blue-check', userAuthorized=true, actionId, handle, accountHandle, evidenceRef (policy), scopeEvidenceRef (observed membership) and expiresAt. Both proofs must exist; action/account/handle must match; expiry must be finite and future. An exception changes only the blue requirement. The actual blue value may remain null or false.

One pure qualification predicate owns the normal-blue-or-valid-exception decision. Both input admission and fresh-person admission use it, including expiry after the asynchronous person read. Existing final submission rechecks reuse input admission. No cohort names, strategy IDs, quantities, scheduler, alternative submission method or general policy engine are added.

Alternatives rejected: globally removing blue screening changes ordinary callers; separate follow APIs duplicate intent/recovery ownership. A per-action optional authorization is the narrowest usable change and requires callers to supply facts the SDK cannot infer.

## Propagation and recovery

| Boundary | Treatment |
| --- | --- |
| Public producer | QualityReview and RoundDecision expose the same exception type; blue accepts truthful null |
| Prepared queue | Existing JSON serialization preserves the optional object; no migration |
| Review | Exclusive and executor-scoped review both copy an explicitly supplied exception; omission does not manufacture one |
| Execution | Existing input/fresh-person guards share validation; all other guards remain |
| CLI/root exports | Existing JSON pass-through and public type exports; no separate transport |
| Upgrade | Existing actions/callers are unchanged; older runtimes reject nonblue exceptions safely |
| Retry/unknown | Same original ID, no resend; preexisting remains zero new follows |
| Delivery | Verified local build and matching Skill first; precise main delivery and applicable consolidated release |

## Active acceptance ledger

| ID | Required | Status | Evidence |
| --- | --- | --- | --- |
| FBX-1 | true | passed | Valid bound exception succeeds through normal root API with truthful badge value |
| FBX-2 | true | passed | Missing/mismatched/expired proofs or binding fail before intent; ordinary defaults remain strict |
| FBX-3 | true | passed | Both review paths and prepared batch persist the field; type/build/adjacent tests pass |
| FBX-4 | true | passed | Identity/alerts/unknown/preexisting and expiry during preflight remain protected |
| FBX-5 | true | passed | Original consumer adopts checked build, one authorized cohort member verified, exact commit/push and delivery recorded |

plan: not-required (one bounded repair; active contract and original consumer state own continuation). No new dependencies. No production account, policy files or browser evidence belongs in this repository. Performance target is no new platform reads or writes in ordinary or exceptional admission; validation only reuses the existing evidence-existence function and clock.

## Validation and implementation review

The old build failed the valid-exception and review/batch regressions. The changed build passes all 812 tests, TypeScript public contracts, build, formatting, dependency-cycle/function/file gates, 14 Skill examples and generated checks. Directed cases include mismatched/missing/expired policy, two review paths, five-person batch, preflight expiry, unknown read-only recovery and zero additional browser observations. Diff-only maintainability found zero findings across six changed runtime sources. Subjective boundary review found one predicate and the original admission/recovery owners; no parallel lifecycle or strategy constants. No open implementation findings. Actual consumer adoption now verifies an original reviewed nonblue member through the fixed committed release artifact, including one intent and refreshed durable following. Private identities/proof remain consumer-owned. FBX-5 publication/consumer package adoption remains in progress. The first consumer helper retained its old instance; direct use of the current instance succeeded without replaying any intent.

## Delivery and retrospective

Version 0.2.76 was published once; registry metadata matches source commit 94c2c3c4d792166140549a4c3d277a8d526f24bd. The documentation deployment succeeded and the public page shows the version. The original consumer installed and bound the published package, then verified five original follows, including the scoped nonblue branch; the earlier local artifact verified another original nonblue member. No additional unknowns or replays were produced. Consumer-wide checks have an unrelated existing file-length finding; consumer type/build and integration evidence are recorded in its own project. All required SDK behavior and delivery acceptance items pass.

retrospective_decision: updated original maintenance backlog from pending capability to delivered. The durable regression covers truthful badges, bound authorization, review propagation and original recovery. Existing explicit-current-runtime guidance already covers stale instances; no new global instruction is justified by the consumer helper mistake. parent_status=ready-for-completion-check. This SDK completion does not complete the ongoing consumer daily following goal.
