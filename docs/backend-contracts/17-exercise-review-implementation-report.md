# Stage 17 — ExerciseReview Core 实现与运行验收报告

日期：2026-08-04

分支：`backend/review-core`

Stage 16 基线：`fd70c2a6e7df9b60a3ed8044ea4d049ec2df3097`

权威合同：`docs/backend-contracts/openapi.yaml`

## 1. 结论

Stage 17 Review Core Gate 为 **是**。四个既有 Review operation 已由真实 Controller、Policy、事务服务、PostgreSQL 历史与测试闭合：

- `listExerciseRecordReviews`
- `reviewExerciseRecord`
- `reopenExerciseRecordReview`
- `batchReviewExerciseRecords`

Review Persistence、Append-only History、Teacher Scope、Dual Version Concurrency、VALID、INVALID、Reopen、Batch、Student Projection 与 Review Core Gate 均为 **是**。Score、Export、客户端联调与 Full Production Gate 均保持 **否**。

## 2. 实现边界

- Stage 16 submit 创建 system PENDING review version 1；Stage 17 责任教师直接追加 VALID/INVALID。
- Reopen 追加新的 PENDING 行并将 Record 从 REVIEWED 恢复为 SUBMITTED；历史行不更新、不删除。
- 每次决策同时校验 Record `expectedVersion`、`expectedReviewVersion` 和数据库唯一版本链；并发 stale 写入稳定失败且无半副作用。
- Batch 外层与逐项 mutation 都复用持久化幂等，逐项独立事务，保持输入顺序、部分成功和精确重放。
- `creditedDurationOverrideSeconds` 非空固定返回 `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED`；没有批准 ADR-047。
- 学生 `currentReview` 不返回 `internalNote`、`teacherId` 或历史管理字段；`storageKey` 不进入公共 projection。
- 责任教师只有在 Media 已冻结关联到 ExerciseRecord 后，才能创建原始媒体短期访问 URL。
- 没有 claim-review、`CLAIM_REVIEW`、可写 `UNDER_REVIEW`、ReviewClaim、Score 或 Export 实现。

## 3. 数据库

新增 forward-only `0008_review_core`，SHA-256：

`6e9e15d01fb41ec26cf6dedd2969f7471d69dc6595004eb477b5ec8d2c766eff`

该 migration 不新增表；它 forward-replace Review/Record/Event 约束与触发器，允许受控 Review/reopen 状态转换，并强制：

- `previousReviewId` 必须指向同一 Record 的紧邻上一版本；
- Review 历史继续 append-only；
- INVALID reason shape 与 credited override 永久拒绝；
- Record 只允许 `SUBMITTED → REVIEWED` 与 `REVIEWED → SUBMITTED` 的 Stage 17 转换；
- Score/Export 表仍不存在。

0001–0007 checksum 未变化。空 PostgreSQL 18.4 volume 首次按序部署 0001–0008成功；第二次 deploy 为 `No pending migrations to apply`；Prisma drift 为 `No difference detected`。

## 4. Runtime coverage

OpenAPI 总数保持 88：

- `IMPLEMENTED_VERIFIED`：63
- `IMPLEMENTED_DEFAULT_DENY`：3
- `NOT_IMPLEMENTED`：18
- `BLOCKED_BY_ADR`：4

三个真实 default deny 仍为 Enrollment withdraw、Roster ignore 与 ExerciseRecord withdraw。Review credited override 是已实现 mutation 中的字段级 fail-closed，不增加 operation 总数。

## 5. 自动化测试

最终完整回归：

| 层级        |    结果 |
| ----------- | ------: |
| Unit        |   57/57 |
| Integration |   36/36 |
| E2E         |   35/35 |
| Contract    |   21/21 |
| Security    |   32/32 |
| 合计        | 181/181 |

fail、cancelled、skip、todo 均为 0。Stage 16 的 164 个测试全部保留。`npm audit --audit-level=high` 为 0 vulnerabilities。Redocly 的 6 个既有非阻塞 warning 保持可见，没有隐藏或编造 license。

## 6. Docker 构建与环境

- Docker Client：29.6.2
- Docker Server：29.6.2
- Docker Compose：v5.3.1
- Context：`desktop-linux`
- Engine OS/arch：Docker Desktop Linux / `x86_64`
- Compose project：`bnbu-review-validation`

