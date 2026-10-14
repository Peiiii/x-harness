# Prepared reply baseline continuation

flow: bugfix; risk: L2; retrospective_state: completed. Existing root reply batches can stop before intent after an observed parent URL transition times out. A subsequent exact-parent root read succeeds, so model-level rewarming is repeated business orchestration.

Owner: GrowthExecution baseline admission. Reuse platform.findSubmission and all existing baseline, account, quality, window, pacing and intent gates. On the original prepared reply only, continue that same read once after the specific URL-timeout signal. No sleeps, new driver, new IDs or submission retry. Unknown recovery remains unchanged. Original posts and non-timeout errors do not get this continuation.

R1: one root call proceeds after a transient baseline URL timeout and submits exactly once; both baseline reads occur before intent. R2: repeated timeout stops after two reads with zero intent/submission. R3: unrelated transport/policy failure is not retried. R4: recovered baseline with alerts or needsStateCheck blocks intent. R5: original-post admission keeps its prior one-read failure behavior.

Design review: passed for this bounded reply-read boundary; no state/schema or authorization change. Reproduced from two live prepared replies, both still unsubmitted at failure; public source contains synthetic cases only. Validation: root behavioral regressions and full checks, followed by the same original prepared live reply batch through a matching local build. Source delivery does not count as a comment.

Live follow-up found the same URL transition failure on an original unknown with an actual observed own-account receipt; reading that known detail then verifying recovered it without resubmission. R6: known observed receipt plus existing evidence gets one read-only continuation; R7: unhinted/missing-proof unknowns do not acquire this retry; R8: repeated failure stays unknown and performs zero new writes. Design review extension: passed; no guessed receipt, new IDs or acceptance-gate changes.

Implementation review: passed. Full rebased source check: 327 tests, type/declaration/format/maintainability/Skill gates passed. Live original prepared reply pair proceeded through the validated build without caller rewarming and was publicly verified under the existing exact-parent gates; original unknowns were never resubmitted. The hinted recovery additionally verified two later original receipts in one bounded call each. Comparative total throughput is unproven; this closes only the specified read continuations.

Retrospective: the baseline and known-receipt transitions share the same real URL-timeout signal but different admission states. Retry only the read while retaining the original state and all acceptance gates. A partial successful submit is still an unknown until a real public receipt passes; source validation never substitutes for daily growth results.

## Batch receipt lookup continuation

The same live validation exposed a separate deterministic lookup defect: the date-qualified own-account query missed new replies that the same text query returned without a date filter. The root batch lookup now searches the reviewed phrases under the observed account with `filter:replies`; exact text, new ID, author, intent time, future-time bound, unique match and final exact-parent verification remain unchanged. No submission retries are added. The existing batch recovery regression now requires the reply filter and rejects a `since:` query; its stale, ambiguous and foreign-result cases continue to protect admission.

Validation: full check passed (327 tests, type/build/contract checks and Skill budgets). A real root replyBatch returned verified after automatic lookup and exact-parent settlement in one 15-second call, without manual permalink attachment or resubmission. Diff review confirms that only the search query changed; all result admission guards remain intact. This correction does not mark the daily growth Goal complete. The validated local build is usable immediately; npm publication waits for the next consolidated maintenance release.
