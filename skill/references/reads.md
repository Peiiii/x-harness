# Read tasks

Use bound root `x`. Default `receipt` is compact; use `decision` for complete drafting evidence or after context loss; `delta` omits only previously delivered unchanged evidence.

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
var result = await x.readCreator({ handle: selectedHandle, target: 5, mode: 'decision' });
var postResult = await x.readPost({ target: observedPost, mode: 'decision' });
```

Targets/proof come from actual observations, never guessed URLs or made-up references. API owns bounded navigation/expansion. Native creator needs a selected profile (`navigate:false`); relative times stay unknown and page changes stop collection. Native auto-navigation returns needsCapability.

Results include status/evidenceRef/missing/IDs/completeness. In `decision`, creator/bookmark/search use `sources`, post `post`, person `person`, feedback `feedback`; account includes accountHandle/accountURL. `observed` alone does not prove every requested field exists. `pageComplete:false` is a collection boundary, not proof of truncated target text. View media before describing it. Return complete chosen evidence; keep other observations local. Only on failure load recovery.

`readIncomingReplies` searches replies to the ledger account; skips settled/intent/unknown targets and processedIds (carry across dates). Use readPost(includeContext:true) for visible ancestors; missing context blocks review. Check public dedup; finite windows never prove inbox clearance.
