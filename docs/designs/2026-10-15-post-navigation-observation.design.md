# Preserve a committed post after a URL wait timeout

Flow: bugfix. Risk: L2, one read boundary. Retrospective completed.

Consumer evidence: real reply and thread-like operations sometimes return a URL wait timeout; subsequent same-ID verification can confirm the original public reply. No account data or browser evidence is copied into this public repository.

The platform observation owner currently propagates the navigation exception before observing the resulting document. Recover only the exact URL-wait timeout for a posts read: observe once, require no alert and no incomplete-state flag. An already committed exact target continues normal readiness. An unchanged original page with the same nonempty account may navigate the same evidenced URL directly once, then run normal readiness. Never click a submission, refresh, change action IDs or declare verification. Person/composer navigation, other errors, changed routes/accounts, alerts and incomplete state still fail. A second navigation error propagates without a loop.

Design review: accepted. This adds no write retry or relaxed author/body/time/exact-parent acceptance. Returning a ready observation does not imply submission verification. Required checks: eight synthetic boundary cases, existing navigation and receipt regressions, type checks, full check, real original-ID verification and thread-like continuation. Runtime proof remains in the consumer's original ledger.

Validation: `npm run check` passed all 396 tests, type checks, generated observation checks, Skill checks and maintainability. Implementation review found no changed submission/identity/parent acceptance gate. The consumer adopted the checked local build, verified an existing reply under its original ID and advanced the previously blocked original thread-like batch through 30 observed records and seven newly verified likes. A later native target ambiguity stayed unresolved; this is not evidence that every navigation or every thread is fixed.

Retrospective: navigation exceptions are not evidence that the resulting document is absent. Keep the one fresh observation and at most one same-evidenced-URL navigation inside the original read boundary; never ask the model to repeat a write or mark a missing-parent receipt successful. Public package version remains unchanged; fold this consumer-used build into the next related release rather than starting a per-fix npm publication.

## Thread-root scoped continuation

A thread-scoped read of an unrelated current route cannot validate the requested root, so its incomplete flag prevents the earlier timeout fallback. Repeated consumer thread-like failures reproduced this distinction. Initial navigation for a posts query carrying threadRootId therefore directly opens its existing evidenced URL once instead of selecting an in-page permalink. All ordinary post, person, submission and verification paths retain their existing behavior. Thread membership, exact URL, account and alert gates still run after navigation; unknown reactions retain their original intent. Design review: accepted, no additional retry or acceptance relaxation. Regression covers an inert link on an unrelated scoped page; live continuation and full checks pending.

Thread continuation validation: full check passed 397 tests. The checked local build opened two formerly failing consumer thread roots without a URL timeout; one retained an unknown reaction without repeating its intent, and another observed 26 records and verified nine new likes before its original call budget checkpoint. Implementation review: no findings; direct navigation changes no account, thread-membership, reaction or submission acceptance gate. Retrospective: scope-dependent incompleteness must not turn an inert in-page link into an endless caller warmup loop. This is a local adopted correction for the next related consolidated release; native target ambiguity remains separately unresolved.

Review follow-up: a thread read now returns the current alert state before any direct navigation when a platform challenge is observed. A synthetic challenge regression proves zero navigation actions; full check passed 399 tests after integrating the latest upstream screenshot-only changes. No routine screenshots were added to the consumer workflow.

## Committed profile-route timeout

Two newly reviewed candidate profiles returned a host URL timeout before normal profile readiness. The lower DOM navigation owner may continue only if a fresh account observation confirms the exact requested profile route, no alert and no incomplete flag. Mandatory profile content readiness and the platform's exact handle/relationship/blue checks still follow. This does not extend the outer post-only unchanged-page retry to profiles; wrong routes, alerts and incomplete account observations still throw, and no Follow/submission action is repeated. Design review accepted; regression covers committed, wrong route, alert and incomplete state. Required live proof is the same original candidate read through the root API.

Committed-profile validation: full check passed 410 tests. Both original consumer profile targets subsequently returned fresh complete exact-handle observations through readPerson in one root batch; their actual biographies let the consumer distinguish an eligible AI developer from an excluded crypto account. Implementation review found no changed Follow/submission or identity acceptance gate. This source correction is adopted locally and consolidated with the recommendation-reader maintenance batch; no per-fix npm publication.

## Host goto timeout at the same boundary

A live original-submission verification returned a URL timeout from the host navigation itself, before the adapter’s explicit waitForURL catch. Move only navigation activation into that existing catch. The same exact committed route and alert checks still apply, followed by mandatory exact article readiness; no new navigation, submit, acceptance or weakened parent verification. Design review: this closes the same adapter boundary without new fallback state. Synthetic regressions require committed goto timeout to continue, wrong route and challenge to stop before article use.

Validation: full check passes 413 tests, including all three host-goto regressions, types, maintainability and Skill budgets. Implementation review: only placement inside the pre-existing timeout catch changes; unknowns still require original-ID verification and no submission path is repeated. Retrospective: host goto itself can own the URL wait, so adapter recovery must encompass both navigation activation and its explicit wait rather than only the latter. Local adoption, no isolated npm release.


## 2026-10-15：已到详情页仍必须等待精确正文

flow=bugfix，risk=L2，retrospective_state=pending。真实来话链接在原读取路径两次缺证后，一次直达已观察URL成功；同页立即读取尚无正文，随后同一根reader取得完整原目标和上下文。原DOMNavigation同URL早返回只等人物内容、不等帖子，遗漏详情就绪门。多次原帖链接点击未离开源页，直达同证据URL已实证可用，不把该症状推断为平台拒绝。

