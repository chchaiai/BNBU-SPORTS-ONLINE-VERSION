# Stage 20B Implementation Gate

本 Gate 将“项目负责人批准”“可开始环境准备”“环境真实可用”和“客户端联调完成”分开判定。推荐值不能替代批准，建设授权也不能替代 runtime 证据。

## 1. Export Implementation Readiness

EXP-DEC-01–12 尚未批准，Export ADR、OpenAPI、状态/权限/snapshot/格式/private storage/retention/TTL/worker/claim/lease/retry 与 `0011` 设计均未冻结。

四个 Export operation 必须继续精确返回 `SYSTEM_MODE_UNSUPPORTED`；不得创建 `0011_export_core`、Export 表、Job、worker、artifact 或下载 URL。

```text
EXPORT_APPROVAL_GATE=NO
EXPORT_IMPLEMENTATION_READINESS=NO
```

## 2. Client Integration Approval

`PROJECT_OWNER` 已于 2026-08-05 批准 INT-DEC-01–12 的推荐方案，并授权 Android/Web 分模块联调的前置合同落盘和 synthetic staging 准备。证据见 `20-client-integration-approval-template.md`。

```text
CLIENT_INTEGRATION_APPROVAL_GATE=YES
CLIENT_INTEGRATION_PREPARATION_READINESS=YES
APPROVED_THREE_CLIENT_DEFINITION_OF_DONE=NO
```

该批准允许建立 OpenAPI-bound client generation 基线、环境注入规则、Mock 不可达规则、synthetic fixture/reset 合同和 staging 验收清单；不等于客户端源码已修改或任何模块已经联调通过。

## 3. Synthetic Staging Runtime Readiness

运行 Gate 只有在以下证据全部存在后才能变为 YES：

1. 与 local/production 隔离的具名 staging 部署目标和 HTTPS 地址；
2. 独立 PostgreSQL、private object storage 和最小权限 Secret，且均非 production 凭据；
3. 可审计、仅合成的固定账号/fixture 与安全 reset；
4. 后端 92 个 operation 的当前运行行为可验证，四个 Export operation 仍精确 default deny；
5. private Media、Score、Audit 和 requestId tracing smoke 通过；
6. Android/Web staging test build 能显式注入唯一 Base URL，且无旧 API/Mock fallback；
7. CORS/cookie/CSRF、refresh rotation/reuse/logout、日志脱敏、reset 隔离和 teardown 经过安全验收。

当前域名、云厂商、Secret 托管产品、长期运维参数和真实部署证据尚未确定：

```text
STAGING_CONSTRUCTION_APPROVED=YES
STAGING_RUNTIME_READINESS=NO
CLIENT_INTEGRATION_EXECUTION_READINESS=NO
CLIENT_INTEGRATION_STARTED=NO
```

## 4. Production Readiness

PROD-DEC-01–14 未获整体批准，ADR-070–074 保持 `PROPOSED`。本次 synthetic staging 有限授权不批准正式域名、正式 Secret、真实数据、Production 部署、RPO/RTO、长期 retention 或 Full Production。

```text
PRODUCTION_APPROVAL_GATE=NO
PRODUCTION_READINESS=NO
FULL_PRODUCTION_GATE=NO
```

## 5. 允许与禁止的下一动作

| 当前状态                              | 允许动作                                                                                                                                     | 禁止动作                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Client 决策已批准、staging 尚未 ready | 冻结 OpenAPI hash/client generation 输入；准备隔离 staging 配置合同、synthetic seed/reset、安全与 smoke 清单；待基础设施选择批准后部署和验收 | 不开始真实客户端联调；不硬编码临时地址；不连接未知服务；不宣称 staging ready |
| staging runtime Gate 未来通过         | 从批准后的 clean HEAD 只启动 Auth 模块的 Android 学生端，再做 Web 消费端；每模块独立验收                                                     | 不并行改完所有模块；不改后端合同迁就旧 DTO/Mock；不创建 iOS                  |
| Export 未批准                         | 保持四个 operation 真实 default deny                                                                                                         | 不实现 Export 或创建 `0011_export_core`                                      |
| Production 未批准                     | 仅进行已批准的 synthetic staging 工作                                                                                                        | 不上线、不使用正式域名/Secret/真实数据、不提升 Production Gate               |

## 6. 当前总判定

```text
APPROVED_INTEGRATION_ORDER=YES
APPROVED_GENERATED_CLIENT_STRATEGY=YES
APPROVED_MOCK_RETIREMENT_POLICY=YES
APPROVED_STAGING_ENVIRONMENT=YES
APPROVED_THREE_CLIENT_DEFINITION_OF_DONE=NO
CLIENT_INTEGRATION_APPROVAL_GATE=YES
CLIENT_INTEGRATION_PREPARATION_READINESS=YES
STAGING_CONSTRUCTION_APPROVED=YES
STAGING_RUNTIME_READINESS=NO
CLIENT_INTEGRATION_EXECUTION_READINESS=NO
CLIENT_INTEGRATION_STARTED=NO

EXPORT_APPROVAL_GATE=NO
EXPORT_IMPLEMENTATION_READINESS=NO
PRODUCTION_APPROVAL_GATE=NO
PRODUCTION_READINESS=NO
FULL_PRODUCTION_GATE=NO
STAGE_20B_READINESS=NO
USER_APPROVAL_REQUIRED=YES_FOR_INFRASTRUCTURE_SELECTION_AND_RUNTIME_GATE
```

`STAGE_20B_READINESS=NO` 只表示真实 staging 与首个客户端模块尚未满足执行 Gate，不撤销已经成立的 Client Integration Approval 和 preparation readiness。
