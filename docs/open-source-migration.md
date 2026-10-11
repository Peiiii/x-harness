# X Harness：独立开源仓库与 class 重构方案

## 有效要求与最终组织

用户要求：TS npm 包；顶层任务 API 完整且无冗余步骤；非必要不调用下一层；节省输入/输出 token；实现可维护、文件不超过 1000 行且有硬门；采用真实 class 组织；独立开源仓库、严格于 MIT 的协议、官网及可更新 Skill、安装 AI 驱动开发体系。2026-10-12 用户明确取消 submodule，最终采用两个完全独立的 Git 仓库。

- 独立源码：`<harness-repository>`，公开 `Peiiii/x-harness`，AGPL-3.0-only。
- 私有内容仓库：运行只依赖固定版本 `@nextclaw/x-harness`；没有嵌套 Git、Gitlink、submodule 或运行时开发源码依赖。
- 内容上下文读取器：私有 `packages/x-harness-context`。运营合同、账号台账、证明和帖子仍由原路径拥有，不发布。
- 父仓开发流程：`scripts/x-harness-dev.mjs` 可直接维护独立源码仓库。常规使用不需要克隆、读源码或调用开发入口。

## 顶层 API 与最少步骤

根运行导出保持 `createXGrowthHarness`；构造时传入已登录的 tab 或 app、原 ledgerPath/proofDirectory，构造不触发浏览器读取。返回 `BusinessHarness` 的任务接口：

| 任务 | 顶层方法 |
| --- | --- |
| 创作者、书签、搜索 | readCreator、readBookmarks、searchSources |
| 帖子、账号、反馈 | readPost、readPerson、readFeedback、inspectAccount |
| 原帖、回复 | publishPost、replyToPost |
| 关注 | followOne、followBatch |
| 整轮与状态 | runGrowthRound、inspectRound |
| 未知提交恢复 | verifySubmission、verifyPublishedPost、verifyFollow |

顶层调用拥有能力检查、已审意图、提交、核验和结算。一次可完成的任务不拆成用户手动 preflight/导航/写入/刷新/verify；已 verified 不重复核验。UNKNOWN 先核验同一动作，不能重新提交。低层只从 diagnostics 在确有缺能力、错误定位或维护时使用。

默认 receipt 返回状态、ID、必要计数、缺口和证据引用；decision 白名单输出当前任务完整相关证据；delta 利用实例缓存返回变化与 unchangedIds。过滤 DOM/AX、导航、无关控件与未知扩展字段；目标正文不截断，警告保留。完整错误和观察留本地证明，公共回执返回稳定诊断与恢复入口。Skill 按当前任务渐进加载；正常运行不读取实现或声明文件。

## Class 的职责边界

- BusinessHarness：统一任务接口、回执投影、读取缓存和错误边界，实现 XGrowthHarness。
- GrowthHarness 及 policy/state/execution/round/batch/recovery 等 owner：依赖构造注入，管理原台账及执行生命周期；状态不抬升为全局。
- XPlatform 与 observation/targets/collections/writing/capabilities：隔离平台证据与写入动作。
- DOMXBrowser、NativeXBrowser、AXHarness、SerializedBrowser：实例持有当前观察、编辑绑定与互斥状态；内部读取方法与串行外部端口分开，避免重入。
- FileRoundStore：原台账、CAS/锁与证明路径的唯一 owner，实现 RoundStore。
- XHarnessCLI：安装、更新、版本化模块位置和工作区初始化。

有状态行为在真实方法体内，不用 class 包一层原 closure；构造函数接收窄依赖，私有属性持有实例状态。对现有调用方保留薄 factory；公共方法取出后仍绑定原实例。纯计算、一次性投影和需要序列化到浏览器的程序保留函数。REPL 原生短调用的序列化闭包必须包含 AXHarness class 及实际解析依赖。

## 仓库内容与 AI 开发体系

独立仓库拥有 src/、test/、release/、skill/、site/、scripts/ 与 npm 元信息；LICENSE 为 AGPL-3.0-only，发布包附 exact commit 的 SOURCE.md。不带原私有 Git 历史、运营台账、真实浏览器证明和凭据。

`npm ci && npm run bootstrap` 通过官方 Qingtian 安装/检查共享 AI 开发体系并启用 staged hook。上游受管规则保留本地忽略，由官方升级入口更新，不重新许可或复制为本仓规则。AGENTS 记录项目授权与 class/维护合同。

硬门：文件 <=1000 行、源码函数自身逻辑 <=150 行、运行时无依赖环、有状态 factory 不保留 closure 模型。check/build/prepack/release/staged hook 复用检查；发布从一个已提交 revision 构建，普通 npm pack 拒绝混入运行源码 WIP。严格 AGPL 保留开源对应源码义务，不增设非商业限制。

## 开发与交付流程

父仓入口提供 bootstrap、check、deliver。deliver 接受显式文件清单，先验证独立仓，精确提交；发布产物验证后普通推送源仓。带 --release 时发布 npm、Skill 与官网，再把父仓依赖和锁文件更新到公开版本，运行父仓回归，精确提交普通推送。没有源码变化不制造空提交；其他 staged/worktree WIP 分别保留，不代为发布。

原文件/索引/工作区在迁移前分别备份。原源码 WIP 转入独立仓，原内容 WIP 留父仓。旧 context 与兼容入口只迁移 owner，不复制台账状态。没有独立仓或凭据时只报告实际缺口，不能伪造发布。

## 验收标准

- OX01：公开独立仓、AGPL、无私有历史/凭据/台账。
- OX02：两个独立 Git 仓库；父仓通过 npm 运行；原 staged/worktree WIP 保留。
- OX03：npm/Skill/官网版本、源码地址与许可一致；实际公开下载和安装。
- OX04：新 clone 可通过 npm ci/bootstrap/check；AI 体系检查通过。
- OX05：独立类型、声明、行为、安装/更新测试；1001 行 staged/build 反例失败。
- OX06：父仓整链路回归通过；真实 registry 更新保留工作区/台账字节、刷新同进程 root/child 模块。
- OX07：两仓精确普通推送，fresh fetch 主线一致；父仓版本与实际安装相符。
- OX08：实例隔离、方法绑定、异常解锁、构造无浏览器 I/O、单次提交及 REPL class 序列化通过。

风险 L4；standard。design-review: passed。TypeScript、AGPL 与两个独立仓由用户明确选择；npm 版本边界隔离开发与运行，父仓开发入口有实际维护调用者。验证与复盘见任务原项目记录和验证文件，测试不冒充新的 X 外部运营结果。
