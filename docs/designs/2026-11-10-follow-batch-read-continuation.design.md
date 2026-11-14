# Continue a follow batch after an unsubmitted profile timeout

Flow: bugfix. Risk: L2. Owner: `FollowBatch` in `src/growth-batch.ts`.

An approved five-to-ten-person batch currently returns after its first profile
read times out, although that action remains prepared and independent members
have not been attempted. The existing target-claim continuation already isolates
object-specific occupancy; extend that same loop boundary to a narrowly
recognized, pre-submission UI timeout.

Continue only when the decision is `person-read-failed`, the existing read-failure
classifier identifies an unconfirmed UI observation, the message identifies a
timeout/deadline and contains no authentication, verification or rate-limit
signal, and the original action is still prepared with neither intent nor claim.
Retain the failed decision in the batch receipt and leave that action untouched.
Every subsequent member uses the existing root execution and fresh write guards.

HTTP errors, browser connection failures, page occupancy, unknown submission,
identity/alert failures, and changed original action state still stop the batch.
No retry, extra navigation, new candidate, state migration or public API is added.

Acceptance: (1) a first-member UI timeout permits four independent durable
successes in the same five-member batch while preserving the failed action;
(2) repeating that batch never resubmits those successes; (3) HTTP/refusal,
connection, login, new unknown and post-intent cases still stop; (4) existing
target-claim continuation, pacing and time-budget tests remain passing. Use
synthetic fixtures only. After verified local adoption, resume the consumer's
original prepared members and record actual relationship results separately.

Design review: passed before implementation. The chosen boundary is tied to an
existing pre-intent reason and independently checked persisted state; unknown or
ambiguous failures remain stopping conditions. A separate actor, retry service,
queue, policy option or browser adapter would duplicate existing owners.
Plan: not required; one source owner and its existing regression suite suffice.
