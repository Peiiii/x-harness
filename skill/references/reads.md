# Reads

Root `x`: receipt=status, decision=evidence, delta=changes.

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

```js
await x.readPost({ target: observedPost, mode: 'decision' });
```

Targets need observed proof. API navigates/expands. Native creator: selected profile, navigate:false; relative time unknown; page changes stop.

Decision: creator/bookmark/search→sources, post→post, person→person, people→people, feedback→feedback, account→accountHandle/accountURL. observed ≠ field completeness; pageComplete:false = scope. View media before describing; preserve target text; keep other reads local. Use recovery on failure.

`readIncomingReplies`: ledger account; skip settled/intent/unknown and processedIds across dates. readPost(includeContext:true) for ancestors; missing context blocks review. Dedup publicly.

`readIncomingConversations({targets?,...window})`: ≤5 full chains with ancestorPath, nodes, confirmed edges, unconfirmed parents and attempts. Targets need proof. rootCandidateId = earliest loaded ancestor, not guaranteed root. Missing branches need reads; never guess edges or inbox clearance.

`resolveQuote:true` follows one observed card and returns `post.quoteSource` only after exact destination/body/author/time binding.

`readPeople`: observed follower/following lists; offsets reuse cells. advance scrolls a unique fresh handle. people has full bio, blue/relationship. Dedup; unknowns need profiles. No approval/write. Native unsupported.
