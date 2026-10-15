# Reads

| API | Required | Optional |
| --- | --- | --- |
| readIncomingReplies | none | processedIds, limit (5), maxPages (3), mode |
| readCreator | handle | target (10;1–50), maxScrolls, navigate, expand, mode |
| readBookmarks | folder (observed name), or discoverOnly:true | processedIds, limit (1–5), maxPages (1–10), resume, mode |
| searchSources | query | resume, processedIds, limit (1–5), maxPages (1–10), mode |
| readExploreRecommendations / readHomeRecommendations | none | processedIds, limit (1–5), maxPages (1–10), mode |
| readPost | target: {postId,url,evidenceRef} | includeContext, resolveQuote, mode |
| readPerson | target: {handle,url,evidenceRef} | mode |
| readPeople | target: {url,evidenceRef} | offset, limit (1–5), advance, mode |
| readFeedback | targets: [{postId,url,evidenceRef}] | replyLimit (0–3), mode |
| inspectAccount | none | mode |
| inspectRound | taskId (original batch ID) | none |

Targets need proof. Native `readCreator`: selected profile (`navigate:false`), unknown relative time. Stop on route changes.

Bookmarks `resume:true` continues the bound folder; rendered tail ≠ full proof.

`pageComplete:false`: finite scope. Preserve full text; view media before describing.

Incoming replies: ledger only; carry processedIds; skip settled/intent/unknown. Read parents with `readPost(includeContext:true)`; deduplicate.

`readIncomingConversations({targets?,...window})`: ≤5 chains per call. Targets need proof; returns nodes, ancestors, confirmed edges, unknown parents and attempts. `rootCandidateId` may not be root. Missing context blocks review; don't infer edges or clearance.

`resolveQuote:true` follows one observed card and returns `post.quoteSource` only after exact destination/body/author/time binding.

`readPeople`: selected followers/following; `offset` reuses cells, `advance` scrolls. Returns bio, blue, relationship; dedup. Unknowns need profiles; Native unsupported.

Discover names only.

Count `sourceOrigin` only with selected “For you” on its actual `/explore` or `/home` route; keep their kinds distinct. Trends/search do not qualify. Missing counts stay unknown.

[Batch discovery](batch-discovery.md).
