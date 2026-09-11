# Greenfield Foundation 本地运行手册

本手册只适用于合成 local/test 数据。禁止连接旧远程 API、未知数据库、staging/production 数据库或复制真实学生数据。

## 1. 前置条件

- Node.js 24 与 npm 11（CI/容器锁定 24.18.0，本轮本机验证运行时为 24.13.1）；
- Docker Engine/Desktop 与 Compose v2，用于 PostgreSQL 18.4、local MinIO 和 Mailpit；
- Git checkout 位于根仓库，`backend/` 是普通目录；

容器镜像已精确锁定在 `docker-compose.yml`。PostgreSQL、MinIO 与 Mailpit 只绑定 loopback；bucket 默认私有。MinIO root credential 只供初始化使用，App 使用独立的最小权限身份。不要把 `.env`、PEM、邮箱验证码或真实 Secret 提交到 Git。

## 2. Windows PowerShell

从 monorepo 根目录执行唯一安装与初始化流程：

```powershell
npm run bootstrap
npm run local:env:init
npm run local:env:check
```

`npm run bootstrap` 按三个受管 package 的 lockfile 安装 Backend、合同工具和 Web 依赖。初始化脚本生成独立的 local-only 数据库、MinIO、Token、幂等、QR、Push 和 seed 凭证，并通过独占创建保护已有 `backend/.env`；它不会读取、打印或覆盖现有 Secret。TTL 单位都是秒，并自动校验：

```text
ACCESS_TOKEN_TTL < REFRESH_TOKEN_IDLE_TTL <= REFRESH_TOKEN_ABSOLUTE_TTL
IDEMPOTENCY_LEASE < IDEMPOTENCY_RETENTION
QR_JOIN_SECRET_REPLAY_SECONDS >= IDEMPOTENCY_RETENTION
JOIN_CAPABILITY_TTL_SECONDS < COURSE_INVITE_TTL_SECONDS
```

启动基础设施并初始化：

```powershell
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d
docker compose --env-file backend/.env -f backend/docker-compose.yml ps
npm --prefix backend run db:generate
npm --prefix backend run db:migration:check
npm --prefix backend run db:migrate:deploy
npm --prefix backend run db:seed:local
npm --prefix backend run start:dev
```

等待 PostgreSQL、MinIO 和 Mailpit 均为 healthy；`minio-init` 成功退出属于正常状态。Mailpit SMTP 为 `127.0.0.1:1025`，UI 为 `http://127.0.0.1:8025`。

验证：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health/live
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health/ready
Invoke-RestMethod http://127.0.0.1:3000/api/v1/system-mode
```

local/development 的合同浏览页为 `http://127.0.0.1:3000/api/docs`。停止服务后保留本地卷：

```powershell
docker compose --env-file backend/.env -f backend/docker-compose.yml down
```

不要使用 `down -v`，除非明确要销毁且已核对目标是可重建的合成本地数据。

## 3. macOS/Linux

```bash
npm run bootstrap
npm run local:env:init
npm run local:env:check
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d
docker compose --env-file backend/.env -f backend/docker-compose.yml ps
npm --prefix backend run db:generate
npm --prefix backend run db:migration:check
npm --prefix backend run db:migrate:deploy
npm --prefix backend run db:seed:local
npm --prefix backend run start:dev
```

不要直接复制示例占位符；配置校验会拒绝 `CHANGE_ME`。已有 `.env` 需要保留时，只运行 `npm run local:env:check`，不要删除或覆盖它。

## 4. Seed

`npm run db:seed:local` 只在 `APP_ENV=local` 时运行，并要求显式 `LOCAL_SEED_TEACHER_PASSWORD` 与 `LOCAL_SEED_ADMIN_PASSWORD`。它幂等创建：

- 合成 BNBU Organization；
- 一个合成 CURRENT Semester；
- 一个合成 Teacher User/Profile；
- 一个合成 Admin User/Profile；
- `NORMAL` SystemPolicy；
- 合成 Course/ClassSection，以及无 Enrollment、历史关系、ACTIVE/REMOVED/WITHDRAWN 和身份冲突学生 fixture；
- 一个只保存 digest、无明文 escrow 的 ACTIVE CourseInvite；需要明文邀请时必须调用受认证 API 创建。

全部学生身份也是明显的合成 fixture；账号使用 `.invalid` 邮箱，不包含真实联系人、真实学号或生产 Secret。seed 可重复执行且不得产生重复身份/关系，不可用于 staging/production。

## 5. 测试

不依赖数据库的层：

```powershell
npm run test
npm run test:contract
npm run test:security
```

