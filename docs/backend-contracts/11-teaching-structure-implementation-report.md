# Greenfield 教学结构实现与运行验收报告（阶段 11）

> 验证日期：2026-08-03（America/Los_Angeles）
>
> 分支：`backend/teaching-structure`
>
> 权威基线：`8f116988b3a455beb530fa37bb8d87fe8b10190a`
>
> 最终 Docker 源码提交：`218b58925556d5f314b51a250be441e86a909339`
>
> Compose project：`bnbu-teaching-structure-validation`

结论：**Course Catalog Gate、ClassSection Management Gate、Teaching Structure Gate 均为“是”**。Student Course Projection 为 `BLOCKED_BY_ENROLLMENT`；Enrollment/QR Join、Roster、Session、Media、Record、Review、Score、Export 和 Full Production Gate 仍为“否”。

## 1. 范围与 Git 基线

本阶段只实现组织级 Course 目录和单责任教师 ClassSection。没有创建 Enrollment、CourseInvite/JoinCapability、Roster、ExerciseSession、MediaEvidence、ExerciseRecord、Review、Score 或 Export 表、Controller 或假成功；没有连接旧远程 API、未知数据库、真实学校数据或 production Secret；没有修改 Android/Web 源码和 gitlink。

实现与验证提交：

| Commit                                     | 主题                                                           |
| ------------------------------------------ | -------------------------------------------------------------- |
| `94a2742d71046b38937a266158e8fa9ba676de65` | `docs(backend): accept v1 course catalog governance`           |
| `bb86d60fe0fbbb2298b9607157620f8baec26697` | `feat(backend): add teaching structure persistence`            |
| `ccf77471d4a56ac655aa479c7a09c9ffebe943d4` | `feat(backend): implement organization course catalog`         |
| `922a35986ecffe33c3f84514d1382e486bdae05c` | `feat(backend): implement teacher-owned class sections`        |
| `185c73242fc2ec1a727dd33d4ca3924e88777f6b` | `test(backend): verify teaching structure contracts and scope` |
| `218b58925556d5f314b51a250be441e86a909339` | `fix(backend): normalize runtime coverage roadmap`             |

最终报告另以独立本地 docs commit 提交；本阶段没有 merge、rebase、pull、push 或 Pull Request。

Android/Web gitlink 保持：

- Android：`e4cd2e5a623261cd19cddbd59d5cda7627bf7e98`
- Web：`a602280b4aa46d3e944671d341a7bf12bacb17cb`

## 2. ADR-067 与角色治理

ADR-067 已由 `PROPOSED` 更新为 `ACCEPTED`，旧讨论历史保留。V1 权威规则为：

- Course 是 Organization 范围、跨 Semester 复用的目录；ADMIN 创建、读取、更新、启用/停用，不能跨组织。
- TEACHER 只读本组织可开班的 ACTIVE Course，不可创建或修改 Course。
- STUDENT 在 Enrollment 完成前不得读取组织全量 Course/ClassSection；后端返回稳定 403，不返回假空列表。
- ClassSection 是 ACTIVE Course 在一个可写 Semester 下的一次具体开课，只有一个责任 `teacherId`。
- TEACHER 只能以自身 ACTIVE TeacherProfile 创建、读取、更新和关闭本人 ClassSection；不能指定或修改他人 `teacherId`。
- ADMIN 可读本组织 ClassSection 治理投影，但不能创建、修改、关闭或代替教师操作。
- Course 停用不删除、关闭或改写历史 ClassSection，但禁止基于其创建新 ClassSection。
- 学校教务同步、多教师 TeachingAssignment、管理员代行和学生目录投影均不在本阶段。

没有重新引入 `claim-review`、`CLAIM_REVIEW`、可写 `UNDER_REVIEW` 或多教师模型。

## 3. 已实现 operation 与运行覆盖账本

本阶段实现 10 个 operation：

