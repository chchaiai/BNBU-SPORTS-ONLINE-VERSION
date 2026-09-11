# PostgreSQL Greenfield 数据库基线

## Stage 21 Client Capabilities Migration、RBAC 与 Docker 口径

`0011_client_capabilities` SHA-256 为 `78acf3c51ef2c3be25c7b9c534f487c65653bec7486535ccb889df12eeb56da6`。它新增 27 张客户端能力与位置证据表；Migration 静态口径为 67 个 foreign key、38 个 explicit unique index、86 个 CHECK addition、71 个 explicit index。0001–0010 保持不可变，变更仅通过 forward-only 0011 落盘。

2026-08-06 在 Docker Desktop 4.85.0、Engine 29.6.2、Compose 5.3.1 上使用全新 PostgreSQL 18.4 volume 顺序部署 0001–0011；重复 deploy 无 pending，schema drift 为 `No difference detected`。首次验证暴露旧 Compose 把 migrator 当作 PostgreSQL bootstrap 超级用户、且 App 对 `_prisma_migrations` 具有过宽 DML 权限；修复后在另一个全新 project/volumes 从零完成最终复验。

- bootstrap、migrator、app 为三个不同身份；migrator/app 均为 `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`。
- migrator 只对当前数据库拥有 migration 所需的 `CONNECT/CREATE` 与 public schema `USAGE/CREATE`；App 只拥有数据库 `CONNECT` 与 public schema `USAGE`。
- App 拥有 0 个 relation，对 73/73 张业务表具有完整 DML；对 `_prisma_migrations` 仅 `SELECT`，无 insert/update/delete。实际 App `CREATE TABLE` 与 migration 历史更新探针均被拒绝且无残留。
- Runtime 以 UID 10001 运行；12 个本地客户端 operation 的 33 项 HTTP smoke、PostgreSQL/App restart、readiness 恢复、持久化签名、MinIO private bucket 与对象重启持久性均通过。
- 日志、环境与 image history 的 exact-secret 扫描为零泄漏；精确 teardown 后本次 project 的容器、网络、卷、镜像与临时验证文件均为 0。

该证据只覆盖隔离的本地 Synthetic Staging 和合成 fixture，不表示远程 Staging、生产备份恢复、iOS 真机闭环或 Production Gate 已完成。完整 Stage 21 边界见 [`../../docs/backend-contracts/21-client-capabilities-local-integration-report.md`](../../docs/backend-contracts/21-client-capabilities-local-integration-report.md)。

## Stage 19 Audit Read governance Migration

`0010_export_audit_governance` SHA-256 为 `42aea4159d943b1c1c541ef8558c123d0e88d8e5aed06fd462aeabc1f98fe3df`。它不新增表、FK、unique/index 或 trigger，只 forward-replace 一条 `audit_logs_action_type_check`，加入 `AUDIT_LOG_READ`；既有 AuditLog append-only trigger 保持有效。由于 Export 合同决策未闭合，数据库中没有任何 `export%` 表。

Stage 19 Docker PostgreSQL 18.4 全新 volume 顺序部署 0001–0010，重复 deploy 为 `No pending migrations to apply`，drift 为 `No difference detected`。App role 为 `CREATE=false, USAGE=true`；restart 后 organizations/users/studentProfiles/migrations 计数保持不变。该 local persistence 证据不等于生产备份恢复或 Historical Data Migration。

## Stage 18 Migration 与 Score catalog 口径

`0009_score` SHA-256：`1a4a21a6c4097cbeaaf1c8b8e7b3faef3db774f84296988f7edb9c288c06282d`。它新增 `score_rules`、`score_rule_approval_events`、`student_scores`、`student_score_revisions`、`score_contributions`、`score_adjustments`、`score_adjustment_approval_events`、`score_publication_events`、`score_recalculation_attempts` 九张表。

