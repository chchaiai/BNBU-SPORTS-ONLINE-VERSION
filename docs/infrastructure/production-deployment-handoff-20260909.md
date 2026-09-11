# 正式服务器部署交接 · 2026-09-09

状态：生产依赖链路已实际验证；验收邮箱已由用户确认在收件箱收到。部署窗口约 22:15–23:10（Asia/Shanghai）。

## 实际访问

| 入口 | 实测 |
| --- | --- |
| https://www.student.bnbusports.cn/student/ | HTTPS 200；Edge 展示学生隐私入口 |
| https://www.teacher.bnbusports.cn/ | HTTPS 200；Edge 读取服务端系统状态后显示正式登录页 |
| 两站 `/api/v1/health/ready` | 200、READY/UP |
| https://bnbusports.cn/ | 原有分发站 200 |

香港 CVM：43.129.193.7 / ins-kfitq8i6，Ubuntu 22.04。Backend 127.0.0.1:3000，Portal 127.0.0.1:3100；Nginx 对外 80/443。应用容器使用 UID/GID 10001、只读根文件系统、cap_drop ALL、no-new-privileges、日志轮换、内存上限、restart unless-stopped。两容器实际 restart 后健康，Docker/Nginx/ClamAV/病毒库更新服务与证书续期 timer 均已启用。

## 已部署版本

基线提交：`f0f628ae44f9fe6f55a94dbca5bc1ef0288f8457`；附加本次生产扫描接线与部署工具。发布目录 `/opt/bnbu-sports-production/releases/f0f628ae-scanner1`，`/opt/bnbu-sports-production/current` 指向该目录。

| 镜像 | 固定 image ID |
| --- | --- |
| bnbu-backend-production:f0f628ae-scanner1 | sha256:c5bc0c36ac5579467a16597b73f964dbfbf0264ffec4a47b3ba80aeb79863f8c |
| bnbu-backend-migrator:f0f628ae | sha256:81fba1cab2772a8f0d38b67639d79feeee9ce257fde985ced6439184bfe93c37 |
| bnbu-portal-production:f0f628ae | sha256:3cb11157c1c5e084ea4a9908abc6355fab9a9d8821daad3dbd5580ca508e4493 |

镜像传输包服务器路径 `/home/ubuntu/bnbu-infra-check-20260909/production-images-f0f628ae.tar.gz`，SHA256 `968a52a0f6292858a7a6400dd34d0b3dae092bb8b467d259a78c273a94b73151`；本地与服务器校验一致。Compose `.env` 使用上述 immutable image ID。

## 验证结果

- Backend：生产配置启动成功；readiness 200；正式域名管理员密码登录 200；首改密码状态 true；首改前管理业务拒绝 403；注销 200。
- Web：生产构建完成；本地 immutable Portal 镜像 200；两正式站点 Edge 浏览器加载成功；管理站动态系统状态读取正常。
- Database：香港同 VPC PostgreSQL `172.19.0.16:5432/bnbusports`。初始空库，59 项 Migration 成功。运行账号 `bnbusports_app`；迁移账号 `bnbusports_sqladmin`；Migration 后权限收紧成功，迁移记录只读。实际会话 `pg_stat_ssl` 为 TLSv1.3。媒体 AVAILABLE 结果由数据库读回确认。
- COS：`bnbu-sports-prod-hk-1443273655`，ap-hongkong，私有、SSE-COS。CVM 角色临时凭据实际完成 PUT/HEAD/GET、签名 HTTPS 下载字节一致、匿名 GET 403、学生站 CORS OPTIONS 200。
- HTTPS：正常证书校验；SAN 覆盖两个正式域名；有效期 2026-09-09 至 2026-12-08 13:16:55 UTC。certbot.timer 已启用。HTTP 配置为 308 转 HTTPS；Nginx 配置检查通过。
- Media：原 EXTERNAL_REQUIRED 扫描分支恒返回 503，已补接私有 clamd Unix socket `/run/clamav/clamd.ctl`。干净输入通过、真实 EICAR 被拒绝、服务不可用时拒绝通过。只接受明确 clean verdict；保留原格式、摘要、位置元数据与时长规则。协议依据：[ClamAV INSTREAM](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)。
- 邮件：SES 广州，已验证域 `verityai.cn`，发信地址 `no-reply@verityai.cn`，已审核模板 56852，变量 code。用户确认后为 BNBUSportsHKCVMRole 关联既有策略 283093829，仅 ses:SendEmail/resource *。2026-09-09 22:52 实际发给 1376293426@qq.com，用户确认“已在收件箱收到”。MessageId `qcloudses-30-1443273655-date-20260909225220-ITGLqmvUAl4Y1`；RequestId `b418f4fd-c9f0-45b0-8d57-0537b021dab4`。

