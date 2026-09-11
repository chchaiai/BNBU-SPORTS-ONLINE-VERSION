# 香港 Staging 基础设施验收与 Backend 交接

日期：2026-09-09（Asia/Shanghai）。设备权威基线：根目录 `Tencent_equipment.md`。

## 结论与适用范围

CVM、PostgreSQL、COS 已具备后续 Backend 部署所需的基础环境：真实 SSH、数据库严格 TLS 登录与权限测试、COS 临时凭据及真实对象操作、容器网络和两个验收域名的 DNS/HTTPS 均已验证。

本次完成的是基础设施准备。业务数据库仍无业务表；未部署 Backend/Web 业务版本，未执行业务迁移。新域名根路径有意返回 `503 BACKEND_DEPLOYMENT_PENDING`，`/__infra/health` 的 200 只证明 HTTPS 入口。桶名含 `prod`，仍按本次用户授权的 Staging 范围使用。

开始工作时分支为 `codex/bnbu-sports-web-new-20260907`，HEAD 为 `2e0ad9862044609afa548b863e10485427f04aef`，仅 `Tencent_equipment.md` 未跟踪。根目录没有磁盘上的 AGENTS.md，遵循对话提供的约束。当前 `contracts/contract-metadata.json` 是 `1.2.0-contract / RC`，SHA `667ae751f3e623e3d603db4d68e6e9314d4b3fd6da433a1def8c36b81597d74a`；本次没有改动 Contract 或 Backend 源码。

## 设备与云配置

| 资源 | 已确认配置 |
| --- | --- |
| CVM | `BNBU_SPORTS_HK` / `ins-kfitq8i6`，香港二区，Ubuntu 22.04，2 CPU / 4 GiB / 60 GiB |
| CVM 地址 | 公网 `43.129.193.7`；内网 `172.19.0.13` |
| 网络 | `vpc-683l8xss` / `subnet-ej6xg6gf`；数据库与 CVM 同 VPC、同子网 |
| PostgreSQL | `BNBUSPORTSSQLHK` / `postgres-entm7byh`，18.6，高可用版，1 CPU / 2 GiB / 100 GB |
| 数据库地址 | `172.19.0.16:5432`，数据库 `bnbusports`，外网地址未开启 |
| 数据库安全组 | 实际绑定 `sg-bo8xycnp`，唯一入站允许 `172.19.0.13/32 → TCP 5432` |
| 数据库可用性 | 主香港二区、备香港三区，半同步，控制台正常；销毁保护已开启 |
| 数据库备份 | 每日 01:01–05:01，数据/日志均保留 7 天；20:36:53–20:36:58 自动物理备份成功，2.92 MB；日志备份有占用 |
| COS | `bnbu-sports-prod-hk-1443273655` / `ap-hongkong`，私有读写、多 AZ |
| COS 加密 | 新开启默认 `SSE-COS`；实际新对象响应为 `AES256` |
| 实例角色 | 新建 `BNBUSportsHKCVMRole`，角色 ID `4611686018448989343`；仅绑定目标香港 CVM |
| 自定义策略 | 新建 `BNBUSportsHKCOSLeastPrivilege`，策略 ID `285832458`；对应 `tools/staging-infra/hk-cos-policy.json` |
| 身份方式 | CVM 元数据自动提供临时 SecretId/SecretKey/Token；测试没有打印或存档其值 |

角色授权由用户在本对话明确确认后创建并绑定。角色策略允许 HeadBucket，以及香港桶 `media/*`、`roster-sources/*` 的 Get/Head/Put；分片操作和 DeleteObject 仅限 `roster-sources/*`。没有配置静态 COS 密钥，没有使用旧广州角色/桶。

COS CORS 仅允许用户确认的两个 HTTPS 来源：

- `https://www.student.bnbusports.cn`
- `https://www.teacher.bnbusports.cn`

Methods：PUT、GET、HEAD；Allow-Headers：Content-Type、Content-Length；Expose-Headers：ETag、Content-Length；Max-Age：600；Vary: Origin 已开启。配置快照见 `tools/staging-infra/hk-cos-cors.json`。

