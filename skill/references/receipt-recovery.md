# Observed reply receipt recovery

If the root reports an original unknown but a fresh proof or public search exposes its actual own-account permalink, keep that original action. Never derive a receipt ID from a timestamp or guess URLs. Read the observed candidate with root readPost and its original evidenceRef; confirm the actual author, reviewed text, new ID and time at/after intent. A visible parent in context alone is not the final exact-parent verification.

The original ledger already supports observedPublicURL and observedPublicEvidenceRef. Use the existing diagnostics createFileRoundStore transaction to attach only these two fields to that same unknown/intent reply, preserving other actions, executors and counts. Both fields must come from actual observed proof, not a claimed success. Then call root verifySubmission({taskId,actionId}); its normal fresh author/text/time/assets/exact-parent gates settle the original action. A rejected/ambiguous hint remains unknown. Do not manually mark verified, create a replacement action, resend or bypass alerts.

Prepared reply baseline URL timeouts get one internal read-only continuation. A second timeout, unrelated failure, alerts or unconfirmed content stops before intent. Reusing this root behavior is preferable to model-level per-parent rewarming. This does not grant new platform access or override project budgets/windows.
