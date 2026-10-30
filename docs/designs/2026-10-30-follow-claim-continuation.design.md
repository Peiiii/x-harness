# Target-local claim continuation

Bugfix L3. Root cause: parallel round and followBatch both stopped at a target-local claim, freezing independent original members. No release of unknown/dead-looking claims is required to continue independent work.

AC1 a claimed first target retains its exact original claim/status/diagnostic while independent batch members execute once. AC2 repeated original batch never repeats verified members. AC3 same-tab/executor contention, authorization/platform refusal and a new unknown still stop the affected write path. AC4 normal calls add no read, browser creation, identity check or transaction. AC5 next normal original actor call adopts the verified local build; actual receipts stay consumer-owned.

Design/implementation review: continue only two exact existing collision errors, not broad diagnostic codes; shared queue and followBatch both need the distinction. Original quotas, batch handles/ID, pacing, CAS, and unknowns remain owned by existing state. No TTL or null-PID reclamation. Host termination proof is still required for actual claim release.
