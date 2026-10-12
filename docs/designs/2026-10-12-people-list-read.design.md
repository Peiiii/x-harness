# Bounded people-list task reads

Contract people-list-20261012. Flow bugfix. Risk L2; publish/adoption L4.
Existing DOM readPeople returns visible cells, but the atomic view and root task
are absent, forcing repeated profile navigation for complete cell evidence.
Bind the original parser through the existing platform/reading/proof pipeline.
Root readPeople accepts an observed follower/following-list URL and a 1–5 cell
window. Same-page offsets do not navigate or reload. Optional advance presses
PageDown on one unique freshly observed handle link, then observes again.
Caller deduplicates handles; an unchanged/partial window is not an exhausted
platform or completed target. No follow or quality approval is automatic.

Blue uses one actual verified SVG with the blue color; missing/ambiguous badges
remain null. Relationship comes from the actual handle-bound control. Biography
is the full visible cell text after the handle, excluding known relationship
controls; absent handle/intro remains null. Native badge color is unsupported
and returns needsCapability. Existing write/unknown/budget policy is unchanged.

CL-1 parser regressions: passed. CL-2 root/proof/same-page and guarded advance:
passed. CL-3 source types/tests/maintainability/Review: passed (140 tests). CL-4 published
artifact identity, consumer adoption and necessary live list/prepare read:
pending. Data in source/tests is synthetic; consumer evidence stays private.

Design review: URL whitelist rejects arbitrary pages; control identities must
be unique; badges/relationships are independent unknowns. Read evidence does
not establish follow-back probability or approve any candidate.

Implementation review: no open findings after preserving biography control-like
lines and validating the target URL again after advance. The public API keeps
proof/delta projection in the original reader owner; writes remain separate.

Live acceptance found sidebar UserCells visible before the primary list loaded.
Restrict parser, readiness and advance links to the actual primary column; a
loading primary list remains missing rather than borrowing recommendations.
The synthetic loading/sidebar regression covers this boundary. CL-4 remains
pending until the corrective published artifact is adopted and read live.
