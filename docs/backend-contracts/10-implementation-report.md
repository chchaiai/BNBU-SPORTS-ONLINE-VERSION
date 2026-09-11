# Greenfield Foundation 实施报告

> 验证日期：2026-08-02 · 分支：`backend/greenfield-foundation` · 范围：权威后端 Foundation；不等于完整体育打卡业务或 production 就绪。

## 1. 决策与权威路径

项目已正式接受 Greenfield：根仓库 `backend/` 是唯一权威后端源码路径，是普通目录而非 submodule。唯一人工维护的 API 机器合同为 `docs/backend-contracts/openapi.yaml`。旧远程 API 仍是未知遗留黑盒，本轮没有连接、修改或反推其数据库。

Android 与 Web 仍保持各自 submodule；本轮只做回归，没有修改源码或 gitlink：

- Android：`e4cd2e5a623261cd19cddbd59d5cda7627bf7e98`
- Web：`a602280b4aa46d3e944671d341a7bf12bacb17cb`

## 2. 分支与阶段提交

|   # | Commit                                        | Subject                                                            |
| --: | --------------------------------------------- | ------------------------------------------------------------------ |
|   1 | `0660d3fcd54c51252ec377146b12832b815ee7da`    | `docs(backend): accept greenfield backend authority baseline`      |
|   2 | `ffccbb818cdc9f4724c2d9be7f2be28b7ef7ebb9`    | `docs(api): close deterministic greenfield contract gaps`          |
|   3 | `827616a74f5340649770aa55d32340118779a5d4`    | `chore(backend): bootstrap greenfield NestJS service`              |
|   4 | `cc39cc9e9a35749c3fe70fb6b5e89b4edcdf382e`    | `feat(backend): add PostgreSQL foundation and migrations`          |
|   5 | `4f729195db935b817b3f7f1f6da6627dc8d82018`    | `feat(backend): implement shared auth policy and HTTP foundations` |
|   6 | `f8b9822b83bbbecdebcebf817b7487925ec6f5c2`    | `test(backend): add contract integration and security gates`       |
|   7 | 本报告所在提交（最终 hash 以 `git log` 为准） | `docs(backend): report greenfield foundation implementation`       |

没有 push、Pull Request、merge、rebase、pull 或 fetch。

## 3. 技术栈与新增目录

| 组件           | 实际版本/选择                                                    |
| -------------- | ---------------------------------------------------------------- |
| Node.js        | Node 24 LTS；CI/容器 24.18.0，本机验证 24.13.1                   |
| npm            | 11.8.0 package manager contract                                  |
| TypeScript     | 5.9.3 strict；ADR-089 明确暂不强装 TS 7                          |
| NestJS         | app/core 11.1.28；CLI 11.0.24                                    |
| Prisma         | 7.9.1                                                            |
| PostgreSQL     | 18.4                                                             |
| API            | REST JSON，`/api/v1`                                             |
| Auth           | Argon2id；JOSE EdDSA/Ed25519；opaque hashed Refresh Token        |
| 架构           | ESM Docker 化模块化单体；PostgreSQL transaction/outbox           |
| Object storage | S3-compatible Port 边界；local Compose MinIO，仅基础设施未接业务 |

新增的主要目录/文件：

- `backend/src/common/`：配置、数据库、错误/HTTP、policy、idempotency、audit、outbox、日志、限流、安全、时间/ID；
- `backend/src/modules/`：auth、health、system-mode、organizations、semesters、users；
- `backend/src/generated/`：可重建的 Prisma/OpenAPI/policy/migration artifacts；
- `backend/prisma/`：schema、seed、版本化 migration；
- `backend/test/`：unit/integration/e2e/contract/security；
- `backend/docs/`：架构、数据库和本地 runbook；
- `tools/backend-contracts/`：确定性合同检查；
- `.github/workflows/backend-ci.yml`：后端质量门禁。

## 4. 合同修复与 OpenAPI

