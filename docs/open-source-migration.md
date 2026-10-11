# X Harness 独立开源仓库迁移

有效范围：用户 2026-10-11 授权独立附属仓库、直接开源、采用比 MIT 严格的协议、安装共享 AI 驱动开发体系，并一次性交付。flow standard / risk L4 / retrospective pending。实际开始 23:32；复用既有发布与重构证据。

决策：创建 Peiiii/x-harness 公共仓库，采用 AGPL-3.0-only；以 Git submodule 挂在 packages/x-harness，根 package 名称统一为 @nextclaw/x-harness，发布 0.2.0。日常用户仍仅 npx setup/update + Skill + 一次顶层任务调用。AGPL 允许商业使用，强化修改版分发及网络服务的源码义务，不承诺禁止商业使用。历史从选定源码的干净初始提交开始，原私有仓库与原 0.1.x 许可不改变。

独立 owner：通用 src（不含 context）、tests、CLI、Skill、官网、维护脚本、发布构建及公开文档归新仓库。内容工作区定位、账号/合同接续与 CLI 留在私有 packages/x-harness-context；原 scripts 只使用具名公共入口/必要诊断入口。父仓库锁定子仓库 commit，无同步业务副本。共享 AI 体系由 Qingtian 官方安装器接入并核验，上游受管副本本地安装、忽略入 Git，bootstrap 可重建；项目 AGENTS 自有段落明确 owner、1000行门、验证及全托管主线。避免把上游未声明许可的开发体系整体再许可公开。

并发保护：发布从已提交源迁移；切换目录前重新捕获 HEAD/index/worktree 与未跟踪文件，原内容保存本地备份。未提交业务改动与原暂存意图迁到子仓库工作区，项目 context 改动归私有适配包；只公开经过验证的提交版本。父仓库提交本次路径迁移和 gitlink，保留其它内容/台账 WIP。凭据只引用既有本机发布配置，不写入新仓库。

维护机制：1000行、函数自身逻辑150行、运行时依赖循环门留在源码 owner，check/build/prepack/release/staged hook 共用规则；父仓库保留兼容脚本及私有适配检查。一个同步命令提交推送指定子仓库路径、更新父仓库指针；失败不发布悬空 gitlink，不自动加入无关 WIP。npm 与官网由新仓库构建，仓库/许可链接完整；保留可更新的稳定 CLI 与版本化模块路径。

验收：OX01 公共独立仓库/AGPL/干净历史；OX02 子模块单 owner、父链路与 WIP保留；OX03 0.2.0 npm与官网同版开源说明；OX04 AI体系安装检查与fresh clone bootstrap；OX05 独立类型/测试/规模门及负例；OX06 父原回归与真实npm升级（配置/台账字节不变、缓存刷新）；OX07 两仓精确普通提交推送并fresh对齐。真实浏览器宿主证据复用窗口内原版本，关闭窗口后不新操作X；本任务不再发布宣传帖子。

黄金链路：fresh clone独立仓库→bootstrap→check/build；父clone递归子模块→pnpm install→x:check/原context resume；公开npm旧用户update→同版Skill/versioned module→原workspace字节不变。Design Review passed：用户要求均映射、状态与源码owner明确，项目专用能力不外泄、不为开源增加日常用户步骤。plan required，以上顺序直接实施，原发布项目承接状态，不建立新并行台账。

追加有效要求：用户明确拆仓后采用 class、按 Python 式实例模型组织，不接受仅把函数塞进 class 的表面包装。保留 TS：业务 facade、Growth/Platform/DOM/AX owner 改为有构造函数、私有实例字段、具名实例方法的 class；方法拥有实际逻辑。兼容 factory 仅 new class，公开方法在构造阶段绑定以保持现有回调/spread 合同，私有字段不进入 public projection；纯计算与浏览器序列化程序维持函数。验收 OX08：业务主体 class 落地、实例隔离、回调绑定、声明/已有 API 与行为/调用次数保持、并行与 unknown 不重发；构造函数只初始化状态和依赖，不触发网页 I/O。设计 Review 追加通过，原不变量与规模门继续有效。
