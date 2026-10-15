# 原帖与评论抽样点赞

用户于2026-10-14要求：调用方只选帖子，不先收集评论列表；harness 内部自动点赞原帖和评论。追加要求评论约60%抽样、时间分布优化且不过于缓慢。flow=standard，L3，plan=not-required；retrospective_state=completed。

## 主链路与边界

根 API `likePostAndComments({url,batchId?,sampleRate?,maxLikes?,maxPages?,timeBudgetMs?})`；无需传作者或评论列表。原帖总是候选；评论默认0.6稳定抽样。原台账 `threadLikeBatches` 拥有扫描与抽样，既有 `reactions` 拥有唯一点击intent及核验状态。批次绑定URL/账号/抽样配置；同批次同帖子不重抽，不同批次不重复点击已有intent/unknown。

复用真实Chrome DOM reader、openObserved、唯一文章定位、likePost及原store；实际提交由原AX harness对精确帖子按钮单次激活，避免locator键盘聚焦隐含点击，增加定向thread语义视图；原帖上方祖先、侧栏、推荐区、广告不进入候选。普通Show replies/Show more replies展开；隐藏/不可达内容不保证覆盖。分页稳定尾部只表示当前已加载范围，scopeComplete永远false。原帖在每次恢复打开后必须实际观察确认，再允许虚拟化窗口接续；页面/身份/告警异常停。

用户追加纠正30秒、3–6秒都太慢，明确1–2秒：本接口每次新intent距账号最近回复/点赞1秒，另加0–1秒负载平滑间隔（旧收到互动/回复接口不在本次改动范围）；不模拟人类、不绕过检测。等待在harness内部，预算不足返回resumeAt/原批次，夜间00–07停止，不增加逐条模型调用。单次有界默认20个新点赞、40次分页、120秒预算，允许提高到100个、200页、10分钟；达到界限明确checkpoint不称全量完成。X规则禁止自动点赞：https://help.x.com/en/rules-and-policies/x-automation；随机选择或节奏不改变这一规则。

## 活跃验收合同 THREAD-LIKES-v1

parent-goal：仅URL输入即可由harness遍历并抽样点赞原帖/评论，持久防重与节奏，给出可用入口与验证证据。

| ID | Required | 标准 | 状态/证据 |
| --- | --- | --- | --- |
| TL-01 | true | URL根API内部发现原帖与评论，60%稳定选择，分页/普通展开；排除祖先/推荐 | passed；下方验证 |
| TL-02 | true | 已赞不取消，未知不再提交，并发intent保守防重，恢复不重抽 | passed；下方验证 |
| TL-03 | true | 间隔1–2秒、核验读取计入间隔、预算/夜间/告警停止；单调用内执行 | passed；下方验证 |
| TL-04 | true | 类型、行为、真实浏览器边界验证，紧凑结果区分checkpoint和实际已加载范围 | passed；下方验证 |
| TL-05 | true | 精确提交推送、匹配Skill、可用构建/适用发布；不混入WIP | passed；0.2.71 npm精确归档验证、标准安装匹配Skill/runtime、consumer检查191 passed/1 skipped |

黄金验收：绑定原台账和真实Chrome→只传观察到的帖子URL→原帖+抽样评论公开状态变为已赞→同批次恢复不重抽/不取消→回执列新增/已有/抽样跳过/未知及范围，不宣称全量。

方案Review(mode=design)：passed；复用已有点赞执行边界，新增线程遍历owner必要；未知与跨任务点击共用reactions。未知只冻结本对象，继续其它已选对象，最终回执保留unknown；平台告警停止整批。真实原帖、评论、恢复、抽样和提交间隔已核验；普通展开由定向合成边界测试覆盖，隐藏内容不保证。

## 验证与返工证据

388项完整回归、类型/CLI/公共合同与Skill示例检查通过。真实Chrome批次观察原帖+6条评论，稳定选中5条（原帖+4评论），全部公开点赞核验通过，另2条抽样跳过；恢复执行只提交剩余2条，再次执行newLikesThisCall=0并到达loaded-thread-boundary。网络轨迹每个完成对象只有一条FavoriteTweet，无UnfavoriteTweet。实际间隔1.43、1.70、1.92秒；核验/读取计入间隔。实际证明及早期试验未知保留consumer原台账，不进入公开源码。

