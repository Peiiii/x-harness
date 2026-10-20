# Keep original publication verification in the loaded client

flow: bugfix; risk: L2; retrospective_state: completed.

Full-document navigation back to an observed own profile bootstrapped Viewer again; the live consumer received HTTP429. Account inspection itself only reads rendered DOM. Repeated verification then refreshed a usable profile and captured only its pinned card before the real timeline rendered, leaving visibly public originals unknown.

Use the existing unique exact visible link for a bare-profile destination. For a profile refresh, switch between uniquely observed adjacent replies/posts timeline tabs; clicking the already selected Posts tab opens a menu in current X. Missing/ambiguous controls or explicit force retain one existing reload path. Detail/thread routing stays unchanged.

A fresh complete, alert-free observation containing exactly one original matching the existing full-text, author, intent-time, baseline-ID and reviewed-media predicates verifies directly. Otherwise preserve refresh. Original refresh waits for the reviewed candidate text instead of the first (possibly pinned) card. Readiness does not grant success: all predicates and quote-card checks still run against the resulting fresh observation. No resend, extra page, generic retry or refusal bypass is introduced.

Design and implementation review: predicates reused without weakening; reply/follow refresh unchanged; unique-route guards and bounded readiness remain. No open findings. Validation: 707 full tests, types/build/contracts/format/maintainability and 13 Skill examples passed. Synthetic regressions cover missing/ambiguous/forced navigation, exact adjacent tabs, early pinned-card readiness, and unchanged author/time/media/body/baseline rejection.

Live adoption: the original consumer reverified two already submitted originals with the repaired local root API, without activation or refresh; both returned their distinct public IDs. A separately authorized due original bookmark also submitted once and verified on its same action. Proofs remain in the private consumer repository. Pending future stability is not claimed; this proves the observed failing boundary.

Delivery: source commit and ordinary push are required; local consumer adoption does not imply npm publication. Consolidate npm at the next applicable maintenance release. Retrospective: observe a complete already loaded target before navigation; pinned-card visibility is insufficient timeline readiness. Regression cases live with their existing owners.
