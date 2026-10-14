# 原帖与评论抽样点赞

用户于2026-10-14要求：调用方只选帖子，不先收集评论列表；harness 内部自动点赞原帖和评论。追加要求评论约60%抽样、时间分布优化且不过于缓慢。flow=standard，L3，plan=not-required；retrospective_state=pending。

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
| TL-05 | true | 精确提交推送、匹配Skill、可用构建/适用发布；不混入WIP | not-run |

黄金验收：绑定原台账和真实Chrome→只传观察到的帖子URL→原帖+抽样评论公开状态变为已赞→同批次恢复不重抽/不取消→回执列新增/已有/抽样跳过/未知及范围，不宣称全量。

方案Review(mode=design)：passed；复用已有点赞执行边界，新增线程遍历owner必要；未知与跨任务点击共用reactions。未知只冻结本对象，继续其它已选对象，最终回执保留unknown；平台告警停止整批。真实原帖、评论、恢复、抽样和提交间隔已核验；普通展开由定向合成边界测试覆盖，隐藏内容不保证。

## 验证与返工证据

372项完整回归、类型/CLI/公共合同与Skill示例检查通过。真实Chrome批次观察原帖+6条评论，稳定选中5条（原帖+4评论），全部公开点赞核验通过，另2条抽样跳过；恢复执行只提交剩余2条，再次执行newLikesThisCall=0并到达loaded-thread-boundary。网络轨迹每个完成对象只有一条FavoriteTweet，无UnfavoriteTweet。实际间隔1.43、1.70、1.92秒；核验/读取计入间隔。实际证明及早期试验未知保留consumer原台账，不进入公开源码。

实际边界修复：CUA只读DOM不实现compareDocumentPosition，改为单次有序DOM选择；线程窗口沿原readPosts显式放宽，普通读取仍1–5；CSS visibility:hidden的残留progressbar不得阻止稳定尾部；仅一次精确URL就绪超时只读续验。键盘按钮聚焦实际会先点击并再次激活，已移除该路径，用已观察AX索引单次激活；测试保护一intent/一click、无键盘。Unknown只冻结对象，连接/身份/平台警告冻结批次。方案与实现Review基于上述修复后版本：no findings。

复盘：浏览器缓存/定位器假设需要真实边界测试；具体发现已修原reader/activation owner并有回归。不新增全局提示词或通信规则。发布后更新TL-05和retrospective_state；发布时间进入翌日不改变本事项日期。