实际边界修复：CUA只读DOM不实现compareDocumentPosition，改为单次有序DOM选择；线程窗口沿原readPosts显式放宽，普通读取仍1–5；CSS visibility:hidden的残留progressbar不得阻止稳定尾部；仅一次精确URL就绪超时只读续验。键盘按钮聚焦实际会先点击并再次激活，已移除该路径，用已观察AX索引单次激活；测试保护一intent/一click、无键盘。Unknown只冻结对象，连接/身份/平台警告冻结批次。方案与实现Review基于上述修复后版本：no findings。

复盘：浏览器缓存/定位器假设需要真实边界测试；具体发现已修原reader/activation owner并有回归。不新增全局提示词或通信规则。已发布并安装0.2.71，registry gitHead=01f48cbd22e19f3ea3ff7bfa909119ba2d36fe0c；发布时间进入翌日不改变本事项日期。


## 2026-10-15：截断 AX 链接造成线程点赞中断

flow=bugfix，risk=L2，retrospective_state=pending。现有 DOM 观察拥有完整目标ID、作者、正文和唯一点赞按钮；其后的原生辅助信息在渲染较多卡片时会把 permalink Value 截为省略号，原 AX parser 正确拒绝认作完整ID，导致无 intent 的 prepared 对象反复中断。真实诊断保留消费者原证明，不进入公开仓库。

修复使用现有 DOMEditing.likePost 的唯一按钮 click，一次 beforeSubmit/一次 click；线程平台层仍先核账号、精确URL、根线程归属、完整目标ID和作者，DOMEditing仍核唯一文章与按钮，并fresh观察已赞状态。删除冗余 ThreadLikeActivation 路径及其专属测试，扩展原 DOM 浏览器边界测试覆盖线程上下文、禁止键盘/AX调用、已赞与wrong-target零点击。未知反应继续冻结，批次、抽样和状态合同不变。无需新公共API、配置或持久字段。不尝试从截断URL推测完整ID。

方案Review(mode=design)：passed。与扩展 AX 前缀绑定/再读恢复相比，复用已有完整 DOM 控件路径减少一套身份推断和额外读取；只改变提交激活实现，不删除平台或公开已赞验证门。Required：原线程上下文单intent/单click；错误目标/告警不提交；既有未知防重/分页/节奏回归；完整check；真实原批次恢复及再次恢复不取消已赞。未验证前不宣称采用或修复完成。


修前线程 DOM 边界测试在旧激活路径因缺少 AX 能力失败；修后同一边界与线程状态测试15项通过。完整check416项通过（移除2项旧AX专属测试，新增1项线程DOM拒绝测试），含类型、CLI/公开合同、格式、维护性及Skill检查。实现Review(mode=implementation)：no findings；diff-only人工核原精确DOM目标、线程归属/作者/账号门未删除，项目维护性入口已通过。真实采用待原批次复测，不以本地检查冒充已采用或总体效率达标。


真实验证返工：DOM click 方案未通过。原批次新点击后的公开已赞状态未持久确认，新增12个unknown，保持原ID冻结，不再点击；不将单元测试通过当真实激活成功。撤回DOM路径改动，先恢复原单次AX激活，原根任务继续用最后受检构建。原方案Review/采用结论对该路径撤销，retrospective_state=pending。

修订方案Review(mode=design)：passed，范围仅原NativeLikeActivation。保留新鲜DOM的完整ID/作者/正文作为目标输入；一次完整新鲜AX观察在内存按既有parser分页，完整ID路径照旧。仅在native URL明确被省略且ID不可解析时，用同一原始container内的完整正文、准确作者URL和至少12位观察到的ID前缀联合绑定，必须在整份AX中唯一；不补造完整AX ID。直接对该新鲜快照中的唯一like按钮执行一次AX click，随后观察状态，仍由原DOM/反应owner核持久已赞。前缀相同/正文相同多候选、正文缺失、错作者/路由、告警/残缺快照一律不达intent；原完整ID出现但不符不得fallback。原根平台ID/账号/线程检查不变。验证首先限制1个新点赞，真实通过再扩大，避免把未通过的激活试验扩成批量。


修订验证：完整check419项通过，含截断/完整链接、重复候选、正文/作者/前缀/路由/告警拒绝及原未知冻结。保存的真实失败快照与原完整DOM对象在消费者侧离线回放：唯一绑定一次模拟intent/AX index，native帖子ID仍为null，没有伪造ID、没有平台写入。真实原批次恢复取得新已赞核验，另一批次单成功上限验证新增1个已赞且无新未知；同时真实运行另有1个点击后未确认，保留未知，不声称普遍消除了点赞未知。原截断绑定故障已有回归与边界回放覆盖；先前DOM试验12个未知也全部冻结，不重发/重点击。

