# 三端客户端错误上报 2026-09-08—09

## 最终行为

补齐网页旧协议调用的 POST /audit-logs/client-errors。三端沿用已有客户端错误处理代码，界面、布局及产品前端源码未修改。后端协议为本地 Draft，共 251 操作；新增 0058 迁移扩展独立限流用途和审计动作，现为 58 迁移。

登录身份、组织、角色、请求编号和接收时间均取服务器事实；平台必须匹配登录角色。限定客户端分类、方法、状态和已知错误码，未知码统一 UNKNOWN。正文、堆栈及额外字段拒绝，带查询参数的 route 拒绝。route、relatedRequestId、clientOccurredAt 接收校验后不写入审计元数据，避免任意标识进入长期记录。审计明确 reportedByClient=true，CLIENT_ERROR_REPORTED/SUCCEEDED 表示收到了上报，不证明客户端声称的业务失败事实。

每个组织内账号独立限制每分钟 30 次尝试；限流计数保存不可逆 scope 摘要。使用现有幂等事务，同键同输入回放同一 receipt，同键不同输入 409。学生和教师只得到 receipt，不获得审计查询权限。错误上报仍是客户端 best-effort；限流、未登录或安全门禁可使上报不可用，不改变原操作错误提示。

## 验证

- docker-client-diagnostics-20260908.txt、docker-client-diagnostics-retest-20260908.txt：缺少运行报告路径，退出 1，业务测试未执行。
- docker-client-diagnostics-configured-20260908.txt、docker-client-diagnostics-audit-diagnostic-20260908.txt：直接运行专项前遗漏 migrate deploy，旧数据库约束导致 500/P2010；原记录保留。
- docker-client-diagnostics-migrated-20260908.txt：应用新迁移后专项通过，退出 0；覆盖匿名拒绝、平台伪装、额外秘密字段、带查询参数地址、限流、同键回放与不同输入冲突、未知错误码归一、服务器身份/时间和数据库元数据白名单。
- client-diagnostics-migration-check-20260908.txt：历史 0057 约束替换未列入安全扫描，失败。已将其加入现有“必须存在对应新约束”的检查，不修改旧迁移。
- client-diagnostics-migration-recheck-20260908.txt：58 个迁移安全检查通过。
- client-diagnostics-migration-tests-20260908.txt：旧测试写死 56 个迁移，失败；更新计数后 client-diagnostics-migration-tests-retest-20260908.txt 为 9/9 通过。
- client-diagnostics-contract-check-20260909.txt：基础协议检查通过，251 操作、390 schemas。
- docker-browser-client-diagnostics-rebuild-20260908.txt：本地后端重建并应用迁移，健康检查 healthy。
- client-diagnostics-browser-20260909.txt：学生实际邮件 OTP 登录、教师与管理员实际密码登录后，在浏览器调用当前客户端错误处理函数注入合成网络异常，三端均自动上报 200 并取得真实审计回执。属于客户端接线验证，不是制造真实业务故障。
- 第十六次全量见 DOCKER-E2E-SIXTEENTH-20260909.md：94/94，25 suites，217 enabled 成功、251 error/access、34 默认拒绝，运行覆盖通过。

## 本地复现与依赖

专项在 compose.v81-full-integration.yml 的隔离 PostgreSQL 中运行，先 npm run build、prisma migrate deploy，再使用 tsx 和 runtime-conformance-hook 执行 client-capabilities.e2e.test.ts 的 accepts only authenticated bounded 用例；设置 BNBU_RUNTIME_CONFORMANCE_REPORT=/tmp/client-diagnostics.ndjson。浏览器脚本为 tools/local-integration/v81-client-diagnostics-browser-probe.mjs，依赖当前本地合成账号、3199 API、3300 Portal、4274 学生页面及 18025 Mailpit。

跨组织管理员审计读取的完整专项、诊断归档内容、持续大流量、离线恢复后补发和云环境不由本轮证明。正式发布协议门禁及三端其他验收缺口仍待处理。所有本地数据为合成数据，未进行云部署。