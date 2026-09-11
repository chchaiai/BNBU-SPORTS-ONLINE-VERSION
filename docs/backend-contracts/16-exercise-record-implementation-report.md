# Stage 16 — ExerciseRecord Core 实现与运行验收报告

日期：2026-08-04

分支：`backend/exercise-record`

Stage 15 最终基线：`02830bf3cb396d26f5cb5287cff09a4adf1241c4`
最终 Stage 16 HEAD：以本报告所在最终本地提交后的 `git rev-parse HEAD` 为准。

## 1. Stage 16P 与实施范围

Stage 16P 先修复 generated runtime coverage roadmap 漂移：根因是生成文件曾混入手工 Stage 15 关闭段落；恢复为 generator 的纯输出，并在 `AGENTS.md` 冻结“generated roadmap 不得手改”和最终 clean-HEAD 检查。修复提交为 `0fe82318fdafa52a18d49efe0b4819b650fb9add`。修复后重新放行 Stage 15 全基线 149/149，再开始 Stage 16。

Stage 16 只实现 ExerciseRecord Core。没有实现教师 Review decision、Score、Export、客户端或 production 参数，没有修改 Android/Web gitlink，也没有把后续路由做成假成功。

## 2. 合同与运行覆盖

唯一机器合同仍为 `openapi.yaml`，共 88 个 operation。Stage 16 新增运行实现：

- `listExerciseRecords`
- `createExerciseRecordDraft`
- `getExerciseRecord`
- `updateExerciseRecordDraft`
- `submitExerciseRecord`
- `discardExerciseRecord`
- `withdrawExerciseRecord`（真实 default deny）

最终覆盖为 59 `IMPLEMENTED_VERIFIED`、3 `IMPLEMENTED_DEFAULT_DENY`、22 `NOT_IMPLEMENTED`、4 `BLOCKED_BY_ADR`。三个默认拒绝为 `withdrawEnrollment`、`ignoreRosterAlignmentResult` 与 `withdrawExerciseRecord`。

## 3. Migration 0007

`0007_exercise_record` SHA-256：`d78b14c17acd1fa1f39760504525a2b1df3755472149b343da9709157bcf534f`。

新增五张表：

- `exercise_records`
- `exercise_record_media`
- `exercise_record_daily_slots`
- `exercise_record_events`
- `review_records`

Migration 确定性静态口径为 5 表、22 FK、18 unique index、22 CHECK additions、26 total indexes。复合 FK 将 Record、Session、Enrollment、ClassSection、Semester、Course、Student、Teacher 与 Organization scope 固定在同一租户事实内；history 触发器保护 append-only，Record trigger 阻止身份、时长和已提交内容被绕过修改。每日槽位 `(enrollmentId,businessDate)` 永久占用，CANCELLED 不释放；媒体关联 trigger 先锁 Record，再执行数量与一致性检查，防止并发绕过。

0001–0006 checksum 未变化。

## 4. Record 生命周期与事务

本人只能从 `COMPLETED` Session 创建 DRAFT；Session、Enrollment、ClassSection、Semester、Course、Organization 与 Student 必须一致。客户端不能自报 tenant、student、teacher、status、权威时长或 review result。Draft update 只接受 OpenAPI 白名单与 `expectedVersion`。

服务端按 Session 的 `actualDurationSeconds` 决定正式信用：0..3599 拒绝提交；3600..7199 固定为 3600；大于等于 7200 固定为 7200。Submit 在单一 PostgreSQL 事务中锁定 Record 与 Media，校验 1..6 IMAGE、0..1 VIDEO、全部 AVAILABLE/同 owner/同 Session/`EXERCISE_RECORD` purpose，写冻结关联与永久每日槽位，执行 DRAFT → SUBMITTED，追加 Record event、AuditLog、Outbox、幂等完成，并创建 system PENDING ReviewRecord version 1。任一失败全部回滚。

Discard 只允许 DRAFT → CANCELLED 并保留历史。Withdraw 真实经过认证、资源 scope 与 DTO 校验后固定返回 `EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED`，不会新增成功 event/AuditLog/Outbox，也不会改变 version。

新增的同日双提交 E2E 曾发现：直接等待数据库 unique violation 会先中止 PostgreSQL 事务，使预期 409 被放大为 500。第一轮修复把 Enrollment 行锁移到 submit 事务最前并先读取每日槽位；最终镜像的真实并发 smoke 又暴露 Prisma driver adapter 将 PostgreSQL `40001` 包装为 `P2010`，而不是只使用既有 `P2034`。最终方案保留 Enrollment 串行边界，并在共享 IdempotencyService 中对 `P2034` 与嵌套 `P2010/originalCode=40001` 执行最多三次的有界全事务重试。容器实测固定为一条成功、一条 `EXERCISE_RECORD_DAILY_LIMIT_REACHED`，失败草稿仍为 DRAFT 且无 Review/Media 关联半副作用。数据库唯一约束继续作为最终防线，没有被移除或放宽。

## 5. Media 冻结与安全投影

提交后 MediaEvidence 通过受 FK 保护的 `exercise_record_media` 与 Record 冻结关联；Media 当前投影返回关联 `recordId`，但不返回 `storageKey`。Record submit 不修改 Session 事实、Enrollment 或 Media verified MIME/size/hash/duration。

