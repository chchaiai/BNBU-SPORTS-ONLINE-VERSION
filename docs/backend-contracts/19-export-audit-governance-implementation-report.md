# Stage 19 Export、Audit Read 与后端 Operation 全覆盖实施报告

验证日期：2026-08-04（America/Los_Angeles）。输入分支为 `backend/score-core`，输入 HEAD 为 `b526d299e98ca5f33abc8c79328f599fca113d6b`；实施分支为 `backend/export-audit-governance`。最终交接 HEAD 以本报告提交后的 `git rev-parse HEAD` 为准，输入 HEAD 必须是其祖先。

## 1. 结论

Stage 19 将 92 个 OpenAPI operation 全部闭合为可验证的真实运行状态：82 个 `IMPLEMENTED_VERIFIED`、10 个 `IMPLEMENTED_DEFAULT_DENY`、0 个 `NOT_IMPLEMENTED`、0 个 `BLOCKED_BY_ADR`。Backend Operation Coverage Gate 为“是”。

Export 的持久化、快照、worker、artifact 格式/保留期和下载授权尚无完整 ACCEPTED 决策，因此四个 Export operation 只实现了经过认证、角色与组织策略约束的精确 `SYSTEM_MODE_UNSUPPORTED`；没有 Export 表、文件、worker、URL 或假空数组。Export Business Gate 仍为“否”。Client Integration、Historical Data Migration 与 Full Production Gate 均保持“否”。

## 2. 剩余 11 个 operation 处置

权威盘点见 `19-remaining-operation-inventory.md`。

| operationId | Stage 19 disposition | 结果 |
| --- | --- | --- |
| `requestCurrentUserEmailChallenge` / `verifyCurrentUserEmailChallenge` | IMPLEMENT_VERIFIED（ADR-101 后续替换） | 邮箱唯一认证；首次绑定/双邮箱换绑；验证码、邮箱明文不进入 AuditLog/Outbox |
| `listStudents` | IMPLEMENT_VERIFIED | ADMIN 本组织；TEACHER 仅本人 ACTIVE ClassSection；稳定分页与过滤 |
| `getStudent` | IMPLEMENT_VERIFIED | STUDENT 本人、责任 TEACHER、同组织 ADMIN；越权安全 404 |
| `updateStudent` | IMPLEMENT_DEFAULT_DENY | ADR-096 仍为 PROPOSED；`SYSTEM_MODE_UNSUPPORTED`，零副作用 |
| `getTeacher` | IMPLEMENT_VERIFIED | STUDENT 仅 ACTIVE Enrollment 教师、TEACHER 本人、同组织 ADMIN |
| `listExports` | IMPLEMENT_DEFAULT_DENY | 精确 503；不返回假数组 |
| `createExport` | IMPLEMENT_DEFAULT_DENY | 精确 503；不创建 Job/Outbox/Audit/artifact |
| `getExport` | IMPLEMENT_DEFAULT_DENY | 精确 503；无 fallback success |
| `createExportDownloadUrl` | IMPLEMENT_DEFAULT_DENY | 精确 503；不创建 signed/public URL |
| `listAuditLogs` | IMPLEMENT_VERIFIED | 仅同组织 ADMIN；受控检索、时间/actor/action/target 过滤、绑定 cursor |
| `getAuditLog` | IMPLEMENT_VERIFIED | 仅同组织 ADMIN；跨组织安全 404 |

此前四个真实 default-deny 保持不变：`withdrawEnrollment`、`ignoreRosterAlignmentResult`、`withdrawExerciseRecord`、`openStudentScoreCorrection`。Stage 19 新增六个，共 10 个。

## 3. 合同与 Migration

OpenAPI operation 总数保持 92，没有为归零而删除 operation。`updateStudent` 补入精确 503 default-deny response；`AUDIT_LOG_READ` 纳入正式 Audit action 枚举；新增 ADR-096（PROPOSED）记录 Student/Profile 字段治理冲突，未擅自 ACCEPT。

新增唯一 forward-only Migration：`0010_export_audit_governance`。

- SHA-256：`42aea4159d943b1c1c541ef8558c123d0e88d8e5aed06fd462aeabc1f98fe3df`
- 新表：0
- FK：0
- unique index：0
- 新 index：0
- 新 trigger：0
- CHECK replacement：1（仅将 `AUDIT_LOG_READ` 加入既有 `audit_logs_action_type_check`）
- Export 表：0

0001–0009 checksum 未变化。Docker PostgreSQL 18.4 全新 volume 首次顺序部署 0001–0010 成功；重复部署为 `No pending migrations to apply`；Prisma schema drift 为 `No difference detected`。App role 为 `CREATE=false, USAGE=true`。

## 4. 实现边界

Student/Teacher read projection 由 User/Profile/Enrollment/ClassSection 权威关系计算，客户端自报身份不能扩大权限。学生列表与 Audit 列表 cursor 绑定 organization、principal、role、filters、sort 和 limit。

Audit Read 仅允许 ADMIN 且限制在 `principal.organizationId`。查询不扫描任意 JSON；公共 `safeMetadata` 先按 action 顶层白名单投影，再递归限制深度/长度/数组大小并脱敏 token、Authorization、Cookie、password、Secret、DATABASE_URL、storageKey、signed URL、evidence、internalNote、完整联系方式、request body、stack、SQL 与 constraint。每次 list/get 都在查询快照确定后追加一条 `AUDIT_LOG_READ`，不会递归读到自身，历史仍 append-only。