| operationId                | Method | Path                                            | 结果                                           |
| -------------------------- | ------ | ----------------------------------------------- | ---------------------------------------------- |
| `listCourses`              | GET    | `/api/v1/courses`                               | ADMIN 组织目录；TEACHER 仅 ACTIVE；STUDENT 403 |
| `createCourse`             | POST   | `/api/v1/courses`                               | ADMIN-only，幂等、审计、Outbox                 |
| `getCourse`                | GET    | `/api/v1/courses/{courseId}`                    | 组织与角色投影                                 |
| `updateCourse`             | PATCH  | `/api/v1/courses/{courseId}`                    | ADMIN-only，expectedVersion                    |
| `listClassSections`        | GET    | `/api/v1/class-sections`                        | TEACHER 本人；ADMIN 本组织                     |
| `createClassSection`       | POST   | `/api/v1/class-sections`                        | TEACHER 自身责任教师                           |
| `getClassSection`          | GET    | `/api/v1/class-sections/{classSectionId}`       | 教师/组织安全范围                              |
| `updateClassSection`       | PATCH  | `/api/v1/class-sections/{classSectionId}`       | 本人教师、字段白名单、expectedVersion          |
| `closeClassSection`        | POST   | `/api/v1/class-sections/{classSectionId}/close` | 本人教师、幂等关闭                             |
| `listTeacherClassSections` | GET    | `/api/v1/teachers/{teacherId}/class-sections`   | 本人教师或 ADMIN 只读                          |

自动生成的 [`backend-implementation-roadmap.md`](./backend-implementation-roadmap.md) 覆盖权威 OpenAPI 全部 86 个 operation。`npm run runtime-coverage:check` 最终结果：

| 状态                       |                                       数量 |
| -------------------------- | -----------------------------------------: |
| OpenAPI operation          |                                         86 |
| `IMPLEMENTED_VERIFIED`     | 19（Foundation 9 + Teaching Structure 10） |
| `IMPLEMENTED_DEFAULT_DENY` |                                          0 |
| `NOT_IMPLEMENTED`          |                                         60 |
| `BLOCKED_BY_ADR`           |                                          7 |

本阶段没有把通用 404、OpenAPI 声明或空 Controller 计为实现。每个 `IMPLEMENTED_VERIFIED` operation 均绑定真实 Controller、generated policy、application/repository/migration（适用时）、contract test、E2E 和 Docker smoke 证据。

## 4. Migration 与 PostgreSQL 实测

新增 forward-only migration：

| 项目                        | 结果                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| Migration                   | `0002_teaching_structure`                                          |
| SHA-256                     | `bc62c8cc42989da02eb5be92c7c68f64a72b90e6a41b3913c169333d5fbfbc41` |
| 新表                        | `courses`、`class_sections`、`class_section_excluded_dates`        |
| SQL foreign keys            | 14                                                                 |
| SQL explicit unique indexes | 6                                                                  |
| SQL CHECK additions         | 20                                                                 |
| SQL explicit indexes        | 12                                                                 |
| destructive                 | `false`                                                            |

`0001_greenfield_foundation` 未修改，checksum 仍为 `0573e3d13018e0db103ef4b605eb35278723174507b37379425a489b10e1462d`。

最终空 PostgreSQL 18.4 容器实测：

- `0001` 后依次应用 `0002`，首次 deploy exit 0；第二次明确为 `No pending migrations to apply`。
- Prisma schema drift：`No difference detected`。
- 业务表共 15 张；后续禁止表数量为 0。
- 三张新表实际为 14 个 FK、19 个表内 CHECK、7 个 unique index（含 3 个主键 backing index）、13 个 total index（含主键）。
- SQL 静态数字与 catalog 数字口径不同：`0002` 的 20 个 CHECK 包含对既有 `audit_logs_action_type_check` 的一次 forward replacement；6 个显式 unique index 中 2 个为既有 Semester/TeacherProfile 的组织复合外键提供 parent key；PostgreSQL catalog 另计 3 个新表主键 index。不存在 schema 漂移或报告篡改。
- App 角色对 `public` schema 的 `CREATE` 权限为 `false`；Migrator 为 `true`。
- AuditLog append-only trigger 仍存在并在 integration test 中生效。
- 被引用 Course 不能物理删除；Course 停用和 ClassSection 关闭均保留历史。
- 合成 seed 连续执行两次成功，最终仍为 2 Organization、3 Semester、4 基线 Course、5 基线 ClassSection，没有重复插入。

