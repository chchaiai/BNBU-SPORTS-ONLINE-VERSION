# Greenfield Foundation Docker 运行验收报告（阶段 10B）

> 验证日期：2026-08-03（America/Los_Angeles）；验证分支：`backend/foundation-runtime-validation`；Foundation 基线：`6f315098915d8bd753cd2241049dfb47c08a9f6f`；Compose project：`bnbu-foundation-validation`。
>
> 结论：**Greenfield Foundation 验收 Gate：是**；所有业务 Gate 与 Full Production Gate 仍为否。

## 1. 范围与边界

本次只验收已完成的 Greenfield Foundation 容器运行能力。没有实现 Course、ClassSection、Enrollment、QR Join、Roster、ExerciseSession、Media、ExerciseRecord、Review、Score 或 Export；没有修改 Android/Web 源码或 gitlink；没有连接旧远程 API、未知数据库、真实学生数据或 production Secret；没有为未实现 operation 增加 Controller、Mock fallback 或假成功。

基线与最终 gitlink：

- Android：`e4cd2e5a623261cd19cddbd59d5cda7627bf7e98`
- Web：`a602280b4aa46d3e944671d341a7bf12bacb17cb`

阶段 10B 发现容器问题后，运行修复提交为 `572dcc2`（最终完整 hash 以 `git log` 为准）。运行证据和 Gate 文档使用独立后续提交。本阶段没有 merge、rebase、pull、push 或 Pull Request。

## 2. Docker 环境

| 项目                   | 实测值                                                        |
| ---------------------- | ------------------------------------------------------------- |
| Windows host           | Microsoft Windows 11 家庭版中文版 `10.0.26200`（build 26200） |
| Docker Client          | `29.6.2`，`windows/amd64`                                     |
| Docker Server / Engine | `29.6.2`，`linux/amd64`                                       |
| Docker Desktop         | `4.85.0 (235549)`                                             |
| Docker Compose         | `5.3.1`                                                       |
| Docker context         | `desktop-linux`                                               |
| Server OS / kernel     | Docker Desktop，Linux `6.6.87.2-microsoft-standard-WSL2`      |
| Architecture           | `x86_64`，16 CPU，`overlayfs`                                 |
| Buildx                 | `v0.35.0-desktop.2`                                           |
| BuildKit               | `v0.31.2`，builder `desktop-linux`，状态 `running`            |

Docker CLI 安装在用户本地 Docker Desktop 目录，但没有进入当前 shell 的 `PATH`。验收使用该绝对路径并只在单条命令进程内补充 `PATH`，没有修改系统环境或 Docker Desktop 配置。第一次 build 在解析 Docker credential helper 时因同一目录不在 `PATH` 而提前失败；补充任务局部 `PATH` 后按原命令成功，不属于 Dockerfile 或依赖失败。

## 3. 隔离配置与 Compose 静态解析

从 `backend/.env.example` 生成 `backend/.env.validation.local`，并确认被 `backend/.gitignore` 的 `.env.*` 规则忽略。文件只包含随机合成密码、随机 HMAC/AES key 与 local-validation-only Ed25519 key；所有 `CHANGE_ME` 均替换；未打印完整文件或 Secret；最终 teardown 后已删除。

`docker compose -p bnbu-foundation-validation --env-file .env.validation.local config` 实测 exit 0，结果如下：

- 服务只有现有定义中的 `postgres`、`minio`、`minio-init`；没有创建第二套 Compose。
- App 与 Migrator 按现有 Dockerfile/runbook，以同一 Compose network 上的独立容器运行。
- PostgreSQL：`postgres:18.4-alpine3.24`。
- MinIO：`minio/minio:RELEASE.2025-09-07T16-13-09Z-cpuv1`。
- MinIO client：`minio/mc:RELEASE.2025-08-13T08-35-41Z-cpuv1`。
- Node：`node:24.18.0-bookworm-slim`，解析 digest 为 `sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d`。
- 没有 `latest` 标签或未替换变量。
- PostgreSQL `127.0.0.1:55433`；MinIO `127.0.0.1:59000/59001`；均没有绑定公共网卡。
- `minio-init` 显式执行 bucket 创建与 `mc anonymous set none`。
- App 与 Migrator 使用分离数据库角色/URL；App 启动日志中没有 migration，运行镜像也不包含 migration 目录。
- 根目录构建 context 为项目既有 context；`.dockerignore` 排除 `.env`、`.git`、测试、测试 key 和宿主机 `node_modules`。

## 4. 最终镜像构建

最终命令：

```text
docker buildx build --no-cache --load --file backend/Dockerfile --tag bnbu-sports-backend:foundation-6f31509 .
docker buildx build --no-cache --load --target migrator --file backend/Dockerfile --tag bnbu-sports-backend-migrator:foundation-6f31509 .
```