## CVM 配置与目录

- 已从 Docker 官方 Ubuntu 仓库安装 Docker CE/CLI 29.8.0、containerd 2.3.5、Buildx 0.37.0、Compose 5.5.1。真实 Docker Hub 拉取与 hello-world 执行通过，Docker 开机启动已启用。
- 新增 `/etc/docker/daemon.json`，默认 json-file 日志每文件 10 MiB、最多 5 个。新建验证容器 inspect 得到准确配置，验证容器已删除；最终没有运行中或停止的容器。
- 创建 `/opt/bnbu-sports-staging/infra`，存放无密钥的验证脚本与 Backend CA 校验模块副本。
- 创建 `/etc/bnbu-sports-staging/secrets`，`root:10001`、0750；专用组名 `bnbu-secrets`，没有将交互用户加入此组。
- CA 链：`/etc/bnbu-sports-staging/secrets/tencentdb-ca-chain.pem`，`root:10001`、0640。包含腾讯数据库中间 CA 与根 CA；SHA256 为 `f88985069085405c33905d85bdb1bfc51f8498b6ac7d7324e649c60d1824a7d4`。
- 用户提供的 `/home/ubuntu/.pgpass` 为 0600。它仅用于现有两个数据库账号验证，不能挂载到 Backend 容器，也不在 Git 中。
- 操作临时目录：`/home/ubuntu/bnbu-infra-check-20260909`（0700），存放本次无密钥脚本与公开 CA 副本。Python COS 验证使用 Ubuntu 仓库的 `python3-boto3`。
- SSH 已验证香港专用密钥；有效配置为公钥认证启用、密码与键盘交互认证关闭。安全组仍允许公网 TCP 22；固定运维来源收紧需后续确定稳定来源。CVM 还绑定了数据库安全组，这是已有的冗余配置；未把它误当成数据库实际绑定的验证证据。
- 时间同步正常，NTP synchronized；最终根磁盘空闲约 51 GiB，可用内存约 2953 MiB。没有做容量压测。

当前 CVM 同时运行分发站，Nginx 原配置为 `/etc/nginx/sites-available/bnbu-sports-download.conf`，站点根目录 `/var/www/bnbu-sports-download/current`。后续部署应使用独立目录、独立 Nginx 配置，Backend 只映射 `127.0.0.1:3000`。最终 `https://bnbusports.cn/` 仍返回 200。

## DNS 与 HTTPS

用户明确指定并授权开放两个验收域名。本次在 DNSPod `bnbusports.cn` 下新增默认线路 A 记录 `www.student`、`www.teacher`，均为 `43.129.193.7`，TTL 600。CVM 查询公共解析器 `1.1.1.1` 已返回目标 IP。

新增 Nginx 配置 `/etc/nginx/sites-available/bnbu-staging-hk.conf`，并通过同名链接启用。版本化模板在 `tools/staging-infra/nginx-hk-staging.conf`；证书签发引导配置在 `nginx-hk-bootstrap.conf`。

使用已有 Certbot 账户和 HTTP-01 webroot `/var/lib/letsencrypt` 成功签发独立证书，覆盖两个完整域名：

- `/etc/letsencrypt/live/bnbu-staging-hk/fullchain.pem`
- `/etc/letsencrypt/live/bnbu-staging-hk/privkey.pem`（仅服务器保存，未读取内容）
- 有效期至 2026-12-08。
- `certbot.timer` 已启用且活动；已有 deploy hook `20-reload-nginx` 先校验再重载 Nginx，手动执行通过。
- Certbot 1.21.0 对本次独立证书的 `renew --dry-run --non-interactive` 演练成功，输出 `all simulated renewals succeeded`。该版本不支持 `--run-deploy-hooks`，因此续证模拟与 deploy hook 分别验证。

两域名的 HTTP 根路径返回 308 到原域名 HTTPS；HTTPS `/__infra/health` 返回 200，正文 `{ "scope":"https-ingress", "status":"READY", "backend":"DEPLOYMENT_PENDING" }`；HTTPS 根路径返回 503，明确业务尚未部署。

