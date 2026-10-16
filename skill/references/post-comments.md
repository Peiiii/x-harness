# Post comments

`readPostComments({target:{postId,url,evidenceRef},maxPages:10,timeBudgetMs:60000,processedIds:[],mode:"decision"})`

Limits: maxPages 1–100, timeBudgetMs 1–120000

`readPostComments`: one evidenced root, bounded sequential thread read/ordinary expansion. Returns deduplicated captured sources and `paginationBoundary` in every mode. No likes, follows or replies. `complete` describes this bounded read only; `pageComplete:false` and `scopeComplete:false` always. Rendered-tail never proves hidden/unavailable comments exhausted. Keep original root checkpoints and known IDs; `processedIds` excludes old rows after rereading the root, not a durable platform cursor. Thread membership is observed; an absent `replyToId` remains unknown and cannot be inferred as a direct root edge. Preserve partial evidence on alerts/scope loss, handle that read before resuming. No Native support.

A `diagnostic.category` of `browser-connection` stops that collection chain for handle/connection recovery; it is not evidence that each remaining post failed. Pass the current root API explicitly into caller helpers after rebinding. Keep original IDs and partial sources; never replay writes.