## Smoke Test

1. 生产运行检查 8/8：HTTPS 登录、首改要求、权限拒绝、COS 上传/HEAD/读取/真实扫描、签名下载、匿名拒绝、CORS、注销。
2. 媒体 API 检查 5/5：创建上传及幂等重放 → COS PUT → confirm → 生产 worker/ClamAV → AVAILABLE → 授权下载字节一致 → PostgreSQL 回读；最后停用合成账号。
3. 扫描器真实检查 3/3：clean、EICAR、不可用时拒绝。
4. 新扫描协议及既有媒体单元测试 21/21；Backend typecheck、Backend build/openapi check、Portal build 通过。
5. 两容器实际重启后 healthy，公网 readiness 200；原分发站仍 200。未重启整台 CVM。

媒体验收对象 ID `01a086b0-53cb-727c-864b-2c397ce6f5fb`；隔离合成组织 `01a086b0-513f-7502-8741-de8d5be0ecb9`。合成组织相关账号已 DISABLED/tokenVersion 增加，保留测试事实与审计记录。未删除数据库或 COS 内容。合成学生会话由测试工具签发，只用于本次媒体链路，不代表真实学生入班或真实邮箱登录验收。

首次失败与修复：Portal 旧构建上下文缺共享学生文件，改用 monorepo context 后构建成功；新协议测试夹具误计头长度，修正后 21/21；运营 probe 首次漏 supplementary group，补与 Backend 一致的 10001 后通过；媒体合成组织 namespace 首次含小写，数据库约束拒绝且事务回滚，改大写后全链通过。生产规则未放宽。

## 私密配置与首位管理员

服务器文件均未写入 Git，未输出凭据内容：

| 路径 | 用途与权限 |
| --- | --- |
| /etc/bnbu-sports-production/secrets/runtime.json | 应用数据库凭据、签名/加密/哈希密钥；root:10001 0640，目录 0750 |
| /etc/bnbu-sports-production/secrets/migrator.json | 专用迁移数据库凭据；root:10001 0640 |
| /etc/bnbu-sports-production/secrets/tencentdb-ca-chain.pem | 腾讯数据库 CA；root:10001 0640 |
| /etc/bnbu-sports-production/mail.env | SES region/sender/template 配置；root:10001 0640 |
| /etc/bnbu-sports-production/bootstrap/initial-admin.json | 首次管理员随机临时密码；root:root 0600，目录 0700 |

SES/COS 凭据来自 CVM metadata 临时角色并自动刷新，无长期 SES 静态密钥文件。Backend 已读取 mail.env。首位总管理员 `chengwacheong@bnbu.edu.cn`，权限 SUPER；首次登录须改密。由有权维护服务器的用户在私密 SSH 终端读取 initial-admin.json 后登录，勿粘贴到聊天或日志。邮箱未伪造为已验证；后续需按产品正常流程完成本人邮箱验证。机构已初始化 BNBU；正式课程/教师/学生名单尚待管理员录入。

## 部署和运行