本机 DNS 存在 198.18.* 的代理解析。为独立核验公网入口，本机 curl 使用已确认的目标地址 `--resolve <域名>:443:43.129.193.7 --noproxy '*'`，保持正常 HTTPS 证书校验，两个域名均 200。浏览器自动化打开该新域名被客户端阻止（ERR_BLOCKED_BY_CLIENT），因此本次没有将浏览器页面验收记为通过。

## 实际验证结果

| 检查 | 结果与证据 |
| --- | --- |
| SSH 与主机身份 | 专用密钥登录 `ubuntu@43.129.193.7`，hostname `VM-0-13-ubuntu`，sudo 正常 |
| CVM → PG TCP | 实际连接 `172.19.0.16:5432` 成功 |
| PG TLS | 从关闭改为开启，保护地址 `172.19.0.16`；SAN 包含该 IP |
| 两账号严格登录 | app 与 sqladmin 均在真实 `bnbusports` 成功登录，TLS 1.3 / TLS_AES_256_GCM_SHA384 |
| app 权限 | 非 superuser、不可建库/建角色/复制/绕过 RLS；可 CONNECT、公有 schema USAGE，不能 public CREATE；没有角色成员继承 |
| admin 权限 | 数据库 Owner，可 DDL，属腾讯管理角色；仅供迁移和运维 |
| 真实 DML | 管理账号事务中新建独立 probe schema/table，切换到 app 完成 INSERT/UPDATE/SELECT/DELETE，结果为 true；ROLLBACK 后确认 probe schema 不存在 |
| DDL 负向 | app 实际 CREATE TABLE public 被 permission denied 拒绝 |
| TLS 负向 | 错误主机名的 verify-full 登录被证书主机名不匹配拒绝 |
| Backend CA 模块 | 当前仓库 `loadTencentDbCa` 对完整链校验通过 |
| 非 root 容器 | 与 Backend 同 Node 24.18.0-bookworm-slim，UID/GID 10001、只读、无 capabilities；严格 PG TLS、错误主机名拒绝、角色临时凭据、COS DNS/HTTPS 均通过 |
| COS 网络 | 主机/容器均解析为 `169.254.0.47`，同地域内网访问；匿名桶请求 403 |
| COS 对象 | 真实预签名 PUT/GET、字节 SHA256 比对、HeadObject、AES256、分片上传合并均通过 |
| COS 拒绝测试 | 匿名对象读取、列桶、写授权前缀外、media 删除均 403 |
| CORS | 两个新 HTTPS Origin 预检 200 且返回匹配 Origin；未知 Origin、旧 www.verityai.cn、HTTP student Origin 均 403 |
| 清理 | roster 测试对象删除后 HeadObject 404；数据库事务完整回滚；无测试容器残留 |
| HTTPS | 两个公网新域名严格证书校验请求、308 跳转、200 基础入口、503 待部署状态通过 |
| 既有站点回归 | bnbusports.cn HTTP 200，Nginx 配置校验通过 |

数据库真实 `inet_server_addr()` 返回托管后端地址 `9.254.207.81`，客户端仍连接已确认的 VIP `172.19.0.16`；不要将数据库内部实际服务地址写进部署参数。

COS 有一份保留的 73 字节合成证据对象：`media/infra-verification/fda9a1f1fde5446193bdf5015e63c7f7.txt`。保留原因是应用角色按预期无 media 删除权限。内容仅为基础设施测试文字，私有且加密，没有人员/业务数据。无需为清除此证据扩大 Backend 角色；需要清理时由桶管理者执行。重复运行验证脚本会生成新的同类证据对象。

原始数据库与 HTTPS 命令结果摘要在同目录 `evidence-20260909/`；其余测试结果以上述工具实际输出和配置快照记录。所有文件仅记录状态、资源 ID、非密钥配置，不含密码、临时凭据、预签名 URL、私钥内容。

## Backend 部署交接与剩余依赖