真实数据库层只接受 loopback 上专用的 PostgreSQL 18 数据库 `bnbu_sports_test`、用户 `bnbu_test`、端口 `5432` 或 `55432`，并要求显式的一次性清库确认值。测试会清空全部业务测试表；绝不能复用 local/staging/production：

```powershell
$env:TEST_DATABASE_URL = 'postgresql://bnbu_test:test_password@127.0.0.1:55432/bnbu_sports_test?schema=public'
$env:TEST_DATABASE_RESET_CONFIRMATION = 'BNBU_SPORTS_EPHEMERAL_TEST_DATABASE_V1'
npm run test:integration
npm run test:e2e
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:TEST_DATABASE_RESET_CONFIRMATION
```

macOS/Linux：

```bash
export TEST_DATABASE_URL='postgresql://bnbu_test:test_password@127.0.0.1:55432/bnbu_sports_test?schema=public'
export TEST_DATABASE_RESET_CONFIRMATION='BNBU_SPORTS_EPHEMERAL_TEST_DATABASE_V1'
npm run test:integration
npm run test:e2e
unset TEST_DATABASE_URL
unset TEST_DATABASE_RESET_CONFIRMATION
```

完整静态门禁：

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
npm run test:integration
npm run test:e2e
npm run test:contract
npm run test:security
npm run build
npm audit --audit-level=high
```

## 6. Docker image

构建上下文必须是根仓库，以便构建时核对唯一 OpenAPI：

```powershell
Set-Location ..
docker build --file backend/Dockerfile --tag bnbu-sports-backend:local .
```

Dockerfile 提供 `migrator` 和非 root `runtime` stage；runtime 不复制源码、测试、`.env` 或测试密钥。应用容器与迁移步骤必须使用不同数据库凭证。Compose 的 `POSTGRES_BOOTSTRAP_*` 身份只负责新卷初始化；实际 Migration 使用显式 `NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT` 的 `POSTGRES_MIGRATOR_USER`，只对该项目数据库和 `public` schema 具有迁移所需的 `CREATE`，不能创建其他数据库。每次容器化 deploy 后都会同步 App 对业务表的 DML，并把 `_prisma_migrations` 收紧为只读，以便 readiness 校验 checksum 而不能篡改迁移历史。三个数据库用户名必须是彼此不同的小写 PostgreSQL identifier。2026-08-02 的实现机器没有 Docker，这是历史事实；阶段 10B、11、12、13 后续均已在 Docker Desktop 真实构建和运行。阶段 12 证据见 [`../../docs/backend-contracts/12-identity-enrollment-qr-join-implementation-report.md`](../../docs/backend-contracts/12-identity-enrollment-qr-join-implementation-report.md)，Stage 13 证据见 [`../../docs/backend-contracts/13-official-roster-alignment-implementation-report.md`](../../docs/backend-contracts/13-official-roster-alignment-implementation-report.md)。

手工运行 App 镜像时，宿主机发布端口与容器内 `PORT` 是两个不同参数。例如 `-p 127.0.0.1:53000:3000` 必须同时向容器显式注入 `PORT=3000`；不要把宿主机开发端口原样作为容器监听端口。镜像 Healthcheck 使用容器内 `PORT`，宿主机烟测还必须独立验证实际发布端口。

## 7. 常见错误

| 症状                       | 原因与处理                                                                 |
| -------------------------- | -------------------------------------------------------------------------- |
| 启动报 `CHANGE_ME`         | `.env` 仍有占位符；全部替换，不添加代码 fallback                           |
| PEM 格式错误               | 私钥不是 PKCS#8、公钥不是 SPKI，或 `.env` 未用 `\n` 编码换行               |
| Token TTL 校验失败         | 调整显式秒数，满足 access < idle <= absolute                               |
| 幂等/QR TTL 校验失败       | 重新运行检查并满足本手册列出的 retention、lease、replay 与 join 约束       |
| Prisma 找不到 URL          | migration CLI 读取 `MIGRATION_DATABASE_URL`；应用读取 `DATABASE_URL`       |
| readiness 失败             | 先检查 PostgreSQL、migration checksum、CURRENT Semester 与 SystemPolicy    |
| integration 拒绝数据库 URL | URL 不是专用 loopback `bnbu_test@.../bnbu_sports_test`，或缺少显式清库确认 |
| CORS 被拒绝                | `CORS_ALLOWLIST` 必须是逗号分隔的精确 HTTP(S) origin，不含 path            |
| 登录持续受限               | local 单进程限流生效；不要在代码中关闭，等待窗口或重启仅限合成 local 环境  |
| Mailpit 无法访问           | 确认 Compose 中 `mailpit` 为 healthy，SMTP/UI 端口未被其他进程占用         |
| Docker 不可用              | 安装/启动受支持的 Docker 环境后再验收；不得用未执行的 CI 配置冒充通过      |
