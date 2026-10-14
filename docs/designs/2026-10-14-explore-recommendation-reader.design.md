# X Explore 推荐流读取器

## 问题与用户链路

评论专责需要按真实来源统计主动互关帖评论，其中一部分必须来自 X「探索」页的推荐流。当前根 API 有 `searchSources`，它会打开 `/search` 并复用帖子收集器；搜索结果不能记作探索推荐，当前公开 API 无法读取并证明探索来源。

运营执行者从已登录的 Chrome 标签页调用 `readExploreRecommendations({limit, maxPages, processedIds, mode})`。Harness 打开 X `/explore`，观察并选中明确的「为你推荐」/“For you”页签，等待帖子卡片后复用现有有界收集器。结果返回完整帖子正文、作者、时间、可见数字指标，以及绑定到 `/explore` 和已选推荐页签的 `sourceOrigin`。执行者继续用原回复合同核互关关系、热度、防重、时效和作者限次，再自行决定是否评论。

若路由、推荐页签、帖子卡片或必要字段无法确认，返回不完整/需决策结果，不附有效探索来源证明；搜索结果永不改标。整个链路不调用未配置的私有 X API，也不改写帖文或代替运营者判断准入。

## 方案与边界

- 来源读取 owner 仍是 `PlatformCollections`，根业务 API 仅暴露 `readExploreRecommendations`，DOM 导航 owner 只负责打开 `/explore`；沿用现有 `collectSources` 解析正文、扩展、分页与去重。
- 推荐页签由当前可见且 selected 的 tab 证据确认，支持精确标签「为你推荐」和“For you”。不推断其它 Explore 子页、热榜或搜索页属于推荐流。
- 帖子读取器已经采集卡片上按钮及 analytics/quotes 可见指标；来源转换必须保留可见数字指标标签供运营判断热度。卡片未显示指标时保留为未知，不能据此补值或否认来源。`ReadResult` 仅保留明确的来源枚举、已验证页面及页签，不向业务 API 泄露原始 DOM/AX 或导航控件。
- 参数沿 `WindowOptions`；保持每页最多5条、至多10页、传入ID去重。该读取是 CQS 只读操作，不新增跨调用状态。

拒绝将 `/search` 改名或把搜索结果加上探索标签，因为它会伪造来源。拒绝新建独立解析器/私有 API 路径，因为已有帖子观察与收集链路足以覆盖首个场景，新增平行解析器会重复分页和证据语义。

## 验收

1. 通过公开 `createXGrowthHarness` 调用 API：页面路由为 `/explore`，推荐 tab 可见并选中，最多读取指定数量；每条帖子保留 ID、作者、全文、时间和实际可见的数字指标（缺失时不推断），且返回可核对的 `sourceOrigin`。
2. 路由错误、tab 缺失/未能选中、页面告警或帖子证据不全时，结果不得带完整来源证明，也不得标记为 complete。
3. synthetic adapter 测试通过同一收集器覆盖分页与已处理 ID 去重；搜索 API 仍只返回搜索来源语义。DOM 与 Native 能力声明保持准确，TypeScript 根合同含新方法。

计划：not-required；实现、单测、全仓检查、本地构建和一次真实 Explorer 读取可在本维护批次闭环。发布 npm 不属于本次必需交付；运营任务使用通过检查的本地构建。
