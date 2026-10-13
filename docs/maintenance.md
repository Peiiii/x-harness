# 维护与发布节奏

2026-10-13用户明确要求：影响很小的改动先记录并积累，由执行者在合适时机集中修改，避免逐条修补和发布耗费时间。本文件拥有本仓库的延期判断、待办与发版时机；AGENTS、开发入口只链接本文件。

## 判断与执行

| 当前影响 | 处理 |
| --- | --- |
| 阻碍已授权任务；损害执行正确性、公开核验、防重、数据完整性或权限边界；必要能力缺失且无合格可用路径 | 及时修复并验证。当前消费者必须使用修复才能继续时，经适用检查和真实边界验证后可直接使用本地构建，不等待 npm；发布按下方集中交付，不用“小改动”延期必要修复。 |
| 不影响当前任务的小优化，例如措辞、诊断展示、轻微易用性或尚无显著成本的内部整理 | 在下方待办记一次，继续当前任务；不为这一项单独修改、升版本、运行发布链或更新消费者。已发现的有效证据复用，不另做大范围调查。 |
| 已完成的非紧急改动，当前消费者不依赖它 | 按适用检查精确提交并推送，标记待合并发布；源码提交不等于 npm/官网发布。纯开发规则与待办记录无需发 npm。 |

按真实影响判断，不按改动行数判断；一行防重缺陷也可必须立即修复。延期不能降低业务验收或把阻塞、错误结果记为完成。

## 集中处理与发版

在下一次相关模块开发或有明确用户价值的功能/修复发布前，顺手检查待办；同模块可合并的已到时机项一起处理、验证和发布一次。小问题重复出现、累积成本已明显影响任务时升级为当前修复。是否到了合适时机由执行者依据收益、风险与维护成本判断，不设人为条数、固定等候时间或额外定时任务，也不逐次向用户请示。

发布前只纳入已经实现、验证通过的改动，待办本身不进入版本完成声明。公开包只有运行能力/安装Skill等消费者确需更新时才升级；官网只在相关页面或公开能力需要更新时部署，不随每次源码/文档提交机械重部署。用户于2026-10-13明确：正常运营也可用经验证的本地构建；本地采用与 npm 发布分开，不要求每个小修复先发布。使用实际受检源码的构建产物、匹配 Skill 与根业务 API，复用原台账；记录源码提交/受检范围和构建位置，保护其它 WIP，不以本地可用冒充已发布。

本地采用的稳定改动在本次维护批次收尾、同模块下一次集中交付或公开消费者需要时合并发布，不能长期只留本地；若暂不能发布，在原待办写明具体阻塞与下一检查点。没有运行改动、仅规则/待办更新时不发 npm；公共依赖仍只在真实发布可用后更新。

待办仅在发现具体小问题、相关开发、发布准备或影响升级时读取/更新；普通平台动作不增加检查调用。完成后原行记录版本或提交；撤销则说明理由，不建第二份队列。

## 待办

每项保留日期、实际问题/原owner、影响与延期理由、处理触发、验证条件、状态与完成引用；缺证据不造问题。

