# Stage 18 — Score Core 实现报告

生成日期：2026-08-04。

实现分支：`backend/score-core`。

审批合同最终 HEAD：`4a276235351d1b2d6a1691f9a93cdcd55fc1aff0`。

本报告记录的实现 HEAD：`ed30653faabd4fe0cecee9a37303326bb551ba18`（最终文档提交以后续 `git rev-parse HEAD` 为准）

## 1. 审批与权威合同

- 项目负责人已明确批准 Stage 18A 的全部最终推荐方案。
- 审批记录提交：`bff46c95c4f31ae1693158bc0741bcdef5356ecd`。
- 审批模板 SHA-256：`4e0a255f7fe974972ac97f8de60ab68b40a4a33d1da9ebc42910502f3b30f139`。
- 审批绑定提交：`8beb535264b5c8129147aeb7f32a86a53160514b`。
- OpenAPI/合同冻结提交：`dd24078cab9b9d616f6f875f65f07c75b826d616`。
- 实现 Gate 提交：`4a276235351d1b2d6a1691f9a93cdcd55fc1aff0`。
- ADR-018、ADR-019、ADR-044、ADR-056、ADR-059、ADR-069 已按批准内容 `ACCEPTED`；ADR-026、ADR-047、ADR-062 已被正式 V1 规则 `SUPERSEDED`。ADR-070–074 未改变，Production Gate 仍关闭。

## 2. OpenAPI、operation 与运行覆盖

唯一人工维护机器合同仍为 `docs/backend-contracts/openapi.yaml`。Stage 18 实现 15 个 Score operation：

1. `listScoreRules`
2. `createScoreRule`
3. `getScoreRule`
4. `submitScoreRuleForApproval`
5. `approveScoreRule`
6. `rejectScoreRule`
7. `listStudentScores`
8. `getStudentScore`
9. `recalculateStudentScore`
10. `publishStudentScore`
11. `openStudentScoreCorrection`
12. `listScoreAdjustments`
13. `createScoreAdjustment`
14. `approveScoreAdjustment`
15. `rejectScoreAdjustment`

生成器与检查器的最终盘点为：OpenAPI 92；`IMPLEMENTED_VERIFIED` 77；`IMPLEMENTED_DEFAULT_DENY` 4；`NOT_IMPLEMENTED` 11；`BLOCKED_BY_ADR` 0。`openStudentScoreCorrection` 是无副作用真实路由 default deny，固定错误码为 `SCORE_CORRECTION_NOT_ALLOWED`；它不会创建修正窗口、revision、AuditLog 成功事实或业务 Outbox。

## 3. Persistence 与 Migration

新增 forward-only migration：`0009_score`。SQL SHA-256：`1a4a21a6c4097cbeaaf1c8b8e7b3faef3db774f84296988f7edb9c288c06282d`。0001–0008 未修改。

新增九张表：

- `score_rules`
- `score_rule_approval_events`
- `student_scores`
- `student_score_revisions`
- `score_contributions`
- `score_adjustments`
- `score_adjustment_approval_events`
- `score_publication_events`
- `score_recalculation_attempts`

Migration 静态口径：9 tables、36 foreign keys、16 explicit unique indexes、10 CHECK additions、27 explicit indexes、7 user triggers。五个 append-only trigger 保护审批、revision、contribution 与 publication 历史；两个 definition guard 分别保护 Rule 和 Adjustment 的不可变定义。约束固定组织/学期/教学班/学生/Record/Review/Rule/Revision scope，数据库同时约束状态、数值范围、审批 actor 和聚合指针。

在隔离的 loopback-only PostgreSQL 18.4 空数据库中顺序部署 0001–0009成功；重复 `migrate deploy` 返回无待执行 migration；`db:schema:drift:check` 为 0。该数据库是本次测试使用的临时 portable PostgreSQL，不是 Docker 验收替代品；测试结束后实例已停止且数据目录已删除。

