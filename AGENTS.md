# X Harness 开发约定

- 通用 TypeScript harness、CLI、Skill、官网与测试的唯一源码 owner 在本仓库；业务以 class 的构造函数、实例状态与方法组织，纯计算/可序列化浏览器程序可保留函数。根任务 API 保持稳定、最少步骤与紧凑结果，正常用户不读源码。
- 文件 <=1000 行、函数自身逻辑 <=150 行、运行时依赖无循环。提交、check、build/prepack、release 都执行硬门。
- 不保存或提交真实账号、运营台账、真实浏览器证明、凭据与本机绝对路径；自己的测试数据必须人工合成。源码协议 AGPL-3.0-only，保持版权/许可及对应源码链接。
- 用户已授权 AI 全托管维护本仓库：完成适用类型/测试/Review 后精确提交并普通推送 origin/main，发布适用 npm/官网，无需重复许可。保护其他 WIP，不强推、不提交未验证内容。
- 用户于2026-10-13要求：不影响当前任务的小改动先记录、积累后集中处理，不逐条修改或发版。开发与发布先按[维护与发布节奏](docs/maintenance.md)判断；提交推送与 npm/官网发布分开，记录待办不升级版本。
- Skill 唯一源码 skill/，安装副本由 CLI 管理；开发体系只由 Qingtian 官方安装/升级，受管副本本地忽略，不手改。

<!-- ai-development-system:start -->
## 共享 AI 开发体系

- 开始开发决策前先读取当前项目的目标、约束与权威事实；项目 `AGENTS.md` 承载项目规则和授权。
- 普通开发从 `.agents/skills/development-lifecycle/SKILL.md` 进入，由它选择流程与当前阶段，命名流程入口见 `.agents/workflows/README.md`（含大型交付）；明确只要调查、设计、验证或 Review 时只完成该范围。
- 用户要求打开、启动或查看擎天 / AI 开发体系大盘时，读取 `.agents/wiki/skills/tools/qingtian-dashboard/SKILL.md` 并执行到当前项目可用的入口；单纯讨论设计不启动。
- 修改项目 AI 规则、Skill 拓扑或开发体系时，按需读取 `.agents/wiki/skills/process/agent-instructions-governance/SKILL.md`；先找现有 owner，再做最小、可验证的改动。
- 只读取当前阶段和当前判断需要的 reference；不把整个 Skill 库、历史记录或项目知识一次性载入。
- 保护用户和其它任务的工作区改动。未经用户明确授权或当前项目已有可核对的明确授权，不提交、推送、建 PR、发布或部署。
- 先找事实、状态和行为的权威 owner；复用或修正已有路径，避免复制规则、平行状态与无收益的适配层。
- 修复异常先定义可观察判定条件，再沿真实触发或最近边界验证。修改 TypeScript 类型、导入、导出或运行链路时运行适用范围的类型检查。
- 源码验证后按项目检查入口完成 diff-only 可维护性检查和实现 Review；有 finding 时修正并重验受影响证据。
- 收尾核对最小完整结果、有效证据、用户可用入口和未验证边界；复盘只沉淀有可复用增量的事实或方法。
- 上游管理的 Skill 由 `ai-development-system` 仓库维护；项目专项规则留在本项目。升级通过同步工具审查差异，不直接覆盖受管文件。
<!-- ai-development-system:end -->
