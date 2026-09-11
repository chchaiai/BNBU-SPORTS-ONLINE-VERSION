# Stage 21 客户端能力本地集成报告

日期：2026-08-11（邮箱唯一认证更新）。

## 结论

ADR-097、ADR-098 与 ADR-101 将 Stage 21 客户端能力中的 24 个 operation 提升为 `Stage 21 Local Integration`。当前 OpenAPI 为 `1.4.0-contract`、123 operations；runtime coverage 为 106 `IMPLEMENTED_VERIFIED`、17 `IMPLEMENTED_DEFAULT_DENY`、0 `NOT_IMPLEMENTED`、0 `BLOCKED_BY_ADR`。当前工作树 OpenAPI SHA-256 为 `42965df623cab184522a573d2289538fd4a2b847e74d971b7fedd064c45c2273`。

“本地集成”只证明当前工作树的真实 Controller → Service → Prisma/PostgreSQL 路径及其本地测试与 Docker Synthetic Staging 边界。它不证明 Staging HTTPS、iOS 二进制、APNs/FCM 或 Production Gate 已通过。

## 24 个本地实现 operation

| 能力 | operation | 本地闭合边界 | 明确未完成 |
|---|---|---|---|
| 通知 | `listNotifications`、`markNotificationRead` | 本人/同组织列表、游标与未读过滤；幂等标记已读并在同事务追加 event、AuditLog、Outbox | 没有业务通知生产者、模板治理或自动保留清理 |
| 推送设备 | `registerPushDevice`、`unregisterPushDevice` | 本人当前认证会话登记；`ANDROID/IOS/WEB`；token 使用用途绑定加密且不投影；显式注销清除密文并留撤销证据 | 没有 APNs/FCM provider/worker、投递回执、自动随 session revoke 的 hook、生产 keyring/轮换证据 |
| 用户偏好 | `getCurrentUserPreferences`、`updateCurrentUserPreferences` | 只读写本人；服务端默认投影；更新要求 `expectedVersion` 并追加变更事件/审计/outbox | 没有跨设备实时推送或外部邮件订阅系统 |
| 帮助中心 | `listHelpArticles`、`getHelpArticle` | 公开只读 `PUBLISHED` 且已到发布时间的安全 Markdown 投影 | 没有管理端发布/编辑 operation、内容签审或生产内容 |
| 意见反馈 | `createFeedback`、`listFeedback`、`getFeedback` | 三角色可创建；`STUDENT/TEACHER` 只读本人，`ADMIN` 只读本组织；创建幂等并追加 event/审计/outbox | 没有处理、回复、关闭、SLA、附件或完整工单线程 |
| App 版本政策 | `getAppReleasePolicy` | 公开按 `ANDROID/IOS/WEB` 读取当前生效、未过期的持久化政策；无政策返回稳定 503；下载地址只允许 HTTPS | 没有管理端发布 operation、签名、灰度、生产政策或跨平台版本比较规则 |
| 学生邮箱 OTP 登录 | `requestStudentSignInCode`、`verifyStudentSignInCode` | 请求显式携带 `organizationCode`，`channel` 固定 `EMAIL`，202 响应返回 `challengeId`；验证成功建立既有 `AuthSession`、access token 与 refresh token；未知账号采用枚举安全响应，验证码只存摘要 | 已实现 SMTP 适配器；Staging/Production 未配置 SMTP 必须 fail fast，`PHONE` 稳定 422 且不创建 challenge |
| 本人邮箱首次绑定/换绑 | `requestCurrentUserEmailChallenge`、`verifyCurrentUserEmailChallenge` | `PENDING_CONTACT_BINDING` 首次绑定只验证新邮箱；换绑分别验证当前和新邮箱；邮箱唯一、版本冲突、验证码过期/重放均由服务端裁决；成功后撤销其他设备会话 | 历史手机号列与历史 `PHONE` challenge 只读保留；本阶段不执行物理删除 |
| 教师/管理员账号找回 | `requestAccountRecovery`、`completeAccountRecovery` | 仅允许 `TEACHER/ADMIN`；202 响应返回 `recoveryId`；完成后更新 Argon2 密码、提升 `tokenVersion` 并撤销旧会话与 refresh token | 学生不走密码找回；非测试环境的真实投递 provider 尚未配置 |
| 免测申请 | `listExemptionApplications`、`createExemptionApplication`、`getExemptionApplication`、`updateExemptionApplication`、`submitExemptionApplication`、`reviewExemptionApplication` | 学生仅管理本人申请；责任教师审核本人班级；管理员仅本组织只读；状态迁移、expectedVersion、append-only event、审计/outbox 均在事务内；附件必须是同组织、同学生、同 enrollment 的私有 `EXEMPTION_APPLICATION` 媒体 | 尚无远程 Staging 对象存储与 iOS 真机上传闭环 |

