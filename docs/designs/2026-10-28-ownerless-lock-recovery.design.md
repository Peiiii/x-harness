# 已核验宿主上下文的遗留锁恢复

flow:bugfix，risk:L3。沿原FileRoundStore与原recovery guard，不引入第二份台账、锁龄自动抢占或新派单层。上游同批0a27a1e已加入token/storeId/owner/usageTrace和保存/清理的持有权检查，本修复在其上合并，不覆盖它。

当前宿主可能无真实PID；原recover只允许实体PID已退出，因此隔离核超时后旧null-owner锁永久阻塞。新增可选verifyExclusiveRecovery宿主端口：仅owner无法用PID验证时，在原独占recovery guard内取得原上下文已终止或所有注册写入者已停稳的可信证明。证明须绑定原锁SHA、原台账revision及存在的证据文件；known live PID仍不能覆盖。核心在证明前后核原锁、台账和recovery token，变化则拒绝；保存未知状态，不重放平台动作。无端口默认仍拒绝null-owner，不因年龄解锁。执行者保持停稳直到同原锁hash的释放证明；这是故障恢复证据，不是新运营审批。

恢复guard也有token，finally只清自己；close失败仍尝试清自己token，旧writer不能删除替换锁。宿主端口是可信依赖，SDK不能仅凭调用方布尔值证明宿主生命周期；项目必须核全量原写入者/原上下文证据，不得用时间静止代替。不会宣称文件token检查等于跨文件原子fencing，活owner严禁移除。

LR1: token/usage归属与替换后保存/清理沿原4项检查；LR2: 11项新恢复验证覆盖无owner默认拒绝、可信静止证明、活PID不可覆盖/死PID可恢复、错锁/错revision/缺证明/recovery guard变化/原锁替换及非对象损坏锁；LR3: full check含类型/契约/格式/维护门通过后交付。LR4: 消费者旧锁在三个原写入者安全边界停稳、原宿主明确kernel reset后恢复，原台账前后逐字节hash相同，新锁token/真实PID创建释放已核，原unknown没有改写。真实证明只在消费者私有目录，不进入本仓库。

运行边界：无宿主死亡/完整停稳证据时仍保留锁，继续独立工作；不可抢锁、强停或重发未知。后续一般调用采用同一新构建，已发布运行绑定按安全边界更新。当前代码不承诺宿主内部DOM延迟或所有外部失败已解决。
