# Stage 20B Synthetic Staging Readiness Plan

状态：`CONSTRUCTION_APPROVED / RUNTIME_NOT_READY`

批准人：`PROJECT_OWNER`

批准日期：`2026-08-05`

## 1. 目的和边界

本计划把已批准的 Android/Web 客户端合同转化为可执行的 synthetic staging 前置 Gate。它不选择云厂商、域名或 Secret 产品，不创建 production 环境，不修改客户端/后端业务代码，也不表示 staging 已部署。

唯一机器合同仍是 `docs/backend-contracts/openapi.yaml`。本轮输入绑定在 `20b-client-contract-baseline.json`：OpenAPI version `1.0.0-contract`，SHA-256 `1171cb76a485911ef44f5df9fc65f99ad5cbb9f7ab9d6a4e0d479c06eb4dad8c`，运行行为为 92 operations / 82 verified / 10 exact default deny。

## 2. 基础设施选择前的停止 Gate

部署前必须由项目负责人或授权基础设施负责人补齐并批准：

| 项目        | 必须落盘的非 Secret 证据                                                  | 当前      |
| ----------- | ------------------------------------------------------------------------- | --------- |
| 部署目标    | 具名环境/区域、责任人、成本与销毁责任                                     | `PENDING` |
| HTTPS       | staging 域名、证书签发/续期、HTTP 重定向策略                              | `PENDING` |
| PostgreSQL  | 独立实例/数据库、18.x 兼容性、App/Migrator 身份分离、备份与 reset 边界    | `PENDING` |
| 对象存储    | 独立 private bucket、Roster/Media 身份隔离、无 anonymous access、生命周期 | `PENDING` |
| Secret 托管 | 具名产品/机制、访问者、注入方式、轮换与紧急撤销                           | `PENDING` |
| 可观测性    | requestId 查询入口、脱敏日志、最小指标和验收责任人                        | `PENDING` |

任何值不得先以源码常量、提交的 `.env`、真实账号或 production Secret 代替。选择完成前只能准备合同、fixture 规范和自动化，不连接未知服务。

## 3. 环境隔离合同

- staging 使用独立 PostgreSQL、private object storage、issuer/audience、CORS allowlist、cookie domain 和 Secret；不得与 local 或 production 共享持久化事实或凭据。
- 后端只通过显式环境配置启动；production 缺少必需配置必须 fail fast。
- Android staging build 只通过 BuildConfig 注入 HTTPS Base URL；Web staging build 只通过部署环境变量注入；二者都不得包含第二个旧 API URL 或故障 fallback。
- 不创建 iOS 工程。未来 iOS 仅保留 xcconfig 合同位置。
- 所有环境显示明确标识；development-only Mock 必须显著，production/staging 验收 build 必须证明 Mock adapter、seed 和本地业务真相不可达。

## 4. Synthetic seed/reset 合同

seed 只产生不可识别的合成组织、学期、课程、教学班、学生、教师、管理员和媒体对象。固定 fixture 可以使用稳定语义别名，但密码、Token、密钥、数据库 URL 和存储 credential 不进入 Git 或报告。

reset 必须：

1. 只接受明确的 staging environment identity；检测到 production 或未知目标立即拒绝；
2. 要求独立授权和审计，记录 requestId/操作者/时间/fixture version，不记录 Secret；
3. 先阻止并发测试流量，再清理 staging 合成 DB 与 bucket 对象；
4. 重新执行既有 0001–0010 migration 和确定性 seed；不得创建 `0011_export_core`；
5. 验证对象存储无匿名读写、残留对象符合预期、数据库无真实数据；
6. 生成新的用户会话，旧 Token 不得跨 reset 继续有效；
7. 可重复执行并产生相同的业务 fixture 拓扑，不依赖固定内部 ID。

## 5. 固定角色与场景

至少准备以下合成角色，不在文档中记录密码：ACTIVE STUDENT、责任 TEACHER、非责任 TEACHER、同组织 ADMIN、停用用户。fixture 必须覆盖：

