# 慢DOM的原生只读备用

flow:bugfix，risk:L3。通过原根工厂的nativeReadFallback.getApp惰性端口，只有read/search根任务在DOM超过soft threshold时读取已授权Native快照。精确核当前Tab URL、本账号、原视图完整性；不匹配不聚焦/导航，不把不支持蓝V证据的Native人物数据作为完整结果。Native与原DOM只读结果竞争，先到的合格结果采用；慢Native迟到结果不切换实例状态，原DOM迟到结果不覆盖已选替代实例。

Native胜出后原DOM适配器被隔离为新实例，Native控件不交给DOM写入；后续业务写之前必须有新DOM观察，明确导航可先执行。写任务不启用此备用，不重试提交、不重放unknown，真实告警保留。已知DOM策略拒绝不转换Native恢复。Native被采用后同绑定只读优先Native，导航时重置；无变化的健康DOM不增加RPC。备用不可用保留原DOM读取并受总截止约束，不能假称取消底层调用。原同Tab重绑仍复用已有隔离适配器协议，不把并行纯读取误当平台重复提交。

NR1原同Tab恢复6项保持；NR2新增9项覆盖匹配Native、错页/错账号/字段不全、人物蓝V不支持、迟到Native、写根禁备用、DOM真实拒绝与Native限制保留；日志新readTransport与原根调用关联。NR3完整构建/类型/契约/格式/全量回归后部署完整不可变artifact；NR4在真实宿主用合成端口核自动切换及零提交，原执行者安全边界采用。实际平台性能改善由自然业务验证，不能用合成端口当真实关注成功。Native后台字段能力、共享前台归属不满足时保留原判断，不全量替换DOM。

## 2026-10-29: independent profile reading and lost execution contexts

A pure profile collector must use a read-only binding with its own tab and no
publishing executor. Registering a read as a durable writing execution can leave
an unknown-PID activity after a host reset, blocking all later reads. The consumer
now supplies a facade exposing only read/search/inspect methods and resolves the
canonical verified runtime instead of a separate historical profile pointer.
Existing writing bindings and their claims are unchanged; no old action or lease
is deleted to make a read proceed.

The existing `tabReadRecovery.rebind` provider also covers creator collection
when the exact `node_repl exec context not found` failure occurs. It reconnects
the same tab once and retries only the read. Policy refusals and429 are unchanged;
write roots are excluded from this collection retry. Collection keeps its own
bounds instead of another short outer timeout. Optional recovery telemetry must
not prevent the retry. Creator history retains the diagnostic and failure proof
separately from successful data-window evidence and an earlier cursor checkpoint.

Validation:1104 regular tests plus type/build/CLI/contracts/format/maintainability
checks; consumer read-only facade is tested with an existing unknown-owner lock,
unchanged ledger, no write methods and no constructor browser calls. These local
checks do not prove that all host DOM latency or natural collection throughput is
fixed. Missing data remains missing and completed windows can still be ingested.