1. 使用 `tools/staging-infra/hk-infrastructure.env.example` 中香港资源和新 Origin 参数。它是基础设施覆盖参数，不能单独作为完整 Backend env。
2. 现有 `backend/config/staging-configuration-requirements.json`、`backend/config/staging.env.example` 及 `backend/docs/tencent-cloud-staging-configuration.md` 仍冻结旧广州资源、旧域名、旧账号。部署任务必须同步其配置校验、Compose 挂载源和运维 Runbook；不得直接照旧值部署。本次没有发布新的业务配置基线。
3. 发布/冻结 Backend 镜像，准备完整 FILE_JSON 运行时与迁移密钥、相应测试 fixture；运行时只给 app 数据库 URL，迁移任务才给 sqladmin URL。CA 在容器内挂载为 `/run/secrets/tencentdb-ca-chain.pem`。
4. 当前业务表 0、default privileges 0。Backend 部署后必须运行权威迁移及 `harden-runtime-database-access.mjs`，传入 `POSTGRES_APP_USER=bnbusports_app`，验证 app 业务表 DML 和 `_prisma_migrations` 只读。当前 probe DML 不替代这一步。
5. 部署两个 Web 应用及 Backend 路由后替换 Nginx 的 503 占位 location，完成真实登录、邮件 OTP、名册、图片/视频等业务闭环。无需为容器开放公网 3000。
6. SES/OCR/AI、外部媒体扫描、业务配额和生产审查不属于本次三类基础设施验收。新角色仅有 COS 权限，未授予 SES，后续邮件通道须独立配置和实际验证。
7. 自动备份存在且计划已核对；恢复演练、故障切换演练、容量/压测和告警接收人未验证。COS 版本控制/生命周期/日志/告警未启用；没有新增这些可计费服务或改变保留策略。
8. CVM 公网 SSH 来源仍较宽，已禁止密码登录；生产前确定稳定运维来源、补丁窗口和主机/数据库/桶告警。主机存在可更新软件包，未进行跨业务重启或批量升级。
9. CVM 到期时间 2026-10-05，数据库到期时间 2026-10-09；资源续费由所有者管理。

上述部署与业务依赖不等同于基础网络失败。若实际部署发现角色、CA、数据库权限或 HTTPS 入口回归失败，应停止部署并按本文件重新验证。

## 复核与回退

- PG 验证：使用 0600 pgpass 和 `sslmode=verify-full` 执行 `tools/staging-infra/inspect-hk-postgres.sql`；该脚本包含单事务 probe DDL/DML 并回滚。它不会迁移业务数据。
- COS 验证：在目标 CVM 运行 `python3 tools/staging-infra/verify-hk-cos.py`；仅使用实例角色，输出状态，副作用和证据对象保留见上。
- 容器网络：挂载验证脚本、当前 Backend 的 `postgres-tls.mjs` 和 CA 文件，以 UID/GID 10001 执行 `verify-container-network.mjs`；检查的是容器网络和 TLS，不是 Backend 应用上线。
- Nginx 使用独立新增文件；回退入口时只移除该文件的启用链接并 `nginx -t` 后 reload。DNS 可暂停本次新增的两条记录。不要覆盖分发站配置。
- Docker 配置是本次新增，只有日志参数；回退须先确认没有业务容器依赖，维护窗口内进行。
- CAM 回退为解绑本次角色，或停止授予本次策略；解绑会使 Backend COS 不可用。保留数据库 TLS；不要把关闭 TLS 当作普通回退手段。
- 本地存档仅包含设备基线、本交接与证据、`tools/staging-infra/`。未推送、合并、部署业务版本或修改其他任务文件。

## 参考

- Docker 安装依据：[官方 Ubuntu 安装文档](https://docs.docker.com/engine/install/ubuntu/)。
- COS 默认加密：[腾讯云服务端加密概述](https://cloud.tencent.com/document/product/436/18145)。
- PostgreSQL CA：[腾讯云 SSL 设置说明](https://intl.cloud.tencent.com/zh/document/product/409/67850)，证书来自用户下载的当前实例控制台附件。
