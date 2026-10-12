# Read tasks

Use root `x`: receipt for status, decision for full evidence, delta for previously delivered changes.

| API | Required | Optional |
| --- | --- | --- |
| readIncomingReplies | none | processedIds, limit (5), maxPages (3), mode |
| readCreator | handle | target (default 10, 1–50), maxScrolls, navigate, expand, mode |
| readBookmarks | folder (observed name) | processedIds, limit, maxPages, mode |
| searchSources | query | processedIds, limit, maxPages, mode |
| readPost | target: {postId,url,evidenceRef} | includeContext, mode |
| readPerson | target: {handle,url,evidenceRef} | mode |
| readFeedback | targets: [{postId,url,evidenceRef}] | replyLimit, mode |
| inspectAccount | none | mode |
| inspectRound | taskId (original batch ID) | none |

```js
var postResult = await x.readPost({ target: observedPost, mode: 'decision' });
```

Use observed targets/proof only. API owns bounded navigation/expansion. Native creator requires selected profile (navigate:false); relative time stays unknown; page changes stop collection.

Results carry status/evidenceRef/missing/completeness. Decision: creator/bookmark/search→sources, post→post, person→person, feedback→feedback, account→accountHandle/accountURL. observed is not field completeness; pageComplete:false is collection scope. View media before describing; preserve target text, keep other observations local. Failure→recovery.

`readIncomingReplies` searches replies to the ledger account; skips settled/intent/unknown targets and processedIds (carry across dates). Use readPost(includeContext:true) for visible ancestors; missing context blocks review. Check public dedup; finite windows never prove inbox clearance.

`readIncomingConversations({targets?,...window})` returns ≤5 chains: full observed text, ancestorPath, loaded nodes, confirmed edges, unconfirmed parent IDs and original attempts. Targets need observed proof. rootCandidateId is the earliest loaded ancestor, not guaranteed root; pageComplete:false. Missing branches/parents require targeted reads, never infer edges or inbox exhaustion.