这些 mutation 复用既有 requestId、authentication、PolicyEngine、organization/self scope、SystemMode、Idempotency-Key、PostgreSQL transaction、domain history、AuditLog、Outbox 和稳定 ErrorCode；没有建立模块私有的第二套权限、幂等或错误 envelope。

## 7 个仍 default deny 的 Stage 21 operation

| 能力 | 数量 | 当前原因 |
|---|---:|---|
| 运动目录、活动折算 | 2 | 目录治理、公式字段与 ScoreRule/ClassSection 范围尚未批准，不建立第二套成绩事实 |
| GPS/位置 | 6 | 生产政策参数、同意撤回、采样/精度、原始/粗化保留、删除、密钥与可见范围尚未批准 |

上述 7 个 operation 保留真实路由、权限先行和稳定 `SYSTEM_MODE_UNSUPPORTED`，不会用通用 404 或空成功伪装实现。拒绝路径不产生业务状态迁移、成功 AuditLog 或业务 Outbox。

## 客户端迁移规则

- 唯一权威后端前缀为 `/api/v1`；客户端不得把旧远程 API、Mock 或本地 DTO 反向定义为第二份合同。
- 迁移按完整业务模块逐步进行，而不是在一个页面中混接半套新旧调用。同一客户端构建的同一页面必须只有一个数据源。
- 选择新 operation 后，失败必须按稳定错误码显式处理，不得静默回退历史 API、Mock 或本地假成功。
- 历史接口若仍有真实调用，只能先以遥测确认调用方和最低支持客户端版本，再定义观察阈值与回滚窗口；这些证据明确后才决定下线日期。当前没有获批的具体下线日期。

## GPS 基础与关闭边界

本地代码已经建立位置政策、同意、轨迹、样本、加密原始样本、粗化摘要与保留证据的 Prisma 结构和应用层基础，包括 consent/policy 绑定、样本去重、用途绑定加密、只投影粗化摘要以及先删除秘密再清理摘要的 retention 顺序。当前这些能力没有接入 HTTP Controller/Module，6 个位置 operation 仍由 `ClientCapabilitiesService.deny` 处理。

因此当前不得声称：iOS/Android 会申请定位权限、真实坐标可上传、教师/管理员可查看轨迹、保留任务已在 Staging/生产调度、密钥已托管/轮换，或 Production GPS Gate 已通过。原始坐标不得进入公共 projection、日志、AuditLog、Outbox、通知或成绩事实。

## 持久化与验证边界

