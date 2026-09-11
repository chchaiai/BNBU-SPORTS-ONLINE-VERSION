# Greenfield 学生身份、Enrollment 与 QR Join 实现及运行验收报告（阶段 12）

> 验证日期：2026-08-03（America/Los_Angeles；容器日志为 UTC）
>
> 分支：`backend/enrollment-qr-join`
>
> 权威基线：`625cac9275f4c2d8a722700b9e0a494526e1404a`
>
> 最终 Docker 源码提交：`d7ea554a2a9956d86854a7e9debfea2a9c27fd9d`
>
> Compose project：`bnbu-enrollment-qr-join-validation`

结论：**Student Identity Creation、CourseInvite、JoinCapability、QR Join Atomicity、Enrollment Core、Student Teaching Projection 与 Enrollment/QR Join Core Gate 均为“是”**。由于 ADR-054 仍为 `PROPOSED`，Enrollment Withdrawal/Rejoin Gate 必须保持“否 / DEFAULT DENY”。Roster、Session、Media、Record、Review、Score、Export 与 Full Production Gate 仍为“否”。

## 1. 范围与 Git 基线

本阶段只实现学生身份闭环、CourseInvite、JoinCapability、Enrollment、一次性二维码原子入班及基于 ACTIVE Enrollment 的学生教学投影。没有创建 Roster、ExerciseSession、MediaEvidence、ExerciseRecord、Review、Score 或 Export 表/Controller；没有连接旧远程 API、未知数据库、真实学校数据或 production Secret；没有修改 Android/Web 源码或 gitlink。

本地实现提交：

|   # | Commit                                     | 主题                                                                 |
| --: | ------------------------------------------ | -------------------------------------------------------------------- |
|   1 | `3c811534e0d63a3706aaeb601d31ca05dd46a91e` | `docs(backend): accept v1 identity enrollment and qr join decisions` |
|   2 | `48dd79b0b69441df05834ac7a003ea8c5327387c` | `feat(backend): add identity enrollment and invite persistence`      |
|   3 | `007a00c3d14aa9a5f3a3958164e9fa5add8e7d31` | `feat(backend): implement secure course invite capabilities`         |
|   4 | `c3d8668390a64b4adda7a98ffc64aa5bf1e464c3` | `feat(backend): implement atomic student qr enrollment`              |
|   5 | `b1e94c97977b32d55d2132b39865988b160606be` | `feat(backend): implement scoped enrollment management`              |
|   6 | `73a0ca7ded3f6f698e1af1347e1d49ef3d200b4f` | `feat(backend): enable enrollment-bound student projections`         |
|   7 | `d7ea554a2a9956d86854a7e9debfea2a9c27fd9d` | `test(backend): verify enrollment qr join contracts and security`    |

本报告另以第 8 个本地 docs commit 提交，准确 hash 以最终 `git log` 为准。本阶段没有 merge、rebase、pull、push 或 Pull Request。

Android/Web gitlink 保持：

- Android：`e4cd2e5a623261cd19cddbd59d5cda7627bf7e98`
- Web：`a602280b4aa46d3e944671d341a7bf12bacb17cb`

## 2. ADR 与运行覆盖账本

本阶段接受并实现：

- ADR-080：预登录二维码入班使用短期、一次性、ClassSection 绑定的 Join Capability。
- ADR-093：CourseInvite/JoinCapability 使用公开 UUIDv7 ID + 高熵 secret，长期只存独立 HMAC；身份和精确重放结果使用专用 AES-256-GCM escrow。
- ADR-094：organization 内按规范化 `studentNumber` 唯一创建或严格复用无密码学生身份；Enrollment 永久保留同班关系，教师 restore 复用同一 ID。

ADR-054 未接受，因此 withdraw route 虽有真实 Controller、认证、resource scope、DTO、合同与 E2E，仍固定返回 `ENROLLMENT_WITHDRAWAL_DISABLED`，不产生状态事件、成功 AuditLog 或业务 Outbox；学生自行 rejoin 也不开放。

新增/闭合 10 个 Stage 12 operation：