Migration 确定性静态口径为 9 tables、36 foreign keys、16 explicit unique indexes、10 CHECK additions、27 explicit indexes、7 user triggers。五个 trigger 保护 append-only history，两个 definition guard 保护 Rule/Adjustment 定义。Prisma Decimal 对应 PostgreSQL numeric；组织/学期/教学班/学生/Record/Review/Rule/Revision 的复合关系阻止跨 scope 引用，审批、publication、recalculation 与 adjustment history 采用追加式事实。

隔离 loopback-only PostgreSQL 18.4 空库按顺序部署 0001–0009成功，重复 deploy 无 pending，schema drift 为 0；0001–0008 checksum 未改变。该证据来自本次临时 portable PostgreSQL，实例与数据目录已清理，不能替代尚未执行的 Docker PostgreSQL/MinIO/App runtime、restart/persistence 与容器日志验收。完整证据和 Gate 限制见 [`../../docs/backend-contracts/18-score-core-implementation-report.md`](../../docs/backend-contracts/18-score-core-implementation-report.md)。

## 1. 权威版本与迁移

| 项目                        | Foundation                                                         | Teaching Structure                                                 |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| PostgreSQL                  | 18.4                                                               | 18.4                                                               |
| Prisma ORM/Client           | 7.9.1                                                              | 7.9.1                                                              |
| Migration ID                | `0001_greenfield_foundation`                                       | `0002_teaching_structure`                                          |
| Migration SHA-256           | `0573e3d13018e0db103ef4b605eb35278723174507b37379425a489b10e1462d` | `bc62c8cc42989da02eb5be92c7c68f64a72b90e6a41b3913c169333d5fbfbc41` |
| destructive                 | `false`                                                            | `false`                                                            |
| 新表                        | 12                                                                 | 3                                                                  |
| SQL foreign keys            | 23                                                                 | 14                                                                 |
| SQL explicit unique indexes | 22                                                                 | 6                                                                  |
| SQL CHECK additions         | 88                                                                 | 20                                                                 |
| SQL explicit indexes        | 38                                                                 | 12                                                                 |

统计由 `npm run db:migration:check` 对受版本控制 SQL 计算；manifest 与生成的运行时 migration manifest 必须完全一致。

2026-08-02 使用独立、loopback-only 的真实 PostgreSQL 18.4 空测试库验证 Foundation。2026-08-03 阶段 10B 在 Docker 完成 Foundation 运行验收；阶段 11 在全新 volume 应用 0001+0002；阶段 12 又在全新 Docker PostgreSQL 18.4 volume 依次应用 0001+0002+0003，第二次 deploy 为 `No pending migrations`，Prisma schema drift 为 `No difference detected`，19/19 integration 与重启持久性通过。上述均不是 production 备份恢复验收。

## 2. 表清单

| 表                             | 用途与关键边界                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `organizations`                | 组织边界、时区和 locale；V1 为单一 BNBU，但所有相关事实仍带 organization ID     |
| `system_policies`              | 每组织唯一的 `NORMAL/READ_ONLY/MAINTENANCE` 当前模式                            |
| `users`                        | opaque UUID、单基础角色、认证状态和可选密码 hash；学号不是主键                  |
| `student_profiles`             | 学生专属身份；`student_number` 为字符串并保留前导零                             |
| `teacher_profiles`             | 教师专属身份和 employee number                                                  |
| `admin_profiles`               | 管理员专属身份和 employee number                                                |
| `auth_sessions`                | 可撤销设备会话、idle/absolute expiry、撤销原因                                  |
| `refresh_tokens`               | opaque token 摘要、原子轮换、family/replacement/reuse 事实                      |
| `semesters`                    | 学年、term、日期与每组织唯一 CURRENT 学期                                       |
| `idempotency_records`          | request hash、lease、状态与加密响应快照                                         |
| `audit_logs`                   | append-only 权限/行为安全事实                                                   |
| `outbox_events`                | 事务 Outbox 状态、claim/attempt/错误摘要                                        |
| `courses`                      | Organization 范围、跨 Semester 复用的 Course 目录；生命周期使用 ACTIVE/INACTIVE |
| `class_sections`               | Course 在 Semester 下的一次开课；一个责任 Teacher；关闭/归档保留历史            |
| `class_section_excluded_dates` | ClassSection 排除日期整体值对象集合；无独立公共 API                             |
| `course_invites`               | 教学班邀请版本与轮换历史；长期只存 token HMAC，ACTIVE invite 每班最多一个       |
| `join_capabilities`            | 短期、一次性、身份与教学班绑定的加入能力及专用加密 escrow                       |
| `enrollments`                  | 学生与教学班永久关系；同班唯一、同学期 ACTIVE 唯一、remove/restore 复用同一 ID  |
| `enrollment_status_events`     | Enrollment append-only 状态事件，不作为可修改当前状态的替代品                   |