确定性合同修复包括：删除 claim-review/UNDER_REVIEW、统一每日唯一键、冻结 ReviewRecord 和学生 currentReview 投影、稳定 mediaId 与 declared/verified hash、精确 AuditLog、闭合 QR Join transport、为全部 operation 建立权限 metadata、冻结 Review/Adjustment reason 和 ExportType，并对未批准能力 default closed。详见 `09b-contract-closure.md`。

| 指标                      |              结果 |
| ------------------------- | ----------------: |
| paths                     |                73 |
| operations                |                86 |
| schemas                   |               212 |
| local refs checked        |             1,249 |
| unresolved refs           |                 0 |
| operation policy coverage |     86/86（100%） |
| permission registry diff  |                 0 |
| named enums / values      |          31 / 140 |
| named enum diff           |                 0 |
| ErrorCode                 |               143 |
| ErrorCode diff            |                 0 |
| Redocly warnings          | 6，非阻塞且未隐藏 |

警告为：缺 license、3 个公开只读探针没有 4XX、`ResponseMeta`/`ScoreContribution` 两个 component 未引用。

## 5. 数据库与 Migration

| 项目              | 实际结果                                                           |
| ----------------- | ------------------------------------------------------------------ |
| Migration ID      | `0001_greenfield_foundation`                                       |
| SHA-256           | `0573e3d13018e0db103ef4b605eb35278723174507b37379425a489b10e1462d` |
| tables            | 12                                                                 |
| foreign keys      | 23                                                                 |
| unique indexes    | 22                                                                 |
| CHECK constraints | 88                                                                 |
| total indexes     | 38                                                                 |
| destructive       | false                                                              |

表为 Organization、SystemPolicy、User、StudentProfile、TeacherProfile、AdminProfile、AuthSession、RefreshToken、Semester、IdempotencyRecord、AuditLog、OutboxEvent。主键为应用层 UUIDv7/PostgreSQL uuid；学号是保留前导零的字符串，不作主键；状态闭集由命名 CHECK 保护；AuditLog 有 append-only trigger。

真实 PostgreSQL 18.4 验证使用官方 PostgreSQL Windows 页面所链接的 EDB portable binaries，在 `C:\tmp` 启动 loopback-only、一次性 trust 测试实例；下载包 SHA-256 为 `7EFFE34C0BF89027B3F171447D351CBC460F4566C8D0F643DAEC67F140787858`。验证结果：空库 deploy 成功、重复 deploy 无副作用、schema drift 为零、6/6 集成测试通过。该临时实例不在仓库内，不是 Docker 或 production 环境。

## 6. 已实现与未实现接口

已实现 9 个 operation：

1. `GET /api/v1/health/live`
2. `GET /api/v1/health/ready`
3. `GET /api/v1/system-mode`
4. `POST /api/v1/auth/password-login`
5. `POST /api/v1/auth/refresh`
6. `POST /api/v1/auth/logout`
7. `GET /api/v1/me`
8. `GET /api/v1/organizations/current`
9. `GET /api/v1/semesters/current`

未实现 77 个合同 operation。没有为 Course/ClassSection、Enrollment/QR Join、Roster、ExerciseSession、MediaEvidence、ExerciseRecord、Review、Score 或 Export 创建假 Controller、空任务、假下载 URL 或 Mock fallback。

## 7. Foundation 能力

- 预配 TEACHER/ADMIN 密码登录、禁用/未验证/角色拒绝；
- Argon2id 与 Ed25519/EdDSA exact-algorithm JWT，最小 claims；
- opaque Refresh Token 摘要、原子 rotation、reuse detection、session revoke/logout；
- access policy 生成/守卫、role/organization/resource scope default deny；
- 数据库 SystemMode，READ_ONLY/MAINTENANCE fail closed；
- requestId、成功/错误 envelope、严格 DTO/枚举、body parse error 映射；
- Helmet、精确 CORS allowlist、body limit、timeout、trust proxy 显式配置；
- PostgreSQL 幂等预留、HMAC canonical request hash、AES-GCM response snapshot；
- AuditLog allowlist/HMAC source facts、数据库 append-only；
- Outbox 状态机与 `SKIP LOCKED` 并发领取；
- JSON 日志与 Token/密码/联系方式脱敏；
- liveness/readiness、migration compatibility、local-only Swagger；
- fail-fast 环境校验、分离 app/migrator 数据库 URL。