实现Review(mode=implementation)：no findings；复用原parser、原平台身份/线程门和反应store，完整ID路径不转前缀fallback，只有准确作者+完整正文+至少12位省略前缀且整份AX唯一才绑定；不改变样例为合成源的事实或未知结果。项目完整维护性/类型/格式/合同与测试通过。retrospective_state=completed；复盘增量：原生UI字符串会截断而DOM完整，跨表面应绑定已有完整对象与唯一可见控件，不用截断值冒充完整ID；激活替换必须先限制真实试验，单元click计数不能证明宿主的持久切换。当前消费者采用受检本地构建，公开npm版本未变；运营全天目标仍归原合同，不因修复完成关闭。


## 2026-10-15：普通来话点赞复用同一原生激活

flow=bugfix，risk=L2，retrospective_state=pending。连续普通来话点赞公开状态未确认；普通分支仍使用已在真实线程试验失败的locator.click，而线程原生单次激活已有真实持久已赞证明。具体宿主为何未确认尚不泛化为双击根因；所有旧unknown冻结，不用修复重点击。

修订方案Review(mode=design)：passed。DOMEditing.likePost统一使用当前原生单次激活类；平台层和DOM精确文章/按钮、账号、作者、原intent、fresh已赞门不变。将现有内部thread-like-activation模块/测试改名为like-activation（NativeLikeActivation），对应当前两种实际调用，删除普通分支单独locator点击；不新增第二入口、公共API、状态字段或依赖。现有src/test组织允许同级职责名调整，无单独planned-path脚本。Required：普通与线程同一单intent/单原生click、零locator click/键盘，已赞不提交、错目标/作者/路由/告警和模糊截断仍拒绝；完整check；不同新来话真实原批次持久已赞及恢复不取消，旧未知不重试。


普通路径验证：修前组装边界普通点赞触发不允许的locator activation，线程原生路径通过；修后两分支均单intent/单AX click、零locator click/keyboard。完整check429项通过。真实普通来话原批次首次目标已为preexisting，未当新成功；另一条新来话公开已赞核验verified，约1秒，证明该普通激活路径，不证明所有来话点赞或总体3倍效率。既有普通/线程unknown全部保留冻结。

实现Review(mode=implementation)：no findings；当前所有点赞只经过同一内部NativeLikeActivation，原精确DOM/原生唯一绑定、根平台账号/作者/线程及原反应幂等门保留。retrospective_state=completed；复盘增量：同类toggle的宿主激活应由同一owner拥有，避免普通与线程分支使用不同且已实证不可靠的激活路径。源码按维护批次提交推送，本地采用，不单独发布npm；运营继续。

## 2026-10-15：单目标原生回读失败不扩大中断

flow=bugfix，risk=L2，plan=not-required，retrospective_state=pending。两条真实线程均在一次intent之后抛出`like-native-target-unconfirmed`，原反应已正确保存unknown，但`one`的统一halt让其它已选prepared项中断；具体账号/对象与证明留消费者原台账。原非异常unknown已支持继续其它对象，本修复收敛到同一语义，不替换原生激活、不再试未知点击。

冻结方案：仅已保存intent的上述精确错误，可做一次原`readThreadLikeWindow(reset:false)`只读恢复。必须鲜核原完整线程URL、threadConfirmed、同账号、无告警/残缺，仍在原时段/预算内，才让原unknown保持冻结并继续其它selected对象；原beforeSubmit/CAS及各对象DOM/AX/公开已赞门照旧。intent前失败、一般transport、平台拒绝或恢复缺证继续停批。原store保存恢复观察与原对象引用，无新API/状态/依赖/文件，不加外层模型循环。页面稳定尾部仍只代表有限范围，unknown不计成功。

方案Review(mode=design)：passed。黄金链路：原线程一次已审点击→原生回读单目标失配→原对象unknown→一次鲜读完整原线程→其它独立selected项单次提交/核验→原unknown不重点击。Required LC1：同一回归修前只处理首项，修后其它项核验且原未知冻结；LC2：intent前/transport/错页/错账号/告警/缺线程/预算及夜间不放行后续写入；LC3：完整检查及实现Review、显式本地采用并接续原真实批次。下一相关维护集中发布，不单独发npm。当前运营与全天目标仍未完成。

