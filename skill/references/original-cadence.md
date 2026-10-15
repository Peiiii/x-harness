# Original post cadence

`configureOriginalCadence({taskId,minGapMs,userAuthorized:true,evidenceRef})` stores an explicit account-wide original policy in the existing ledger. Only an original-scoped caller (or legacy owner) can configure it. Evidence must exist, and minGapMs is an integer from 1,000 to 900,000. No policy is installed by default; choosing an interval is the consumer's authorized editorial decision, not a platform-safety guarantee.

Root `publishPost` and original rounds check the shared gap before admission and atomically reserve `activatedAt` immediately before activation. This covers independent publishing too. A recent activation returns `waiting`, reason `original-post-cadence`, and absolute `resumeAt`, with no new submission. Keep the same task/action/calendar IDs and continue other useful work, then resume that action at its real time. Never submit unknown again.

If the next permitted activation is at or beyond original notAfter, `original-cadence-outside-draft-window` submits nothing. It is not permission to extend the slot. Existing identity, quality, authorization, claims, time windows, and unknown recovery remain unchanged. Policy applies to callers running this implementation; do not claim cached older runtimes have adopted it. Manual platform activity outside the harness is not scheduled by this API.
