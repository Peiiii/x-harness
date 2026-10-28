# Writes and rounds

Load common review and only the matching operation heading. The project owns authorization, identity, budgets, policy and the original ledger plan. Independent initialization plans zero writes; record authorized counts before execution. Default Asia/Shanghai windows: replies 07–24, other writes 07–22. Follow needs reviewed Chinese blue-check candidates. Never expand scope. Examples require real observations/proof and grant no authorization.

## Common review

A prepared action has id (stable original ID), status:'prepared', accountHandle, accountURL, accountEvidenceRef and quality. All proof references are existing files; URLs/identity must be actually observed. Already prepared ledger actions need not be prepared again.

Content quality: `{approved:true,approvedText:text,evidenceRef:reviewProof,draftFingerprint}`; original fingerprint is SHA-256 of exact draft file bytes. Use Node crypto/createHash and fs/readFileSync locally; this requires no runtime source. Reply quality needs approvedText/proof; original also needs draftFingerprint. Any changed text/file needs a fresh review. Follow quality: `{approved:true,handle,blue:true,chinese:true,evidenceRef:reviewProof}`; verify evidence, never infer blue from generic certification.

Action APIs return status/actionId/publicURL/evidenceRef and reason/missing/resumeAt when relevant. Verified requires public proof. Unknown loads recovery, never resubmits. Business calls own intent, submit once, fresh verification and original settlement.

## Publish

[Native](native-publishing.md).

Spacing: [cadence](original-cadence.md).

Original action optional notBefore is an ISO timestamp with timezone. Explicit draft header notBefore or 最早发布窗口 is also enforced; the later constraint wins. Invalid metadata blocks, and before-window independent publishing returns waiting; scoped rounds report draft-not-before-not-reached. Both preserve no intent or submission. Recovery of an already submitted post is unaffected.

Original actions may pass `notAfter` as the calendar window’s exclusive ISO end. It is rechecked at intent and immediately before activation; expiration submits nothing. Unknown verification remains allowed after expiry.

Real quotes: pass `quoteTarget:{postId,url,evidenceRef}`; composer and public card must bind that ID. See [quotes](quotes.md).

Additional fields: kind:'original', draftPath (existing .post.md), text (complete approved text), composeURL, composeEvidenceRef; optional assets:[{path,alt}], activation:'click'|'keyboard'. Every media path must exist and be reviewed. The DOM uploader supports 1–4 absolute PNG/JPEG/WebP images with separately verified ALT in upload order, or one absolute MP4 video; mixed media batches are rejected before upload. Video uploads wait for a visible preview and public settlement requires a video on the exact fresh post; image ALT controls are not applied to videos.

```js
var result = await x.publishPost({
  taskId,
  draftPath,
  preparedAction: {
    id: actionId,
    status: "prepared",
    kind: "original",
    accountHandle,
    accountURL,
    accountEvidenceRef,
    quality: {
      approved: true,
      approvedText: text,
      evidenceRef: reviewProof,
      draftFingerprint,
    },
    draftPath,
    text,
    composeURL,
    composeEvidenceRef,
  },
});
```

Optional independentExecution:{tabId,evidenceRef,scopeEvidenceRef} requires real independent task-tab/scope proof; binding executor scope is covered in setup only if needed. Existing original action can omit preparedAction; draftPath still required.

## Reply

