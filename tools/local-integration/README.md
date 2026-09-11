# Android + iOS + Web 本地 Docker 联调手册

本文只适用于本机合成数据环境。它不会连接旧远程 API、Staging 或 Production，也不要把 `backend/.env`、邮箱验证码、Token、对象存储签名 URL 写入 Git 或终端日志。

## 第 1 阶段：仓库与 Docker 前置检查

从 monorepo 根目录执行：

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
npm --prefix backend run repo-layout:check
docker version
docker compose version
docker buildx version
docker run --rm hello-world
```

通过标准：没有嵌套 Git/gitlink；`docker version` 同时返回 Client 和 Server；Compose、Buildx、`hello-world` 均成功。

全新 Clone 只使用 monorepo 的统一依赖安装入口；它会按各自 lockfile 安装 Backend、合同工具和 Web 依赖：

```powershell
npm run bootstrap
npm run bootstrap:check
npm run contract:check
```

## 第 2 阶段：生成本地环境配置

```powershell
npm --prefix backend run local:env:init
npm --prefix backend run local:env:check
```

初始化脚本使用独占创建：若 `backend/.env` 已存在会拒绝覆盖。检查脚本只报告配置是否满足本地边界，不输出 Secret，并校验幂等 retention/lease、QR replay 与 invite/join capability 的全部 TTL 关系。

## 第 3 阶段：启动 Docker 基础设施

```powershell
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d
docker compose --env-file backend/.env -f backend/docker-compose.yml ps
```

预期服务：

- PostgreSQL：`127.0.0.1:5433`
- MinIO API / Console：`127.0.0.1:9000` / `127.0.0.1:9001`
- Mailpit SMTP / UI：`127.0.0.1:1025` / `http://127.0.0.1:8025`

必须等待 PostgreSQL、MinIO、Mailpit 都变为 healthy；`minio-init` 成功退出属于正常状态。

## 第 4 阶段：迁移、合成 Seed 与后端

使用仓库现有脚本查看可用命令，然后依次完成 Prisma 生成、forward-only migration 和 seed：

```powershell
npm --prefix backend run
npm --prefix backend run db:generate
npm --prefix backend run db:migrate:deploy
npm --prefix backend run db:seed:local
npm --prefix backend run start:dev
```

实际脚本名以 `backend/package.json` 为准。后端应监听 `http://127.0.0.1:3000`，API 前缀固定为 `/api/v1`。健康检查返回 200 后再启动客户端。

## 第 5 阶段：启动 Web 教师端

```powershell
npm --prefix BNBU-Sports-Web-new/portal-teacher-admin run dev -- --hostname 127.0.0.1 --port 3001
```

打开 `http://127.0.0.1:3001`，使用本地 seed 的合成教师账号登录。Web 默认请求同源 `/api/v1`，Vinext 开发服务器会将该路径代理到 `BNBU_LOCAL_BACKEND_ORIGIN`；未设置时使用 `http://127.0.0.1:3000`。在“课程管理”中为进行中的合成教学班生成邀请二维码/邀请码。邀请码是服务端签发的不透明字符串，不得大写、截断或只提取其中一段。

## 第 6 阶段：构建并启动 Android

先启动 Android Emulator，再执行：

```powershell
Set-Location BNBU-Sports-Android-master
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb reverse tcp:9000 tcp:9000
adb shell monkey -p edu.bnbu.student.mvp.debug -c android.intent.category.LAUNCHER 1
```

模拟器访问后端使用 `10.0.2.2:3000/api/v1`。MinIO 的上传签名 URL 指向宿主机 `127.0.0.1:9000`，因此每次重启模拟器或重新安装后都要重做 `adb reverse tcp:9000 tcp:9000`。

## 第 6A 阶段：iOS 本地真实 API 联调

iOS 工程不在本 monorepo 中，但它必须使用本仓库提供的同一份 Contract 1.5 候选和本地基础设施。先在 Backend/monorepo 根目录执行：

```bash
npm --prefix backend run local:env:init
npm --prefix backend run local:env:check
docker compose --env-file backend/.env -f backend/docker-compose.yml up -d
npm --prefix backend run db:generate
npm --prefix backend run db:migrate:deploy
npm --prefix backend run db:seed:local
npm --prefix backend run start:dev
```

- iOS Simulator 的 API base URL 使用 `http://127.0.0.1:3000/api/v1`；Mailpit UI 为 `http://127.0.0.1:8025`，MinIO API 为 `http://127.0.0.1:9000`。
- 不复制含 `CHANGE_ME` 的模板，不手工编造 `.env`。`local:env:init` 独占创建 `backend/.env`，已存在时拒绝覆盖；`local:env:check` 只报告有效性，不输出 Secret。
- 扫码入班顺序固定为 preview → issue Join Capability → 不带 Access Token 调 join → 保存 `PENDING_CONTACT_BINDING` 会话 → 邮箱 challenge/verify → 刷新为 `ACTIVE`。在激活前阻断运动和免测是正确行为。
- 免测写入必须从 `GET /enrollments` 的 ACTIVE Enrollment 明确取 `enrollmentId`，并按 Contract 传 `applicationSubtype` 和独立的 `organizationName`；不得把 800/1000 米、校队/社团或组织名称拼进 `reason`。
- 本地 HTTP 仅限 Simulator 与回环测试。真机、Staging HTTPS、ATS、证书信任、真实邮箱和公网对象存储必须另做环境验收，不能通过放宽 ATS 或复用生产凭据绕过。
- 当前不启用 APNs；不要申请通知权限或上传 push token。App 内通知中心与远程推送是两套独立能力。

## 第 7 阶段：执行端到端业务闭环

