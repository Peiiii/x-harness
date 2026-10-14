# Prepared reply baseline continuation

flow: bugfix; risk: L2; retrospective_state: pending. Existing root reply batches can stop before intent after an observed parent URL transition times out. A subsequent exact-parent root read succeeds, so model-level rewarming is repeated business orchestration.

Owner: GrowthExecution baseline admission. Reuse platform.findSubmission and all existing baseline, account, quality, window, pacing and intent gates. On the original prepared reply only, continue that same read once after the specific URL-timeout signal. No sleeps, new driver, new IDs or submission retry. Unknown recovery remains unchanged. Original posts and non-timeout errors do not get this continuation.

R1: one root call proceeds after a transient baseline URL timeout and submits exactly once; both baseline reads occur before intent. R2: repeated timeout stops after two reads with zero intent/submission. R3: unrelated transport/policy failure is not retried. R4: recovered baseline with alerts or needsStateCheck blocks intent. R5: original-post admission keeps its prior one-read failure behavior.

Design review: passed for this bounded reply-read boundary; no state/schema or authorization change. Reproduced from two live prepared replies, both still unsubmitted at failure; public source contains synthetic cases only. Validation: root behavioral regressions and full checks, followed by the same original prepared live reply batch through a matching local build. Source delivery does not count as a comment.
