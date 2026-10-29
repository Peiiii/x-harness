# Submission diagnostics stay outside the normal action path

Flow: bugfix, risk L2; parent stability objective remains active.

Source audit found that a normal DOM submission automatically started Network.enable plus baseline/final reads and a200ms polling timer. A separate failure branch awaited protocol diagnostics without its own deadline. These are browser control requests, not X HTTP requests, but they add work and an avoidable stalled dependency. The prior successful-submission test lacked the real send capability and therefore missed the automatic capture.

Design: normal root bindings never enable submission network capture. Remove the failure-time protocol query from editor completion. Preserve original activation, editor-clear/context/alert evidence and public-result verification, with transport explicitly not-collected. An explicit lower-level developer capture can still be selected; it uses one baseline and one bounded final snapshot, no interval timer, and idempotent stop. Its scope is endpoint events inside the capture window, not proof of the exact current activation or permission to resend.

A separate source-collection optimization reuses the existing list observation only while candidate processing made no UI change. Expansion still restores the list before pagination. The unchanged completeness predicate is factored into one method; no source/identity/date/alert or unknown-write check is removed.

Review: the change removes optional telemetry from the business critical path rather than adding a timeout as a default prerequisite. No account-wide throttle, policy/config gate or observer process is introduced. Reduced browser control calls do not prove reduced X HTTP traffic or a solved429 cause. Actual network failure event production and natural consumer outcomes remain required parent evidence.

Validation: normal and failed submission regressions failed before repair with a real send/readEvents capability. The corrected default makes zero diagnostic capability/send/readEvents calls; editor failure still retains the original evidence and never repeats activation. Source pagination proves one removed unchanged observation while the expansion case keeps its restore. Directed66 and pre-integration full1,177 checks pass; final integration, source delivery and consumer artifact proofs are recorded separately.