没有创建 `enrollments`、`course_invites`、`join_capabilities`、`official_roster_imports`、`exercise_sessions`、`media_evidence`、`exercise_records`、`review_records`、`score_rules`、`student_scores` 或 `export_jobs`。

## 5. 领域、事务与安全边界

Course 与 ClassSection 均按 `domain/application/infrastructure/interface/http` 分层；domain 不依赖 NestJS、Prisma、Express 或客户端 DTO。关键实现：

- CourseCode trim + uppercase + 严格格式；Course 和 ClassSection 使用应用层 UUIDv7。
- Course、Semester、TeacherProfile、actor 与 ClassSection 的 Organization 一致性由复合 FK、repository scope、application invariant 多层保证。
- `organizationId` 与责任 `teacherId` 来自认证 principal/数据库映射，不接受客户端自报。
- ClassSection 的 Course/Semester/Organization/teacher 创建后不可普通修改；关闭/归档后普通写拒绝。
- CheckInWindow、daily time pair、Semester 范围与 ExcludedDates 去重/排序/范围由 domain、数据库 CHECK/trigger 共同保护。
- ExcludedDates 整体替换使用 `FOR UPDATE` 与同一事务；失败时 ClassSection、日期、AuditLog、Outbox 全部回滚。
- 所有 mutation 复用共享 PostgreSQL Idempotency、AuditLog、Outbox；相同 key/相同 body 稳定重放，不同 body 返回冲突。
- expectedVersion 使用乐观锁；Prisma/PostgreSQL constraint、SQL 与 stack 不进入客户端错误。
- opaque cursor 绑定 Organization、principal、role、teacher scope、filter、sort、limit 与 schema version；跨教师、跨组织或变更参数后拒绝。
- 未知 operation policy/resolver 明确 fail closed；撤销 Session、伪造 role/Organization、mass assignment 与数据库错误泄漏均有 Security negative test。

## 6. 测试与质量门禁

最终测试：

| 层          |  结果 | 关键覆盖                                                                  |
| ----------- | ----: | ------------------------------------------------------------------------- |
| Unit        | 21/21 | Foundation 12 + Course/ClassSection domain、projection、cursor 9          |
| Integration | 13/13 | Foundation 6 + PostgreSQL teaching structure 约束/事务 7                  |
| E2E         | 16/16 | Foundation 8 + Course/ClassSection HTTP、角色/组织/mode 8                 |
| Contract    |   3/3 | 86 operation、refs、policy/enum/error diff、响应边界                      |
| Security    |   8/8 | 配置、伪造身份、撤销、未知 policy/resolver、mass assignment、日志/DB 错误 |
| 总计        | 61/61 | 0 fail、0 skip、0 todo                                                    |

Foundation 原有 33/33 全部保留并持续通过。另行通过：

- `npm ci`
- `npm run format:check`
- `npm run lint`（0 warning）
- `npm run typecheck`
- `npm run contract:check`（diff 0；既有 6 个 Redocly warning 未隐藏）
- `npm run runtime-coverage:check`
- `npm run db:validate`
- `npm run db:migration:check`
- `npm run db:schema:drift:check`
- `npm run generate:check`
- `npm run build`
- `npm audit --audit-level=high`（0 vulnerabilities）
- `git diff --check`

## 7. Docker 环境与最终镜像

| 项目                   | 实测值                                           |
| ---------------------- | ------------------------------------------------ |
| Docker Client          | 29.6.2，windows/amd64                            |
| Docker Server / Engine | 29.6.2，linux/amd64                              |
| Docker Desktop         | 4.85.0 (235549)                                  |
| Docker Compose         | 5.3.1                                            |
| Context                | `desktop-linux`                                  |
| Server architecture    | `x86_64`，16 CPU                                 |
| Build backend          | Docker Desktop containerd snapshotter / BuildKit |

