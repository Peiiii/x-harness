# Writes and rounds

Load common review plus only the operation heading needed. Existing project contract owns authorization, identity, budgets, policy and original ledger plan. Independent initialization has zero planned writes; set only authorized counts in that ledger before executing. Current runtime window is 07:00–24:00 Asia/Shanghai for replies and 07:00–22:00 for other writes; follow gates require reviewed Chinese-language blue-check candidates. Do not expand scope. Examples below use existing real observations/proof; they are not executable authorization.

## Common review

A prepared action has id (stable original ID), status:'prepared', accountHandle, accountURL, accountEvidenceRef and quality. All proof references are existing files; URLs/identity must be actually observed. Already prepared ledger actions need not be prepared again.

Content quality: `{approved:true,approvedText:text,evidenceRef:reviewProof,draftFingerprint}`; original fingerprint is SHA-256 of exact draft file bytes. Use Node crypto/createHash and fs/readFileSync locally; this requires no runtime source. Reply quality needs approvedText/proof; original also needs draftFingerprint. Any changed text/file needs a fresh review. Follow quality: `{approved:true,handle,blue:true,chinese:true,evidenceRef:reviewProof}`; verify evidence, never infer blue from generic certification.

Action APIs return status/actionId/publicURL/evidenceRef and reason/missing/resumeAt when relevant. Verified requires public proof. Unknown loads recovery, never resubmits. Business calls own intent, submit once, fresh verification and original settlement.

## Publish

Original action optional notBefore is an ISO timestamp with timezone. Explicit draft header notBefore or 最早发布窗口 is also enforced; the later constraint wins. Invalid metadata blocks, and before-window independent publishing returns waiting; scoped rounds report draft-not-before-not-reached. Both preserve no intent or submission. Recovery of an already submitted post is unaffected.

Original actions may pass `notAfter` as the calendar window’s exclusive ISO end. It is rechecked at intent and immediately before activation; expiration submits nothing. Unknown verification remains allowed after expiry.

Real quotes: pass `quoteTarget:{postId,url,evidenceRef}`; composer and public card must bind that ID. See [quotes](quotes.md).

Additional fields: kind:'original', draftPath (existing .post.md), text (complete approved text), composeURL, composeEvidenceRef; optional assets:[{path,alt}], activation:'click'|'keyboard'. Every media path must exist and be reviewed. The DOM uploader supports one absolute PNG/JPEG/WebP image with required ALT, or one absolute MP4 video. Video uploads wait for a visible preview and public settlement requires a video on the exact fresh post; image ALT controls are not applied to videos.

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

Additional fields: kind:'follow', handle, url, evidenceRef (observed person), plus common account fields and follow quality. Batch uses `{taskId,handles,preparedActions?}`; original contract determines allowed batch sizes. Each preparedAction corresponds to its handle. If already prepared, omit preparedActions. `await x.followOne({taskId,handle})` requires its original prepared action and project-permitted single-action scope. A preexisting relationship is not a new verified follow; honor result counts.

Explicit later follow window: read [authorized window](authorized-window.md) only when the user/project changes the time gate. Existing scoped permits support it; do not inspect source or change the clock.

Explicit same-day suspension of internal follow pacing: use [follow observation authorization](follow-observation.md). It does not waive platform refusals or night boundaries.

## Round

`await x.inspectRound({taskId})` inspects original state; `await x.runGrowthRound({taskId,maxActions})` runs/resumes it. maxActions bounds this call, not original planned total. Preparation uses decision:{type:'prepareActions',accountHandle,ownershipEvidenceRef,actions}; actions are the reviewed structures above.

Optional decision fields: attemptsCoverage:{complete,since,evidenceRef}, sharedAttempts:[{kind,at}], nextScheduledCheckAt. For follow budgets, coverage must actually cover the required window; unknown history cannot be recorded as zero. Missing data remains a decision gap.

Review an existing action with decision:{actionId,approved,evidenceRef,approvedText?,draftFingerprint?,blue?,chinese?}; use content fields for content, blue/chinese for follow. approved:false skips that candidate without filling original planned count. Preserve intent/unknown/verified states and IDs. Read returned gaps/decision/mayEnd; partial success is not whole-round completion.

## Incoming likes

`likeIncomingBatch({batchId,targets:[{postId,url,evidenceRef,author,incomingEvidenceRef}],sampleRate:0.3})` samples once per stable batch (1–5 observed received comments), retains selection in the original ledger, serially likes and verifies exact public state. Existing likes never toggle. Each fresh click has a 30-second minimum gap; waiting returns resumeAt rather than polling. Unknown intent freezes that object. No reply-goal credit or guarantee against platform restrictions; alerts stop the batch.

Optional executor.replyEmojiPolicy={sampleRate,maxInRecent} gates new reply drafts: stable original-ID sampling, no consecutive emoji, at most maxInRecent in the latest ten intents/unknown/verified replies. Plain text remains allowed; existing unknown recovery is unchanged.

## Executor-local read restrictions

A non-actionable item remains account-wide unless its original ledger explicitly records `executionRestriction:{scope:'executor',executorId,reason,evidenceRef}`. The exact current reason and evidence in `blockEvidence` must match, and the restricting executor must exist with the same kind. Another authorized executor can proceed through the root API with its own identity/source proof; the affected executor stays blocked. Missing/stale scope proof, shared capacity, alerts, windows, pacing, quality and unknown guards still reject. Do not infer locality from a message or silently clear another executor's marker.
