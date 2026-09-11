# BNBU Sports Greenfield 权威后端

> **Current production-closure authority (2026-08-06):** the versioned candidate is
> Contract `1.4.0-contract`, derived from the byte-verified immutable Contract 1.3
> snapshot. Current governance covers 122 OpenAPI operations: 104 enabled operations
> require real HTTP conformance evidence and 18 intentionally disabled operations must
> fail closed. Historical stage totals below are retained only as prior-stage evidence
> and are superseded by
> [`CURRENT-HANDOFF.md`](../docs/backend-contracts/CURRENT-HANDOFF.md) and the generated
> [`OPERATION-COMPLETION-MATRIX.md`](../docs/backend-contracts/OPERATION-COMPLETION-MATRIX.md).

## Stage 19：Operation closure（当前状态）

当前生成器结果为 92 operations：82 verified、10 exact default-deny、0 not implemented、0 blocked。Student/Teacher projection 与 ADMIN-only Audit Read 已实现；Audit Read 自身追加 `AUDIT_LOG_READ` 且 public metadata 递归脱敏。Export 因持久化、格式、artifact lifecycle、retention、download TTL 和 retry 尚未批准，四个路由固定返回 `SYSTEM_MODE_UNSUPPORTED`，不创建表、Job、文件或 URL。

完整测试为 209/209，Docker first/repeat migration、drift、runtime smoke、restart/persistence 与 teardown 已通过。Backend Operation Coverage Gate 为“是”，但 Export Business、Client Integration、Historical Data Migration 与 Full Production 均为“否”。详见 [`../docs/backend-contracts/19-export-audit-governance-implementation-report.md`](../docs/backend-contracts/19-export-audit-governance-implementation-report.md)。

## Stage 18：Score Core（当前状态）

Stage 18 已实现 15 个 Score operation：ScoreRule 版本与双 ADMIN 审批、Decimal 成绩计算、不可变 revision/contribution、Review 驱动重算、显式 publication、ScoreAdjustment 审批，以及 Student/Teacher/ADMIN 安全投影。`openStudentScoreCorrection` 按批准规则为真实无副作用 default deny；Export 未实现。

`0009_score` 新增九张表，SHA-256 为 `1a4a21a6c4097cbeaaf1c8b8e7b3faef3db774f84296988f7edb9c288c06282d`。PostgreSQL 18.4 空库 0001–0009首次部署、重复部署和 drift 0 已验证。运行覆盖为 92 operations / 77 verified / 4 default deny / 11 not implemented / 0 blocked；五层测试为 194/194。

Score Core 总 Gate 当前仍为“否”：本次 Windows 环境没有 Docker CLI/Desktop，无法执行强制的 no-cache image、MinIO/App 容器链、restart/persistence 和容器日志验收。Android/Web 已通过 snapshot import 转为父仓库普通目录，Git 拓扑阻塞已解除，但不得用该治理修复、portable PostgreSQL 或五层测试替代 Docker 证据。详见 [`../docs/backend-contracts/18-score-core-implementation-report.md`](../docs/backend-contracts/18-score-core-implementation-report.md) 与 [`../docs/repository/monorepo-conversion-report.md`](../docs/repository/monorepo-conversion-report.md)。Export、Client Integration 与 Full Production Gate 均保持“否”。

`backend/` 是体育打卡项目唯一权威后端源码目录，由根仓库直接跟踪，不是 Git submodule。唯一人工维护的 API 机器合同是 [`../docs/backend-contracts/openapi.yaml`](../docs/backend-contracts/openapi.yaml)；生成文件、运行时 Swagger、Android DTO 和 Web Mock 均不得反向覆盖它。

本目录当前交付 Greenfield Foundation、Teaching Structure、Enrollment/QR Join、Roster、ExerciseSession、MediaEvidence 与 ExerciseRecord Core，不是完整体育打卡业务，也不是 production 发布包。旧远程 API 仍被视为未知遗留黑盒，本服务不连接或修改其数据库。

## 当前实现

技术栈锁定为 Node.js 24 LTS（CI/容器 24.18.0；本机验证 24.13.1）、npm 11、TypeScript 5.9.3 strict、NestJS app/core 11.1.28、Prisma 7.9.1 和 PostgreSQL 18.4，采用 ESM 模块化单体、REST JSON 与统一 `/api/v1` 前缀。

已实现的 9 个 Foundation operation：