## 4. 公式与可追溯计算

V1 公式唯一实现为：

```text
qualifiedSeconds = min(max(totalCreditedSeconds, 0), 72000)
rawScore = qualifiedSeconds / 72000 * 100
finalScore = HALF_UP(rawScore, 2)
if totalCreditedSeconds < 72000 and finalScore >= 100.00, finalScore = 99.99
```

持久化使用 Prisma Decimal/PostgreSQL `numeric`，不使用 JavaScript binary float 保存最终事实。71999 秒固定为 99.99，72000 秒及以上封顶 100.00。Contribution 逐条绑定 Record、当前 VALID Review 和 ScoreRule version；规范化 `sourceFingerprint` 覆盖有序输入，重复计算幂等，输入变化生成新的 working revision。

Review VALID 会触发工作成绩计算；reopen/INVALID 会撤销当前工作贡献并生成新 working revision。已发布 revision 不会被后台重算覆盖，学生只读取 published projection；教师显式 republish 后才切换学生可见版本。Review Outbox 重放、重复事件和手工 recalculation 均通过相同 fingerprint/事务边界收敛。

## 5. Rule、Publication 与 Adjustment

- Rule 从 DRAFT 提交审批；激活要求两名不同的 ACTIVE ADMIN 批准，且创建者不能批准自己的规则。
- 规则审批事件追加写入，激活新 version 时保留历史规则与旧 revision 引用。
- Teacher 只能读取/发布本人 ClassSection；ADMIN 只能在本组织治理范围读取与审批，ADMIN 不默认代行教师。
- Publication 追加事件并更新 published revision 指针，不修改历史 revision。
- ScoreAdjustment 是最终分数层面的追加式申请；Teacher 提交，ADMIN 审批/拒绝；证据仅允许安全的内部引用格式，拒绝 URL、scheme、绝对路径和路径穿越。
- Approved adjustment 进入新的 working revision，随后仍需责任教师显式发布。

所有 mutation 复用认证、PolicyEngine、组织/资源 scope、SystemMode、`Idempotency-Key`、`expectedVersion`、PostgreSQL transaction、AuditLog、Outbox 和稳定错误 envelope。学生 projection 不暴露审批身份、内部 Contribution、内部 note 或存储键。

## 6. 五层测试与质量检查

在提交 `ed30653faabd4fe0cecee9a37303326bb551ba18` 上重新执行完整质量门禁：

| Layer | Result |
| --- | ---: |
| Unit | 60/60 |
| Integration | 39/39 |
| E2E | 36/36 |
| Contract | 24/24 |
| Security | 35/35 |
| Total | 194/194 |

`fail/cancelled/skip/todo` 均为 0。`npm ci`、format、lint、strict typecheck、contract、runtime coverage、Prisma validate、migration safety、schema drift、generated artifact、build 与 `git diff --check` 均通过；`npm audit --audit-level=high` 为 0 vulnerabilities。Redocly 原有 6 个非阻塞 warning 保持可见，未隐藏。

测试覆盖公式向量、71999 边界、Rule 双审批、禁止自批、revision/contribution/fingerprint、Review 驱动重算、重复 Outbox、published preservation、Adjustment 审批、default deny、学生/教师/ADMIN projection、scope、expectedVersion、幂等、AuditLog/Outbox 原子性与敏感信息泄漏。

## 7. Docker 验收与实际阻塞

计划使用 Compose project `bnbu-score-validation` 和三个被 Git ignore 的临时 env 文件执行 runtime/migrator no-cache build、PostgreSQL 18.4、private MinIO、0001–0009 deploy、非 root app、完整业务链、restart/persistence、fail-fast、CORS、日志脱敏与 teardown。