| 项目               | Runtime                                                                                       | Migrator                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| exit code          | 0                                                                                             | 0                                                                         |
| 最终无缓存构建耗时 | 60.75 s                                                                                       | 53.52 s                                                                   |
| image ID           | `sha256:5c0f1dce7181ab0d12db2881db5087dc5b6d7df21a37d4416eb5f5b6406b2a7d`                     | `sha256:fd4c9341e0aabca569f26ebd8699d34123396ee7cf0804f351712eaab7455732` |
| local repo digest  | `bnbu-sports-backend@sha256:5c0f1dce7181ab0d12db2881db5087dc5b6d7df21a37d4416eb5f5b6406b2a7d` | 本地 target tag，无远程 registry digest                                   |
| size               | 193,758,202 bytes（约 184.78 MiB）                                                            | 213,478,224 bytes（约 203.59 MiB）                                        |
| User               | `bnbu`（UID 10001）                                                                           | `node`                                                                    |
| Entrypoint         | `docker-entrypoint.sh`                                                                        | `docker-entrypoint.sh`                                                    |
| Cmd                | `node --enable-source-maps dist/main.js`                                                      | `npm run db:migrate:deploy`                                               |

多阶段构建真实执行 `npm ci`、锁定的 `package-lock.json`、Prisma Client 生成、migration safety、Nest/TypeScript build 和 OpenAPI check。最终 image history 不包含 `--force`，也不包含本次生成的 Secret。

最终 runtime image 检查：

- `/app/.env`、`/app/.git`、`/app/test`、`/app/tests`、`/app/prisma`、`/app/src` 均不存在。
- `node`、`openssl` 与镜像 healthcheck 使用的 Node `fetch` 能力存在。
- rootfs tar 对临时环境文件全部强 Secret 值及 PEM 换行形式做流式精确扫描，匹配数为 0。
- image history 对相同 Secret 扫描匹配数为 0。
- 最终用户实测 `id -u = 10001`、`id -un = bnbu`。
- healthcheck 为镜像既有的 `/api/v1/health/live` Node probe；独立无后端进程探针最终进入 `unhealthy`，证明失败能反映服务不可用。

## 5. 运行服务与 Health

最终 teardown 前状态：

| 服务        | 状态    | Health / exit                                              |
| ----------- | ------- | ---------------------------------------------------------- |
| PostgreSQL  | running | `healthy`                                                  |
| MinIO       | running | `healthy`                                                  |
| MinIO init  | exited  | exit 0                                                     |
| Migrator    | exited  | exit 0；首次 deploy 成功，重复 deploy 无 pending migration |
| Backend App | running | `healthy`，User `bnbu`，restart count 0                    |

没有 crash loop、持续 restart、缺失环境变量、未处理异常或数据库权限错误。App 的 liveness healthcheck 与数据库 readiness 分离：PostgreSQL 停止时 App 进程仍存活，但 `/health/ready` 返回 503；数据库恢复后 readiness 返回 200。

## 6. PostgreSQL 18.4 与 Migration

在全新的 Docker PostgreSQL 18.4 空卷中，Migrator 首次应用 `0001_greenfield_foundation` 成功；第二次和 PostgreSQL 重启后的再次 deploy 都返回 `No pending migrations to apply`。

| catalog / invariant              | 实测值 |
| -------------------------------- | -----: |
| Foundation tables                |     12 |
| foreign keys                     |     23 |
| non-primary unique indexes       |     22 |
| CHECK constraints                |     88 |
| non-primary total indexes        |     38 |
| finished migration rows          |      1 |
| forbidden future business tables |      0 |

Migration checksum 为 `0573e3d13018e0db103ef4b605eb35278723174507b37379425a489b10e1462d`，与 manifest、迁移脚本和 `_prisma_migrations` 一致。`npm run db:schema:drift:check` 返回 `No difference detected`。

数据库边界实测：

- Migrator 角色具有 public schema CREATE 权限。
- App 角色没有 public schema CREATE 权限，也没有 superuser/createdb/createrole/replication 标志；实际 `CREATE TABLE` 被拒绝。
- `audit_logs_append_only_trigger` 存在且启用；实际 UPDATE 被 `audit logs are append-only` 拒绝。
- `student_number` 是 `character varying`；合成值 `00123456` 读回仍保留前导零。
- `semesters_one_current_per_organization_idx` 存在；插入第二个 CURRENT Semester 被唯一索引拒绝。
- Course/ClassSection 等后续业务表计数为 0。

## 7. MinIO