| Method | Path                            | 用途                                     |
| ------ | ------------------------------- | ---------------------------------------- |
| GET    | `/api/v1/health/live`           | 进程存活探针                             |
| GET    | `/api/v1/health/ready`          | 数据库、migration 与 SystemMode 就绪探针 |
| GET    | `/api/v1/system-mode`           | 当前系统模式                             |
| POST   | `/api/v1/auth/password-login`   | 已预配 TEACHER/ADMIN 密码登录            |
| POST   | `/api/v1/auth/refresh`          | Refresh Token 原子轮换                   |
| POST   | `/api/v1/auth/logout`           | 撤销当前会话                             |
| GET    | `/api/v1/me`                    | 当前用户安全投影                         |
| GET    | `/api/v1/organizations/current` | 当前组织                                 |
| GET    | `/api/v1/semesters/current`     | 当前学期                                 |

Foundation 同时实现：Ed25519/EdDSA Access Token、Argon2id、摘要化 opaque Refresh Token、rotation/reuse detection、统一 operation policy、组织范围校验、SystemMode、数据库幂等、AuditLog、Outbox、requestId、成功/错误 envelope、严格输入校验、CORS、请求体/超时限制、结构化脱敏日志和 fail-fast 配置。

阶段 11 新增 10 个 Teaching Structure operation：

| Method | Path                                            | 权威边界                                                        |
| ------ | ----------------------------------------------- | --------------------------------------------------------------- |
| GET    | `/api/v1/courses`                               | ADMIN 本组织目录；TEACHER 仅 ACTIVE；STUDENT 由 Enrollment 阻塞 |
| POST   | `/api/v1/courses`                               | ADMIN-only 创建                                                 |
| GET    | `/api/v1/courses/{courseId}`                    | 组织/角色范围读取                                               |
| PATCH  | `/api/v1/courses/{courseId}`                    | ADMIN-only 更新、启用/停用                                      |
| GET    | `/api/v1/class-sections`                        | TEACHER 本人；ADMIN 本组织治理                                  |
| POST   | `/api/v1/class-sections`                        | TEACHER 创建本人教学班                                          |
| GET    | `/api/v1/class-sections/{classSectionId}`       | 教师/组织安全范围读取                                           |
| PATCH  | `/api/v1/class-sections/{classSectionId}`       | 本人教师字段白名单更新                                          |
| POST   | `/api/v1/class-sections/{classSectionId}/close` | 本人教师幂等关闭                                                |
| GET    | `/api/v1/teachers/{teacherId}/class-sections`   | 本人教师或 ADMIN 只读                                           |

Course Catalog、ClassSection Management、Teaching Structure、Enrollment/QR Join、Roster、ExerciseSession、MediaEvidence 与 ExerciseRecord Core 已实现；Student Course/ClassSection Projection 已由本人 ACTIVE Enrollment 闭合。OpenAPI 现有 88 个 operation：59 `IMPLEMENTED_VERIFIED`、3 `IMPLEMENTED_DEFAULT_DENY`、22 `NOT_IMPLEMENTED`、4 `BLOCKED_BY_ADR`。没有假 Controller 或假成功；`withdrawEnrollment`、`ignoreRosterAlignmentResult` 与 `withdrawExerciseRecord` 是真实 default-deny。Review、Score、Export 与 Full Production Gate 均保持关闭。

## 本地运行

完整步骤、Windows/macOS/Linux 命令和故障排查见 [`docs/local-runbook.md`](docs/local-runbook.md)。最短流程如下：

```powershell
# 从 monorepo 根目录执行；初始化脚本不会覆盖已有 backend/.env。
npm run bootstrap
npm run local:env:init
npm run local:env:check
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d
npm --prefix backend run db:generate
npm --prefix backend run db:migrate:deploy
npm --prefix backend run db:seed:local
npm --prefix backend run start:dev
```

Compose 会同时启动 PostgreSQL、MinIO、MinIO 初始化任务和 Mailpit；Mailpit UI 位于 `http://127.0.0.1:8025`。生成和启动前都会校验 `IDEMPOTENCY_LEASE < IDEMPOTENCY_RETENTION`、`QR_JOIN_SECRET_REPLAY_SECONDS >= IDEMPOTENCY_RETENTION` 与 `JOIN_CAPABILITY_TTL_SECONDS < COURSE_INVITE_TTL_SECONDS`。

应用启动不会自动执行 migration。local/development 环境可访问 `/api/docs`；Swagger 只展示权威合同的生成副本，不是新合同源。