Opt-in [batch likes](#reply-batch-with-thread-likes): `likeTargetAfterVerified:true` likes only the parent; `threadLikes:{...}` samples its thread. Choose one mode.

Additional fields: kind:'reply', postId, url, evidenceRef (observed parent), text; optional assets/activation as above. Common account/quality fields still required. The exact parent is verified by the API. `replyBatch({taskId,actions})` accepts 1–5 reviewed replies, submits serially and recovers an observed receipt once without resending; The batch owns one normal pacing wait (up to 30 seconds) per action and one read-only retry for an observed permalink. Longer or renewed waits and capability/decision failures return unfinished work. Remaining unknowns without permalinks get one batched own-account lookup, then exact-parent verification of unique observed links; unknowns never resubmit. Incoming clicks have a ≥30s minimum gap, not a safety guarantee. Incoming conversations require reviewed conversation:{recipientHandle,rootId,round,automatedLoop?}; at most 3 own rounds per recipient/root, with intent/unknown counted. Mark observed automatic loops to stop earlier.

```js
var result = await x.replyToPost({
  taskId,
  postId,
  text,
  preparedAction: {
    id: actionId,
    status: "prepared",
    kind: "reply",
    accountHandle,
    accountURL,
    accountEvidenceRef,
    quality: { approved: true, approvedText: text, evidenceRef: reviewProof },
    postId,
    url: parentURL,
    evidenceRef: parentProof,
    text,
  },
});
```

## Follow

Explicit user-authorized cohort exceptions: read [blue screening](follow-blue-exception.md). Ordinary candidates still require blue; never forge a badge.

Give a 5-person `followBatch` an outer host timeout of at least 180000ms for serial pacing and verification. On host timeout, inspect original IDs first: never replay intent/unknown; only never-submitted prepared entries may resume after current policy gates.

Additional fields: kind:'follow', handle, url, evidenceRef (observed person), plus common account fields and follow quality. Batch uses `{taskId,handles,preparedActions?}`; original contract determines allowed batch sizes. Each preparedAction corresponds to its handle. If already prepared, omit preparedActions. `await x.followOne({taskId,handle})` requires its original prepared action and project-permitted single-action scope. A preexisting relationship is not a new verified follow; honor result counts.

Explicit later follow window: read [authorized window](authorized-window.md) only when the user/project changes the time gate. Existing scoped permits support it; do not inspect source or change the clock.

Explicit same-day suspension of internal follow pacing: use [follow observation authorization](follow-observation.md). It does not waive platform refusals or night boundaries.

## Round

Explicit success goal blocked by total reservations: [verified-target planning](planning.md).

`await x.inspectRound({taskId})` inspects original state; `await x.runGrowthRound({taskId,maxActions})` runs/resumes it. maxActions bounds this call, not original planned total. Preparation uses decision:{type:'prepareActions',accountHandle,ownershipEvidenceRef,actions}; actions are the reviewed structures above.

Optional decision fields: attemptsCoverage:{complete,since,evidenceRef}, sharedAttempts:[{kind,at}], nextScheduledCheckAt. For follow budgets, coverage must actually cover the required window; unknown history cannot be recorded as zero. Missing data remains a decision gap.

Review an existing action with decision:{actionId,approved,evidenceRef,approvedText?,draftFingerprint?,blue?,chinese?}; use content fields for content, blue/chinese for follow. approved:false skips that candidate without filling original planned count. Preserve intent/unknown/verified states and IDs. Read returned gaps/decision/mayEnd; partial success is not whole-round completion.

## Incoming likes

`likeIncomingBatch({batchId,targets:[{postId,url,evidenceRef,author,incomingEvidenceRef}],sampleRate:0.3})` samples once per stable batch (1–5 observed received comments), retains selection in the original ledger, serially likes and verifies exact public state. Existing likes never toggle. Each fresh click has a 30-second minimum gap; waiting returns resumeAt rather than polling. Unknown intent freezes that object. No reply-goal credit or guarantee against platform restrictions; alerts stop the batch.

Optional executor.replyEmojiPolicy={sampleRate,maxInRecent} gates new reply drafts: stable original-ID sampling, no consecutive emoji, at most maxInRecent in the latest ten intents/unknown/verified replies. Plain text remains allowed; existing unknown recovery is unchanged.

## Executor-local read restrictions

A non-actionable item remains account-wide unless its original ledger explicitly records `executionRestriction:{scope:'executor',executorId,reason,evidenceRef}`. The exact current reason and evidence in `blockEvidence` must match, and the restricting executor must exist with the same kind. Another authorized executor can proceed through the root API with its own identity/source proof; the affected executor stays blocked. Missing/stale scope proof, shared capacity, alerts, windows, pacing, quality and unknown guards still reject. Do not infer locality from a message or silently clear another executor's marker.

## Follow priority during reply gaps

Use `runFollowPriorityBatch({taskId,follow:{executor:{id,scopeKinds:['follow'],evidenceRef},handles,pacing?,recoveryTargets?},reply:{actions,verifiedTarget?}})` on the current reply-scoped root. Supply the existing authorized follow actor, reviewed original handles, and optional original unknown person targets. The root serially selects a follow batch when available; before a due backoff it executes the reviewed reply batch. New reply boundaries and short pacing waits recheck follow readiness and hand over in the same call. Only a matching evidenced expired backoff can reopen, without clearing other actor markers; unknowns are read-only verified, never resubmitted. All normal time, authorization, budget, review and account serialization gates remain.

Return: `selected:'follow'|'reply'|'none'`, `followResult?`, `replyResult?`, `reason?`, `resumeAt?`. Continue through this same API while work is available. Midnight returns without platform work. Counts/results remain original-ledger facts; a batch receipt never guarantees the daily target.

An unconfirmed individual reply parent baseline submits nothing and does not stop the remaining reviewed authors in `replyBatch`. Its receipt remains needsDecision; shared alerts, missing capabilities, pacing/time gates and other refusals still stop the batch. Never treat a skipped baseline as completion.

## Thread likes

`likePostAndComments({url,batchId?,sampleRate:0.6,maxLikes:20,maxPages:40,timeBudgetMs:120000,reuseCurrentPage?:boolean})` opens the selected X permalink and internally scans/expands ordinary rendered replies. No caller comment/author list is needed. Root is selected separately; comments use a persisted per-ID 60% sample, not an exact quota. Same batch/root/rate resumes without redrawing; changed sampling requires a new batch ID. Existing global reactions prevent duplicate clicks across batches. Already-liked controls never toggle; unknown intent is verified when visible and never clicked again.

Thread clicks use one fresh, exact Chrome AX button activation, avoiding locator keyboard focus that itself clicks. The thread page remains open; exact card ID, author, account and fresh public liked state are checked without visiting commenter profiles. Ancestors, ads, sidebar and Discover more recommendations are excluded; only unambiguous observed Show replies/Show more replies controls expand. Hidden/unavailable replies are outside verified coverage. DOM Chrome tab required; native app binding returns capability-required.

Serial fresh submissions are 1–2 seconds apart, including read/verification time. This is load pacing, not human impersonation or detection evasion. maxLikes caps new intents, including unknown/failed; old recovery, preexisting and pre-intent skips cost none. newLikesThisCall stays verified-only. Limits: 100 attempts, 200 advances, 600000ms/call. Internal waits consume no additional model calls; insufficient time returns waiting/resumeAt, caps return checkpoint. Continue the same call arguments/batch with a sufficient outer tool timeout; never poll or resample. Account warning, wrong identity, midnight (Shanghai 00–07) stops. Unknown intent freezes only that post; other selected comments may continue, and its unknown state remains in the receipt and ledger. Result counts separate newLikesThisCall, verified, preexisting, skipped, unknown and pending. `verified` only means the loaded thread reached a bounded stable tail; scopeComplete is always false, never all comments on X.

X's published rules prohibit automated likes: https://help.x.com/en/rules-and-policies/x-automation . Sampling and timing do not change that rule or guarantee against restrictions. This API requires explicit task authorization and does not automatically attach to every reply.

```js
var result = await x.likePostAndComments({
  url: "https://x.com/example/status/123",
  batchId: "thread-123",
  sampleRate: 0.6,
  timeBudgetMs: 120000,
});
```

Executor-scoped early windows: incoming likes and thread likes use the same evidenced `windowAuthorization` as their reply/follow executor. The matching kind, executor ID, actual start/exclusive expiry and existing proof are required; missing or expired permits retain the default gate. Recheck before each intent and continuation. This permit does not schedule work, clear refusals or authorize another executor.

## Pin an owned public post

Pin requires explicit authorization, its existing proof and a DOM tab:

```js
if (!x.pinPost) throw new Error("pin capability required");
await x.pinPost({
  taskId,
  target: { postId, url, evidenceRef },
  userAuthorized: true,
  authorizationEvidenceRef: authorizationProof,
});
```

The root checks current account and exact owned main post, records intent, selects the observed pin menu and confirmation, then checks the profile pinned ID. A navigation checkpoint requires the same call after the target renders. For unknown use `pinPost({...sameArguments,verifyOnly:true})` first; it never republishes content. A visible pending pin confirmation can resume the same task; target changes are rejected. Only `verified` means the target is currently pinned.

## Reply batch with thread likes

Explicit `replyBatch({taskId,actions,threadLikes:{sampleRate:0.6,maxLikes:20,maxPages:10,timeBudgetMs:30000}})` performs the existing 1–5 reviewed replies and public verification, then likes each exact verified parent and sampled visible comments. Default replyBatch stays replies-only. One caller invocation owns serial pacing/recovery/likes; do not add caller loops.

Reply status/results and threadLikes/interactionStatus/pendingLikeActionIds are separate; checkpoints never mean all hidden comments or follower growth. Stable `reply-thread-likes-<parentId>` reuses original sampling/reactions. Unknown replies never trigger likes or resubmit. Repeat the same original arguments for permitted unfinished work. Invalid like config rejects before replies. Optional beforeReply is an async deny-only project admission callback, fresh for each new prepared reply; root permission/identity/quality/unknown/night gates remain. followPriorityExecutorId yields at original reply/like boundaries. Allow outer timeout for serial replies plus bounded thread budgets (three threads typically need >=240000ms).

Target-only mode immediately likes each verified reply's exact original target and returns separate targetLikes. It reuses the current exact confirmed thread or opens the reviewed URL once; unknown replies never imply success. Target-like failures never resend a comment. Do not combine it with threadLikes; the whole-thread mode already includes its parent.