`0004_official_roster_alignment` 新增六张 Official Roster 表，`0005_exercise_session` 新增三张 Session 表，`0006_media_evidence` 新增四张 Media 表，`0007_exercise_record` 新增五张 Record/初始 Review 表。仍没有 ScoreRule、StudentScore 或 ExportJob 表；后续合同可以描述这些模块，但 migration 不预建含义不完整的空表。

## 3. 关系与约束

关键约束包括：

- 所有核心主键为 PostgreSQL `uuid`，由应用层 UUIDv7 生成；API 始终把 ID 当 opaque string。
- Profile 使用 tenant-safe `(organization_id,user_id)` 外键；一个 User 只能匹配其单一角色对应的一种 Profile。
- 学号和 employee number 在组织范围内唯一，使用字符串存储，禁止数值转换和姓名关联。
- AuthSession、RefreshToken 的 user/session/family/replacement 关系均携带 organization 范围；Refresh replacement/current 约束保证一对一轮换链。
- 每个组织最多一个 `CURRENT` Semester，由 partial unique index 保证。
- 所有闭集状态使用受命名 CHECK 约束的 `varchar/text`，不使用 PostgreSQL enum，也不接受任意字符串。
- Refresh token、idempotency、outbox 的状态形状由交叉字段 CHECK 保证，不只依赖 TypeScript。
- AuditLog 的 update/delete 由数据库触发器拒绝；Outbox 并发领取使用可跳过锁定行的索引/查询路径。
- 时间戳使用 `timestamptz`，学期边界使用 `date`；服务内部统一 UTC instant，需要 business date 时按 Organization timezone 派生。
- Course code 在 Organization 内唯一；Course 被 ClassSection 引用后不能物理删除，停用不级联修改历史 Section。
- ClassSection 的 Course、Semester、TeacherProfile、created/updated/closed actor 使用携带 Organization 的复合 FK；不能构造跨组织关系。
- ClassSection 的 `(semester_id,course_id,class_code)` 唯一；version、状态、关闭字段、日期 pair、daily time pair 由命名 CHECK 保护。
- ExcludedDate 使用 `date` 和关系表主键去重；trigger 保证其同时位于 Semester 与 ClassSection check-in 范围内。
- StudentProfile 的 `(organization_id,student_number)` 保留字符串语义和前导零；并发创建由组织唯一约束与事务冲突处理共同防重，不按姓名或联系方式模糊合并。
- CourseInvite 每个 ClassSection 最多一个 ACTIVE 版本；轮换只撤销旧版本并保留历史，原始 token 不进入普通列、AuditLog 或 Outbox。
- JoinCapability 状态形状、消费字段、identity/result ciphertext 与到期窗口由命名 CHECK 保护；同一 capability 只能成功消费一次。
- Enrollment 永久唯一 `(class_section_id,student_id)`；同一 `(organization_id,semester_id,student_id)` 最多一条 ACTIVE；状态、结束字段与 version 形状受数据库约束保护。
- EnrollmentStatusEvent 禁止 update/delete；教师 restore 更新同一 Enrollment，不创建第二条关系。