最终以根仓库为 context，对提交 `218b589` 的 Dockerfile target 分别执行真实 `--no-cache` build：

| 项目                    | Runtime                                                                   | Migrator                                                                  |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Tag                     | `bnbu-sports-backend:teaching-structure-218b589`                          | `bnbu-sports-migrator:teaching-structure-218b589`                         |
| exit                    | 0                                                                         | 0                                                                         |
| duration                | 57.35 s                                                                   | 50.18 s                                                                   |
| image ID / local digest | `sha256:fb02959c15b029f2bd18bb3836eb349b8229daca8799ccf06fee2f4c9aaa5945` | `sha256:07235cabdc251e3c9ad2738521c40dad55c62483cdbef5e36ef03b7caec468fc` |
| size                    | 193,868,246 bytes（184.89 MiB）                                           | 213,479,316 bytes（203.59 MiB）                                           |
| User                    | `bnbu`，UID/GID 10001                                                     | `node`，UID/GID 1000                                                      |
| Cmd                     | `node --enable-source-maps dist/main.js`                                  | `npm run db:migrate:deploy`                                               |

Build 真实执行锁定 Node 24.18.0、`npm ci`、package-lock、Prisma Client generation、migration safety、Nest build 与 OpenAPI check。Runtime 有可执行 Healthcheck；image history 对全部临时 Secret 精确扫描为 0；`/app/.env`、`.git`、项目 test、PEM 均不存在；没有依赖宿主机 `node_modules`。

## 8. Compose、MinIO 与 Docker Smoke

现有 Compose 只定义 PostgreSQL、MinIO 和 MinIO init；依照既有 runbook，Migrator 与 App 使用 Dockerfile target 在同一 network 独立运行，没有创建第二套 Compose。最终状态：

- PostgreSQL `postgres:18.4-alpine3.24`：healthy，loopback `127.0.0.1:55433`。
- MinIO 固定 release：healthy，loopback `127.0.0.1:19000/19001`。
- MinIO init：exit 0。
- Migrator 首次/重复/drift：均 exit 0。
- App：healthy，非 root，loopback `127.0.0.1:53011`。
- Bucket `bnbu-stage11-private`：`private`；anonymous read/write 均 403；没有 Media Controller 或永久公开 URL。

Docker HTTP smoke 共 33 项，覆盖全部 9 个 Foundation 与 10 个 Teaching Structure operation：

- live、ready、SystemMode、Teacher/Admin login、错误密码、`/me`、current Organization/Semester；
- Refresh 原子 rotation、旧 token reuse 撤销 family、logout 后 refresh 拒绝；
- Course list/create/get/update、幂等 replay、Teacher 写拒绝；
- ClassSection list/create/get/update/close、Teacher list、calendar/ExcludedDates；
- 跨教师、ADMIN 代行、跨组织、cursor principal、未认证和未实现 Enrollment 路由负例；
- X-Request-ID 与响应一致；成功 `data/meta`、错误五字段；未实现路由不返回假数据。

App restart 后 health/readiness 为 200；PostgreSQL 停止期间 readiness 为 503，恢复后为 200；实际 PostgreSQL restart 后为 healthy/ready。Smoke 创建的 Course/ClassSection ID 与 2 条 migration 记录均持久存在。该证据只说明 local Compose volume/restart，不是 production 备份恢复演练。

最终 54,722 bytes 容器日志内存扫描：临时 Secret 精确匹配 0、完整合成邮箱/学号匹配 0、Token/Authorization/Cookie/DATABASE_URL pattern 匹配 0。CORS allowlist 生效；production 模式缺 `SECURITY_HASH_KEY` 时 exit 1 fail fast；local validation 没有被识别为 production。

## 9. 实际发现并修复的问题

