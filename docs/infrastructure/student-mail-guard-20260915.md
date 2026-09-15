# 学生登录验证码防刷 · 2026-09-15

已部署至 https://www.student.bnbusports.cn/student/ 。

## 方案

复用 PostgreSQL 的 auth_rate_limit_facts 与现有 Serializable 幂等事务，在邮件调用前完成检查和额度预留。多实例、不同幂等键的并发请求也受约束，无新增服务或数据库迁移。

- 邮箱（大小写及首尾空格归一）：60 秒 1 次、30 分钟 5 次、24 小时 10 次，滚动窗口。
- IP：10 分钟 300 次，考虑校园共享出口；未获取 IP 时仍执行邮箱和全局限制。
- 所有组织的学生验证码共用每分钟 100 次发信预留上限。触顶返回 429，窗口释放后恢复；发信失败仍占用本次额度，防止故障重试风暴。
- 普通登录只向已有可登录学生账号的已验证邮箱发送。其他邮箱返回同形状的 challenge 回执，但不调用邮件提供商、不消耗全局发信额度。
- 扫码入班发送新邮箱验证码时必须提交有效且未过期的 joinInviteToken；后端校验邀请组织、状态和签名摘要。入班验证继续检查邀请和邮箱归属。
- 登录提示改为“如果该邮箱已关联学生账号，验证码将发送至该邮箱”；限流提示显示后端给出的剩余秒数。

用户要求优先最简单快速方案，本次采用后端硬限额，未接入 Turnstile 或新增设备识别。有效邀请码的持有者仍可对不同学校邮箱请求验证码，但受邮箱、IP 和全局上限约束。本次全局上限覆盖学生登录/入班共享接口，不代表其他邮件业务的全站日预算。统一响应未做严格等时处理。

## 验证

- 本地真实 PostgreSQL + SMTP Mailpit：6/6 通过。覆盖先验邮箱再入班、6 并发仅 1 个 challenge、幂等重放、半小时/每日/全局限额、未知邮箱和伪造邀请、错误/过期验证码、已入班及退班学生登录。
- 单元测试：17/17，包括未知邮箱发信门禁确实零次调用邮件提供商、正常发送调用一次、验证码状态机和窗口边界。
- TypeScript typecheck、Nest build、OpenAPI generate/check、修改的前端 JS 语法检查、本次文件 diff whitespace 检查通过。
- 生产：站点和 readiness 200；静态文件及后端替换模块 SHA256 一致；未知邮箱 202、同幂等键重放一致、新键重发 429、无效邀请 401。
- 生产探测仅使用随机 example.invalid 未关联邮箱，没有向真实学生发送测试邮件。本次未验证真实邮箱收件箱送达，未执行生产压测。

测试初版发现数据库 scopeType 只允许 ACCOUNT/SOURCE，已改为 SOURCE 下独立摘要命名空间保存全局额度。测试 SMTP 起初配置不匹配，改接本地 Mailpit 后通过。镜像构建初次不接受裸 image ID 作为 FROM，改用本地标签并校验其不可变 image ID 后成功，失败发生在切换前。

## 发布及回滚

- 当前目录：`/opt/bnbu-sports-production/releases/student-mail-guard-20260915`
- 上一目录：`/opt/bnbu-sports-production/releases/bug-20260915`
- 镜像：`sha256:a1f4fe61a66db2b988fa161a6369d0b15454b914f8671d7a209edf8aa30bc791`
- 替换：client-authentication.service、client-capabilities.dto 编译文件及 source maps；学生 api.js、i18n.js、screens/join.js。
- 数据库迁移：无。生产配置继承上一版本。源码 OpenAPI 请求定义同步新增可选邀请字段；本次运行镜像中的生成版 API 文档未替换，调用方以本说明和源码请求定义为准。
- 自动失败回滚已配置，未实际演练回滚。手动回滚：`sudo python3 /home/ubuntu/bnbu-student-mail-guard-20260915/deploy.py --rollback`。
- 部署证据：`evidence/student-mail-guard-20260915/deployment-result.json`；发布文件与基线摘要：该目录下 `bundle/validation.json`。

仓库中原有学时迁移及其他并行改动未纳入本次镜像。未执行 Git 提交或推送。