- MinIO health 为 `healthy`，`minio-init` exit 0。
- `bnbu-foundation-validation-private` bucket 存在。
- `mc stat` 显示 `Anonymous: Disabled`；`mc anonymous get` 显示 `private`。
- 无签名 list/read 与 PUT/write 均返回 HTTP 403。
- MinIO Access Key/Secret 只来自临时环境文件；最终日志与 image 扫描均没有命中。
- 本次只证明对象存储基础设施可用；没有新增 Media Controller、Media 表、永久公开 URL，也没有把 MinIO 存在解释为 Media 模块已实现。

## 8. Foundation API Smoke

以下 9 个已实现 operation 均在最终 runtime image 上通过：

1. `GET /api/v1/health/live`
2. `GET /api/v1/health/ready`
3. `GET /api/v1/system-mode`
4. `POST /api/v1/auth/password-login`
5. `POST /api/v1/auth/refresh`
6. `POST /api/v1/auth/logout`
7. `GET /api/v1/me`
8. `GET /api/v1/organizations/current`
9. `GET /api/v1/semesters/current`

具体结果：

- live/ready 为 200/UP，ready 验证 migration compatibility。
- SystemMode 为正式枚举 `NORMAL`。
- 合成 Teacher 与 Admin 均登录成功；错误密码为 401 和稳定 `AUTH_CREDENTIAL_INVALID`。
- `/me` 使用 Access Token 成功，且不包含 `passwordHash`、`tokenVersion` 或 Refresh Token。
- Refresh Token 原子轮换成功；旧 token 重放返回 `AUTH_SESSION_REVOKED`，token family 被撤销。
- 新登录 session logout 成功；logout 后旧 Refresh Token 不能继续使用。
- current organization 返回合成 BNBU 投影；current semester 返回合成 CURRENT Semester。
- 指定 `X-Request-ID` 与响应 header、成功 envelope `meta.requestId`、错误 envelope `requestId` 一致。
- 成功响应字段严格为 `data/meta`；错误响应字段严格为 `code/message/details/requestId/timestamp`。
- CORS allowlist 对允许 origin 返回精确 header，对拒绝 origin 不返回 allow-origin。

未实现接口先后抽查 `/students`、`/courses`、`/class-sections`、`/enrollments`、`/exercise-sessions`、`/exercise-records`、`/student-scores`、`/exports`：均为 404；12 张 Foundation 表抽查前后行数完全一致。最终镜像再次抽查 Course/ClassSection/Record/Export 也全部为 404，没有 fallback 假 200、假空数组或数据库副作用。

## 9. 运行安全与日志

- App 容器非 root；PostgreSQL、MinIO、App host port 都只绑定 loopback。
- runtime rootfs/image history 中没有临时 `.env`、测试私钥、Token、数据库密码、MinIO Secret、测试目录或 Git metadata。
- 最终 combined log tail 共扫描 211 行；本次生成 Secret、JWT 形态、DATABASE_URL、完整合成邮箱、完整学号、未脱敏 password/refreshToken/authorization/cookie 字段、fatal/panic/unhandled 均为 0 命中。
- `APP_ENV=local`，没有被误识别为 production。
- 使用相同 env-file 但覆盖 `APP_ENV=production` 并清空真实配置键 `TOKEN_SIGNING_KEY` 的一次性容器 exit 1，明确 fail fast；没有 production fallback。
- 最终 image history 不包含 `--force`。

## 10. 重启与持久性

一轮专用持久性复验记录的合成 ID：

- Organization：`019fc89c-feb8-7368-b83a-8873da40013e`
- CURRENT Semester：`019fc89c-fefb-77f8-9eb9-0d1339bce7f1`
- Admin User：`019fc89c-fedf-7508-a41a-ac18b3a415f5`
- Teacher User：`019fc89c-feef-7161-a21f-a1d0d5473bdf`

App 重启后恢复 `healthy`，readiness 200，Teacher 登录成功。PostgreSQL 停止期间 readiness 503；启动后 PostgreSQL 恢复 `healthy`、readiness 200、登录成功。以上四个 ID 与 migration row count（1）在 PostgreSQL 重启前后完全一致。

最终无 `--force` 镜像又重复完成 App 重启、PostgreSQL 503→healthy/200、9/9 API、refresh/reuse/logout 和 post-restart migration `No pending migrations`。

这些结果只证明 local Compose volume restart/persistence，不是 production 备份恢复、PITR 或灾备演练；ADR-071 和 Production Gate 没有因此改为 ACCEPTED/是。

## 11. 全量质量检查

最终 Dockerfile/test 修复后完整复跑：

