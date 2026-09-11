# Stage 20A Production ADR Inventory

生成日期：2026-08-05。ADR-070–074 全部继续为 `PROPOSED`。本清单只补充证据与决策映射，不改变状态，不批准生产参数。

| ADR                                           | 当前状态 | 已有可验证证据                                                                                                                  | 仍缺少的批准                                                                                                          | Stage 20A 决策映射                              | 对 Gate 的影响                                                                    |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| ADR-070 统一幂等基础设施                      | PROPOSED | PostgreSQL `idempotency_records`、scope/key/hash、lease、加密响应、exact replay、并发测试均已实现；所有 mutation 使用统一协议。 | production retention/lease 数值、跨实例恢复 SLO、临时凭证 replay window、清理 owner、容量和告警。                     | PROD-DEC-01/08/09/11，EXP-DEC-08/11，INT-DEC-06 | 未批准前 production mutation 启动 Gate 为 NO；local/test 通过不等于生产参数获批。 |
| ADR-071 备份与灾难恢复                        | PROPOSED | Docker restart/persistence 与空库 Migration 已验证；明确不等于备份恢复。                                                        | DB/object storage backup 类型、频率、retention、encryption、offsite、restore 演练、RPO/RTO、责任人。                  | PROD-DEC-02/05/06/07/09/10/13                   | Full Production Gate 必须为 NO。                                                  |
| ADR-072 认证密码学与密钥管理                  | PROPOSED | Argon2id、EdDSA/Ed25519、最小 claims、opaque refresh rotation/reuse detection、production fail-fast 已实现。                    | Secret 托管、`kid`/多 key 过渡、rotation/emergency revoke、Web refresh 传输、撤销传播 SLO、访问者。                   | PROD-DEC-03/04/08/09/13，INT-DEC-03/04          | Staging 与 Production Secret 未批准；不能使用 local key。                         |
| ADR-073 审计、日志、告警和 on-call            | PROPOSED | AuditLog append-only、ADMIN org-scoped read、递归脱敏、read-of-read、requestId 和日志 Secret 扫描已验证。                       | Audit/app/security log 分类 retention、访问审批、防篡改副本、metrics/alert thresholds、dashboard、on-call、事件通知。 | PROD-DEC-08/12/13，EXP-DEC-09，INT-DEC-05/12    | Production Approval 为 NO；原始 AuditLog 不得清理或导出。                         |
| ADR-074 Migration compatibility/contract Gate | PROPOSED | 0001–0010 forward-only、独立 migrator、repeat deploy、drift 0、App 无 CREATE、generated contract checks 已验证。                | 支持版本窗口、客户端使用证据、expand/migrate/contract 观察期、lock timeout、stop/rollback owner、破坏性操作审批。     | PROD-DEC-09/10，INT-DEC-01/02/11/12             | 不能执行破坏性 contract；Client/Production Gate 为 NO。                           |

## 关联但不在本阶段自动关闭的决策

- ADR-032、045、068：身份/教学/名单/媒体的数据保留与访问审批仍影响 PROD-DEC-12。
- ADR-096：Student/Profile 一般写字段治理继续 `PROPOSED`，`updateStudent` 继续 exact default-deny；邮箱绑定已由 ADR-101 的专用 challenge 接口独立批准，不恢复通用 `PATCH /me`。
- Export 尚无 ACCEPTED ADR。EXP-DEC-01–12 全部批准后，必须先新增正式 Export ADR，再修改 OpenAPI 或创建 0011。

## 环境边界

| 环境       | 数据                     | Secret                    | DB / storage              | 允许客户端             | Mock                               |
| ---------- | ------------------------ | ------------------------- | ------------------------- | ---------------------- | ---------------------------------- |
| local      | 纯合成，可重置           | local-only 随机值         | loopback PostgreSQL/MinIO | 开发 build             | 允许且显式标识                     |
| test       | 自动化 fixture           | test-only                 | 隔离临时 DB/storage       | 测试 runner            | 允许测试 double                    |
| staging    | **尚未就绪**；推荐纯合成 | 独立托管 Secret，尚未批准 | 必须与 production 隔离    | 只允许批准的测试 build | production-like flow 禁止静默 Mock |
| production | 禁止测试/真实数据混用    | 独立、轮换、最小权限      | 目标/拓扑尚未批准         | 正式签名客户端         | 禁止                               |

## Production blocker 清单

1. 正式部署目标、域名、TLS 终止和责任人未批准。
2. Secret 托管、轮换、`kid` 和 emergency revoke 未批准。
3. 托管/自建 PostgreSQL、HA、连接池和私网拓扑未批准。
4. RPO、RTO、backup retention、offsite 和 restore 演练未批准。
5. Media/Roster/Export bucket topology、encryption、versioning 和 lifecycle 未批准。
6. metrics/alerts/log retention/on-call 未批准。
7. release approval、rollout/rollback、migration timeout 和 compatibility window 未批准。
8. 容量/限流正式参数没有压测证据。
9. 数据分类 retention、删除、legal hold 和学校政策未批准。
10. incident severity、通知时限、取证责任人未批准。

结论：`PRODUCTION_ADR_INVENTORY_GATE=YES`，`PRODUCTION_APPROVAL_GATE=NO`，`FULL_PRODUCTION_GATE=NO`。