1. 首轮手工 App 容器把宿主 `53011` 映射到容器 3000，但临时环境文件中的 `PORT=3100`，导致内部 Healthcheck 正常而宿主端收到 empty reply。未修改 Dockerfile；最终运行显式 `PORT=3000` 并从头重跑完整 Smoke。
2. 第一条结构诊断 SQL 使用了错误列名并包含完整合成邮箱，PostgreSQL 把失败语句记录到容器日志。确认不是应用日志泄漏后，验证查询改为 ID/无 PII，保留 volume 只重建隔离 PostgreSQL 容器；最终全日志扫描为 0。报告保留该过程，不把首次失败冒充通过。
3. 初版 runtime coverage 生成器输出与 Prettier 不一致，使 `runtime-coverage:check` 和 `format:check` 无法同时稳定通过。提交 `218b589` 让生成器直接输出仓库规范 Markdown，并在修复后重新执行全量检查和两张无缓存镜像构建。
4. PostgreSQL catalog 与 migration 静态统计最初看似不同；核对后确认是主键 backing index、既有 parent composite key 与 audit CHECK replacement 的统计口径差异，不是 schema drift。
5. 沙箱内首次 `npm ci` 无权读取用户 npm cache、`npm audit` 无法访问 advisory endpoint；获准访问既有 cache/网络后分别成功，未使用 `--force` 或降低 audit level。

## 10. Teardown 与未验证内容

最终执行 `docker compose -p bnbu-teaching-structure-validation --env-file .env.stage11.local down -v --remove-orphans`，并只删除该 project 的手工 App/Migrator/Drift 容器。验证容器、network、volume 均无残留；临时 `.env.stage11.local` 与 `C:\tmp\bnbu-stage11-docker-smoke.mjs` 已删除。没有执行 `docker system prune -a`，没有删除其他 project、镜像或 volume。

未验证且不得由本报告推断：Android/Web/iOS 真实联调、Enrollment/QR Join、Roster、打卡、媒体、审核、成绩、导出、学校同步、production TLS/Secret/轮换/限流、staging、备份恢复、监控告警、隐私法务或正式上线。

## 11. Gate 与阶段 12 就绪

| Gate                      | 判定                    | 依据                                                                                        |
| ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------- |
| Greenfield Foundation     | 是                      | 原 33/33 与阶段 10B 保持通过                                                                |
| Course Catalog            | **是**                  | 表/约束、ADMIN 治理、Teacher/Student 写拒绝、组织、幂等/version/audit/outbox、Docker 全通过 |
| ClassSection Management   | **是**                  | 表/日期、本人教师 CRUD/close、跨教师/跨组织、ADMIN 只读、关闭/归档、Docker 全通过           |
| Teaching Structure        | **是**                  | 两个子 Gate 均为“是”                                                                        |
| Student Course Projection | `BLOCKED_BY_ENROLLMENT` | 当前稳定 403，无假空列表；不阻塞教学结构 Gate                                               |
| Enrollment/QR Join        | 否                      | 未实现                                                                                      |
| Roster                    | 否                      | 未实现                                                                                      |
| Session / Media / Record  | 否                      | 未实现且 production ADR 未闭合                                                              |
| Review                    | 否                      | 未实现                                                                                      |
| Score                     | 否                      | 未实现且业务 ADR 未闭合                                                                     |
| Export                    | 否                      | 未实现                                                                                      |
| Full Production           | **否**                  | ADR-070–074、TLS、Secret、恢复、监控、业务与跨端 Gate 未闭合                                |

阶段 12 的代码前置条件已满足：存在 ACTIVE Course、CURRENT Semester、可加入的 ACTIVE ClassSection、稳定单一 teacherId、后端可读 `isEnrollmentOpen`/时间窗、Course/ClassSection policy 已验证、0001+0002 可从空库部署、Docker Gate 通过、最终工作树 clean。这里只表示可以开始独立的 Identity Completion + Enrollment + QR Join 阶段，不表示这些能力已经实现。