Export 不具备被批准的 persistence、snapshot、worker 或 private artifact 合同，故全部保留真实 default-deny。已明确冻结的 published/locked Score revision 约束没有被削弱，但本阶段没有把它扩展成未经批准的 Export 实现。

## 5. 测试与质量证据

完整五层回归：Unit 63/63、Integration 41/41、E2E 40/40、Contract 27/27、Security 38/38，总计 209/209；fail/cancelled/skip/todo 为 0。

Stage 18 的 194 个既有测试全部保留，并新增 15 个 Stage 19 测试。format、lint、strict typecheck、合同、runtime coverage、Prisma validate、migration safety、generated artifacts 与 build 均通过；Redocly 的 6 个既有 warning 保持可见。`npm audit --audit-level=high` 为 0 vulnerabilities。

## 6. Docker 运行验收

环境：Docker Client/Server 29.6.2、Docker Desktop 4.85.0 (235549)、Compose v5.3.1、context `desktop-linux`、Linux amd64、WSL2。Compose project 为 `bnbu-stage19-validation`。

使用根仓库真实 context 和 `backend/Dockerfile` 完成两次 no-cache BuildKit 构建：

| image | no-cache build | image ID/digest | size | User | Cmd |
| --- | ---: | --- | ---: | --- | --- |
| `bnbu-sports-backend:stage19-runtime` | 98.606 s | `sha256:9f3a0eca20192c4942a5941bbed403aa2984447e82589ab4d037be6c09706dd4` | 196,633,369 bytes | `bnbu` / UID 10001 | `node --enable-source-maps dist/main.js` |
| `bnbu-sports-backend:stage19-migrator` | 97.721 s | `sha256:aa612a3094f73835e5a798210e98f3314400a0a9e3667894b5c6b2b3a9e7e597` | 215,951,004 bytes | `node` / UID 1000 | `npm run db:migrate:deploy` |

runtime healthcheck 真实存在并执行。runtime 不含 `.env`、`.git`、`test` 或 Prisma source；migrator 不含 `.env`、`.git` 或测试目录。两张镜像 history 对敏感配置名扫描均为 0。

PostgreSQL 与 MinIO 均 healthy，MinIO init exit 0；roster/media bucket 匿名访问均为 403。App healthy、UID 10001，11 个 Stage 19 operation runtime smoke 全部通过，Teacher Audit Read 固定返回 `PERMISSION_AUDIT_SCOPE_DENIED`。六个新 default-deny 在登录完成后的精确数据库快照前后，User/Profile version、AuditLog、Outbox 与 Export 表数量完全不变。

App restart 后 readiness=200，持久性计数保持 `organizations=2/users=17/studentProfiles=12/migrations=10`。PostgreSQL 停止时 readiness=503，恢复 healthy 后 readiness=200。MinIO restart 后两个 bucket 仍存在且匿名访问仍为 403。允许来源 CORS preflight 为 204 并返回精确 origin；恶意来源为 404 且无 allow-origin。仅注入 `APP_ENV=production` 而缺少必需配置时容器 exit 1。

当前成功运行的 App/PostgreSQL/MinIO/init/migrator 日志扫描：19 个实际敏感 credential/key 值精确匹配 0；Bearer、Authorization、DATABASE_URL、storageKey、signed URL、evidenceReference、完整合成学号/邮箱和 password 形态匹配 0；未处理异常/crash loop 匹配 0。

teardown 使用 `down -v --remove-orphans` 并精确移除手工 App/migrator；最终该 project 的 container/network/volume 均为 0。三份 `.env.stage19.*` 与临时脚本已删除；未运行 `docker system prune`。

### 实际发现并处理的问题

1. 首次 build 从根 context 未显式传入 `--file backend/Dockerfile`，在读取 Dockerfile 前即失败；改为真实路径后两张镜像均 no-cache 成功。
2. 第一批 local-only 随机 Secret 可能以 `-` 开头，被 `mc admin user add` 当成 flag；init exit 1，Gate 未误判。仅销毁本 project 空 volume，重新生成带安全首字符的随机值后 init exit 0，最终日志无 Secret。
3. Windows 保留了 52967–53576 端口区间，两个临时 App 端口绑定失败；改用 loopback 18019 后正常。
4. 首次 App 配置的 QR replay window 小于 idempotency retention，应用按设计 fail-fast；修正 ignored local config 后 healthy，未修改业务源码。
5. 第一次零副作用比较误把登录的两个预期 Outbox 包含在区间内；随后将快照严格放在登录后、default-deny 前后，得到零变化证据。

## 7. Gate

| Gate | 判定 |
| --- | --- |
| Remaining Operation Inventory | 是 |
| Runtime Disposition | 是 |
| Export Contract | 否，关键决策未批准 |
| Export Persistence / Snapshot / Worker / Private Artifact / Authorization | 否，未实现且未伪造 |
| Audit Read | 是 |
| Audit Redaction | 是 |
| Remaining Governance | 是（写能力按合同 default-deny） |
| Backend Operation Coverage | 是 |
| Export Business | 否 |
| Client Integration | 否 |
| Historical Data Migration | 否 |
| Full Production | 否 |
| Stage 20 Readiness | 是，仅表示可进入独立决策/联调准备阶段 |

最终文档提交后还必须在 clean HEAD 重新运行 `runtime-coverage:check`、`runtime-coverage:generate`、`contract:check`、`generate:check`、`git diff --check` 与 monorepo layout 检查；最终 HEAD、提交列表和 clean 状态以最终命令输出为准。本阶段未 push、未创建 Pull Request、未 merge/rebase/pull，未修改 Android/Web 业务源码。
