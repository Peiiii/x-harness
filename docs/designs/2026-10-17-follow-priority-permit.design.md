# Follow priority and explicit early windows

flow: bugfix; risk: L2; owner: FollowPriority.evaluate

An explicitly authorized early follow window already passes GrowthPolicy's scoped permit validation, but FollowPriority rejects every pre-07:00 selection before consulting that permit. Restore agreement with the existing authorization contract; add no policy field or default permission.

Design: use the existing executorWindowAllowed predicate at the priority night gate, then retain original authority, real backoff, health-budget, action and submission checks. No clock override, cleared history, replay or change to default windows. The original executor and evidence must match. Design review: this reuses the same validated permit boundary as submission; invalid or absent permits remain denied and expiration stays exclusive.

Acceptance: absent permit at 06:00 denies; a matching valid early permit selects the original follow work; before start and exact midnight expiration deny; wrong scope/executor, absent proof, no authorization and invalid dates deny. Existing real-backoff and shared-budget routing tests remain green. Synthetic regression first failed on the valid early-permit case against the previous build. Actual consumer adoption must be recorded privately; public tests contain no account data.
