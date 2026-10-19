# People-list read retry

flow: bugfix, risk L2, reproduction: live original read plus assembled synthetic regression
retrospective_state: completed
plan: not-required; one bounded implementation and verification batch

A follower scan can stop at a visible list loading error while a separate sidebar also has Retry. The existing nextPeople only scrolls and safely refuses ambiguous controls. The consumer observation-option adapter has been corrected separately; this defect still prevents the authorized complete-list read.

Keep recovery in DOMEditing's people advance boundary. A small DOMPeopleReadRecovery owns the single-use retry state because the editing module is near its enforced file limit. It is called only from the current confirmed people view after the existing alert/state guards. Match the actual error cell inside the unique main primaryColumn, then its unique visible Retry control. Sidebar-only errors do not trigger recovery. Route/account/state mismatch and multiple primary retry controls refuse without activation. Retrying is a read operation, never a relationship or content submission.

One attempt is allowed for the exact page plus observed list-boundary handle. Mark before activation, so another advance cannot repeat the same failed request. A genuinely advanced boundary may receive its own bounded attempt. Preserve the public API, original scan ID, all collected people/proofs, unknown writes, and incomplete coverage semantics. No network clients, cursor fabrication, global reload, arbitrary-first selectors, new schedules or platform-limit bypass.

Acceptance: P1 assembled live-shaped primary and sidebar errors activate only the primary error-cell Retry, once per boundary; P2 missing, duplicate, changed-route, alert and repeated-error cases make no additional activation, while ordinary scrolling stays unchanged; P3 use the tested local build against the original authorized stalled scan, retain its count and advance when the server responds, otherwise preserve the accurate partial boundary. Complete-list status still requires original count-matched proof; a retry itself is not completion.

Design review: passed after independent counterexample walk-through of sidebar-only errors, duplicate primary controls, route change and repeated failure. Existing exact account/page and write guards remain. No public protocol or persistent-state change. The helper has one current owner and caller; no general recovery framework.

Validation: the previous consumer build fails six of the eight new assembled regressions; the repaired build passes all eight plus the existing people-list and followback audit suites (42 tests total). TypeScript checking, build and the repository hard maintainability gate pass. Implementation review: no findings after checking primary/sidebar ambiguity, repeated activation, route changes, existing alerts and unchanged normal scrolling.

Live acceptance P3: the original authorized scan retained all previously collected entries. Its unique primary list Retry was activated once; the server still returned the same loading boundary, and a second advance refused with people-retry-already-attempted. The original scan remains incomplete; this repair does not claim service recovery or complete coverage. Account-specific evidence and adoption records stay in the consumer repository.

Retrospective decision: the regression and original read owner now cover this failure class; no new global prompt or retry scheduler. The independent observation-option forwarding correction is consumer-owned. Source delivery and local adoption are separate from npm publication; combine this bounded read correction with the next related reader release.

Subsequent consumer acceptance: after an independently evidenced identity-read recovery, the self-contained retained build resumed the same original scan and advanced its captured entries. The remaining rendered-tail/counter gap stayed explicitly incomplete. The retained artifact (including its generated observation modules) also passed the same 42 directed tests. This extends P3 with actual continuation, without claiming complete follower coverage or write recovery.
