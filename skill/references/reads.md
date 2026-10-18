# Reads

| API | Required | Optional |
| --- | --- | --- |
| readIncomingReplies | none | processedIds, limit (5), maxPages (3), mode |
| readCreator | handle | target (10;1–50), maxScrolls, navigate, expand, timeline (posts/replies), mode |
| readBookmarks | folder (observed name), or discoverOnly:true | processedIds, limit (1–5), maxPages (1–10), resume, mode |
| searchSources | query | resume, processedIds, limit (1–5), maxPages (1–10), mode |
| readExploreRecommendations / readHomeRecommendations | none | processedIds, limit (1–5), maxPages (1–10), mode |
| readPost / [comments](post-comments.md) | target: {postId,url,evidenceRef} | includeContext, resolveQuote, mode |
| readPerson | target: {handle,url,evidenceRef} | mode |
| readPeople / [bulk](people.md) | target: {url,evidenceRef} | offset, limit (1–5), advance, mode |
| readFeedback | targets: [{postId,url,evidenceRef}] | replyLimit (0–3), mode |
| inspectAccount | none | mode |
| inspectRound | taskId (original batch ID) | none |

Targets need proof. Native: selected profile, navigate:false; time unknown. Stop on route change.

Bookmarks resume:true: same folder; tail ≠ all.

`pageComplete:false`: finite scope. Preserve full text; view media before describing.

Incoming: ledger processedIds; skip settled/intent/unknown. Parents: readPost(includeContext:true), deduplicate.

`readIncomingConversations({targets?,...window})`: ≤5 chains per call. Nodes, ancestors, edges, unknown parents, attempts. `rootCandidateId` may not be root. Missing context blocks review; don't infer edges or clearance.

resolveQuote:true: one observed card; quoteSource requires destination/body/author/time binding.

readPeople: selected followers/following; offset reuses cells, advance scrolls. Bio/blue/relationship; dedup. Unknowns need profiles; no Native.


sourceOrigin needs selected For you on actual /explore or /home; keep kinds distinct. Exclude trends/search. Absent counts unknown.

[Batch discovery](batch-discovery.md).

`timeline:"replies"`: unique observed same-profile tab; `navigate:false` requires it already selected. Finite receipt candidates still need exact-parent verification; unknown never resends.