## 8. 测试与质量结果

| 层                |  结果 | 关键覆盖                                                                                                     |
| ----------------- | ----: | ------------------------------------------------------------------------------------------------------------ |
| Unit              | 12/12 | ID、Clock、requestId/envelope/error、guard/scope、密码/Token/refresh、幂等、审计脱敏、Outbox                 |
| Integration       |   6/6 | 空库 migration/约束、leading-zero、CURRENT Semester、append-only、并发 Outbox、SystemMode/rollback           |
| E2E               |   8/8 | live/ready/mode、login/me、错误/禁用/Token、refresh/reuse/logout、并发幂等、mode、validation/CORS/body limit |
| Contract          |   3/3 | OpenAPI/refs/policies、manifest、Foundation HTTP contract                                                    |
| Security negative |   4/4 | 伪造/撤销/跨组织凭证、未知 metadata、CORS、超大 body、requestId/日志脱敏                                     |
| 总计              | 33/33 | 无 skip、无删除测试换通过                                                                                    |

最终复跑发现原 Token 篡改测试偶尔会把末字符替换成其原值，导致该轮没有真正篡改。测试已改为确定性翻转 signature 首字符并重新全量通过；生产 Token 实现没有为迁就测试而放宽或改写。

同时通过：format、lint（0 warning）、strict typecheck、build、Prisma validate、migration safety、generated artifact check、contract check、schema drift 和 `git diff --check`。`npm audit --audit-level=high` 为 0 vulnerabilities。

CI 使用独立 `postgres:18.4-alpine3.24` service，执行锁定依赖安装、两次 migration deploy、drift、五层测试、build、audit、Docker build 和 Git diff。工作流已静态解析，但本轮没有 push/PR，所以没有远程 CI run 证据。

## 9. Android/Web 回归

| 客户端               | 结果  | 说明                                                           |
| -------------------- | ----- | -------------------------------------------------------------- |
| Android              | 通过  | `gradlew.bat testDebugUnitTest` exit 0；hash 仍为 `e4cd2e5...` |
| Web typecheck        | 通过  | 两个 TypeScript config 均 exit 0                               |
| Web production build | 通过  | vinext/Vite 五阶段 build 完成                                  |
| Web tests            | 25/25 | 现有五个测试文件全部通过；hash 仍为 `a602280...`               |

这些结果只证明现有客户端/Mock 回归，没有进行新 Greenfield API 的跨端业务联调，也不证明兼容旧远程服务。

## 10. Docker 与运行安全

Dockerfile 已实现多阶段 build、`npm ci`、独立 migrator、生产依赖裁剪、固定 Node 24.18.0 series、非 root UID/GID、healthcheck，并通过 `.dockerignore` 排除 `.env`、测试和 Git metadata。Compose 固定 PostgreSQL 18.4 和 MinIO 镜像，loopback 绑定且 bucket 私有。

本机未安装/不可用 Docker CLI/daemon，因此 Compose 启动和 Docker image build **未执行**。CI 包含 Docker build 但没有远程 run。不能把“Dockerfile 存在”写成“Docker 验收通过”。

## 11. Gate 判定

| Gate                            | 判定   | 依据                                                                                      |
| ------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| Greenfield Foundation 实现范围  | 是     | 合同、工程、12 表、Auth/Policy/HTTP/Idempotency/Audit/Outbox/Health、33/33 测试均完成     |
| Greenfield Foundation 验收 Gate | **否** | 30 项严格标准中，本机 Docker Compose 启动和 Docker build 无执行证据；其余当前可执行项通过 |
| Course/ClassSection             | 否     | 写职责 ADR-067 未批准，无实现                                                             |
| Enrollment/QR Join              | 否     | transport 已闭合，完整表/用例/跨端验证未实现                                              |
| Roster                          | 否     | 无后端导入/对齐模块                                                                       |
| Session/Media/Record            | 否     | 可信计时与媒体 production 决策未关闭，无实现                                              |
| Review                          | 否     | V1 合同已闭合，无业务 Controller/表                                                       |
| Score                           | 否     | 公式、分类、激活/发布仍阻塞                                                               |
| Export                          | 否     | 只冻结 ExportType，V1 不建 ExportJob                                                      |
| Full Production                 | **否** | Secret/轮换、TTL、备份恢复、媒体、保留、告警、staging、HTTPS、隐私法务均未验收            |

