# Reads

| API | Required | Optional |
| --- | --- | --- |
| readIncomingReplies | none | processedIds, limit (5), maxPages (3), mode |
| readCreator | handle | target (10;1–50), maxScrolls, navigate, expand, mode |
| readBookmarks | folder (observed name) | processedIds, limit, maxPages, mode |
| searchSources | query | processedIds, limit, maxPages, mode |
| readPost | target: {postId,url,evidenceRef} | includeContext, resolveQuote, mode |
| readPerson | target: {handle,url,evidenceRef} | mode |
| readPeople | target: {url,evidenceRef} | offset, limit (1–5), advance, mode |
| readFeedback | targets: [{postId,url,evidenceRef}] | replyLimit, mode |
| inspectAccount | none | mode |
| inspectRound | taskId (original batch ID) | none |

Targets need observed proof. Native creator: selected profile, navigate:false; relative time unknown; page changes stop.

observed ≠ field completeness; pageComplete:false = scope. View media before describing; preserve target text; keep other reads local.

`readIncomingReplies`: ledger account; skip settled/intent/unknown and processedIds across dates. readPost(includeContext:true) for ancestors; missing context blocks review. Dedup publicly.

Incoming work: use `readIncomingConversations({targets?,...window})` once for discovery + context (≤5); no preceding `readIncomingReplies`. It preflights required capabilities and preserves source failures. Returns ancestorPath, nodes, confirmed edges, unknown parents and attempts; rootCandidateId is only the earliest loaded ancestor. Missing context blocks review; never guess roots/edges or inbox clearance. Use `readIncomingReplies` only when the candidate list alone is the goal; it excludes settled/intent/unknown + cross-date processedIds.

`resolveQuote:true` follows one observed card and returns `post.quoteSource` only after exact destination/body/author/time binding.

`readPeople`: observed follower/following lists; offsets reuse cells. advance scrolls a unique fresh handle. people has full bio, blue/relationship. Dedup; unknowns need profiles. Native unsupported.