| operationId                  | Method | Path                                              | 状态                       |
| ---------------------------- | ------ | ------------------------------------------------- | -------------------------- |
| `createCourseInvite`         | POST   | `/class-sections/{classSectionId}/course-invites` | `IMPLEMENTED_VERIFIED`     |
| `previewCourseInvite`        | GET    | `/course-invites/{inviteToken}/preview`           | `IMPLEMENTED_VERIFIED`     |
| `issueJoinCapability`        | POST   | `/course-invites/{inviteToken}/join-capabilities` | `IMPLEMENTED_VERIFIED`     |
| `joinClassSectionWithInvite` | POST   | `/course-invites/{inviteToken}/join`              | `IMPLEMENTED_VERIFIED`     |
| `listEnrollments`            | GET    | `/enrollments`                                    | `IMPLEMENTED_VERIFIED`     |
| `getEnrollment`              | GET    | `/enrollments/{enrollmentId}`                     | `IMPLEMENTED_VERIFIED`     |
| `manuallyEnrollStudent`      | POST   | `/class-sections/{classSectionId}/enrollments`    | `IMPLEMENTED_VERIFIED`     |
| `removeEnrollment`           | POST   | `/enrollments/{enrollmentId}/remove`              | `IMPLEMENTED_VERIFIED`     |
| `restoreEnrollment`          | POST   | `/enrollments/{enrollmentId}/restore`             | `IMPLEMENTED_VERIFIED`     |
| `withdrawEnrollment`         | POST   | `/enrollments/{enrollmentId}/withdraw`            | `IMPLEMENTED_DEFAULT_DENY` |

最终 `npm run runtime-coverage:check`：

| 状态                       | 数量 |
| -------------------------- | ---: |
| OpenAPI operation          |   86 |
| `IMPLEMENTED_VERIFIED`     |   28 |
| `IMPLEMENTED_DEFAULT_DENY` |    1 |
| `NOT_IMPLEMENTED`          |   51 |
| `BLOCKED_BY_ADR`           |    6 |

OpenAPI 为 73 paths、86 operations、213 schemas、1,257 个本地引用；policy 86/86、enum 32/144、ErrorCode 143，全部 diff 0。Redocly 既有 6 个 warning 保留并公开：缺 license、3 个公开只读探针无 4XX、2 个未来 component 未引用；没有编造 license、删除未来 schema 或隐藏 warning。

## 3. Migration 0003 与 PostgreSQL 实测

新增 forward-only migration：

| 项目                        | 结果                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| Migration                   | `0003_identity_enrollment_qr_join`                                 |
| SHA-256                     | `032b2f001638de63495bdb8d9bd3979ab54679eaaa7802d7526c6e5e24aaa5b7` |
| 新表                        | 4                                                                  |
| SQL foreign keys            | 20                                                                 |
| SQL explicit unique indexes | 13                                                                 |
| SQL CHECK additions         | 34                                                                 |
| SQL explicit indexes        | 25                                                                 |
| destructive                 | `false`                                                            |

新增表：`course_invites`、`join_capabilities`、`enrollments`、`enrollment_status_events`。`0001` 与 `0002` 未修改，checksum 分别仍为：

- `0573e3d13018e0db103ef4b605eb35278723174507b37379425a489b10e1462d`
- `bc62c8cc42989da02eb5be92c7c68f64a72b90e6a41b3913c169333d5fbfbc41`

全新 Docker PostgreSQL 18.4 空 volume 实测：

- 首次 migrator 依次应用 0001、0002、0003，exit 0，约 2.5 秒。
- 重复 deploy exit 0，约 1.8 秒，明确输出 `No pending migrations`。
- Prisma schema drift：`No difference detected`。
- 最终应用表 19 张；Stage 13+ 禁止表数量为 0。
- 四张新表 catalog 为 20 FK、34 CHECK、11 个非主键 unique index、23 个非主键 total index。
- migration 静态口径的 13 unique/25 total 还包含为既有 `student_profiles`、`class_sections` 增加的 2 个索引；不是 drift。
- EnrollmentStatusEvent 与既有 AuditLog append-only 保护均存在并由 Integration test 验证。
- App 身份对 schema/database `CREATE` 均为 `false`；Migrator 有 migration 权限；App 启动不执行 migration。
- `studentNumber` 为字符串并保留前导零；organization 内唯一；角色 profile 冲突被数据库触发器拒绝。
- Enrollment 同班永久唯一；同一学生同学期最多一条 ACTIVE；状态/结束字段/version 形状由命名约束保护。

local seed 使用全虚构 fixture，连续执行两次成功且无重复插入。它明确覆盖：无 Enrollment 学生、历史关系、ACTIVE/REMOVED/WITHDRAWN、身份冲突、并发候选缺席、合法非 STUDENT 角色冲突，以及一个只有 64 字符 digest、没有明文 escrow 的 ACTIVE CourseInvite。