## 12. 仍阻塞的 ADR

decision log 当前有 31 个 `PROPOSED`：

- 业务/审核/成绩：ADR-018、019、020、047、054、056、057、059、062、067、069；
- Session/Media：ADR-021、023、029、030、040、060、068；
- 身份/治理/数据能力：ADR-022、024、026、027、032、044、045、046；
- Foundation production 参数与运行：ADR-070、071、072、073、074。

其中 ADR-070/071/072/073/074 直接阻塞 production 幂等、恢复、密钥、审计/监控和 migration contract gate。任何推荐值仍是待确认方案，不能写入 production 默认配置。

## 13. 下一阶段建议顺序

1. 在有 Docker 的隔离机器执行 Compose、Docker build、CI 等价命令，关闭 Foundation 最后一项验收缺口；
2. 批准生产相关 ADR-070–074，但仍不立即上线；
3. 先实现只读 Course/ClassSection 与明确责任教师边界；
4. 实现一次性 QR Join + ACTIVE Enrollment 原子事务；
5. 依次实现 Roster、ExerciseSession、MediaEvidence、ExerciseRecord；
6. 以真实 `recordId` 完成学生提交 → API → 教师 Review → 数据/凭证全链路；
7. 业务方批准成绩公式/分类/发布后再打开 Score；
8. 最后进行 Android/Web/iOS 真实联调、旧 API 遥测/adapter、staging、恢复演练和 Production Gate。

## 14. Git 与发布边界

第七阶段提交后根工作树应为 clean；最终交付时必须再次核对。Android/Web gitlink 不变。所有七个提交仅存在于本地分支；没有 push，也没有创建 Pull Request。当前报告不得被解释为“所有后端已完成”“已可正式上线”“已兼容所有客户端”“已完成成绩计算/媒体 production 安全”。

## 15. 阶段 10B Docker 运行复验（2026-08-03）

上文第 10、11 节记录的“当时本机没有/不可用 Docker，因此 Compose 与 image build 未执行、Foundation 验收 Gate 为否”是 2026-08-02 的历史事实，必须保留，不能回写成当时已经通过。

2026-08-03 在新分支 `backend/foundation-runtime-validation`、Foundation 基线 `6f31509` 上，Docker Desktop/Engine 已可用。阶段 10B 使用 Compose project `bnbu-foundation-validation` 完成真实无缓存 BuildKit build、PostgreSQL 18.4、MinIO/private bucket、MinIO init、专用 Migrator、非 root Backend App、空库/重复 migration、零 schema drift、9 个 Foundation operation、Refresh rotation/reuse/logout、日志脱敏、App/PostgreSQL restart/persistence、全量 33/33 与 teardown。完整证据见 [`10a-foundation-runtime-validation.md`](./10a-foundation-runtime-validation.md)。

运行复验发现并修复：容器缺 OpenSSL；基线生产依赖阶段残留冗余 `npm cache clean --force`；JWT E2E 末字符篡改可能只改变 Base64URL 未使用位而不改变签名字节。最终 Dockerfile 不含 `--force`，Prisma 无 OpenSSL 警告，生产 Token 实现没有为迁就测试而放宽。

最新 Gate（不覆盖上文历史快照）：

