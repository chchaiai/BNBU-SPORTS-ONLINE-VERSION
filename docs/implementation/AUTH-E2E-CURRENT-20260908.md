# 认证端到端修复与复测（2026-09-08）

独立 Docker/PostgreSQL 认证套件已通过 11/11，退出 0。日志 `docker-auth-e2e-current-final-20260908.txt`。执行构建后使用 tsx 和原 runtime-conformance-hook 运行 auth.e2e.test.ts，设置容器内报告路径 `/tmp/auth-conformance.ndjson`。没有关闭响应校验，也没有执行全接口覆盖汇总，因此本结果仅证明本套件通过。

修复：

- 只在认证套件 beforeEach 为教师及管理员准备现行已改密安全记录；共享历史 fixture 不改。管理员使用 SUB 身份、登录账号和 AUDIT_QUERY 单项权限，符合健康检查场景所需。
- 新增未完成改密、缺少安全记录、管理员没有审计权限及缺少管理身份记录的 403 拒绝测试。验证稳定错误码及空公开 details；内部 reason 按当前脱敏设计不公开。
- `/me` 实际存在首次改密/权限拒绝，Draft OpenAPI 增加 Forbidden 响应。
- 维护公告接口 controller/policy 为 PUBLIC，OpenAPI 补 `security: []`，消除错误继承全局认证要求。未改变运行时权限。
- 逐条未登录请求遍历覆盖当前 234 个受保护接口（原协议错计公开公告时为 235），全部验证 401 和相应错误码。
- READ_ONLY 改为明确数据库拒绝，随后验证 NORMAL 登录和 MAINTENANCE 拒绝，保留请求校验、CORS、请求 ID 和体积限制检查。

失败过程保留：`docker-auth-e2e-current-first-20260908.txt` 是专项命令遗漏报告路径导致启动失败；`docker-auth-e2e-current-retest-20260908.txt` 为 8/11，发现分管理员登录账号前置条件、内部 reason 脱敏预期和公开公告协议声明问题；修复后 11/11。

生成检查通过，249 operations；协议/handler parity 249/249，通过。分别见 `auth-e2e-generated-check-20260908.txt`、`auth-e2e-contract-parity-20260908.txt`。产品业务代码及原前端布局未改动。

后续：其他 11 个端到端套件仍待按现行业务逐项修复前置条件及验证。此前完整 15/62 不能被本专项直接替换成新的全量通过率；下一轮完整结果需重新执行。Draft 全量诊断及三端总体验收仍未完成。