## 4. 身份、邀请、能力与 Enrollment 生命周期

### 4.1 无密码学生身份

- QR Join 不创建学生密码，也不在入班请求中接收邮箱或手机号；新 User 进入 `PENDING_CONTACT_BINDING`，必须通过专用邮箱 challenge 验证学校邮箱后才能进入运动业务。User 与 StudentProfile 保持分离。
- `studentNumber` trim 后保持字符串与前导零；姓名执行 trim + Unicode NFC；gender/gradeYear 严格枚举和范围校验。
- 不按姓名、拼音、联系方式或相似度合并身份；已有身份字段不一致时返回稳定冲突，不静默覆盖。
- 并发创建由 PostgreSQL 唯一约束、Serializable 事务和可识别冲突处理共同防重。

### 4.2 CourseInvite

- 仅责任 Teacher 可为本人可写 ClassSection 创建；相同 key/body 精确重放同一明文 token。
- 新创建会撤销旧 ACTIVE invite 并保留历史；每班最多一个 ACTIVE invite。
- 数据库长期只存 token HMAC；短期幂等明文使用专用、到期可清除的 ciphertext，不进入通用幂等、AuditLog、Outbox 或日志。
- public preview 只返回最小 Course/ClassSection/Teacher 投影；过期、撤销、关闭、归档、跨组织与错误 token 均 fail closed。

### 4.3 JoinCapability 与原子 Join

- Capability 绑定 invite、ClassSection、organization 与规范化身份 fingerprint，短期、一次性，使用独立 HMAC 与 AES key。
- 普通 `Authorization: Bearer ...` 不能代替 `X-Join-Capability`；带普通 bearer 调用 Join 稳定返回 401，capability 仍未消费。
- Join 在一个 Serializable PostgreSQL 事务中重新校验所有上下文，创建/复用 User/Profile、ACTIVE Enrollment、EnrollmentStatusEvent、AuthSession/RefreshToken、AuditLog、Outbox，消费 capability 并写专用 result escrow。
- 相同 capability + identity + operation + Idempotency-Key 可精确重放同一 AuthSession bundle；新 key 重用已消费 capability 返回 `AUTH_JOIN_CAPABILITY_ALREADY_USED`。
- 同学期冲突、身份冲突、失效 invite、关闭班级或任一步写入失败均整体回滚，不产生半身份、半 Enrollment 或额外 Session。

### 4.4 Enrollment 管理与投影

- Teacher 只能 list/get/manual add/remove/restore 本人 ClassSection；manual add 只接受同组织 ACTIVE StudentProfile 和非空 reason。
- ADMIN 只能本组织只读，不能代替 Teacher mutation；STUDENT 只能读取本人 Enrollment。
- remove/restore 使用 `expectedVersion`，同一 enrollmentId 从 ACTIVE → REMOVED → ACTIVE，status event、AuditLog 与 Outbox 在同一事务写入。
- Student Course/ClassSection list 只由本人 ACTIVE Enrollment 派生；不读取全组织目录，不返回假空数组掩盖权限。
- withdraw/rejoin 按 ADR-054 继续关闭；Teacher restore 不等于 Student 自助重入。

## 5. Docker HTTP Smoke

最终容器烟测覆盖全部已实现 operation：

| 范围               |  结果 | 关键验证                                                                                                                                   |
| ------------------ | ----: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation         |   9/9 | live/ready/mode、Teacher/Admin login、错误密码、me、current Organization/Semester、Refresh rotation/reuse、logout                          |
| Teaching Structure | 10/10 | Course/ClassSection list/create/get/update/close、Teacher list、幂等与 version                                                             |
| Stage 12           | 10/10 | invite create/replay/rotate/preview、capability issue/replay、atomic join、Enrollment list/get/manual/remove/restore/withdraw default deny |

其他运行验证：

- `X-Request-ID` 与成功 `meta.requestId`/错误 `requestId` 完全一致。
- 成功响应只有 `data/meta`；错误为 `code/message/details/requestId/timestamp` 五字段。
- `/me` 不返回 `passwordHash`、`tokenVersion` 或 Refresh Token。
- Refresh 原子轮换成功；旧 token reuse 撤销 family；logout 后 Refresh 拒绝。
- invite rotation 后旧 preview 为 410，新 preview 为 200，敏感响应带 `no-store`/`no-referrer`。
- Join 首次成功、相同 key 精确重放、新 key 重用已消费 capability 为 409。
- Student 新 Access Token 可立即调用 `/me` 和本人 Course/ClassSection/Enrollment projection。
- CORS allowlist origin 返回精确 ACAO；未允许 origin 不返回 ACAO。
- 抽查 Roster、ExerciseSession、Export 三个未实现 operation，均为 404、无假 200、无假空数组、无数据库副作用或 fallback Controller 匹配。