| Gate                            | 2026-08-03 最新判定 | 边界                                                                  |
| ------------------------------- | ------------------- | --------------------------------------------------------------------- |
| Greenfield Foundation 验收 Gate | **是**              | 阶段 10B 全部强制 Docker/runtime/quality/teardown 项通过              |
| Course/ClassSection             | 否                  | 未实现                                                                |
| Enrollment/QR Join              | 否                  | 未实现                                                                |
| Roster                          | 否                  | 未实现                                                                |
| Session/Media/Record            | 否                  | 未实现                                                                |
| Review                          | 否                  | 未实现                                                                |
| Score                           | 否                  | 未实现                                                                |
| Export                          | 否                  | 未实现                                                                |
| Full Production                 | **否**              | production Secret/轮换、TLS、恢复、告警、媒体、业务与跨端 Gate 未关闭 |

ADR-070–074 仍未批准；local Compose restart/persistence 不是 production 备份恢复演练。Android/Web gitlink 仍分别为 `e4cd2e5a623261cd19cddbd59d5cda7627bf7e98` 与 `a602280b4aa46d3e944671d341a7bf12bacb17cb`。阶段 10B 没有 push，也没有创建 Pull Request。

## 16. 阶段 11 教学结构复验（2026-08-03）

上文 Foundation 初次实现时“本机没有 Docker、Foundation 验收 Gate 为否”，以及阶段 10B 将 Foundation Gate 关闭为“是”，均为必须保留的历史事实。阶段 11 没有重写这些结论，而是在新分支 `backend/teaching-structure`、基线 `8f116988b3a455beb530fa37bb8d87fe8b10190a` 上新增独立业务 Gate。

ADR-067 已接受；Course 与 ClassSection 完整实现 10 个 operation。`0002_teaching_structure` 新增 `courses`、`class_sections`、`class_section_excluded_dates`，checksum 为 `bc62c8cc42989da02eb5be92c7c68f64a72b90e6a41b3913c169333d5fbfbc41`；`0001` 未修改。运行覆盖账本现为 86 operation：19 `IMPLEMENTED_VERIFIED`、0 `IMPLEMENTED_DEFAULT_DENY`、60 `NOT_IMPLEMENTED`、7 `BLOCKED_BY_ADR`。

阶段 11 在 Compose project `bnbu-teaching-structure-validation` 上完成最终提交 `218b589` 的 runtime/migrator 无缓存构建、全新 PostgreSQL 18.4 空 volume、0001+0002 首次/重复 deploy、零 drift、private MinIO、非 root App、9 个 Foundation + 10 个教学结构 operation Docker smoke、Refresh rotation/reuse/logout、角色/组织负例、App/PostgreSQL restart/persistence、日志脱敏和 teardown。完整证据见 [`11-teaching-structure-implementation-report.md`](./11-teaching-structure-implementation-report.md)。

最新 Gate（不覆盖历史快照）：

| Gate                      | 2026-08-03 最新判定     | 边界                                                                           |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| Greenfield Foundation     | **是**                  | Foundation 33/33 与阶段 10B Docker 证据持续通过                                |
| Course Catalog            | **是**                  | ADMIN 组织治理、Teacher/Student 写拒绝、幂等/version/audit/outbox、Docker 通过 |
| ClassSection Management   | **是**                  | 本人教师管理、ADMIN 只读、跨教师/跨组织、日期/关闭、Docker 通过                |
| Teaching Structure        | **是**                  | Course 与 ClassSection 子 Gate 均通过                                          |
| Student Course Projection | `BLOCKED_BY_ENROLLMENT` | 当前 403 且无假空列表                                                          |
| Enrollment/QR Join        | 否                      | 未实现                                                                         |
| Roster                    | 否                      | 未实现                                                                         |
| Session/Media/Record      | 否                      | 未实现                                                                         |
| Review                    | 否                      | 未实现                                                                         |
| Score                     | 否                      | 未实现                                                                         |
| Export                    | 否                      | 未实现                                                                         |
| Full Production           | **否**                  | ADR-070–074 与 production/跨端验收仍未关闭                                     |

阶段 11 没有修改 Android/Web gitlink、没有 push、没有创建 Pull Request，也不声称 Enrollment、打卡、审核、成绩、客户端联调或正式上线已经完成。

## 17. 阶段 12 学生身份、Enrollment 与 QR Join 复验（2026-08-03）