## 测试与质量门禁

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run contract:check
npm run runtime-coverage:check
npm run db:validate
npm run db:migration:check
npm run db:schema:drift:check
npm run generate:check
npm run test
$env:TEST_DATABASE_URL = 'postgresql://bnbu_test:...@127.0.0.1:55432/bnbu_sports_test?schema=public'
$env:TEST_DATABASE_RESET_CONFIRMATION = 'BNBU_SPORTS_EPHEMERAL_TEST_DATABASE_V1'
npm run test:integration
npm run test:e2e
npm run test:contract
npm run test:security
npm run build
npm audit --audit-level=high
```

Integration/E2E 只接受 loopback 上的专用 `bnbu_test@.../bnbu_sports_test` PostgreSQL 数据库、`5432`/`55432` 端口、`schema=public` 和显式清库确认值；测试会清理全部业务测试表，绝不能指向 local、staging 或 production。2026-08-03 阶段 12 最终结果为 Unit 28/28、Integration 19/19、E2E 20/20、Contract 6/6、Security 12/12，总计 85/85、0 skip、0 todo；Foundation 与 Teaching Structure 回归持续通过。Docker Desktop 上的空 PostgreSQL 18.4、重复 deploy、零 drift、private MinIO、29 个已实现 operation smoke、非 root、restart/persistence 与 teardown 均通过。详情见 [`../docs/backend-contracts/12-identity-enrollment-qr-join-implementation-report.md`](../docs/backend-contracts/12-identity-enrollment-qr-join-implementation-report.md)。

## Migration

当前 forward-only migration 链为：

1. `prisma/migrations/0001_greenfield_foundation/`：12 张 Foundation 表；checksum 不可变。
2. `prisma/migrations/0002_teaching_structure/`：`courses`、`class_sections`、`class_section_excluded_dates`。
3. `prisma/migrations/0003_identity_enrollment_qr_join/`：`course_invites`、`join_capabilities`、`enrollments`、`enrollment_status_events`。
4. `prisma/migrations/0004_official_roster_alignment/`：六张 Roster 导入/快照/对齐/解析事件表。
5. `prisma/migrations/0005_exercise_session/`：Session、服务端确认 segment 与 append-only event。
6. `prisma/migrations/0006_media_evidence/`：Media 当前事实、上传会话、append-only 状态历史与处理尝试；不预建 Record、Review、Score 或 Export 表。

```powershell
npm run db:migration:check
npm run db:migration:diff
npm run db:migrate:deploy
npm run db:schema:drift:check
```

迁移必须由独立部署步骤使用 `MIGRATION_DATABASE_URL` 执行；应用只使用最小权限 `DATABASE_URL`。数据库细节与当前 checksum 见 [`docs/database-baseline.md`](docs/database-baseline.md)。

## 实施进度账本

[`../docs/backend-contracts/backend-implementation-roadmap.md`](../docs/backend-contracts/backend-implementation-roadmap.md) 从唯一 OpenAPI 与 `runtime-coverage.manifest.json` 生成，逐 operation 记录 Controller、policy、use case、repository、migration 与测试证据。修改 manifest 后运行：

```powershell
npm run runtime-coverage:generate
npm run runtime-coverage:check
```

不能手工把“OpenAPI 已声明”或通用 404 标为已实现。

## 环境变量

`.env.example` 只有字段、占位符和本地说明，不包含可用 Secret。所有必填项缺失、仍含 `CHANGE_ME`、格式错误或 TTL 关系不合法时，应用都会启动失败。主要分组：

- 应用：`APP_ENV`、`APP_VERSION`、`PORT`、`LOG_LEVEL`；
- 数据库：`DATABASE_URL`，migration CLI 另用 `MIGRATION_DATABASE_URL`；staging/production 还必须把完整 TencentDB CA 链挂载到 `TENCENTDB_CA_FILE`；
- Token：issuer、audience、Ed25519 私钥/公钥、Access/Refresh TTL；
- 安全：幂等 retention/lease/AES key、HMAC key、登录限流；
- QR Join：邀请/能力 TTL、专用 HMAC/AES key、公开接口限流与精确重放窗口；
- HTTP：CORS allowlist、trust proxy、请求体上限、请求超时；
- 系统：`SYSTEM_MODE_SOURCE=database`；
- local-only：PostgreSQL/MinIO/seed 合成凭证。

Foundation 不提供 production TTL、Secret 或密钥托管默认值。浏览器 Refresh Token transport、生产密钥轮换/`kid`、分布式限流、备份恢复、审计保留和告警责任仍受 Production Gate 阻塞。

## 架构与权威关系

- 架构、请求生命周期和事务边界：[`docs/architecture.md`](docs/architecture.md)
- 数据库与 migration 基线：[`docs/database-baseline.md`](docs/database-baseline.md)
- 本地运行手册：[`docs/local-runbook.md`](docs/local-runbook.md)
- 合同闭合证据：[`../docs/backend-contracts/09b-contract-closure.md`](../docs/backend-contracts/09b-contract-closure.md)
- 实施报告：[`../docs/backend-contracts/10-implementation-report.md`](../docs/backend-contracts/10-implementation-report.md)

权威顺序固定为：已接受 ADR/业务决策 → 统一业务规则 → OpenAPI → 后端实现 → 客户端实现 → Mock/展示文档。生成的 Prisma Client 和 OpenAPI metadata 可以被重新生成，不得手工维护为第二套事实。

## 阶段 12：学生身份、Enrollment 与 QR Join

Stage 12 在既有 Course/ClassSection 之上新增 10 个 operation：CourseInvite 创建/轮换与公开预览、JoinCapability 签发、原子 QR Join、Enrollment list/get/manual add/remove/restore，以及一个真实但按 ADR-054 默认拒绝的 withdraw route。Stage 13 新增私有 FILE Roster import、版本/rollback、alignment 与 resolution operations；Roster 永不修改 Enrollment/Profile/User。学生只通过本人 `ACTIVE` Enrollment 读取关联 Course/ClassSection；不会获得组织目录或他人关系。

二维码流程不要求普通 Access Token。公开 invite token 与 join capability 均采用公开 UUIDv7 ID + 高熵 secret，长期只保存独立 HMAC；身份 snapshot 和短期精确重放结果使用用途绑定的 AES-256-GCM escrow。Join 在 Serializable PostgreSQL 事务中原子创建或严格复用无密码 STUDENT User/StudentProfile，创建 ACTIVE Enrollment、AuthSession/RefreshToken、状态事件、AuditLog 与 Outbox，并消费 capability；任一步失败全部回滚。

当前运行账本为 88 个 OpenAPI operation：59 `IMPLEMENTED_VERIFIED`、3 `IMPLEMENTED_DEFAULT_DENY`、22 `NOT_IMPLEMENTED`、4 `BLOCKED_BY_ADR`。Enrollment/QR Join、Roster、ExerciseSession、MediaEvidence 与 ExerciseRecord Core 已完成运行验收。学生 Enrollment withdraw/rejoin、Roster ignore 与 ExerciseRecord withdraw 保持真实 default deny；Session 离线计时/自动过期/生产参数、Media retention/production processing、Review decision、Score、Export 与 Full Production Gate 仍为“否”。

## 阶段 14：ExerciseSession Core

Stage 14 实现 OpenAPI 已有的 start、get active、get、pause、resume、finish、cancel 与 conservative reconcile 八个 operation，未新增 Session list。服务端决定 `startedAt`、组织时区 `businessDate`、状态与时长；暂停区间不计入有效时长，7200 秒封顶，一名学生最多一个非终态 Session。未验证离线区间不加时，ADR-021 的 heartbeat、宽限和自动过期参数仍未批准。

`0005_exercise_session` 新增 Session、segment 与 append-only event 三张表。最终五层测试 135/135；Docker 新空卷 0001-0005、重复 deploy、零 drift、private MinIO、非 root、全量 smoke、重启/持久性、503→200、fail-fast、日志扫描与 teardown 均通过。详见 [`../docs/backend-contracts/14-exercise-session-implementation-report.md`](../docs/backend-contracts/14-exercise-session-implementation-report.md)。

## 阶段 15：MediaEvidence Core

Stage 15 实现 initiate、confirm、metadata get、同 Session bind 与短期 access URL 五个 operation。Initiate 分配稳定 `mediaId` 和 `uploadSessionId`；服务端从 private object bytes 验证 MIME、size、SHA-256、图片尺寸或视频时长，声明字段与 verified 字段严格分离。绑定后由数据库驱动 worker 执行 BOUND → PROCESSING → AVAILABLE/FAILED，处理 attempt、状态历史、AuditLog 和 Outbox 各自持久化。

Compose 为 Roster 与 Media 建立独立 private bucket 和最小权限身份；App 非 root，公共 projection 与日志不暴露 storageKey 或 signed URL。IMAGE 每 Session 最多 6，VIDEO 最多 1；Teacher 仅责任班 metadata，Teacher/Admin 原件均拒绝。`0006_media_evidence` 新增四张表，不创建 ExerciseRecord。最终五层测试 149/149，Docker 真实 IMAGE/VIDEO、0001-0006、repeat deploy、zero drift、restart/worker recovery/persistence、production fail-fast、日志扫描与 teardown 均通过。详见 [`../docs/backend-contracts/15-media-evidence-implementation-report.md`](../docs/backend-contracts/15-media-evidence-implementation-report.md)。

## 阶段 16：ExerciseRecord Core

Stage 16 实现 list、create draft、get、update draft、submit 与 discard 六个 verified operation；withdraw route 真实完成认证、资源 scope 和 DTO 校验后按 ADR-020 稳定 default deny。Record 只能由本人 COMPLETED Session 建立；服务端按权威时长折算 3600/7200 秒，客户端不能自报信用时长或审核结果。

`0007_exercise_record` 新增 Record、冻结媒体关联、每日槽位、append-only event 与 ReviewRecord 五张表。Submit 在同一 PostgreSQL 事务中冻结 AVAILABLE 同 Session 媒体、永久占用 `(enrollmentId,businessDate)`、写 SUBMITTED/history/AuditLog/Outbox，并建立首条 system PENDING Review。同日并发提交由 Enrollment 行锁、数据库唯一约束与最多三次的 serializable 全事务重试共同闭合。最终五层测试 164/164；Docker 新空卷 0001–0007、repeat deploy、zero drift、真实 Record chain 与并发 rollback、non-root、restart/persistence、production fail-fast、日志扫描与 teardown 均通过。详见 [`../docs/backend-contracts/16-exercise-record-implementation-report.md`](../docs/backend-contracts/16-exercise-record-implementation-report.md)。

## 阶段 17：ExerciseReview Core

Stage 17 实现 Review history list、责任教师 VALID/INVALID、reopen 与 batch 四个既有 operation。ReviewRecord 只追加；当前结果由最高 `reviewVersion` 推导。每次 mutation 同时校验 Record `expectedVersion` 和 `expectedReviewVersion`，并由数据库紧邻版本约束防止并发绕过。Reopen 追加 PENDING 并将 Record 恢复为 SUBMITTED，不修改旧 Review。

Batch 保持输入顺序、逐项独立事务、部分成功和精确幂等重放。非空 `creditedDurationOverrideSeconds` 固定返回 `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED`；学生 projection 不含 internalNote、教师身份或 storageKey。责任教师只能为已经冻结关联到 Record 的 AVAILABLE Media 创建短期原始访问 URL。

`0008_review_core` 不新增表，只 forward-replace Review/Record/Event 约束和触发器；SHA-256 为 `6e9e15d01fb41ec26cf6dedd2969f7471d69dc6595004eb477b5ec8d2c766eff`。最终 runtime coverage 为 88 / 63 verified / 3 default deny / 18 not implemented / 4 blocked，五层测试为 181/181。Score、Export 与 Production 仍未实现。完整证据见 [`../docs/backend-contracts/17-exercise-review-implementation-report.md`](../docs/backend-contracts/17-exercise-review-implementation-report.md)。

## 阶段 18V：Score Core Docker Gate

Stage 18 已实现 Rule/双 ADMIN 审批、Decimal 计算、immutable revision/contribution、Review 驱动重算、显式 Publication、Adjustment 审批和 correction default deny。Stage 18V 在真实 Docker Desktop/Engine 上完成 runtime/migrator no-cache build，PostgreSQL 18.4、private MinIO、0001–0009 first/repeat、drift 0、non-root App、完整 Score HTTP/worker/database 链、restart/persistence、production fail-fast、CORS、日志脱敏和 teardown 全部通过。

当前 runtime coverage 为 OpenAPI 92、77 verified、4 true default deny、11 not implemented、0 blocked；五层基线为 194/194。Score Core Gate 为“是”，但 Export、Client Integration、Historical Data Migration 和 Full Production 仍为“否”。完整证据见 [`../docs/backend-contracts/18-score-core-implementation-report.md`](../docs/backend-contracts/18-score-core-implementation-report.md)。