最终无缓存 BuildKit：

| 镜像                                            | 结果   |    时长 | Image ID / digest                                                         |              大小 | User   | Cmd                                      |
| ----------------------------------------------- | ------ | ------: | ------------------------------------------------------------------------- | ----------------: | ------ | ---------------------------------------- |
| `bnbu-sports-backend:stage17-runtime`           | exit 0 | 68.59 s | `sha256:997e49a0a9338d63fecd406f00fbc0abb2fa73e484deacc5afbe4a133838247d` | 196,398,476 bytes | `bnbu` | `node --enable-source-maps dist/main.js` |
| `bnbu-sports-backend-migrator:stage17-migrator` | exit 0 | 65.62 s | `sha256:ce619745c1ab69a12d1fbf2b20192b9ab881d03e222570bb7ccd7f567471aa4b` | 215,816,104 bytes | `node` | `npm run db:migrate:deploy`              |

运行时镜像 Healthcheck 存在。两个镜像均不含 `/app/.env`、`/app/.git`、test 目录或测试密钥；Docker history 对本地 Secret 的精确匹配数为 0。production 仅提供 `APP_ENV=production` 时非零退出并报告必需配置缺失。

运行时发现并修复 Migrator target 未复制生成 Prisma Client 的问题；最终 target 从 build stage 复制 `src/generated/prisma`，不依赖宿主机 `node_modules`。

## 7. 真实容器 Smoke

最终空卷状态：PostgreSQL healthy、MinIO healthy、MinIO init exit 0、Migrator exit 0、重复 Migrator exit 0、App healthy 且非 root。

真实链路使用完全合成数据，覆盖：

1. 完成的 ExerciseSession；
2. private MinIO 对象写入、confirm、bind 与数据库 worker 处理为 AVAILABLE；
3. ExerciseRecord DRAFT 创建、精确幂等重放与 submit；
4. initial PENDING review；
5. 责任教师原始媒体短期访问；
6. VALID、教师历史 list、reopen；
7. non-null credited override 稳定 422 default deny；
8. 两个并发决策严格一成一拒；
9. 第二次 reopen 后 batch 一成一败并精确重放；
10. STUDENT/ADMIN mutation 403；
11. 学生最终安全 `currentReview`，无 internal note、teacher identity 或 storage key。

最终持久化证据为 Record `REVIEWED`、6 条 ReviewRecord、5 条 `REVIEW_RESULT_CHANGED` AuditLog、7 条 Record Outbox。匿名 MinIO read/write 均为 403，Bucket 保持 private。

## 8. 重启、安全与持久性

- App 重启后 healthy/readiness 200，教师登录、6 条历史与媒体访问恢复。
- PostgreSQL 停止时 readiness 为 503；启动并 healthy 后恢复 200。
- MinIO 重启后 private object HEAD、教师短期访问与匿名拒绝均保持。
- App role 的 schema CREATE、superuser、createdb、createrole 均为 false。
- App/MinIO/PostgreSQL 日志对本地 Secret 精确匹配为 0；Bearer、Authorization、access/refresh token、数据库 URL、完整合成邮箱/学号模式匹配为 0。
- App 日志没有自动 migration 记录。
- CORS allowlist origin 返回对应 header；未允许 origin 不返回 allow-origin。

这只证明 local Docker restart/persistence，不是 production 备份恢复或 ADR-070–074 验收。

## 9. Teardown

执行 `down -v --remove-orphans` 等价清理后：validation container 0、network 0、volume 0。临时 `.env.stage17.local` 与 Stage 17 smoke/security 脚本已删除。未执行 system prune，未删除其他项目镜像或 volume。

## 10. Gate

- Review Persistence：是
- Append-only History：是
- Teacher Scope：是
- Dual Version Concurrency：是
- VALID：是
- INVALID：是
- Reopen：是
- Batch：是
- Student Projection：是
- Review Core：是
- Enrollment Withdrawal/Rejoin：否
- Roster Ignore：否
- Session production/offline policy：否
- Media production/retention/privacy：否
- Score：否
- Export：否
- Client integration：否
- Full Production：否

未解决 ADR 继续以 `decision-log.md` 为准；本阶段没有把任何 PROPOSED 决策改为 ACCEPTED。