| ID / 日期 | 问题与 owner | 影响与延期理由 | 处理触发 / 验证 | 状态 |
| --- | --- | --- | --- | --- |
| MAINT-001 / 2026-10-13 | 父仓开发入口 `x-harness-dev.mjs` 的 `deliver` 在未传 `--release` 时仍先运行 `release:build`、`test:release`，再判断是否发布 | 普通源码交付多做发布产物验证；不影响已安装运行包或当前业务，本轮仅记录 | 下次维护开发入口时将产物链限定在实际发布分支；验证普通交付仍完成适用检查/提交/推送，发布分支仍完整验证产物 | deferred，未修改代码 |
| MAINT-002 / 2026-10-13 | Fresh reply receipt candidate was lost when own-detail URL navigation timed out; owner: `src/platform-writing.ts` candidate-detail boundary | Repeated operational recovery needed extra caller reads and original-action metadata updates; active repair trigger reached | Preserve the observed candidate and reuse root batch’s existing single read-only recovery. Keep author/text/ID/time/exact-parent gates; missing receipt remains unknown; no resubmission | Published 0.2.46 and adopted by the consumer; source check 217 tests, release 4 tests, consumer 193 tests passed. Original no-link unknown correctly remains unknown on read-only recovery; live URL-timeout reproduction and overall throughput remain unproven |
| MAINT-003 / 2026-10-13 | Publication baseline refresh waits can be host-capped before article rendering; caller retries reload and restart the transition. Owner: `src/browser-dom-navigation.ts` refreshPosts | A reviewed reply was blocked before intent on two original-ID attempts; current task requires a bounded fresh baseline | Reuse existing strict public-article readiness helper, reload once, fail on changed route/alerts/non-timeout or exhausted budget | Published/adopted 0.2.47; source 222, artifact 4, consumer 193 tests passed. Previously blocked original prepared reply publicly verified in one root batch call, without a repeated intent. Overall comparative throughput unproven |
| MAINT-004 / 2026-10-13 | Creator navigation can time out despite a subsequently readable current profile. Owner: existing creator/reading readiness | Bounded `readCreator` with navigate=false provides the needed original profile evidence; no write bypass | Next related readiness bundle should absorb the bounded current-page continuation in the highest business API, with same-handle and complete-context gates | deferred; no standalone release for this optional optimization |
| MAINT-005 / 2026-10-13 | Explicit keyboard activation can be overridden by the native submit bridge; submitted-editor hidden wait can be host-capped before its original budget. Owner: `src/browser-dom-submission.ts` | Repeated failures in both requested modes now block reliable new submission/receipt flow; trigger upgraded from deferred | Honor explicit keyboard; resume only read-only wait within ten seconds with unchanged account/page/draft/parent and clear alerts. Public receipt gates remain intact; old unknowns never resubmit | Published 0.2.54: rebased source 243 tests, artifact 4, consumer 193 passed. Correction: the published 0.2.57 artifact lacks this fix (native branch still overrides keyboard and the wait remains a single host-capped call). Current reply executor reuses the already installed/published 0.2.54 root API; shared default dependency stays untouched. Source main has the fix for the next normal bundle; do not claim newer version alone proves retention. Live earlier new replies 2109956574324343161 and 2109956977879392746 verified author/text/time/exact parent, but were run on 0.2.57 and do not prove this fix. After selecting 0.2.54 explicitly, new keyboard reply 2109965951110381577 verified author/text/time/exact parent; another new action remains unknown, never resubmit. This proves these live paths, not universal reliability or 3x efficiency. |
| MAINT-006 / 2026-10-13 | Two likes on replies to our own replies remained unliked on fresh observation; batch resumes also report a previously verified new like as preexisting. Owner: reaction execution and batch receipt aggregation | Normal direct incoming likes have verified; freeze the specific unknown targets and retain each first verified receipt for counting. No explicit platform refusal was observed, and a platform-wide restriction is unproven | Next related reaction maintenance: verify exact nested target selection and durable liked state without retrying an unknown click; retain first-success evidence across waiting/resume. Test wrong target/actor, absent liked state and stable new-like accounting | deferred; preserve truthful unknowns and first receipts, no standalone release |
| MAINT-007 / 2026-10-13 | Quote preview initial two-second attachments/tweetText wait timed out before submission; owner: src/browser-dom-editing.ts handleOpenQuoteComposer | NEWS05 original slot expired before recovery; no currently executable publish remains blocked, so accumulate instead of releasing for this expired task | Next related readiness bundle: bounded continuation with exact original source/article, one quote opening, same-page/identity/preview gates, no duplicate submit. Test delayed preview, wrong source and exhausted budget. Formal 0.2.57 independently read the exact source and later returned the bound source ID with empty composer; this disproves a permanent broadcast-layout limitation but does not prove public quote verification | deferred; zero submission and no new unknown. No code or package change |
| FOLLOW-PROFILE-REOPEN / 2026-10-13 | 人物页面停在错误视图，等待目标控件不能恢复；owner: `src/browser-dom-navigation.ts` | 重复影响真实批量关注，已升级为当前修复；不为每个恢复细节单独发版 | 原页/无告警下只重新打开同一已观察路径一次，不重复关注点击；证明批量自动接续、错误/改页/告警仍停止 | 本地源码274测试及类型/维护性检查通过，覆盖当前主页不完整的快路径；已提交待真实批量采用，下一稳定维护批次集中发布，不长期仅留本地 |

| MAINT-002 / 2026-10-13 | 显式执行者局部读取失败此前被当全局写入不可做；growth执行准入与CAS intent拥有 | 已修且本地采用，保留账号级拒绝、真实告警、共享容量与受影响执行者原标记；不为这项单独发npm | 下次growth核心集中交付纳入；280测试与同ID真实准入已验证，公开结果仍unknown不重发 | implemented/local，源码12294db；待集中发布，公共依赖不变 |