## 6. 测试与质量门禁

最终五层测试：

| 层          |      结果 | 回归与新增覆盖                                                                                        |
| ----------- | --------: | ----------------------------------------------------------------------------------------------------- |
| Unit        |     28/28 | Foundation、Teaching Structure、身份规范化、token/HMAC/AEAD、Invite/Capability/Enrollment entity      |
| Integration |     19/19 | 0001+0002+0003 checksum、约束、append-only、同学期唯一、跨组织、事务回滚、并发                        |
| E2E         |     20/20 | Foundation 8、Teaching 8、Stage 12 4；HTTP、权限、幂等、原子 Join、投影                               |
| Contract    |       6/6 | 86 operation、1,257 refs、policy/enum/error diff、Stage 12 十个 operation 与响应边界                  |
| Security    |     12/12 | 配置、伪造身份、scope/mass assignment、DB 错误、capability transport、路径/身份/secret 脱敏、公开限流 |
| 总计        | **85/85** | 0 fail、0 skip、0 todo                                                                                |

阶段 11 的 61/61 全部继续通过，新增 24 项全部通过。另行通过：`npm ci`、format、lint、strict typecheck、contract、runtime coverage、Prisma validate、migration safety、schema drift、generated artifacts、build、`npm audit --audit-level=high`（0 vulnerabilities）和 `git diff --check`。没有 `--force`、没有降低 audit level、没有跳过测试或放宽 TypeScript strict。

## 7. Docker 环境与镜像

| 项目                     | 实测值                                                 |
| ------------------------ | ------------------------------------------------------ |
| Docker Client            | 29.6.2，windows/amd64                                  |
| Docker Server / Engine   | 29.6.2，linux/amd64                                    |
| Docker Desktop           | 4.85.0                                                 |
| Docker Compose           | v5.3.1                                                 |
| Context                  | `desktop-linux`                                        |
| Server OS / architecture | Docker Desktop、`x86_64`、16 CPU、WSL2 kernel 6.6.87.2 |
| BuildKit                 | buildx v0.35.0-desktop.2，可用                         |

Compose 静态解析通过：无 `CHANGE_ME`、无 `latest`；PostgreSQL 为 `18.4-alpine3.24`，MinIO/mc 均为明确 release；PostgreSQL/MinIO 只绑定 loopback；App/Migrator 数据库身份分离；`.env`、`.git`、测试密钥和宿主机 `node_modules` 不进入构建上下文。

对 `d7ea554` 使用根仓库 context 和现有 Dockerfile 执行真实 `--no-cache` BuildKit build：

| 项目                    | Runtime                                                                   | Migrator                                                                  |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tag                     | `bnbu-sports-backend:stage12-d7ea554`                                     | `bnbu-sports-backend-migrator:stage12-d7ea554`                            |
| exit / duration         | 0 / 67.5 s                                                                | 0 / 56.7 s                                                                |
| image ID / local digest | `sha256:9f329adf4cce65bb8807a5dc79db75cb13ba3b5949c1c4d9350f69311c379c6b` | `sha256:973ae87c15b9a7fccfa230c4814959901ae7d7a0f1f7af060321f76959b0a6b9` |
| size                    | 194,031,378 bytes                                                         | 213,488,962 bytes                                                         |
| User                    | `bnbu`，UID/GID 10001                                                     | `node`，UID/GID 1000                                                      |
| Cmd                     | `node --enable-source-maps dist/main.js`                                  | `npm run db:migrate:deploy`                                               |

Runtime Entrypoint 为 `docker-entrypoint.sh`，Healthcheck 为镜像内真实 Node/fetch 命令。Build 真实执行 `npm ci`、package-lock、Prisma generate、合同/迁移检查与 Nest build；不依赖宿主机 `node_modules`。Runtime 内不存在 `/app/.env`、`.git`、项目 test、`prisma` 或测试私钥。`docker history` 对所有临时 Secret/`CHANGE_ME` 精确扫描为 0；没有可用 registry RepoDigest，因此只记录本地 content digest。

## 8. Compose、MinIO 与运行安全