LC1/LC2本地通过：修前同一已intent原生回读异常回归，其它已选项核验0；修后4项核验且原unknown不重点击。错页/账号/告警/残缺/缺线程、intent前错误、一般transport、预算及跨午夜均不继续写入。完整check459项、类型/格式/维护性/Skill预算通过。实现Review(mode=implementation)：no findings；仅原one异常边界增加一次鲜读判定，原intent、激活、时间/身份/线程和公开已赞接受条件未改。LC3真实本地采用待验证，未宣称剩余点赞已完成。

真实LC3返工（revision 2）：原批次恢复在其它prepared目标的intent之前也复现同一精确native错误，零新提交，不能把第一修订当成整个路径已修复。新增已冻结分支：intent前同一精确错误也只在一次鲜读原线程通过后，CAS确认本batch entry仍prepared、账号未变且该post无任何全局reaction，才将该entry记skipped并写明确原因/证明；不创建reaction、不当作preexisting/已赞，继续其它selected项。账号/告警/线程缺证或CAS不通过仍停；原有intent/unknown不进入此skip分支、不重点击。最终回执若只有此类selected跳过也必须needsDecision而非成功。修订方案Review(mode=design)：passed，新增分支有实际零intent边界证据，权限与公开已赞门不变。LC1–LC3对修订范围重新验证，运营仍继续。

修订2本地验证：完整check464项通过；新增intent前单项明确skip后其余4项核验，且不写全局reaction、不计preexisting，原批次再次运行不重试该skip。鲜证错误/告警仍停，CAS遇到并发reaction或账号变更不skip、不覆盖。实现Review(mode=implementation)：no findings；状态归原entry，未引入第二台账，原unknown与公共已赞门保持。真实原批次接续仍待验证，不能据此关闭运营任务。

LC3真实采用：消费者显式重绑完整受检构建后，在原两条线程新增8个公开已赞核验。有限已加载范围内prepared归零；10个unknown保持原intent冻结，22个无intent且原生目标缺证的selected对象明确skipped，均未当成功或preexisting。保存的六个代表恢复观察均为原完整URL、原账号、threadConfirmed=true、无告警/残缺；未由调用方重点击未知。线程仍scopeComplete=false，达到页/时间预算返回checkpoint，不声称全量隐藏评论已完成。初版真实缺口与返工证据保留；实际点赞能力仍有目标无法绑定，后续相关稳定维护再集中发布。LC1–LC3在该隔离/继续范围passed，retrospective_state=completed。

复盘增量：单目标错误必须先按是否已有intent区分；有intent保持unknown，无intent只有CAS证实没有任何reaction才可明确跳过。继续其它对象须有一次新的原线程/账号/无告警证明，不能将“其它任务继续”泛化为忽略平台状态。测试与真实采用分开，部分未核验不扩大为全局停工，也不当作成功补数。

## Explicit executor windows

Thread likes, received-comment likes and reply discovery must share the original GrowthPolicy executor permit validator. Keep the default 07h gate for consumers without a permit; an evidenced matching reply/follow permit can open the caller's actual window. Discovery accepts only its reply executor. Read the saved state at continuation and check again immediately before write intent; expiry/midnight has zero new reads or clicks. Do not change sampling, pacing, intent freezing, author exclusion or public verification.

Acceptance: default early refusal; matching 06h permit succeeds; wrong executor/kind, absent proof, future start and expired permits refuse; expiry during submission prevents intent. Existing normal-hour, unknown and pacing tests remain applicable. Real consumer adoption is separately evidenced by the consumer ledger, never by test counts.

## Independent pacing anchors

Normal replies and received-comment likes retain their shared 30-second interval, measured from normal reply/like intents. Thread reactions carry their own threadBatchId and use the existing 1–2-second lane; their continuing timestamps must not renew a normal reply/like wait forever. Reuse one normal-interaction timestamp calculation in reply admission and both incoming-like checks. Do not change thread pacing, account serialization, unknown freezing, authorization windows or refusal handling.

Acceptance: a recent thread reaction does not block the normal task; a recent ordinary reaction still returns the same exact 30-second resumeAt; ordinary reply intents (including unknown) remain anchors. Run the assembled reply/like boundaries and existing thread/window/pacing tests, then resume the consumer's original prepared action. A test pass is not real publication proof.
