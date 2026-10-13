# Batch followback list audit

flow: standard; task-type: feature; risk: L3; retrospective_state: pending.
User request: obtain all previously followed accounts without followback efficiently through the root harness. Platform reads are forbidden during Shanghai 00–07; development is offline then.

R1 Required: one root `readFollowbackAudit` call scans the two observed own-account list URLs, with one bounded bulk observation per rendered window, never opening individual profiles or writing to X. Reuse the people reader, navigation, proof store and root read claims.
R2 Required: case-insensitive dedup and intersection/difference. Only a count-matched complete unfiltered followers list permits non-followback classification; otherwise absent handles are provisional, not confirmed negative. Following rows must have exact following controls; unknown row relationships retain a gap. Exact expected counts are reviewed caller evidence from the same account profile, not guessed or rounded counts. Completeness means coverage matched that observed count, not a permanently consistent server snapshot.
R3 Required: bounded windows, alert/wrong-page/capability/stall stops; save full results and observations to the original proof directory, return compact counts/pointer by default. Same-instance resume retains accumulated evidence and returns an immutable checkpoint after each call; a new instance can restore the immutable resumeEvidenceRef for identical targets; a newly started list resets and verifies its actual head. Lists may change during scanning; publish observation interval and counts.
R4 Required: check Shanghai access window before every window; stop at midnight with checkpoint. No credentials, private API scraping or hidden browser state. Existing window reads retain their 1–5 limit; bulk is internal to this business task.
R5 Required: synthetic DOM + assembled root tests cover virtualized overlap, explicit following controls, partial/complete followers, zero counts, changed account URL, alerts, resume, night entry/crossing, and demonstrate no profile navigation or submission. Full checks and matching Skill before adoption.

Golden path: obtain actual profile counter/list URL proof in allowed hours → call readFollowbackAudit with both targets and exact expected counts → receive counts and proof path → consume full proof nonFollowers/provisional lists → resume same instance if bounded → complete only if both observed counts match. No unfollow action is added.

Design review: passed for these requirements. Direct per-profile reading scales with account count and is discarded; badge absence alone does not establish non-followback. Two list scans reuse current DOM path; the larger internal window removes model-driven five-person pagination. Live speed and full real-account coverage remain unverified until allowed hours. Plan: not-required for this implementation batch; this record owns cross-turn evidence.

## User revisions and live boundary

User clarified to follow back existing followers, save local lists, and live-test exactly five; user explicitly permits connecting to X now. Subsequent direct five-follow instruction is the scoped night write authorization for this test only, not a daily/global exception. Preserve actual prior backoff and account rolling history across dates.

R6 Required: followBatch supports optional `{pacing:{minGapMs,maxGapMs}}`, 5–30 second bounded ranges; choose each original handle's random gap once, persist in its original batch and reuse on resume. Wait only the remainder since the latest actual shared follow attempt. Current round rechecks all guards after waiting. Optional keeps old callers compatible; consumer selects 12–24 seconds for the five-test. This shapes burstiness, not a guarantee against automation detection.

Live list found a bio mention of a backup handle causing ambiguous identity. Prefer a unique exact relationship-control handle with a matching cell link; multiple/mismatched controls remain unconfirmed. Synthetic same-shape regression passes. Full check: 306 behavioral tests pass, including native head reset, checkpoint restore, account/list scope and evidence-bound counter revisions. Live real-Chrome validation read thousands of unique follower-list rows and positive followback candidates through the new root API, then exported local CSV/JSON. Exact profile count remained higher than observed list coverage after a head-to-tail rescan; full account coverage is unproven and the immutable result remains incomplete. The five-target serial paced trial verified four relationships, with one unresolved original submission retained without resubmission. Actual intent gaps were 15.5–28.0 seconds.

Design review update: passed, reuse original serial batch owner and explicit window permit. No alternate writer or unfollow API; source privacy and midnight default remain. Bulk full-list audit is separate from the five-target relation test.

## Implementation review and retrospective

Implementation review: passed for the changed source and declarations; no hidden API, alternate writer or private account data added to the public source. The root reuses original read claims, DOM membership and proof persistence. Source counter revisions require new existing evidence; missing coverage cannot become a confirmed negative. Runtime/source version and local evidence are recorded by the private consumer.

retrospective_state: captured. Live list navigation retained a previous route scroll position: the original reader now resets and verifies each new list head. Virtualized DOM offsets and timeline membership must be consumed before advancing; offscreen bio handles are not relationship identities. Native viewport anchors and own-account checks prevent wrong-row/list collection. Remaining live coverage mismatch is explicitly preserved rather than attributed to an unproven X limit.
