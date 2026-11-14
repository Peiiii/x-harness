# Interrupted follow batch

A target-local `same-action-claimed` or `same-target-already-claimed-or-submitted` no longer freezes independent members of the original follow batch/parallel queue. The result retains the collision and unresolved member; verified members are not replayed. Same-page contention, a new unknown, policy refusal and actual rate limits still stop that write path. If the old page itself is held, bind one legitimate independently owned page/executor as documented; never clear a claim by age/null PID.

`tab-busy`: inspect proof/claim; age/null PID is not termination. Evidenced own-runtime termination permits CAS release only for matching executor/runtime/token. Preserve intent/unknown/others; verify original ID. Never reset a working runtime for another error.

## Pre-intent profile UI timeout

`followBatch` preserves a member whose profile UI read timed out before intent
and continues the original independent members when its persisted action is
still prepared and unclaimed. The partial receipt retains that failure; it is
not a successful follow. HTTP/refusal, authentication, connection, page occupancy
and newly unknown writes still stop the batch. Resume original IDs only.