现有 Compose 只定义 PostgreSQL、MinIO 与 MinIO init；依照既有 runbook，Migrator 与 App 使用 Dockerfile 对应 target，在同一 Compose network 中独立运行。没有创建第二套 Compose 或假服务。

最终运行状态：

- PostgreSQL：healthy，`127.0.0.1:55432 -> 5432`。
- MinIO：healthy，`127.0.0.1:59000/59001 -> 9000/9001`。
- MinIO init：exit 0。
- Migrator：首次/重复均 exit 0。
- App：healthy，`127.0.0.1:53000 -> 3000`，UID 10001，零 crash loop/持续 restart。
- Bucket `bnbu-stage12-local-private`：`private`；anonymous list/read 为 403，anonymous write 为 403；没有 Media Controller 或永久公开 URL。

App 容器只注入应用所需环境变量；没有 `MIGRATION_DATABASE_URL`、Migrator/PostgreSQL admin 或 MinIO root 凭据名。production 模式只给 `APP_ENV=production` 且缺必需 Secret 时 exit 1 fail fast；local validation 未被误识别为 production。

App/PostgreSQL/MinIO 完整容器日志按实际临时值扫描：

- Secret 精确匹配：0。
- 完整合成学号/邮箱/手机号匹配：0。
- Access/Refresh Token、Authorization、Cookie、Password、DATABASE_URL、MinIO Secret 非脱敏字段：0。
- raw invite/capability 动态 path：0；请求日志使用生成的 route template。
- `level=50`：0；Unhandled exception marker：0。

## 9. 重启与持久性

重启前记录的合成 ID：

- Organization：`019fcab4-2d11-74b8-b896-bfffe6b8b340`
- CURRENT Semester：`019fcab4-2d6e-742e-a694-5fc7af7c3ff4`
- 最新运行学生 User：`019fcac3-5890-7315-85c4-62bc4a2e0305`
- 最新运行学生 Profile：`019fcac3-5890-7315-85c4-65de003fee69`

App 重启后重新变为 healthy，readiness 200、Teacher login 200。随后停止 PostgreSQL，真实 readiness 返回 503；启动同一 PostgreSQL 容器后数据库恢复 healthy、readiness 恢复 200、login 再次成功。上述 ID、Migration 行数和 Enrollment/CourseInvite/JoinCapability 计数签名完全一致，Migration 行数仍为 3，没有重复副作用。

该结果只证明 isolated local Compose volume/restart persistence，不是 production 备份恢复、RPO/RTO、跨区恢复或灾备演练；ADR-071 与 Production Gate 未因此改变。

## 10. 实际发现与处理

1. 初次手工 App 容器发布 `127.0.0.1:53000 -> 3000`，但临时环境中的 `PORT=33012` 被原样注入，导致容器 Healthcheck 正常而宿主请求收到 empty reply。未修改 Dockerfile；只重建该验证 App 容器并显式设 `PORT=3000`，随后从头完整重跑 HTTP smoke。
2. 首轮 smoke runner 把学生越权查询的权威错误码误写为 `AUTH_FORBIDDEN`；后端正确返回 `PERMISSION_RESOURCE_SCOPE_DENIED`。只修正临时 runner 断言并使用新合成学号完整重跑，未改后端合同或实现。
3. 首次 MinIO anonymous write 探针给 curl 传空 data 参数，Windows 参数解析使 URL 丢失；该请求未写对象。改用非空合成 probe body 后 anonymous read/write 均为 403。
4. 最终独立 `npm run build` 首次 shell 未注入 `MIGRATION_DATABASE_URL`，Prisma 按设计 fail fast。注入同一隔离验证环境后 build 成功；没有代码变更或 fallback。
5. PostgreSQL 重启期间日志出现一条 `pg` 未来弃用 warning；无 `level=50`、无 unhandled exception、无 Secret/身份泄漏，readiness 正确为 503 后恢复。

上述失败均保留为过程事实；没有把首次失败冒充通过。没有发现需要 Stage 12 源码、Dockerfile、Compose 或环境校验修复的独立容器缺陷，因此没有额外 `fix(backend)` commit。

## 11. Teardown

最终执行现有 Compose 的 `down -v --remove-orphans`，并只删除独立的 `bnbu-stage12-app`。清理后：

- validation containers：0。
- validation networks：0。
- validation volumes：0。
- `.env.stage12.local`：已删除。
- Stage 12 images：保留，未删除其他 project 镜像或 volume。
- `docker system prune -a`：未执行。

## 12. Gate 判定

