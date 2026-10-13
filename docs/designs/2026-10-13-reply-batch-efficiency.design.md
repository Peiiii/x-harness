# Reply batch efficiency

Contract: REPLY-BATCH-EFFICIENCY-20261013; flow: bugfix; retrospective: completed.

User requested batch or parallel mechanisms instead of model-driven per-item execution. Two reviewed replies previously returned one unknown plus one pacing wait; source counts required separate detail visits despite being present in the source observation.

## Design and review

Keep existing root APIs. Independent source observations already return a batch of up to five posts; preserve their visible metric labels through the existing projection, without inventing counts or exposing raw UI. This removes metric-only detail visits. Models still select sources and write/review exact text.

Use the existing baseline phase for reply admission so it observes existing public IDs without the verification-only refresh. Keep post-submission refresh and exact author/body/time/parent checks.

Within replyBatch, one normal incoming-interaction-pacing wait of at most 30 seconds belongs to the batch. Retry admission once after its deadline; core guards recheck identity, original status, capacity, shared pacing and the midnight window. Longer/renewed waits return. An unknown gets one same-ID read-only verification whether or not its permalink was captured, and is never resubmitted. Writes remain serial. Parallel writes and blind retries were rejected because they break shared account intent and pacing.

Design review: passed for the bounded existing-chain changes; no new public parameter or state owner. Host selector failures and X loading errors can still return unknown; batch completion is not guaranteed.

## Active acceptance

| ID | Required | Status | Evidence |
| --- | --- | --- | --- |
| R1 | yes | passed | One root replyBatch completes a due two-action batch, owns one pacing wait and one readonly recovery; no resend |
| R2 | yes | passed | Batched source decisions preserve visible metrics and exclude raw UI; missing stays missing |
| R3 | yes | passed | Baseline avoids reload while verification, exact parent and refusal/window guards remain |
| R4 | yes | passed | Integrated published 0.2.63 consumer replayed the same four original IDs: two public verified results, two unknown preserved; no resubmission |

The code fixes alone do not satisfy R4. Synthetic fixtures contain no live account/proof data. Follow/reply operations and application contracts remain in the consumer repository.

Validation: npm run check passed (251 tests), release build and four isolated release tests passed. Diff implementation review: no findings; public signature and exact verification/state owners unchanged. R4 awaits published-consumer execution.

Published 0.2.58 consumer replay showed a real unique public reply still needed a manual own-account search to capture its permalink. The batch now performs one shared lookup for remaining unknowns, strictly matches owner/full text/intent time/baseline and only binds a unique observed link before exact-parent verification. Missing/ambiguous rows remain unknown. The conditional reply CLI check projects only authorized original action IDs; account daily goals and other executors remain untouched. This closes the new conditional workflow instead of inheriting all primary reply backlog.

R5 (Required, passed): conditional end-check derives its two-action scope from authorized original IDs and never mutates global goals or other duties. Final source regression: 254 tests passed, including ambiguous/old/foreign receipts and conditional CLI accounting. Implementation review found and corrected a projection issue: preserve all global item kinds, overlay only the conditional reply item and carry its actual resume condition. No open implementation findings.

Real source-read replay caught shared-object serialization aliases: metric rows retained only analytics while their visible button counts were still present separately. Merge both inputs before the existing whitelist/dedup projection. The synthetic alias regression and one real batch of five complete bodies/timestamps/counts now pass without metric-only detail navigation. Retrospective: validate the transport shape with a real read before release; synthetic happy-path metrics did not cover alias serialization. Consumer integration of the final published package remains R4.

User additionally requested at most one or two active comments per person, without switching posts to repeat. R6 (Required): a configured account author ceiling counts distinct original intent/unknown/verified IDs across roots plus known historical entries; active categories are limited, received conversation categories unchanged. Planner defaults to one and uses two only for substantive continuation. Known older actions count conservatively; missing historical evidence is not invented.
R7 (Required): the existing root-age gate accepts original batch-source publication evidence and preserves known-child/12-hour rejection. Add source replyToId to the existing projection to preserve known-child evidence. This removes an individual detail-read prerequisite for newly reviewed batch candidates.

R6/R7 source regressions passed, including distinct roots, unknown occupancy, identical-ID dedup, received-category exclusion, batch root expiry and known-child rejection. Actual consumer candidate publication proofs passed admission offline. Final source check: 258 tests passed. Required R4 still awaits final released-consumer batch execution.

Real release-build batch validation took about 91 seconds for two new authors, one verified and one unknown. It exposed a redundant same-parent verification before shared unknown-link lookup. Restore the per-action readonly retry only when an observed permalink exists; no-link unknowns go directly into the one shared lookup. This removes a duplicate navigation without weakening proof or resubmitting. Report model-call savings separately from platform latency; no overall speed multiplier is proven.

## Final delivery and retrospective

All required R1–R7 have passed their stated scope. Integrated 0.2.63 contains the batch changes and concurrent bounded profile recovery. Full integrated source validation passed 269 tests, type/format/maintainability and Skill checks. An explicit third active reply across separate roots is rejected before navigation, intent and click. Release-build live acceptance processed two new authors in one root call in about 91 seconds, yielding one verified and one unknown. Final published consumer replay retained the four original IDs with two verified and two unknown, including bounded tab recovery; conditional end-check was valid and allowed pending-results settlement without altering primary account duties.

Remaining external uncertainty is reported as unknown; neither full follower impact nor a wall-clock speed multiplier is proven. Batch-call reduction, source metric reuse and fewer duplicate reads are implementation outcomes. Models still review meaning; writes stay serial and never replay an unknown. Author policy uses original IDs and known history, and missing older evidence remains unknown rather than fabricated zero.

Reusable lessons: validate actual transport aliases and batch-source admission, not only happy-path fixtures; test the author's third action before any intent; distinguish deterministic call savings from measured platform latency. No new public API, parallel writer, duplicated state owner or source-private account artifact was introduced. Later operational growth belongs to the consumer's original contracts and ledgers.