修订：同URL的posts也复用原精确permalink/history文章等待；抽取原等待块为同一private helper，冷导航与同页复用共用，不重新导航当前页。帖子详情从已观察URL一次goto，不再先做可惰性的locator链接点击；其它视图不改。保留路由、告警、content readiness和超时预算；不让源页旧文章满足详情。方案Review(mode=design)：passed，现有边界减少一次不可靠点击与重复wait，exact内容门得到统一而非放宽。Required：同页无goto且精确正文等待；首次直达一次goto/commit wait；错误路由、告警/transport依旧拒绝；根来话真实同ID恢复。


验证/Review：修前同URL边界实际contentWaits=0，回归失败；修后同一边界contentWaits=1、零重导航。帖子直达/错误路由/告警/transport定向检查通过，完整check428项通过（合并最新原发帖节奏源码）。真实根readIncomingConversations对原来话的一次冷调用取得完整正文、原祖先和已确认父子边，不需调用方预先warmup；证明这条原失败路径，不保证所有导航无故障。实现Review(mode=implementation)：no findings；原帖子精确文章等待收敛为同一helper，profile其它视图不改，超时/告警/未知门未放宽。

retrospective_state=completed；复盘：URL相同只说明路由已到，不等于内容就绪；共享原content readiness，并优先使用已观察URL避免不必要的链接点击。用户小改集中发布约定保持，本修复随当前必要导航维护本地采用，不单独发npm；原运营目标继续，不以修复完成结算全天。

## Own-replies receipt recovery

Flow: bugfix; risk: L3; retrospective pending. Contract `reply-receipt-surface-20261015`, revision 1, parent goal: recover an actually published reply under its original action without resending. Consumer failures and account evidence remain private. The current batch recovery searches one bounded own-account reply query; an empty search window cannot establish absence or guarantee immediate indexing. The creator reader currently accepts only the profile Posts route.

Golden path: the authorized operator submits a reviewed reply once; the existing search cannot locate its receipt; the same root batch opens the observed profile Replies tab, reads a finite own-account window, binds only a unique matching public candidate, then runs the existing exact-parent verifier and settles the original action. Missing/ambiguous evidence stays unknown. Existing unknowns may use an explicit fresh `readCreator({timeline:'replies'})` observation, then only verify original IDs that acquire new evidence. Ordinary creator reads and successful search recovery keep their current path.

Reuse `PlatformCollections` for observed tab navigation and `collectCreatorDOM` for exact route/content collection. Add only the optional `CreatorOptions.timeline` posts/replies choice and compact selected-timeline evidence. Replies navigation must come from a unique observed same-profile tab; never fabricate a destination. A `navigate:false` request never switches tabs. The existing reply recovery lifecycle moves out of the nearly 1000-line API into `src/reply-receipt-recovery.ts`, beside the other focused task owners, retaining its original CAS, intent, content/time/identity and parent gates. This is the planned-path check: no new directory, store, registry or parallel receipt state.

Variant propagation: root typed input → platform validation/observed tab selection → DOM exact requested route → compact creator timeline evidence → existing original-action recovery. Read-cache entries already include returned creator metadata; post-content identity remains shared. Native adapters lacking creator collection continue to refuse before reading. No ledger schema migration or separate CLI operation is introduced; the matching Skill documents the root option. Delivery uses a checked local build and ordinary source push, with npm deferred to consolidated delivery.

Active acceptance ledger:

| ID | Required | Status | Observable result |
| --- | --- | --- | --- |
| RR1 | true | passed | Only the unique observed Replies tab for the exact profile can be selected; wrong/missing/ambiguous/unselected surfaces cannot be reported as Replies. |
| RR2 | true | passed | Default Posts reads remain unchanged; explicit non-navigation requires the already selected exact Replies route. |
| RR3 | true | passed | An empty fresh non-alert search gets at most one bounded own-Replies lookup for the batch; successful search and platform warnings do not trigger it. No submission is repeated. |
| RR4 | true | passed | Foreign, changed, old, ambiguous or baseline candidates cannot bind; original CAS and exact-parent verification still determine settlement. |
| RR5 | true | passed | Applicable full checks and implementation review pass; the consumer explicitly adopts the checked instance and obtains real root Replies evidence, then continues original duty. |

Design review (mode=design): passed. The new surface addresses an actual index-dependent recovery gap without changing what counts as a verified reply. The fallback is limited to empty fresh non-alert search evidence, not a bypass of a rejection; its exit is one finite lookup. Extracting the existing recovery owner removes the old implementation from API rather than adding a second binding path. No claim of full account coverage, universal recovery, daily goal completion or a measured throughput gain is permitted. Plan: not-required; one bounded repair/check/adoption batch, with operating duty still open. User-facing UI and credentials do not change; AI performs installation and validation.

Implementation review (mode=implementation): no findings after correcting duplicate selected-tab acceptance and an overbroad edit caught by typecheck. Recovery is extracted, not duplicated; original CAS/body/time/baseline/parent checks remain unchanged. Full check passed 447 tests plus types, format, maintainability, generated observations and Skill budgets. New empty-search regressions failed against the previous build, then passed; actual local adoption and live Replies selection remain pending under RR5.

Live acceptance: consumer explicitly rebound the checked module and its batch helper, then root readCreator selected the real observed Replies tab on the exact profile route and returned ten complete own posts with timeline evidence. This proves the selected-surface path; no older unknown was inferred successful. Original reply duty continues with the checked instance. RR1–RR5 passed within this repair scope; overall throughput and daily targets remain unproven. Retrospective completed: public search indexing is one evidence surface, not proof of absence; finite own-profile evidence supplements lookup while the original exact-parent verifier remains the settlement owner.
