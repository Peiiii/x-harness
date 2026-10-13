# Explicit activation and submitted editor readiness

## Goal and acceptance contract

R1: explicit keyboard activation must press the prepared submit button once, even when a native submit bridge exists. It must not observe or click the native bridge. Default/click behavior remains supported.
R2: a host-capped submitted-text wait resumes the existing wait within its original ten-second budget, with fresh unchanged account/page/draft evidence. No second submission, reload or navigation. Changed account/page/draft, alerts, interruption or exhausted budget fails closed.
R3: a cleared editor is only request readiness. Public author/full text/ID/time/exact parent remain required; previous unknown actions are never resubmitted.
R4: complete source/artifact/consumer checks and exercise the published code on a new approved object. Overall comparative throughput remains unproven without a compatible ordinary-post baseline.

## Evidence and decision

Repeated approved submissions in both requested activation modes remained unknown with a host-truncated editor wait. The current owner selects native submission before checking explicit keyboard activation, so the requested alternative can silently use the same bridge. Existing submitted-editor wait has no bounded host-cap continuation. Fix only DOMSubmission; retain all upstream intent, binding and downstream receipt checks. MAINT-005 now reaches its repeated-cost/current-blocking trigger.

Same-executor design review: honor the existing public option; resume only read-only waits and fail on fresh boundary changes. Do not infer success from a click or cleared text, add new activation modes, weaken parent checks, or replay unknown writes. No real account or local operational proof enters this source.

## Implementation review and source evidence

Full check passes 240 tests plus format, source/CLI/contracts types, maintainability, Skill and generated consistency. New tests prove keyboard bypasses an available native bridge; click retains its prior bridge; capped waits submit exactly once; changed account/page/draft/parent, alerts, interruption and exhausted budget fail. Diff-only review found no new write, reload, acceptance inference or parent shortcut. Artifact and published live evidence remain pending.
