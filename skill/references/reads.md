# Reads

| API | Required | Optional |
| --- | --- | --- |
| readIncomingReplies | none | processedIds, limit (5), maxPages (3), mode |
| readCreator | handle | target (10;1–50), maxScrolls, navigate, expand, mode |
| readBookmarks | folder (observed name), or discoverOnly:true | processedIds, limit (1–5), maxPages (1–10), resume, mode |
| searchSources | query | processedIds, limit (1–5), maxPages (1–10), mode |
| readPost | target: {postId,url,evidenceRef} | includeContext, resolveQuote, mode |
| readPerson | target: {handle,url,evidenceRef} | mode |
| readPeople | target: {url,evidenceRef} | offset, limit (1–5), advance, mode |
| readFeedback | targets: [{postId,url,evidenceRef}] | replyLimit, mode |
| inspectAccount | none | mode |
| inspectRound | taskId (original batch ID) | none |

Targets require proof. Native creator: selected profile, navigate:false; relative time unknown; stop on page change.

Bookmarks resume:true continues the bound folder; rendered tail ≠ full proof.

observed ≠ field completeness; pageComplete:false = scope. View media before describing; preserve target text; keep other reads local.

`readIncomingReplies`: ledger account; skip settled/intent/unknown and processedIds across dates. readPost(includeContext:true) for ancestors; missing context blocks review. Dedup publicly.

Incoming: `readIncomingConversations({targets?,...window})` combines discovery/context (≤5); no preceding `readIncomingReplies`. Preflight/source failures remain visible. Returns ancestorPath, nodes, confirmed edges, unknown parents and attempts; rootCandidateId is only the earliest loaded ancestor. Missing context blocks review; never guess roots/edges or inbox clearance. Use `readIncomingReplies` only when the candidate list alone is the goal; it excludes settled/intent/unknown + cross-date processedIds.

`resolveQuote:true` follows one observed card and returns `post.quoteSource` only after exact destination/body/author/time binding.

`readPeople`: observed follower/following; offset reuses cells; advance scrolls a fresh unique handle. Full bio/blue/relationship; dedup; unknowns need profiles. No Native.

Discovery: names only.
