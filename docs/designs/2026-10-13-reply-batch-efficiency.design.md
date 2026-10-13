# Reply batch efficiency

Contract: REPLY-BATCH-EFFICIENCY-20261013; flow: bugfix; retrospective: pending.

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
| R4 | yes | not-run | Published consumer used on original two reviewed actions; actual public results or remaining external failure reported |

The code fixes alone do not satisfy R4. Synthetic fixtures contain no live account/proof data. Follow/reply operations and application contracts remain in the consumer repository.

Validation: npm run check passed (251 tests), release build and four isolated release tests passed. Diff implementation review: no findings; public signature and exact verification/state owners unchanged. R4 awaits published-consumer execution.
