# AoKSend 主发送 / 腾讯云 SES 备用（2026-09-15）

## 当前状态

- 用户指定 AoKSend 发件邮箱：`no-reply@verityai.cn`。
- AoKSend 后台已添加 `verityai.cn`；2026-09-15 11:08 添加四条邮件 DNS 后验证通过，域名状态为“正常”。11:11 创建发信账号 `no-reply@verityai.cn`。
- 已部署香港生产：`/opt/bnbu-sports-production/releases/aoksend-mail-20260915`，AoKSend 主发送、腾讯云 SES 备用。健康检查及四个模块文件校验通过；未运行数据库迁移。
- 模板副本：`backend/templates/email/bnbu-sports-email-verification.html`，源文件为用户桌面的 `bnbu-sports-email-verification-verity-new.html`。
- 将源模板的固定 5 分钟改为 `{{minutes}}`，保留 `{{code}}` 和原版式。当前业务验证码有效期为 10 分钟。
- 原图字节完整提取到 `backend/templates/email/assets/`，发布到 `https://verityai.cn/email-assets/20260915/`。HTML 改用 HTTPS 图片，缩小到 15,822 字节；AoKSend 保存后预览图片及中英文版式正常。
- 用户明确要求审核期间使用 AoKSend 自带模板。当前生产调用 `E_154193113758`（验证码邮件-5，已启用），变量为 code。正式模板 `E_154198061747` 仍审核中，用户审核通过后通知替换。
- 现有密钥已写入香港服务器独立文件 `/etc/bnbu-sports-production/secrets/runtime-aoksend-20260915.json`，root:10001、0640；旧 runtime.json 未改动。本机密钥中间文件已删除，传输服务已停止。
- 香港服务器 11:28 探测：AoKSend 40003 后腾讯云接管，用户确认收到且图片正常。11:39 内置模板探测：AoKSend 200，112ms，未触发备用；用户确认收到且验证码正常显示。
- 腾讯云当前继续使用已通过模板 56852；用户告知新版模板正在审核，尚未替换其生产 ID。
- 11:44 生产学生端发送登录验证码，AoKSend ACCEPTED / 79ms，deliveryId `01a0a32a-34f9-7069-90d8-087da24f10e9`。用户提供收件验证码后，真实浏览器登录成功，首页和个人中心显示对应学号；验证码没有写入证据文件。
- 测试账号已在“大学体育2”修读，课程页没有新入班入口。首次入班邮箱验证待用户提供未入班测试邮箱；不变更现有学生的课程与资料来制造测试前提。

## 接入配置

AoKSend 官方 API：<https://www.aoksend.com/api.html>。
POST `https://apiv2.aoksend.com/index/api/send_email`，表单参数 `app_key`、`template_id`、`to`、`alias`、`data`。
只有 HTTP 成功且 JSON `code` 为数字 200 才算提供商接受；接受不证明收件箱送达。

```dotenv
EMAIL_DELIVERY_PROVIDER=AOKSEND
AOKSEND_TEMPLATE_ID=E_154193113758
AOKSEND_TIMEOUT_MS=5000
```

`AOKSEND_APP_KEY` 写入现有 FILE_JSON 挂载的运行时密钥文件，禁止写入 Git 或容器明文环境。
保留完整 `TENCENT_SES_*` 配置作为备用；AoKSend 未选中时旧的密钥文件无需增加字段。
AoKSend 发件身份由其账号密钥绑定的发信邮箱决定，API 不通过 `from` 字段指定。

每次投递只尝试一次 AoKSend，失败后调用现有 SES 适配器（最多三次尝试）。
两条通道使用同一个验证码、收件人、deliveryId 和 expiresAt；切换前拒绝已过期验证码。
网络超时可能意味着 AoKSend 已接受请求，因此备用发送可能产生两封同码邮件。
日志事件 `AUTH_EMAIL_PROVIDER_FALLBACK` 记录投递标识、主备名称、失败类别、HTTP 状态、数字业务码及耗时；`AUTH_EMAIL_PROVIDER_RESULT` 区分 AOKSEND/TENCENT_SES 的 ACCEPTED/FAILED。不记录收件人、验证码、密钥或提供商原始响应。

## AoKSend 最初提供的 DNS 记录（实际添加值见操作结果）

域名当前 NS 为 `sapling.dnspod.net` / `penguin.dnspod.net`。

| 类型 | 主机记录 | 平台要求的值 |
| --- | --- | --- |
| TXT | @ | `v=spf1 include:spf.mailzos.com ~all` |
| TXT | adkim._domainkey | `v=DKIM1;t=s;p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+04YQEuWJfCHrQ/cp9+WDkltDRzgf0WZvnMEQWdVb+Ojg//YN8GfPniWQwdvOr52peaYeVYmqT8xtxq+ZTdnGNCf/vcE5WlesPHnDKC6U2I/9YqZusNz9LuZkBl17OXzFsL8UDUOpQHqgiirKEeTFEjkPK4motx6mykwFCrD+BwIDAQAB` |
| TXT | _dmarc | `v=DMARC1; p=none; rua=mailto: aoksend@yeah.net ; ruf=mailto: aoksend@yeah.net` |
| MX | @ | `amx.mailzos.com`，优先级 10 |
| A | @ | `8.217.95.98`，平台注明已有 A 记录时不需添加 |

上述是平台最初提出的要求；实际已添加记录见下文操作结果，不能照抄此表重复添加。
SPF 必须与已有发信授权合并；MX 会影响域名收信；DMARC 中第三方报告地址涉及报告发送，不应直接照抄；已有网站 A 记录应按实际网站用途保留。