| Gate                         | 判定                  | 依据                                                                                  |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| Greenfield Foundation        | **是**                | Foundation 回归、Docker、Auth/Refresh/logout、迁移与安全持续通过                      |
| Course Catalog               | **是**                | 阶段 11 回归持续通过                                                                  |
| ClassSection Management      | **是**                | 阶段 11 回归持续通过                                                                  |
| Teaching Structure           | **是**                | Course 与 ClassSection 子 Gate 持续通过                                               |
| Student Identity Creation    | **是**                | 无密码身份、Profile 分离、leading zero、冲突/并发、原子回滚、无泄漏                   |
| CourseInvite                 | **是**                | 责任教师、轮换、单 ACTIVE、摘要/escrow、preview、幂等/audit/outbox、Docker            |
| JoinCapability               | **是**                | 短期、一次性、身份/班级绑定、并发单消费、rate limit、secret 不泄漏、Docker            |
| QR Join Atomicity            | **是**                | User/Profile/Enrollment/Session 单事务、精确重放、同学期唯一、失败无半成品            |
| Enrollment Core              | **是**                | list/get/manual/remove/restore、永久唯一、scope、version/history/audit/outbox、Docker |
| Student Teaching Projection  | **是**                | 只由本人 ACTIVE Enrollment 读取 Course/ClassSection，越权稳定拒绝                     |
| Enrollment Withdrawal/Rejoin | **否 / DEFAULT DENY** | ADR-054 未接受；withdraw 真实默认拒绝，Student rejoin 未开放                          |
| Enrollment/QR Join Core      | **是**                | 除 Withdrawal/Rejoin 外的六个必需子 Gate 全部为“是”                                   |
| Roster                       | **否**                | 无表、Controller 或假成功                                                             |
| Session                      | **否**                | 无实现                                                                                |
| Media                        | **否**                | MinIO 仅基础设施，不代表 Media 模块                                                   |
| Record                       | **否**                | 无实现                                                                                |
| Review                       | **否**                | 无实现                                                                                |
| Score                        | **否**                | 无实现，相关业务 ADR 未闭合                                                           |
| Export                       | **否**                | 无 ExportJob/执行能力                                                                 |
| Full Production              | **否**                | ADR-070–074、TLS/Secret/轮换、恢复、监控、隐私法务、staging 与跨端验收未关闭          |

## 13. 未解决 ADR、阶段 13 条件与发布边界

直接未解决项：

- ADR-054：学生主动 withdraw 与自行 rejoin；当前明确 default deny。
- ADR-070–074：production 幂等参数、RPO/RTO/恢复、密钥托管与轮换、审计保留/告警、migration/部署生产参数；均未批准或篡改。
- 后续 Roster、Session/Media、Review、Score、Export 相关 ADR 继续以 [`decision-log.md`](./decision-log.md) 为准，本阶段没有代替业务方接受。

阶段 13（Official Roster Import / Roster Alignment）前置条件已具备：Enrollment/QR Join Core Gate 为“是”；Enrollment 同班永久唯一和同学期 ACTIVE 唯一存在；Teacher 可读本人班 Enrollment，ADMIN 本组织只读；Student Course/ClassSection projection 闭合；ClassSection 单责任教师 scope 稳定；0001+0002+0003 可从空库部署；Docker Gate 与 teardown 通过。阶段 13 仍必须独立建立 Roster 表、合同、权限、测试与 Gate，不得由本报告推定已经实现。

本阶段没有执行 Android/Web 新 API 跨端联调，也不声称打卡、媒体、审核、成绩、导出或正式上线已完成。所有提交只保存在本地；没有 push，没有创建 Pull Request。

## 14. 实际修改范围

变更集中在：

- 合同/决策：OpenAPI、permission/runtime coverage、ADR-093/094 与受影响的 01–08 合同说明。
- 数据：Prisma schema/client、0003 migration/manifest、安全 seed、migration safety/generator。
- 共享 Foundation：配置、错误、policy resolver、QR crypto、public rate limit、日志/request context、cursor/audit。
- 业务模块：`course-invites`、`join-capabilities`、`enrollments`、student identity resolver，以及 Course/ClassSection/Users/Auth 的必要投影和事务集成。
- 测试：Unit、Integration、E2E、Contract、Security 与数据库 helper。
- 文档：roadmap、decision log、README、architecture、database baseline、runbook、本报告和历史实现报告的最新追加章节。

没有修改 Android/Web 源码、gitlink、Dockerfile 或 Compose；没有删除或改写 0001/0002。