上文 Foundation 初次实现时“本机没有 Docker、Foundation 验收 Gate 为否”、阶段 10B 将 Foundation Gate 关闭为“是”，以及阶段 11 Teaching Structure Gate 为“是”，均是必须保留的历史事实。阶段 12 在新分支 `backend/enrollment-qr-join`、基线 `625cac9275f4c2d8a722700b9e0a494526e1404a` 上新增独立 Enrollment/QR Join 业务 Gate，没有回写历史快照。

ADR-080、093、094 已落实；ADR-054 继续为 `PROPOSED`。`0003_identity_enrollment_qr_join` 新增 `course_invites`、`join_capabilities`、`enrollments`、`enrollment_status_events`，checksum 为 `032b2f001638de63495bdb8d9bd3979ab54679eaaa7802d7526c6e5e24aaa5b7`；0001/0002 未修改。运行覆盖账本现为 86 operation：28 `IMPLEMENTED_VERIFIED`、1 `IMPLEMENTED_DEFAULT_DENY`、51 `NOT_IMPLEMENTED`、6 `BLOCKED_BY_ADR`。

阶段 12 在 Compose project `bnbu-enrollment-qr-join-validation` 上完成 `d7ea554` 的 runtime/migrator 无缓存构建、全新 PostgreSQL 18.4 空 volume、0001+0002+0003 首次/重复 deploy、零 drift、private MinIO、非 root App、9 个 Foundation + 10 个 Teaching Structure + 10 个 Stage 12 operation Docker smoke、Refresh rotation/reuse/logout、invite rotation、capability single-use、原子 Join、manual/remove/restore、withdraw default deny、App/PostgreSQL restart/persistence、production fail-fast、日志脱敏和 teardown。五层测试为 85/85、0 skip、0 todo。完整证据见 [`12-identity-enrollment-qr-join-implementation-report.md`](./12-identity-enrollment-qr-join-implementation-report.md)。

最新 Gate（不覆盖历史快照）：

| Gate                         | 2026-08-03 最新判定   | 边界                                                        |
| ---------------------------- | --------------------- | ----------------------------------------------------------- |
| Greenfield Foundation        | **是**                | Foundation 与 Docker 回归持续通过                           |
| Course Catalog               | **是**                | 阶段 11 回归持续通过                                        |
| ClassSection Management      | **是**                | 阶段 11 回归持续通过                                        |
| Teaching Structure           | **是**                | 两个教学结构子 Gate 持续通过                                |
| Student Identity Creation    | **是**                | 无密码身份、唯一性、并发、原子性与脱敏通过                  |
| CourseInvite                 | **是**                | 轮换、单 ACTIVE、token 安全、preview、scope 与 Docker 通过  |
| JoinCapability               | **是**                | 短期、一次性、身份/班级绑定、单消费、rate limit 通过        |
| QR Join Atomicity            | **是**                | User/Profile/Enrollment/Session 单事务与精确重放通过        |
| Enrollment Core              | **是**                | list/get/manual/remove/restore、scope/version/history 通过  |
| Student Teaching Projection  | **是**                | 只由本人 ACTIVE Enrollment 派生                             |
| Enrollment Withdrawal/Rejoin | **否 / DEFAULT DENY** | ADR-054 未接受；真实 withdraw route 固定拒绝，rejoin 未开放 |
| Enrollment/QR Join Core      | **是**                | 六个必需子 Gate 全部通过                                    |
| Roster                       | 否                    | 未实现                                                      |
| Session/Media/Record         | 否                    | 未实现；MinIO 仅基础设施                                    |
| Review                       | 否                    | 未实现                                                      |
| Score                        | 否                    | 未实现                                                      |
| Export                       | 否                    | 未实现                                                      |
| Full Production              | **否**                | ADR-070–074、production/跨端/恢复/监控/隐私验收未关闭       |

阶段 12 没有修改 Android/Web gitlink、没有 push、没有创建 Pull Request，也不声称 Roster、打卡、媒体、审核、成绩、客户端联调或正式上线已经完成。
