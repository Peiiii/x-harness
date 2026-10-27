# Reply receipt verification without redundant document bootstraps

Flow: bugfix; risk L3 (read transport across platform/DOM owner); retrospective pending.
Contract REPLY-RECEIPT-CLIENT-20261027 revision1. Parent goal: reduce unnecessary webpage initialization in the authorized reply duty while retaining exact public verification and real refusal handling. Platform quota scope and its private threshold remain unknown; this repair cannot guarantee elimination of429.

## Evidence and user path

The operator uses the existing reviewed replyBatch/runPrepared path. After a single submit, X exposes an observed own-account receipt. Current PlatformWriting opens that receipt, then unconditionally refreshes reply pages, unlike the existing original-post path. DOMNavigation also excludes ordinary post permalinks from its existing unique-visible-link route unless a strict original-only preference is provided. Account observation caching does not remove these document requests. Live account/errors stay in the private consumer repository.

After adoption the same operator submits once; the harness follows an unambiguous visible exact receipt link in the loaded client where available, freshly reads the public article, resolves its exact parent and settles the original ID. No user setup or migration. Missing/ambiguous links use the existing evidenced-URL route once; challenges and existing real backoffs retain their refusal behavior. A missing parent remains unknown, never another submit.

## Design

Reuse PlatformWriting and DOMNavigation. An internal soft preferClientNavigation hint is forwarded by PlatformObservation only for actual observed reply receipt navigation. It permits the existing exact visible permalink selection; existing strict preferObservedLink semantics remain unchanged. Default ordinary posts, forced navigation and thread-root navigation are unchanged. The existing inert-link bounded fallback remains; no new retry.

Skip refreshPosts only when a reply has its original observed-public proof and the freshly read exact receipt URL contains one matching original own-account ID/body/assets/intent-time candidate, with matching current account and no alerts/incomplete state. Public-parent acceptance remains downstream. Missing candidate, account, wrong route, alert and no-receipt branches retain current behavior. The existing bounded thread reader resolves missing parent without navigation replay.

Rejected: global removal of refresh or global post-link navigation would change unrelated cold reads and thread scope. Increasing speed/parallel writers cannot repair redundant bootstrap requests and expands risk. No new scheduler, direct X API, credentials, network manipulation or quota evasion.

## Required acceptance

R1: synthetic original reply receipt proves zero refresh and client-preferred public navigation, while final author/body/time/ID/exact-parent checks still determine success.
R2: unique visible exact permalink uses one click and zero goto; missing/ambiguous links use one existing goto; forced/default/strict-original semantics remain. Inert link, wrong route, alert and transport errors retain bounded refusal/fallback.
R3: missing/wrong parent, late text change, duplicate IDs, wrong account and pre-intent time cannot verify; original action submits at most once. No-receipt legacy refresh remains.
R4: typecheck, targeted regressions, full check, diff maintainability and implementation review pass; source precisely committed/pushed. Local build adoption verifies frozen file/recipe hashes and rebinds the original consumer at a safe boundary, preserving original IDs and both owned pages.
R5: after any real backoff is due, real original-ID read-only recovery first, then normal already-authorized prepared work only with complete matching identity and gates. Record actual goto/reload/receipt counts and public outcome. A continuing refusal is an explicit operational limit, not a claim that requests disappeared or429 was fixed permanently.

Design review (mode=design): passed. Scope is the already-observed reply receipt, not all navigation. Refresh exemption requires fresh exact public/account/content proof; missing parent never becomes inferred. No parallel state/API or added retries. Plan: not-required, one bounded source/test/adoption batch. Keep operating goal and unknowns open; no capacity claim from synthetic call counts.

## Source validation and implementation review

Initial regression against the prior frozen implementation failed8 cases (redundant refresh and absent client preference). After correction,90 targeted tests passed; added assembled platform forwarding plus inert/challenge/wrong-route/transport cases also pass in the full check:955 tests, types/CLI/contracts, formatting, maintainability, Skill and generated artifacts. The no-receipt legacy refresh test remains passing. R1-R3 source boundaries passed, R4 source checks passed; actual consumer adoption/live R5 pending.

Implementation review (mode=implementation): no findings. Preference forwarding remains internal and explicit; forced thread navigation wins, strict original preference is unchanged, exact article readiness still runs. The reload exemption requires original receipt proof, current exact route/account and one matched original ID/body/assets/time. It does not infer a parent, remove warnings, repeat a submit or change state schema. Helpers isolate receipt-query construction and matching so the original method stays within its150-line limit. No server quota or causal429-reduction claim follows from these tests.

## Consumer adoption and real boundary

The original consumer froze all191 build files, retained the validated reader/private context and recipe hashes, then rebound the entire original duty/root/helpers with its same owned writer/reader and original ledger. Hash validation passed. At the evidenced due recovery boundary, current writer identity remained incomplete; one permitted draft-free original-page reload produced a current Viewer429. No new comments were submitted and no unknown was resent. R4 local delivery/adoption passed; R5 actual public-receipt optimization remains blocked by the platform, not counted as passed. The new build is selected for the next lawful original-duty recovery. Public npm remains unchanged under the consolidated maintenance policy.

Retrospective decision: update the existing transport/receipt owner and regression suite, not another operator prompt. Session identity reuse cannot remove website bootstrap requests caused by document navigation. The fix removes proven redundant requests; server quota attribution, current refusal recovery and sustained throughput remain unproven. retrospective_state=completed for source/adoption delivery; parent operating goal and R5 real outcome remain open.

## Revision2: first normal verification must acquire the receipt before refresh

Actual consumer instrumentation after identity recovery found a missing normal branch: two existing reviewed replies were submitted once, but their first findSubmission actions did not yet contain observedPublicURL. The initial repair only optimized previously retained receipts; these new first verifications still reloaded the parent. Both remained unknown; no resend. This is a required coverage gap, not acceptance of R5.

Resolve an already fresh unique content/time/author/ID candidate through its observed permalink before considering refresh. Only a fresh exact own-account public-detail route matching that unique candidate permits omitting the refresh, with or without a previously persisted observedPublicURL. Missing candidate, wrong page/current account, challenge, stale content and legacy no-candidate paths retain refresh/readiness/refusal. Extract the existing candidate-detail validation once and reuse it after a necessary legacy refresh; no copied parent or second submission. The exact-parent final filter and bounded thread reader remain unchanged.

Required R6: assembled normal replyToPost without a preexisting observed URL must navigate the candidate before refresh, settle only with exact parent, and never reload an already complete exact public receipt. Wrong/missing parent retains unknown with zero extra submit. New synthetic first-verification regression must fail on71b4e26, then full check and a real original-ID read prove adoption when available. Design review revision2: passed; this closes the original normal path that instrumentation disproved. R1-R5 remain, prior source implementation completion does not satisfy normal-operation acceptance.

Revision2 source validation: first-verification regression fails on71b4e26, then957 full tests/check pass. A new late-detail-content-change regression preserves the earlier observed URL while refusing success. Diff-only maintainability passed for the two changed code/test files. Implementation review: no findings; one candidate-detail owner is used before refresh and after a necessary legacy refresh. Normal first verification now has the same public-detail prerequisite as retained-receipt recovery, and the original exact-parent filter is unchanged. Actual private adoption/recovery remains to be recorded; first-version real submitted objects stay unknown and must not be repeated.
