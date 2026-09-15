# 业务事件待处理记录积压排查（2026-09-15）

## 结论

用户截图 6804 条属实。02:23:25 北京时间只读查询精确复核 6804，全部 PENDING、attempts=0、last_error_code/locked_at 均为空。02:24:12 最终快照为 6805，增量为一条 AUTH_REFRESH_TOKEN_ROTATED。最早记录 2026-09-09 14:57:29 北京时间；均已到 available_at，没有未来定时事件。

根因是 Outbox 业务事件持续写入，而应用没有接入实际消费者。OutboxService.append 将事件写为 PENDING；claimBatch、markProcessed、markFailed 仅提供基础设施接口。源代码调用搜索仅发现测试调用，没有运行期消费者；线上已部署 /app/dist 下 JS 扫描未发现这些消费接口的调用。线上 Docker 只有 backend 和 portal，相关 systemd 服务仅发现静态发布恢复服务。运行数据 attempts 全为 0 与代码一致，未呈现处理失败重试或锁住的特征。

指标统计整个数据库所有 PENDING/FAILED outbox_events，没有按当前组织过滤。因此显示全库业务事件，并非当前学校待发送通知条数。health.service.ts:77 的状态 UP 仅表示 count 查询成功；admin-overview.tsx 以“查询可用”展示，不检查消费者、事件年龄或通知送达。

## 数量来源

截图时 BNBU 组织 5768，其他 17 个组织 1036（全部组织编码 BNBU-TEST-*）；最终快照 BNBU 多出一条会话续期为 5769。不能把 BNBU 中全部记录解释为真实用户操作，因为历史验收也曾使用该组织。

17 个测试组织中主要为 OCR13 457、PERF 264、LONG 112、MEMBER13 41；本轮 BUG15 三个组织合计 20。测试数据增加了统计数字，但不是缺少消费者的根因。

最终快照主要事件：AUTH_REFRESH_TOKEN_ROTATED 1233、EMAIL_VERIFICATION_CHALLENGE_ISSUED_V1 510、STUDENT_SESSION_ESTABLISHED_V1 488、ENROLLMENT_CREATED_V1 444、STUDENT_IDENTITY_CREATED_V1 440、USER_EMAIL_VERIFIED_V1 438。完整 48 种类型、日期分布和组织分布见 evidence/outbox-20260915/production-summary.json。按 UTC 日期，9 月 13 日 2261、9 月 14 日初次快照 3217，事件随着业务及测试积累。

## 影响和处置建议

- 这不是 6804 条失败邮件。验证码服务直接调用 delivery.deliver；业务事件保留在 Outbox 不代表相应验证码未送达。此次未重新验证真实邮件送达，不把事件计数作为送达证据。
- 已完成的登录、入班、资料保存或媒体状态变更，不能因事件 PENDING 就认定业务失败。需要异步消费者完成的后续动作，则必须逐个事件类型核对契约、目标消费者和幂等规则，才能确认影响范围。
- 建议先明确事件生命周期：哪些是待投递业务事件、哪些仅保留作事实记录。对确需投递的事件接入受控消费者、幂等处理及失败/超时恢复；对只作记录的事件明确记录状态与保留策略，避免永久显示为待处理。
- 管理页建议区分组织范围、未消费数量、最老事件年龄、消费者是否运行与实际通知送达状态。是否显示跨组织运维统计涉及管理员权限边界，修改前应确认业务口径。
- 不应为了清零直接将全部记录标记 PROCESSED，也不应在未明确副作用前批量补发历史事件。清理测试组织数据需要独立的明确范围与保留决定。

## 证据与操作边界

线上使用当前 backend 镜像的运行身份，事务 SET TRANSACTION READ ONLY，单条查询 15 秒上限，仅输出聚合数据，无账号邮箱、事件 payload 或密钥。未修改业务数据库、消费事件、投递通知或重启服务。诊断脚本 tools/production/inspect-outbox-20260915.py；云端副本 /home/ubuntu/bnbu-bug-20260915/inspect-outbox-20260915.py。

初次诊断查询使用 day 作为未转义别名被数据库拒绝，修正 AS event_date 后通过；此错误发生在只读事务内。