实际环境检查失败：当前 Windows 环境的 `PATH` 无 `docker` 命令，标准 Docker Desktop 安装路径也不存在，未发现 Docker Desktop 进程。因此 Docker Client、Server、Compose 均无法读取，不能进行 image build、容器 migration、MinIO、app health、完整 Docker Smoke、restart/persistence 或 teardown。未创建 `.env.stage18.*`，未留下容器、network、volume 或验证 Secret；也未执行任何 Docker 安装、`docker system prune` 或以 portable PostgreSQL 冒充 Docker 验收。

因此以下项目本次均为“未验证”，不是“通过”：Docker images/digest/size、MinIO private bucket、app non-root、容器完整 Score 链、PostgreSQL/MinIO restart、503→200、容器持久性、production container fail-fast、CORS 与容器日志脱敏。

## 8. Gate 判定

| Gate | 判定 | 证据/原因 |
| --- | --- | --- |
| Score User Approval | 是 | approval commit 与 SHA-256 固定 |
| Score Contract | 是 | OpenAPI/ADR/枚举/错误/权限已冻结并通过检查 |
| Score Persistence | 是 | 0009、Prisma、空库 deploy、repeat deploy、drift 0 |
| ScoreRule / Dual Approval | 是 | 实现与五层测试通过 |
| Calculation / Formula Vector | 是 | Decimal、72000/71999 与批准向量通过 |
| Revision / Contribution / sourceFingerprint | 是 | 实现与五层测试通过 |
| Review-driven Recalculation | 是 | VALID/reopen/INVALID、重放与手工修复通过 |
| Student / Teacher / ADMIN projection | 是 | scope 与脱敏测试通过 |
| Publication / Published Preservation | 是 | 显式发布与历史保留通过 |
| ScoreAdjustment / Approval | 是 | 申请、审批、证据校验与新 revision 通过 |
| Archived Correction | 否 | 按批准规则真实 default deny |
| Score Core | **否** | Docker 全链路、restart/persistence、容器日志脱敏未能执行 |
| Historical Data Migration | 否 | 本阶段禁止，未执行 |
| Export | 否 | 未实现；不得假成功 |
| Client Integration | 否 | 未修改 Android/Web |
| Full Production | 否 | ADR-070–074 与独立生产验收未关闭 |

Score 源码与五层测试已实现，但 Stage 18 总 Gate 不能关闭。恢复 Docker Desktop/CLI 后，必须从当前 clean 后端 HEAD 执行本任务规定的 no-cache Docker 全链路；全部通过后才能把 Score Core Gate 改为“是”。

## 9. Stage 19 readiness 与发布状态

Stage 19 仅生成接续提示词，未启动。由于 Score Core Docker Gate 和根工作树 clean Gate 尚未满足，Stage 19 readiness 为“否”。Android 父仓库 gitlink 仍固定为 `e4cd2e5a623261cd19cddbd59d5cda7627bf7e98`，但 Android 子模块工作目录存在用户/外部未提交变化；本阶段未覆盖、清理、stash 或提交它。Web gitlink 仍为 `a602280b4aa46d3e944671d341a7bf12bacb17cb`。

本阶段未 push，未创建 Pull Request，未 merge/rebase/pull，未实现 Export，未改变 Production Gate。

## 10. Stage 18V Docker 运行复验（最新判定）

此前第 7–9 节记录的是当时机器没有可用 Docker CLI/Desktop、因此 Score Core Gate 不能关闭的历史事实；该事实保留不删。2026-08-04 在 monorepo 转换 HEAD `8baaa731afd6d44d09a02fa5047570ee18345889` 之后，使用 Docker Desktop 的实际 CLI `C:\Users\23328\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe` 完成复验。Docker Client/Server 均为 29.6.2，Docker Desktop 4.85.0（235549），Compose v5.3.1，context `desktop-linux`，Linux/amd64、WSL2。

