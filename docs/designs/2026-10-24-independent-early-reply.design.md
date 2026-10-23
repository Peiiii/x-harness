# Independent early reply while follow priority is attached

Flow: bugfix. Risk: L2. Retrospective: pending.

The existing priority guard rejects an explicitly permitted early reply when its follow executor has no matching early follow permit. Both actions share an executor's single window permit. A reply permit must never grant an early follow.

Keep the existing executorWindowAllowed checks and all root submission guards. When the ordinary follow window is closed and no follow permit is valid, a valid reply permit means follow selection is unavailable, not that independent replies are forbidden. Return ready:false with follow-window-not-open. Invalid or absent reply authorization retains the night rejection. No public type, stored state, new configuration or transport changes.

Design review: passed. The branch is deny-only for follow selection; it cannot return ready:true or reopen a backoff. Reply submission still checks its own account, original action, quality, window, refusal and public verification. Existing follow-priority boundaries after the ordinary start remain unchanged.

Acceptance: a valid early reply permit lets the original reply batch reach its guarded operation without invoking follow; no/invalid/expired permit rejects; an early follow permit retains existing behavior; ordinary priority regression tests and type/build checks pass. Source and locally adopted runtime must match. npm publication is separate from verified local adoption.

Validation: build (including TypeScript and maintainability), focused follow-priority tests 10/10, targeted formatting and diff checks passed. The production frozen module comparison differs only in the early reply branch. Implementation review: no findings; no state mutation, additional follow authorization or new API. Existing invalid follow/reply permit and ordinary priority cases remain covered. Retrospective decision: regression belongs to the original shared priority owner; no new operational prompting rule is needed. Retrospective: completed. Local consumer adoption and external results are recorded by the consumer, not represented by these tests.

Adjacent authority review: the independent early reply branch also retains the attached follow actor's original task, scope, tab and evidence requirements. These checks share one local predicate with the ordinary authority rejection. Eleven focused regressions now include wrong task, missing follow scope/tab/evidence. Build/type/maintainability, format and diff checks pass; review findings closed. The live consumer's actor already satisfied these conditions; its earlier verified results remain valid.
