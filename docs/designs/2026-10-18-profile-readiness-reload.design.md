# Same-route profile readiness recovery

Flow: bugfix, L2, single DOMNavigation owner; retrospective completed

A profile navigation can reach the exact observed URL without profile content. A same-route goto is not proof of a fresh document request; an explicit read-only reload restored one real blank profile. The cause of the original blank response and HTTP failures remains unproven

Reuse handleWaitProfileContent and its existing bounded readiness wait. After timeout only, freshly observe the exact same URL with no platform alerts, clear the original observation cache, reload once, then rerun the same bounded target-content readiness. No second fallback, Follow activation, fresh intent, account/route changes, or pacing changes. Original root identity, qualification, alerts, history and durable verification gates remain after recovery

Acceptance: an exact-route timed-out profile can recover through one reload; alerts, changed routes and transport errors do not reload; persistent absence fails after the existing finite budget; current-profile and refreshPerson callers retain their contracts. A real original prepared follow batch must be run through the adopted root build, with original IDs/attempts and unknowns preserved

Design review: passed before implementation, bounded read-only recovery stays in the existing owner. Reject an outer per-person navigation loop and unbounded reloads. No new public option or persistent state

Validation and implementation review: the old synthetic reopen case failed its reload contract; all 28 directed and 592 full tests, typecheck/build/format and maintainability passed. Real original batches continued with 15 durable verified outcomes and one original unknown retained. Target suspension remained a refusal, not a verified follow. The live benign-blank reload branch itself was not independently forced; no claim of universal recovery or original HTTP cause. Retrospective: reuse the existing navigation owner and bounded refusal gates, not per-person caller loops; no npm/website release for this isolated maintenance change