Prisma 不能完整表达的 partial unique、命名 CHECK、append-only trigger 和部分索引全部写在版本化 `migration.sql` 中，并由静态脚本与真实数据库测试共同验证。

## 4. UUIDv7 与时间

ID 由共享 `IdGenerator` 在应用层生成 UUIDv7，不依赖数据库默认 UUID，也不从学号、邮箱或姓名派生。这样既保留近似时间局部性，也避免客户端解析 ID 获取业务语义。

应用事实时间通过共享 Clock 注入。数据库保存 UTC instant；API 输出 RFC3339。Semester 的 `start_date/end_date` 是校历日期，不得用本地 midnight instant 替代。当前 local seed 的合成日期只用于可重建开发数据，不是生产校历。

## 5. 迁移策略

```powershell
npm run db:validate
npm run db:migration:check
npm run db:migration:diff
npm run db:migrate:deploy
npm run db:schema:drift:check
```

- Migration CLI 只使用 `MIGRATION_DATABASE_URL`；应用只使用 `DATABASE_URL`。
- 应用启动期间禁止自动 migration。
- 0001+0002+0003 只在 Greenfield 空 PostgreSQL 18 数据库验证，不导入、不连接、不猜测旧远程 schema。
- `0001_greenfield_foundation` 与 `0002_teaching_structure` checksum 已冻结；阶段 12 只新增 `0003_identity_enrollment_qr_join`。
- 一旦任一共享环境采用 migration，所有既有 checksum 都不可变；后续变更只能新增 forward migration，不得重写历史。
- 破坏性 contract、数据清理或 rollback 需要单独 ADR、备份、恢复验证和审批，不由应用自动执行。

## 6. 仍未完成的数据库生产条件

当前没有获批的 RPO/RTO、备份频率/保留、跨区域恢复、连接池容量、生产角色与 Secret 托管、监控阈值、隐私删除/保留流程或 staging 演练。0001+0002+0003 可迁移、local Docker restart/persistence 通过，不等于数据库已可生产运行；Production Gate 保持关闭。

## 7. 阶段 11 实际 catalog 口径

`npm run db:migration:check` 统计 migration SQL 的显式语句；PostgreSQL catalog 还会列出主键 backing index。最终容器中三张新表为 14 个 FK、19 个表内 CHECK、7 个 unique index（含 3 个主键）、13 个 total index（含主键）。0002 的 SQL 统计为 20 个 CHECK additions，是因为还 forward-replace 了既有 `audit_logs_action_type_check`；6 个显式 unique index 中 2 个在既有 Semester/TeacherProfile 上为组织复合外键提供 parent key。两种口径均已记录，schema drift 为零。

App 数据库身份没有 `CREATE` schema 权限；Migrator 身份有 migration 权限。App 启动不执行 migration。完整 Docker 证据见 [`../../docs/backend-contracts/11-teaching-structure-implementation-report.md`](../../docs/backend-contracts/11-teaching-structure-implementation-report.md)。

## 8. 阶段 12 Migration 与 catalog 口径

| 项目                        | `0003_identity_enrollment_qr_join`                                 |
| --------------------------- | ------------------------------------------------------------------ |
| SHA-256                     | `032b2f001638de63495bdb8d9bd3979ab54679eaaa7802d7526c6e5e24aaa5b7` |
| 新表                        | 4                                                                  |
| SQL foreign keys            | 20                                                                 |
| SQL explicit unique indexes | 13                                                                 |
| SQL CHECK additions         | 34                                                                 |
| SQL explicit indexes        | 25                                                                 |
| destructive                 | `false`                                                            |

