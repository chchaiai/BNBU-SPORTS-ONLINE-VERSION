# Stage 20A Client Integration Approval Record

批准人：`PROJECT_OWNER`

批准日期：`2026-08-05`

批准证据：当前任务中项目负责人的明确批准指令。

状态：`ACCEPTED`。本记录取代本文件此前的空白审批模板。

## 逐项批准结果

| 决策                  | 已批准结果                                                                                                                                                                                                                                          | 状态                               |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| INT-DEC-01 联调顺序   | 按模块纵向推进：Auth → Teaching / Enrollment → Session / Media / Record → Review → Score。每个模块先完成 Android 学生事实产生端，再完成 Web 教师/管理员消费与治理端；iOS 不在本阶段完成口径。                                                       | `ACCEPTED`                         |
| INT-DEC-02 API Client | Android Kotlin DTO、Web TypeScript types 与未来 Swift models 来自同一 OpenAPI commit/hash；transport、auth、interceptor、安全存储、重试和 UI adapter 手写并测试。                                                                                   | `ACCEPTED`                         |
| INT-DEC-03 Base URL   | local/staging/production 显式注入；Android 使用 BuildConfig，Web 使用部署环境变量，未来 iOS 使用 xcconfig。禁止硬编码、旧 API fallback、网络失败切 Mock；production 缺少 URL 必须 fail fast。                                                       | `ACCEPTED`                         |
| INT-DEC-04 认证存储   | Android 使用 Keystore-backed encrypted storage；Web 使用 Secure HttpOnly SameSite refresh cookie + memory access token；未来 iOS 使用 Keychain。浏览器传输细节仍需 staging 安全验收，不改变后端 Token family、rotation、reuse detection 与 logout。 | `ACCEPTED_WITH_STAGING_VALIDATION` |
| INT-DEC-05 错误处理   | 只按服务端 `code` 执行业务分支；错误 envelope 固定为 `code/message/details/requestId/timestamp`。未知错误安全失败并显示 requestId，禁止按英文 message 分支。                                                                                        | `ACCEPTED`                         |
| INT-DEC-06 幂等与并发 | mutation 按合同使用 `Idempotency-Key`、`expectedVersion` 与 Review 的 `expectedReviewVersion`；同一用户意图复用同一 key。冲突后刷新并要求重新确认，禁止盲目重放。                                                                                   | `ACCEPTED`                         |
| INT-DEC-07 Media      | 固定为 initiate → private PUT → confirm → bind → processing → AVAILABLE。禁止 production 旧 multipart `/upload/proof`、公开/永久 URL 与 `storageKey` DTO。                                                                                          | `ACCEPTED`                         |
| INT-DEC-08 Session    | 服务端 active Session 是唯一权威；本地计时只用于 UI。App 重启从服务端恢复，没有可信证据的离线时间 fail closed。                                                                                                                                     | `ACCEPTED`                         |
| INT-DEC-09 业务主链   | Session → Media → Record → Review → Score；客户端不得跳级或自行计算正式成绩。                                                                                                                                                                       | `ACCEPTED`                         |
| INT-DEC-10 Mock       | 自动化 fixture 可保留；development-only Mock 必须显式且显著；production 中 Mock adapter、seed、本地业务真相与旧 API fallback 必须不可达，任何失败均不得自动切 Mock。                                                                                | `ACCEPTED`                         |
| INT-DEC-11 契约版本   | 使用 `/api/v1`、OpenAPI commit/hash、generated client version、compatibility diff 与 release notes；客户端拒绝未知 required enum，不手改 generated DTO。                                                                                            | `ACCEPTED`                         |
| INT-DEC-12 验收环境   | 使用独立、纯合成、可安全 reset 的 staging；private Media、Score/Audit/requestId tracing 可用；Export 继续 `SYSTEM_MODE_UNSUPPORTED`；禁止真实数据、旧数据库与旧远程 API。                                                                           | `ACCEPTED`                         |

## staging 有限授权

本次批准的是 synthetic staging 的建设和验收准备，不是 staging 已部署或已通过运行验收。staging 必须与 local/production 隔离，使用独立数据库、对象存储和 Secret，启用 HTTPS、自动 synthetic seed/reset、Android/Web 测试 build 与 requestId tracing，并保持后端 92 个 operation 的当前运行行为。

具体域名、云厂商、Secret 托管产品和长期运维参数尚未批准；因此不得写入正式地址或凭据，也不得把本批准解释为 Production 批准。

## 显式门禁

```text
APPROVED_INTEGRATION_ORDER=YES
APPROVED_GENERATED_CLIENT_STRATEGY=YES
APPROVED_MOCK_RETIREMENT_POLICY=YES
APPROVED_STAGING_ENVIRONMENT=YES
APPROVED_THREE_CLIENT_DEFINITION_OF_DONE=NO
CLIENT_INTEGRATION_APPROVAL_GATE=YES

EXPORT_APPROVAL_GATE=NO
EXPORT_IMPLEMENTATION_READINESS=NO
PRODUCTION_APPROVAL_GATE=NO
FULL_PRODUCTION_GATE=NO
```

iOS 工程当前不存在。Android/Web 即使按模块完成，也只能关闭相应两端模块 Gate，不能声称“三端完成”。本批准不授权 Export、`0011_export_core`、Production、真实数据、Historical Data Migration 或 iOS 工程创建。