使用根目录真实 build context 和既有 Dockerfile 执行两次 `--no-cache` 构建：runtime 90.583 秒，image ID/digest `sha256:e7f510787a10f62aaf4e008083e7924d72a070fbd92051d85080edbe0abbed28`，大小 196,618,071 bytes，运行用户 `bnbu`（容器 UID 10001）；migrator 95.077 秒，image ID/digest `sha256:8e3a244c0e9362e7831fdfd1f434f0775c79a82a73613032e0ca0ab089aa41d8`，大小 215,949,569 bytes，运行用户 `node`。最终 runtime 仅含 production dependencies、`dist` 与 package metadata；没有第一方 `.env`、`.git`、`test`、Prisma source、测试私钥或临时脚本，healthcheck 可执行，history 未发现 Secret。

独立 Compose project `bnbu-score-validation` 使用 PostgreSQL `18.4-alpine3.24`、固定版本 MinIO/mc 和全新 volume。PostgreSQL、MinIO 均 healthy，MinIO init exit 0；roster/media bucket 均 private，匿名访问为 403。Migrator 身份首次顺序部署 0001–0009，重复部署为 `No pending migrations to apply`，schema drift 为 `No difference detected`；App role 的 schema 权限为 `CREATE=false, USAGE=true`，App 启动不执行 migration。

真实 Docker 链路覆盖：短时 ExerciseSession 通过 HTTP start/finish；满足 Record 最低信用规则的 3600 秒 COMPLETED Session 来自明确的 local synthetic seed。随后 Media presigned PUT 写入 private MinIO、confirm/bind、后台 worker 转为 AVAILABLE、Record create/submit、Review VALID、两名不同 ADMIN 激活 Rule、自动生成 Score、手工重算幂等重放、Teacher publish、Review reopen 撤销 working contribution 但保留 published pointer、再次 VALID/republish、Teacher 创建 Adjustment、同组织 ADMIN 审批、新 working revision 与最终 republish 均通过。最终 5.00 调整为 6.25；correction 固定返回 `SCORE_CORRECTION_NOT_ALLOWED`，version/revision/adjustment/AuditLog/Outbox 均无副作用。跨组织 ADMIN 与非责任教师使用资源隐藏式稳定 404，学生与管理员 projection/scope 按合同执行。

最终 runtime 镜像内同一 Decimal 计算器向量为：0→0.00、3600→5.00、36000→50.00、71999→99.99、72000→100.00、90000→100.00，HALF_UP 与封顶规则通过。相同 sourceFingerprint/manual recalculation replay 不创建重复 revision。11 个由 OpenAPI/runtime manifest 差集自动得到的 `NOT_IMPLEMENTED` operation 全部无 2xx、无 `data`/假空数组，稳定 fail closed。

App restart 后 healthy/readiness=200；PostgreSQL 停止时 readiness=503，恢复 healthy 后为 200；MinIO restart 后 private object 仍为 1，匿名仍为 403。重启前后持久性计数不变：ScoreRule 1、approval 2、StudentScore 8、revision 11、contribution 3、publication 3、adjustment 1、recalculation attempt 11、migration 9。production 仅注入 `APP_ENV=production` 且缺必需配置时 exit 1；CORS 允许来源预检 204 并返回精确 origin，恶意来源 404 且无 allow header。App、PostgreSQL、MinIO、init、fail-fast 与 image history 的实际 Secret/Token/PII/storageKey/signed URL/evidenceReference 扫描通过。

teardown 使用 `down -v --remove-orphans`，并单独移除按 runbook 手工启动的 App；最终 `container=0`、`network=0`、`volume=0`。三份 `.env.stage18.*`、临时 smoke 脚本和密钥均已删除；未运行 `docker system prune`，未影响其他 project。

最新 Gate：Monorepo Layout=是、Docker=是、Score Core=是、Stage 19 Readiness=是。Archived Correction、Historical Data Migration、Export、Client Integration、Full Production 继续为否；ADR-070–074 未改变。本节仅关闭 Stage 18V，不执行 Stage 19。
