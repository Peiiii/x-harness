# Batch reply source discovery

Flow standard, risk L2; parent growth goals remain open. Current root search returns at most five sources and forces repeated caller pagination/filtering. This feature replaces that deterministic caller loop with one root business call; it does not submit comments or relax content policy.

## Contract and design review

`discoverReplyCandidates` accepts observed search queries, target (1–50), bounded windows (1–30), processed IDs and excluded handles, and deterministic thresholds. It reuses existing root search, proof store and original ledger; no new scraper or business-state replica. Each window reloads original actions and reply-author history, excludes attempted/unknown/settled targets and authors, and suppresses duplicate authors in its shortlist. Full bodies and source evidence are retained, with a combined local proof and resumable examined IDs. Unknown metrics, incomplete bodies, stale/future time and non-Chinese content cannot pass configured gates. Semantic relevance, human identity and text review remain explicit caller decisions.

Queries run serially on the bound tab. No account writes or parallel editor activity. Each window checks Shanghai 00–07; a cross-midnight call stops before another platform read. Missing capability/platform alerts stop; bounded source shortage returns truthful partial candidates and rejection totals, never pretends to exhaust X. Retry only one read-only unchanged-query readiness failure, using the existing read boundary; no repeated open-ended probes.

Acceptance: one root call can return >=10 distinct eligible authors across multiple synthetic windows; existing attempted authors and unknown targets excluded; missing likes/time/body never counted; bounds and midnight stop enforced; full candidate text/proof preserved; real Chrome call yields locally saved candidates or an evidenced partial shortage. Then use existing reviewed replyBatch on eligible real results, without per-person discovery.

Design review passed: reuses source/proof/state owners, read-only semantics and finite bounds; no approval or write inference. Planned paths src/reply-discovery.ts, public types/API, fixture tests and existing reads Skill. Plan not-required: one feature batch, no state migration. Validation and implementation review pending.

## Validation, implementation review and retrospective

Full check passed: 339 tests, TypeScript/CLI/contracts, build, maintainability and Skill budgets. Six discovery tests cover multiwindow capacity, original history/unknowns, missing metadata, bounds, midnight, alerts and one readiness continuation. Live Chrome: first bounded call collected five metadata candidates; readiness warning was in `missing`, so the same-query single retry now recognizes that actual boundary. Second call collected nine further candidates in 35 seconds. Both combined proofs saved locally by the caller; twenty were requested but not falsely reported as found. Batch semantic review selected five distinct suitable invitations; one existing root replyBatch publicly verified all five. No private operational evidence included in this public repository.

Implementation review passed: existing search/store owners reused; no writes in discovery, no candidate approval inference, no unknown resend, finite windows and explicit partial scope. Current source search can still exhaust finite windows or return incomplete posts; those warnings remain visible, not guessed complete. Retrospective: changed the original root discovery and matching Skill instead of extending model loops. Parent growth targets remain open. Stable feature and earlier query/time fixes are consolidated in 0.2.68.

Post-release real continuation showed three-page windows repeatedly revisiting processed prefixes. The existing collection owner supports ten pages: batch discovery now uses that bound and removes exhausted zero-source queries for the remainder of the call. A regression asserts deep windows and no repeat of exhausted searches. This is a necessary local throughput correction, consolidated at the next stable release; 0.2.68 publication evidence stays unchanged.