1. Web 教师端生成邀请凭证。
2. Android 扫码或粘贴完整邀请凭证，核对课程后加入。
3. Android 使用合成学生邮箱验证码登录；验证码只从本机 Mailpit 获取。
4. Android 开始真实服务端运动会话。
5. 为避免人工等待一小时，可先对唯一的 `SYNTH-*` 活跃会话执行只读检查，再显式应用时间推进：

   ```powershell
   node tools/local-integration/advance-synthetic-exercise-session.mjs --student-number SYNTH-... --seconds 3600
   node tools/local-integration/advance-synthetic-exercise-session.mjs --student-number SYNTH-... --seconds 3600 --apply
   ```

   该工具只接受本地数据库、`SYNTH-*` 学号、恰好一个 RUNNING 会话和固定 3600 秒；真正的结束、审计、事件与状态变更仍由后端 API 完成。

6. Android 结束运动，现场拍照，等待媒体变为 AVAILABLE，然后提交打卡。
7. Web 教师端进入“打卡审核”；页面切换和审核成功后都会重新拉取服务端数据，无需重新登录或整页刷新。教师可以查看服务端开始/结束时间、媒体凭证和历史审核状态，再判定“有效”。
8. Android 强制停止并重新启动，确认记录仍存在且显示服务端计入的打卡时长；再以数据库只读查询核对 `exercise_records=REVIEWED`、最新 `review_records=VALID`。

当前本地 seed 已包含两个不同的合成管理员、两条审批事件、`SYNTH-A-01` 的 ACTIVE 20 小时 ScoreRule，以及专用于跨端闭环的 `SYNTH-CLOSURE-0001` 合成学生。若学生在规则激活后才加入，第一次 VALID review 会在同一服务端计分流程中创建缺失的 `StudentScore` 并重新计算；Android 进度首页应从 0h 更新为服务端确认值。生产规则仍必须走正式审批，不得从客户端补算。

在 Backend、PostgreSQL、MinIO 和 Mailpit 都已启动且执行过本地 seed 后，可以用真实 API 与真实对象存储一键验证同一个 `recordId` 的媒体上传、Record 提交、教师 VALID 审核、成绩发布和学生回读：

```powershell
npm --prefix backend run local:closure
```

该脚本只允许连接 `127.0.0.1`/`localhost` 的本地测试服务和 `bnbu_sports` 数据库；验证码只从 Mailpit API 读取，不会输出验证码、密码、Token、签名 URL 或 `storageKey`。成功时仅输出 `recordId` 和安全状态摘要，可重复运行并恢复已有 DRAFT/REVIEWED 合成记录。

## 已知联调问题与定位

- Android 旧实现把邀请码强制转大写并限制为短格式，已改为按 OpenAPI 接受 16～512 字符的不透明凭证。
- MinIO 返回带双引号的 ETag，而确认上传 DTO 只接受裸 ETag；Android 在确认前移除外围引号。
- App 进程重启后可能已有同一会话的服务端 DRAFT；Android 会发现并更新该草稿。后端也在会话行锁内预检查重复草稿并稳定返回 409，不再泄漏为 500。
- 多个 API 门面可能同时刷新同一个 token family；Android 使用进程级锁并在锁内重读持久凭据，避免 refresh-token reuse detection 撤销会话。
- 合同新增独立只读 `GET /exercise-records/{recordId}/evidence-context`，在不改变旧 `ExerciseRecord` 响应的前提下返回服务端时间和媒体 ID；Web 再按角色调用短时 access URL，不读取 `storageKey` 或签名明文。
- 未选中的 PROCESSING/FAILED 上传不再阻断完整 AVAILABLE 凭证集合的提交；主动把非 AVAILABLE 媒体放进提交集合仍会被拒绝。
- Android 记录页展示最新审核状态和教师公开意见，不显示教师内部备注；首页身份显示 `studentNumber`，不显示内部 UUID。
- 失败请求日志使用映射后的线上 HTTP 状态，不再把 4xx 失败误记为 200/201。

## 固定的运行检查与进程边界

所有本地 URL 都显式使用 `127.0.0.1`，避免 Windows 把 `localhost` 解析到不可监听的 `::1`。后端与 Web 分别在两个终端前台运行，退出时各自使用 `Ctrl+C`，不要用名称模糊的 `Stop-Process node` 杀掉其他开发进程。

基础设施启动后运行：

```powershell
node tools/local-integration/check-local-runtime.mjs
```

后端和 Web 启动后运行：

```powershell
node tools/local-integration/check-local-runtime.mjs --require-backend --require-web
```

模拟器已经启动时，让脚本确认 ADB 设备并建立 MinIO 反向端口：

```powershell
node tools/local-integration/check-local-runtime.mjs --require-backend --require-web --configure-adb
```

Android 提交前会轮询媒体状态，只有 `AVAILABLE` 才进入提交集合；不要用固定 sleep 猜测 worker 完成时间。

## 收尾验证

```powershell
node --check tools/local-integration/initialize-local-environment.mjs
node --check tools/local-integration/check-local-environment.mjs
node --check tools/local-integration/advance-synthetic-exercise-session.mjs
node --check tools/local-integration/check-local-runtime.mjs
node --check tools/local-integration/run-synthetic-record-closure.mjs
npm --prefix backend run repo-layout:check
npm --prefix backend run runtime-coverage:check
npm --prefix backend run contract:check
npm --prefix backend run generate:check
git diff --check
```

停止本地服务时使用 `Ctrl+C` 关闭前后端。保留数据库继续联调时只执行：

```powershell
docker compose --env-file backend/.env -f backend/docker-compose.yml stop
```

不要运行 `down -v`，除非明确决定删除所有本地 Docker 数据卷并已单独确认。