- 新增 forward-only Migration：`backend/prisma/migrations/0011_client_capabilities/migration.sql`；0001–0010 不得修改。
- `0011_client_capabilities` SHA-256 为 `78acf3c51ef2c3be25c7b9c534f487c65653bec7486535ccb889df12eeb56da6`；静态口径为 27 张表、67 个 foreign key、38 个 explicit unique index、86 个 CHECK addition、71 个 explicit index。
- 机器运行账本：`backend/runtime-coverage.manifest.json`；生成路线图：`backend-implementation-roadmap.md`。
- 重点测试：`backend/test/unit/client-messaging.test.ts`、`backend/test/unit/client-capabilities-p1-foundation.test.ts`、`backend/test/unit/location-evidence-*.test.ts`、`backend/test/e2e/client-capabilities.e2e.test.ts`、`backend/test/contract/client-capabilities-contract.test.ts`、`backend/test/security/client-capabilities-security.test.ts`。
- 最终静态与测试复验通过：Unit 103/103、Integration 41/41、E2E 47/47、Contract 31/31、Security 46/46；format、lint、strict typecheck、build、runtime coverage、contract、生成物一致性、迁移安全、schema drift、`npm audit`（0 vulnerabilities）和 `git diff --check` 均通过。

## Docker Synthetic Staging 与数据库 RBAC 证据

Docker Desktop 4.85.0、Engine 29.6.2、Compose 5.3.1 上的首次验证发现旧 Compose 将 migrator 同时配置为 PostgreSQL bootstrap 超级用户，且 App 对 `_prisma_migrations` 拥有超出运行需要的 DML 权限。本阶段据此拆分 bootstrap、migrator、app 三个数据库身份，并增加部署后最小权限 hardening 与静态安全测试。失败项目已精确 teardown，随后在全新 project 和全新 volumes 上从零重验。

- no-cache runtime image digest：`sha256:18eb6e838d59773dc78cefdd45c6cd7badfc3c5ab5b3613e375d8a69efdd77df`；migrator image digest：`sha256:78757a314bcac42c9e19cc1fb57f55cd854e26041bca870ea44382f9a8c34073`。
- ADR-097 全栈基线在 PostgreSQL 18.4 新空卷顺序应用 0001–0011，重复部署为无 pending，schema drift 为 `No difference detected`。ADR-098 增量随后在独立 PostgreSQL 18 测试库顺序应用 0001–0012，同样为 `No difference detected`。
- migrator 为 `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`，只对当前数据库具有 migration 所需的 `CONNECT/CREATE` 及 public schema `USAGE/CREATE`；它不是 bootstrap 身份。
- App 同样为 `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`，只对数据库具有 `CONNECT`、对 public schema 具有 `USAGE`，拥有 0 个 relation；73/73 张业务表具有完整 DML，对 `_prisma_migrations` 仅 `SELECT`，无 insert/update/delete。App 的实际 `CREATE TABLE` 与修改 migration 历史探针均被 PostgreSQL 拒绝且无残留。
- ADR-097 全栈基线 Runtime 以 UID 10001 运行并健康，原 12 个本地 operation 共 33 项 HTTP smoke 断言通过。ADR-098 增量以真实 PostgreSQL E2E 验证学生 OTP、教师找回、数字 buildNumber、私有免测媒体与教师审核；非测试环境未配置真实验证码 provider 时仍稳定 503，GPS 路由继续稳定 503。
- App/PostgreSQL 重启后 readiness 恢复且持久化签名不变；MinIO 两个 bucket 保持 private，受控对象在重启后仍可读取。
- 日志、容器环境、image history 与运行输出扫描覆盖 6 类来源、27 个精确 secret 值及 8 个标记，未发现泄漏；App 环境不含 bootstrap、migrator、root 或 seed secret。
- 精确 teardown 后，本次 project 的容器、网络、卷、镜像与临时验证文件均为 0；未 prune 或触碰其他 Docker 资源。

这些是隔离、本地、仅使用合成 `.invalid`/fixture 数据的 Docker 证据。它不等于具名远程 Staging 已部署，也不等于 iOS 真机、APNs/FCM、生产备份恢复或 Production Gate 已通过。

## 未关闭的外部门禁

- Staging HTTPS 地址、独立数据库/对象存储、Secret 托管与部署：NO。
- iOS 真实 Base URL、测试账号/验证码方案、测试课程与媒体配置、二进制端到端验收：NO。
- 通知生产者与 APNs/FCM 实际投递：NO。
- GPS 生产政策参数、密钥托管、调度、监控与生产开放：NO。
- Production Gate：NO。
