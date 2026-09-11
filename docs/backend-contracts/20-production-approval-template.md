# Stage 20A Production Approval Template

> 未完整批准前：`FULL_PRODUCTION_GATE=NO`。local Docker、restart/persistence 或文档推荐都不构成 Production 批准。

| 决策                          | 必须批准的结果                                                                       | 主要阻塞范围                     | 用户选择                 | 批准日期/证据 |
| ----------------------------- | ------------------------------------------------------------------------------------ | -------------------------------- | ------------------------ | ------------- |
| PROD-DEC-01 环境分层          | local/test/staging/production 的 URL、数据、Secret、日志、DB、storage、clients、Mock | staging/client/production        | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-02 部署目标          | 学校/腾讯云/其他云/双方案、主备、切换条件、入口、责任人、成本/备案                   | staging/production               | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-03 TLS/域名          | staging/production 域名、终止、redirect、renewal、pinning                            | staging/client/production        | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-04 Secret            | 托管方式、隔离、rotation、revoke、最小权限、访问者                                   | staging/production               | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-05 Database          | 托管/自建 PostgreSQL、HA/pool/roles/network/encryption                               | staging/production               | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-06 Backup/restore    | frequency/type/retention/restore test/RPO/RTO/encryption/offsite/owner               | production                       | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-07 Object storage    | S3/MinIO、bucket、encryption/versioning/lifecycle/backup/region/policy               | staging/export/production        | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-08 Observability     | logs/metrics/traces/health/alerts/error reporting/retention/dashboard/on-call        | staging/client/production        | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-09 Release           | manual/CI-CD/blue-green/rolling/window、provenance/digest/approval/rollback          | staging/production               | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-10 Migration         | migrator、compatibility、timeout、backup、failure/destructive policy                 | production                       | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-11 Capacity          | rate/upload/session/export/worker/pool/object/timeout/backlog；压测 Gate             | staging/export/production        | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-12 Privacy/retention | 各数据类别、删除、legal hold、归档、学校政策                                         | staging/client/export/production | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-13 Incident          | severity、leak/outage、notification/shutdown/rotation/forensics                      | production                       | `USER_APPROVAL_REQUIRED` |               |
| PROD-DEC-14 Staging data      | synthetic/masked production/manual real accounts、fixture/reset                      | staging/client/production        | `USER_APPROVAL_REQUIRED` |               |

## ADR-070–074 批准绑定

| ADR     | 必须满足                                                             | 状态     |
| ------- | -------------------------------------------------------------------- | -------- |
| ADR-070 | 幂等 retention/lease/recovery/replay/SLO/owner 已批准                | PROPOSED |
| ADR-071 | backup/restore/RPO/RTO/offsite/drill/owner 已批准并演练              | PROPOSED |
| ADR-072 | key custody/rotation/`kid`/Web transport/revoke SLO 已批准           | PROPOSED |
| ADR-073 | audit/log retention、tamper resistance、alerts/on-call 已批准        | PROPOSED |
| ADR-074 | compatibility window、usage evidence、contract/rollback owner 已批准 | PROPOSED |

```text
STAGING_BLOCKERS_CLOSED=NO
CLIENT_INTEGRATION_PRODUCTION_BLOCKERS_CLOSED=NO
EXPORT_PRODUCTION_BLOCKERS_CLOSED=NO
ADR_070_074_ACCEPTED=NO
PRODUCTION_APPROVAL_GATE=NO
FULL_PRODUCTION_GATE=NO
```