- Auth：password login、refresh rotation、reuse detection、logout、禁用状态和 requestId；
- Teaching/Enrollment：教师本人 ClassSection、学生 ACTIVE Enrollment、越权/跨组织拒绝；
- Session/Media/Record：active Session 恢复、private PUT/confirm/bind/AVAILABLE、Record 提交与初始 Review；
- Review：单条/批量、`expectedVersion` + `expectedReviewVersion` 冲突与重审；
- Score：working/published 分离、Review-driven recalculation、学生安全 projection；
- Audit：按 requestId 追踪关键 mutation；
- Export：四个 operation 精确返回 `SYSTEM_MODE_UNSUPPORTED`，不创建 Job/artifact/URL。

## 6. 客户端合同 Gate

每次生成 DTO/schema 必须同时记录：OpenAPI 所在 Git commit、SHA-256、生成器及版本、generated client version、compatibility diff 和 release notes。生成物不得手工修改字段或 enum；遇到未知 required enum 安全失败。

handwritten transport 必须独立测试：

- 环境注入与 fail-fast；
- Android Keystore-backed encrypted storage；
- Web Secure HttpOnly SameSite refresh cookie + memory access token，以及 staging 中的 CORS/CSRF/cookie 验收；
- refresh rotation/reuse/logout；
- error `code` 分支和未知错误 requestId 展示；
- `Idempotency-Key`、`expectedVersion`、`expectedReviewVersion`；
- 401/403/404/409/429/503、网络中断和超时均不切 Mock；
- production/staging test build 中旧 `/api`、旧 multipart `/upload/proof`、公开 URL、`storageKey` DTO 和 Mock fallback 不可达。

## 7. Runtime 验收清单

只有以下全部有真实证据，`STAGING_RUNTIME_READINESS` 才能变为 YES：

- HTTPS、证书链、CORS/cookie/CSRF 与环境标识通过；
- PostgreSQL migration first/repeat、drift 0、App/Migrator 权限分离；
- private Media bucket、无 anonymous access、完整 initiate→PUT→confirm→bind→processing→AVAILABLE；
- 当前 92-operation disposition 与 runtime manifest 一致；
- synthetic seed/reset 首次与重复执行通过，production/unknown target fail closed；
- Auth rotation/reuse/logout、Score、Audit 和 requestId tracing smoke 通过；
- Android/Web staging test build 指向同一 OpenAPI hash 和唯一 staging URL；
- 日志无 Token、Cookie、Authorization、密码、Secret、DATABASE_URL、storageKey、signed URL 或完整合成身份字段；
- restart/persistence、故障恢复和精确 teardown 通过；
- Export 仍为无持久化的 `SYSTEM_MODE_UNSUPPORTED`。

## 8. 模块执行顺序

staging runtime Gate 通过后，只能依次开始：

1. Auth：Android，再 Web；
2. Teaching / Enrollment：Android，再 Web；
3. Session / Media / Record：Android，再 Web；
4. Review：Android 所需消费面，再 Web 教师治理；
5. Score：Android 学生 projection，再 Web 教师/管理员治理。

每一模块独立记录 OpenAPI hash、client build、operation、requestId、HTTP status/error code、合成 fixture 和结果。未通过当前模块不得把整体 Client Integration Gate 标为完成。

## 9. 当前判定

```text
STAGING_CONSTRUCTION_APPROVED=YES
CLIENT_INTEGRATION_PREPARATION_READINESS=YES
STAGING_RUNTIME_READINESS=NO
CLIENT_INTEGRATION_EXECUTION_READINESS=NO
CLIENT_INTEGRATION_STARTED=NO
APPROVED_THREE_CLIENT_DEFINITION_OF_DONE=NO
EXPORT_IMPLEMENTATION_READINESS=NO
PRODUCTION_APPROVAL_GATE=NO
FULL_PRODUCTION_GATE=NO
```