最终空库共有 19 张应用表。四张新表在 PostgreSQL catalog 中为 20 个 FK、34 个 CHECK、11 个非主键 unique index、23 个非主键 total index；migration 静态口径的 13 个 unique/25 个 total index 还包含为既有 `student_profiles` 与 `class_sections` 增加的 2 个索引。两种口径均已明确记录，schema drift 为零。

0003 首次 deploy 与重复 deploy 均 exit 0，重复结果为 `No pending migrations`。App 身份对 schema/database `CREATE` 均为 false；Migrator 具有 migration 权限。合成 seed 连续执行两次不重复插入，invite 长期列只保存 64 字符摘要且没有明文 escrow。完整实现与 Docker 证据见 [`../../docs/backend-contracts/12-identity-enrollment-qr-join-implementation-report.md`](../../docs/backend-contracts/12-identity-enrollment-qr-join-implementation-report.md)。

## 9. 阶段 14 Migration 与 catalog 口径

`0005_exercise_session` SHA-256 为 `d26ea3da255e6522c893cae9f89d7d1229c4db2f6e43c4d25edfca811cac41f4`，新增 `exercise_sessions`、`exercise_session_segments`、`exercise_session_events` 三张表。Migration 静态口径为 12 FK、8 个显式 unique index、19 个 CHECK additions、15 个显式 index、3 个 user trigger；19 个 CHECK 包含对既有 AuditLog action check 的 forward replacement。

PostgreSQL catalog 对三张新表直接观察到 12 FK、18 个表内 CHECK、11 个 unique index 和 18 个 total index；后两项各包含 3 个主键 backing index。三个 user trigger 分别保护 Session 不可变身份/时序字段、segment 只允许受控关闭、event append-only。两种统计口径均已记录，不构成 drift。

Docker PostgreSQL 18.4 新空卷依次部署 0001-0005，重复 deploy 返回 `No pending migrations to apply`，schema drift 为 `No difference detected`。App role 无 schema CREATE 权限。重启前后 10 个合成 Session、14 个 segment、22 个 event 与 5 条 Migration 数量一致。当时没有 MediaEvidence、ExerciseRecord、Review、Score 或 Export 表。完整证据见 [`../../docs/backend-contracts/14-exercise-session-implementation-report.md`](../../docs/backend-contracts/14-exercise-session-implementation-report.md)。

## 10. 阶段 15 Migration 与 catalog 口径

`0006_media_evidence` SHA-256 为 `81fb6be00696084be87248445941909e04dfb130aff448585d602caa4c73cf31`，新增 `media_evidence`、`media_upload_sessions`、`media_status_events`、`media_processing_attempts`。Migration 静态口径为 10 FK、7 个显式 unique index、25 个 CHECK additions、13 个显式 index、5 个 user trigger。

触发器保护 Media 不可变 scope/声明/verified facts、单调状态、两个 history 表 append-only，并以 transaction advisory lock 串行同 Session/purpose 的 quota 检查。数据库限制活跃 IMAGE <= 6、VIDEO <= 1；应用检查提供稳定错误，数据库约束防止并发绕过。

Docker PostgreSQL 18.4 新空卷按序部署 0001–0006，重复 deploy 返回 `No pending migrations to apply`，schema drift 为 `No difference detected`。App role 无 schema CREATE，Migrator 独立执行 migration。重启后 Media 行、processing attempt 与 private MinIO object 持久存在；没有 ExerciseRecord/Review/Score/Export 表。完整证据见 [`../../docs/backend-contracts/15-media-evidence-implementation-report.md`](../../docs/backend-contracts/15-media-evidence-implementation-report.md)。

## 11. 阶段 16 Migration 与 catalog 口径

`0007_exercise_record` SHA-256 为 `d78b14c17acd1fa1f39760504525a2b1df3755472149b343da9709157bcf534f`，新增 `exercise_records`、`exercise_record_media`、`exercise_record_daily_slots`、`exercise_record_events` 与 `review_records`。Migration 确定性静态口径为 5 表、22 FK、18 unique index、22 CHECK additions、26 total indexes。