## 待完成

1. 真实学生登录已通过；测试班级首次入班邮箱验证待未入班测试邮箱及收件配合。
2. 用户通知后替换已审核通过的两家正式 HTML 模板并再次收件验证。
3. 回退命令：`sudo python3 /home/ubuntu/bnbu-aoksend-release-20260915/deploy.py --rollback`。恢复旧发布目录及其旧密钥、邮件 env 挂载；旧 loader 不认识 AOKSEND_APP_KEY，不能让旧镜像使用新密钥文件。
4. 当前部署与登录证据按准确范围本地提交；首次入班证据后续补充。

## 本地验证

18 项单元测试通过（AoKSend、SES、FILE_JSON loader），覆盖 HTTP 429、超时、网络、业务拒绝、无效 JSON、双通道失败。TypeScript 类型检查、编译通过。
AoKSend 新增代码及测试、secret loader 的 ESLint 检查通过。
本地测试使用合成请求，没有向真实收件人发信。

## 2026-09-15 11:08 DNS 操作结果

用户确认后已在 DNSPod 添加：
- TXT @：`v=spf1 include:spf.mailzos.com ~all`
- TXT adkim._domainkey：AoKSend 后台完整 DKIM 公钥
- TXT _dmarc：`v=DMARC1; p=none`
- MX @：`amx.mailzos.com`，优先级 10

四条均为默认线路，TTL 600 秒，DNSPod 显示添加成功。原网站两条 A 记录仍为 43.129.193.7。
AoKSend 点击验证后域名显示“正常”。没有添加第三方 DMARC 报告地址。
1.1.1.1 当时已返回 SPF 和 DMARC；DKIM 仍返回旧的不存在缓存，MX 尚未返回新记录。平台验证通过不代表所有递归 DNS 缓存均已刷新。
后续进度见本文顶部当前状态。

## 香港服务器探测证据

2026-09-15 11:28:45 CST，运行 `tools/production/verify-aoksend-mail.mjs` 的独立短生命周期容器。
使用现有生产镜像、CVM 角色和新适配器单文件挂载；生产应用进程及配置未切换。
`deliveryId=mail-probe-7998a4c0-7204-4454-a7d6-a089468d5b30`。
AoKSend 拒绝用时 118ms，腾讯云接管并接受用时 232ms。收件对象为用户授权的 QQ 测试邮箱。
用户随后确认测试邮件已收到且图片显示。此结果证明香港服务器的实际适配器可调用 SES 接管并送达，不证明 AoKSend 主通道成功或学生业务完成。
测试验证码随机生成，没有写入业务挑战表，不能用于登录。

## 剩余风险

- 两家自定义模板审核及首次入班回归尚未完成；真实学生邮箱登录已通过。当前生产使用用户授权的 AoKSend 内置模板。
- 内置模板固定写 30 分钟，业务仍为 10 分钟；不因临时文案改变验证码规则。
- SES 旧模板固定 5 分钟文案；新版模板通过后需将过期变量映射为 minutes。
- 超时可能产生两封同码邮件；SES 仍沿用已有三次尝试，最坏整体时延约 35 秒。
- 邮件图片已使用独立目录与 nginx 路由，网站发布工具仍须保留这条路由和 shared 目录，不能用旧 nginx 配置整体覆盖。

## 正式模板图片持久化与验收复核

2026-09-15 执行 `tools/production/stabilize-mail-assets.py`，将三张原图复制到
`/var/www/verityai/shared/email-assets/20260915/`。nginx `/email-assets/` 路由通过 alias
直接读取 shared 目录，现有模板 HTTPS URL 不变，不再依赖网站 current 指向的发布版本。
三张图片均返回 HTTP 200，下载内容 SHA256 与原图完全一致，响应包含 immutable 缓存头。
网站首页和学生后端 readiness 均返回 HTTP 200；nginx 配置检查通过。
原配置备份：`/etc/nginx/sites-available/verityai.conf.before-mail-assets-20260915`。
第一次检查在 nginx 平滑 reload 后仍读到旧工作进程响应头，脚本已自动恢复原配置；
补充有限轮询等待新路由后再次执行通过。未改动邮件 HTML 或业务接口。

代码复核：`UsersModule` 引入 `ClientCapabilitiesModule`，`EmailVerificationService`
的 FIRST_BIND 分支通过同一个 `AuthCodeDeliveryPort` 发送 `EMAIL_FIRST_BIND`；
该端口当前由 AoKSend 主发送和 SES 备用实现。此项是代码链路证据，首次入班真实收件与绑定完成仍待测试账号。

| 验收项 | 当前证据与结论 |
| --- | --- |
| 正式 HTML 主通道发送、收件、显示 | AoKSend 已保存并预览；审核未通过，待用户通知后切换并重测 |
| 临时内置模板主通道 | 香港真实探测成功，用户确认收到且验证码显示正常 |
| 学生登录 | 生产主通道发送成功，用户提供验证码后真实浏览器登录成功 |
| 扫码/邀请码首次入班与邮箱绑定 | 共用主备端口；当前账号已入班，真实首次绑定尚未验证 |
| 主异常、备用接管 | 香港同适配器探测中 AoKSend 40003 后 SES 接管，用户确认收到 |
| 日志及错误 | 按 deliveryId、provider、outcome 区分，单元测试覆盖超时、限流、网络及双通道失败 |
| 部署与存档 | 已部署、健康检查通过；精确范围本地提交，无数据库迁移 |