SSH：`ssh -i C:/Users/23328/Desktop/SSH_CVM密钥/BNBU_SPORTS_HK.pem ubuntu@43.129.193.7`。

当前版本重新启动（服务器）：

```bash
cd /opt/bnbu-sports-production/current
sudo docker compose up -d backend portal
sudo docker compose ps
curl -fsS https://www.teacher.bnbusports.cn/api/v1/health/ready
```

构建源：Backend 使用仓库根上下文 `backend/Dockerfile` 的 runtime、migrator targets；Portal 使用 `tools/production/Dockerfile.portal` 和仓库根上下文，按文件声明提供非空 OCI/Contract/fingerprint/test-batch build args。学生站为现有静态 frontend/student 产物，runtime-config.js 使用 production appEnv。包内保留 compose.yml、production.env、.env（image IDs）、nginx.conf、web/student。

后续发布顺序：构建并验证固定镜像 → 传输并核对摘要 → 新 releases 目录 → 备份 DB → 审阅 Migration → `docker compose --profile migration run --rm migrator` → 启动两服务 → 切换 current → `nginx -t`/reload → 重跑 HTTP/依赖 Smoke。破坏性 Migration 必须再确认；不要自动 downgrade 数据库。

生产扫描器安装 `clamav-daemon clamav-freshclam` 后可用 `tools/production/configure-scanner.py` 配置。`prepare-host.py` 首次生成秘密，已存在则保留。`prepare-smoke-helpers.cjs` 从既有测试 helper 仅提取 seed 函数并使用随机密码，不包含 reset 工具；运行媒体 probe 时私密挂载 runtime JSON/CA，并按脚本引用路径挂载生成的 helper。不要使用本地 test environment 替换生产配置。

## 回滚

首次上线前业务入口为 503。配置备份 `/opt/bnbu-sports-production/backups/nginx-before-production.conf`；数据库备份 `/opt/bnbu-sports-production/backups/before-first-migration-20260909.dump`（root 0600，pg_restore --list 已验证，初始空库）。

`tools/production/rollback-first-deploy.sh` 恢复旧 Nginx 配置并验证，reload 后停止这两个业务容器；保留数据库、COS、密钥和镜像。服务器已安装，可执行 `sudo /opt/bnbu-sports-production/rollback-first-deploy.sh`。脚本已 bash -n 检查；为保持上线服务未实际执行回滚。后续版本如数据库向后兼容，可回指保留 release 及固定镜像；需要数据库恢复时先确认和规划停机，勿直接覆盖生产库。ClamAV 原配置备份 `/etc/clamav/clamd.conf.before-bnbu-production`。

## 剩余风险与边界

- 运行的是已验证 V8.1 实现，其协议标识仍为 `3.0.0-v81-local-draft`。这次未改成旧 formal Contract release；旧客户端兼容与正式协议发布门槛仍独立待处理。
- OCR worker/provider 保持 DISABLED，按现有人工审核路径；无真实 AI/OCR 验收。既定暂缓业务功能见 `docs/implementation/HANDOFF-20260909-CURRENT.md`。
- SES 当前信誉等级 1、共享 IP、单日 500 封；大规模学生上线需容量规划。当前一次实际送达不代表所有收件域投递保证。
- 当前约 Backend 175 MiB/1.2 GiB、Portal 85 MiB/512 MiB；主机可用约 1.9 GiB，无 swap，尚未做生产并发压测。扫描器 MaxThreads 2/队列 4。
- 云数据库已有每日 7 天备份，本次另有迁移前 dump；尚未做完整恢复演练或异地恢复验证。
- CVM 到期 2026-10-05，数据库到期 2026-10-09；需保持续费。证书到期 2026-12-08，续期 timer 已启用。
- 合成 Smoke 数据及少量无个人信息 COS 对象保留；清理须按明确范围授权，未执行删除。

本记录与脱敏验收结果在本地提交存档；未 push。