| 命令 / 层                      | 结果                                                                      |
| ------------------------------ | ------------------------------------------------------------------------- |
| `npm ci`                       | exit 0；582 packages；0 vulnerabilities                                   |
| `npm run format:check`         | PASS                                                                      |
| `npm run lint`                 | PASS，0 warning                                                           |
| `npm run typecheck`            | PASS                                                                      |
| `npm run contract:check`       | PASS；73 paths、86 operations、212 schemas；policy/enum/error diff 均为 0 |
| `npm run db:validate`          | PASS                                                                      |
| `npm run db:migration:check`   | PASS                                                                      |
| `npm run generate:check`       | PASS                                                                      |
| Unit                           | 12/12                                                                     |
| Integration                    | 6/6                                                                       |
| E2E                            | 8/8                                                                       |
| Contract                       | 3/3                                                                       |
| Security negative              | 4/4                                                                       |
| 总计                           | 33/33；0 fail、0 skip                                                     |
| `npm run build`                | PASS                                                                      |
| `npm audit --audit-level=high` | 0 vulnerabilities                                                         |
| `git diff --check`             | PASS                                                                      |

Redocly 仍报告 6 个既有、非阻塞 warning：缺 license、3 个公开 probe 缺 4XX、`ResponseMeta` 与 `ScoreContribution` 未引用。本阶段没有隐藏 warning、编造 license 或删除未来 schema。

Android/Web 源码与 gitlink 均未修改。本阶段没有重新把既有客户端回归冒充为 Greenfield 跨端联调。

## 12. 实际发现与修复

1. **Prisma 容器缺少 OpenSSL。** 首轮 Migrator 虽能执行，但两次明确警告无法探测 OpenSSL。Dockerfile 增加共享 `node-base`，安装 `openssl` 并清理 apt lists；修复后 build、generate、migrate 不再出现该警告。
2. **基线 Dockerfile 有 `npm cache clean --force`。** 该 cache 不会复制进最终 runtime，命令冗余且与本阶段“不得使用 `--force`”冲突；已删除，只保留 `npm ci --omit=dev`。最终 image history 的 `--force` 命中数为 0。
3. **JWT E2E 篡改测试不确定。** 当前代码修改 JWT 最后一个 Base64URL 字符；该字符可能只改变未使用 padding bits，解码签名不变，实测一次返回 200。测试改为确定性翻转 signature 首字符；生产 Token 校验未放宽；完整 E2E 重新 8/8。
4. **环境型重试。** Docker credential helper、沙箱 npm cache/registry、PowerShell 内联引号与新建空测试库缺 migration 都分别按原真实流程修正后重跑；没有用 `--force`、skip、降低 audit level 或隐藏失败。测试库最终按 CI 顺序首次/重复 migrate、drift、33/33。

## 13. Teardown

最终执行精确命名的 App/Migrator 删除和：

```text
docker compose -p bnbu-foundation-validation --env-file .env.validation.local down -v --remove-orphans
```

最终核验：

- 残留 validation 容器：0
- 残留 validation network：0
- 残留 validation volume：0
- `backend/.env.validation.local`：已删除
- 本阶段临时脚本/rootfs tar：已删除
- 未运行 `docker system prune -a`
- 未删除、停止或修改其他 Docker project、image 或 volume

## 14. 未验证内容与 Gate

未验证：远程 CI run、staging/production 部署、HTTPS/WAF、production Secret manager/轮换、真实备份恢复/PITR、容量与故障演练、媒体 production 安全、真实学生数据、Android/Web/iOS 新 API 跨端联调、完整 `recordId` 业务链路。

| Gate                            | 最新判定 | 说明                                                                                                                                                                                         |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greenfield Foundation 验收 Gate | **是**   | daemon、无缓存 build、Compose、PostgreSQL/MinIO/init/Migrator/App、空库与重复 migration、零 drift、9 API、refresh/reuse/logout、非 root、脱敏、restart/persistence、teardown、全量检查均通过 |
| Course/ClassSection             | 否       | 未实现                                                                                                                                                                                       |
| Enrollment/QR Join              | 否       | 未实现                                                                                                                                                                                       |
| Roster                          | 否       | 未实现                                                                                                                                                                                       |
| Session/Media/Record            | 否       | 未实现                                                                                                                                                                                       |
| Review                          | 否       | 未实现                                                                                                                                                                                       |
| Score                           | 否       | 未实现                                                                                                                                                                                       |
| Export                          | 否       | 未实现                                                                                                                                                                                       |
| Full Production                 | **否**   | production 安全、恢复、运维、业务与跨端 Gate 未关闭                                                                                                                                          |

ADR-070、071、072、073、074 仍为待确认的 production 参数/运行决策；本阶段没有批准、改写或把它们标记为 ACCEPTED。
