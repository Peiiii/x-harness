# Received-like executor expiry

flow: bugfix; risk: L3; plan: not-required (one owner and one bounded delivery batch); retrospective_state: completed.

The received-like root accepts an explicit executor window but its daytime shortcut returns true after07 regardless of that window's expiry. A consumer with an exclusive23h deadline can therefore read and click after expiry. Caller clock checks remain necessary; the root must also deny at the actual intent boundary after asynchronous reads.

Use the existing executorWindowAllowed validator whenever this executor has a windowAuthorization. Preserve the original07–24 default only when no permit is configured. This tightens an existing permission boundary, adds no setting or SDK API, and preserves IDs, sampling, existing reactions, pacing and unknown handling. No platform work is permitted to test this fix after the consumer cutoff.

Acceptance contract (Required):
- R1: expired explicit permit denies before platform read/click and creates no reaction intent.
- R2: permit expiring during context/readiness denies at beforeSubmit with zero click/intent.
- R3: valid same-executor proven window still permits the ordinary received-like root.
- R4: malformed scope/proof does not fall back to the daytime default; absent permits preserve daytime behavior.
- R5: old unknown reactions remain untouched and unread after expiry; no resend or toggle.

Golden chain: saved executor permit → likeIncomingBatch with original stable batch/target → pre-read window check → real beforeSubmit check → only in-window intent and public settlement. An expired window returns waiting/needsDecision without platform work. Assembled root tests provide the boundary evidence; no UI or user acceptance is needed for this internal safeguard. Public runtime tests remain explicitly unverified at night.

Design review: pass. The existing single owner and validator are sufficient. A caller-only guard cannot cover a slow operation crossing expiry; changing all default platform hours would incorrectly impose this consumer's schedule on others. No schema, migration, new adapter or strategy-specific hour is added. Source delivery and frozen consumer adoption are separate evidence.

Validation: the seven assembled cases reproduce five failures before repair and all pass afterward. Forty incoming/manual/reply-window cases pass; typecheck, build, source/test formatting and repository maintainability pass. R1–R5 current passed. Implementation review: no findings; existing proof, executor kind, single intent and unknown guards retained. The actual consumer frozen module diff is limited to this inWindow branch; adoption hashes and synthetic root validation belong to the private consumer record. No night platform test and no npm release are claimed.

Retrospective decision: fix the existing capability rather than add reminder text. An explicit permit must constrain the existing daytime fast path as well as the early-window exception. Regression cases retain absent-permit legacy behavior as the counterexample. Public npm integration is deferred to the next related consolidated maintenance batch; verified local consumers may adopt this exact compiled module now.