学生 Record projection 的 `currentReview` 只返回 result、reasonCode、publicComment；不返回 `internalNote`、teacher identity、Review 管理历史或存储定位。Teacher/Admin 没有合同外 Record 写入口；未来 Review/Score/Export 路由不返回 200 或假空数组。

## 6. Docker 运行验收

环境：Docker Client/Server 29.6.2，Compose v5.3.1，Linux amd64；project `bnbu-record-validation`。

- runtime image：`sha256:cd1de77299036cb834d1729e133c4b704bf57eeb33c6ca4c15c9dfbb6684b920`，196,386,837 bytes，no-cache build 72.23 秒，user `bnbu`（UID 10001），command `node --enable-source-maps dist/main.js`，真实 HTTP healthcheck。
- migrator image：`sha256:ed9b4b142364be9f718275876298f9bfdac0f6ece4944292258075decd1e0f25`，215,312,861 bytes，no-cache build 58.64 秒，user `node`，command `npm run db:migrate:deploy`。
- 两个镜像均由锁文件 `npm ci` 构建；runtime 不含 `.env`、`.git`、测试目录或 Prisma migration；history Secret 扫描为零。
- PostgreSQL `18.4` healthy；MinIO healthy；MinIO init exit 0；App healthy、非 root、无 crash loop。
- 新空卷按序首次部署 0001–0007；重复 deploy 返回 `No pending migrations to apply`；schema drift 为 `No difference detected`；0007 数据库 checksum 与 manifest 一致。
- App role 无 schema CREATE 权限；App 容器环境不含 migrator URL/password 或 MinIO root credential；Roster 与 Media bucket 均为 private。

容器真实 smoke 从合成 Student Session 和 private AVAILABLE Media 开始，完成 Record create → update → submit → initial PENDING Review → get/list，并验证 Media `recordId` 一致。错误 withdraw 返回稳定 409 与错误码；不足 3600 秒和同 Enrollment/BusinessDate 第二次提交均整体回滚。最终镜像另以两个独立 COMPLETED Session/AVAILABLE Media 并发提交，结果严格为一个 200 与一个 409；数据库保留 2 个 Record、1 个 daily slot、1 个 initial Review，失败 Record 保持 version 1 的 DRAFT。

重启 App 后 readiness 恢复且登录/Record 仍可读；停止 PostgreSQL 时 readiness 为 503，恢复后为 200；重启前后 Record 数量一致且 migration 无重复副作用。MinIO 专用私有卷在写入合成对象后重启，重启后对象仍可读取且 bucket anonymous policy 仍为 `private`，随后专用容器和 volume 均清理为零。CORS allowlist 生效，production 缺签名 Secret 时 exit 1；日志对 Token、Authorization、Cookie、password、DATABASE_URL、storage key、signed URL 与合成 PII 的扫描命中为 0。

验证时先发现临时 local-only env 的 duration 格式、Docker PEM 引号和 QR replay/idempotency retention 关系不符合现有 fail-fast schema；只修正了被 Git 忽略的合成验证配置，没有放宽应用校验或写入报告 Secret。首次从宿主机 seed 时也误用了容器内 `postgres:5432` 地址，改为同一隔离数据库的 loopback 映射后 seed 通过；这只是验证命令修正，不是源码或数据库规则变更。

## 7. 测试与质量

- Unit：54/54
- Integration：32/32
- E2E：31/31
- Contract：18/18
- Security：29/29
- 总计：164/164，fail 0，skip 0，todo 0

Stage 15 的 149/149 回归全部包含在本轮并持续通过。`npm ci`、format、lint、strict typecheck、contract、runtime coverage、Prisma validate、migration safety、schema drift、generated artifact、build、`npm audit --audit-level=high` 与 `git diff --check` 全部通过；audit 为 0 vulnerabilities。6 个既有非阻塞 Redocly warning 保持可见。

## 8. Gate

以下为 **是**：Record Persistence、Session Association、Media Freeze、Duration Credit、Daily Uniqueness、Draft、Submit Atomicity、Initial Review、Student Projection、ExerciseRecord Core。

以下保持 **否**：

- ExerciseRecord Withdraw：否 / DEFAULT DENY（ADR-020 仍为 PROPOSED）
- Review Decision：否
- Score：否
- Export：否
- Enrollment Withdrawal/Rejoin：否 / DEFAULT DENY
- Roster Ignore：否 / DEFAULT DENY
- Session Offline Credit、Automatic Expiration、Production Parameters：否
- Media Retention/Cleanup、Production Security Processing、Privacy/Location、Production Parameters：否
- Full Production：否

本阶段未批准任何 PROPOSED ADR；未 push，未创建 Pull Request。验证结束后只删除 `bnbu-record-validation` 的 App、Compose containers/network/volumes、两个 ignored 临时 env 与临时容器 smoke 脚本；残留为 0 container、0 network、0 volume。未执行 system prune，也未影响其他 Docker project。

## 9. Contract 1.5 增量（2026-08-12）

ADR-103 修订了原说明规则：`GENERAL` 自主运动仍要求 trim 后 1..200 字说明，`COURSE_RELATED` 课程运动可省略或保存 null。`0016_optional_course_exercise_description` 只新增 forward-only nullability 与 creditType/description 联合 CHECK；既有 Migration 不修改。创建、更新及课程转自主运动的最终状态均由 DTO、领域层和数据库一致校验，客户端提示不能代替后端裁决。本文其余 Stage 16 历史验收数字保持当时证据，不被本增量段落改写。