复合 FK 固定 Record/Session/Enrollment/ClassSection/Semester/Course/Student/Teacher/Organization scope；trigger 保护 Record identity/时长/已提交内容、append-only history 和冻结媒体关联。`exercise_record_daily_slots` 永久执行 `(enrollmentId,businessDate)` 唯一，CANCELLED 不释放槽位；提交先锁 Enrollment，再锁 Record/Media，并对 PostgreSQL serializable `40001` 执行有界全事务重试，确保并发同日提交严格为一条成功、一条稳定拒绝且无半副作用。

Docker PostgreSQL 18.4 新空卷按序部署 0001–0007，重复 deploy 返回 `No pending migrations to apply`，schema drift 为 `No difference detected`。App role 无 schema CREATE，Migrator 独立执行 migration。重启后 Record、media association、daily slot、event 与 initial PENDING Review 均持久存在；没有 Score 或 Export 表。完整证据见 [`../../docs/backend-contracts/16-exercise-record-implementation-report.md`](../../docs/backend-contracts/16-exercise-record-implementation-report.md)。

## 12. 阶段 17 Migration 与 Review 约束

`0008_review_core` SHA-256 为 `6e9e15d01fb41ec26cf6dedd2969f7471d69dc6595004eb477b5ec8d2c766eff`。它不新增表、FK 或 index；确定性静态口径为 0 表、0 FK、0 unique index、2 个 CHECK replacement、0 index。

Migration forward-replace `review_records` 状态形状、`exercise_record_events` event type 与 `exercise_records` mutation guard，并新增 Review insert guard：版本必须从 1 连续递增，非首条记录必须携带同 Record 的紧邻 `previous_review_id`；历史 update/delete 仍由既有 append-only trigger 拒绝。Record 仅新增受控 `REVIEWED → SUBMITTED` reopen 路径，不允许修改权威时长或提交内容。

Docker PostgreSQL 18.4 空卷按序部署 0001–0008，重复 deploy 为 `No pending migrations to apply`，schema drift 为 `No difference detected`。App role 无 schema CREATE/superuser/createdb/createrole。重启后 Record、6 条 Review 历史、AuditLog、Outbox 与 private Media 持久存在；Score/Export 表仍不存在。完整证据见 [`../../docs/backend-contracts/17-exercise-review-implementation-report.md`](../../docs/backend-contracts/17-exercise-review-implementation-report.md)。

## 13. 阶段 18 Score Migration 与 Docker 口径

`0009_score` SHA-256 为 `1a4a21a6c4097cbeaaf1c8b8e7b3faef3db774f84296988f7edb9c288c06282d`，新增 ScoreRule、审批事件、StudentScore、immutable revision、Contribution、Adjustment/审批、Publication 和 recalculation attempt 共九张表。Migration 确定性静态口径为 9 表、36 FK、16 unique index、10 CHECK additions、27 total indexes；append-only 与 definition guard trigger 保护审批、revision、contribution、publication、Rule/Adjustment 定义历史。

Stage 18V 在全新 Docker PostgreSQL 18.4 volume 中顺序部署 0001–0009，重复 deploy 为 `No pending migrations to apply`，schema drift 为 `No difference detected`。App role 对 public schema 为 `CREATE=false, USAGE=true`；Migrator 独立执行 migration，App 启动不迁移。App 与 PostgreSQL restart 后 ScoreRule 1、approval 2、StudentScore 8、revision 11、contribution 3、publication 3、adjustment 1、recalculation attempt 11、migration 9 均保持不变。该 local Compose 持久性证据不是生产备份恢复演练，ADR-070–074 和 Full Production Gate 仍关闭。完整证据见 [`../../docs/backend-contracts/18-score-core-implementation-report.md`](../../docs/backend-contracts/18-score-core-implementation-report.md)。
