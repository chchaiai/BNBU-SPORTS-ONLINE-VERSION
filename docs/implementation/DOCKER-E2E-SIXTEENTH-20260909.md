# 第十六次本地 Docker 后端全量回归 2026-09-09

容器 bnbu-v81-e2e-sixteenth-20260908 退出 0。94/94 测试、25 suites，131.40 秒（不含构建）。运行覆盖 217/217 已启用操作成功、251/251 错误/权限响应、34 默认拒绝，门禁通过。当前本地 Draft 251 操作、58 迁移。

证据：docker-backend-e2e-full-sixteenth-20260908.txt、runtime-conformance-sixteenth-20260909.json、runtime-conformance-sixteenth-20260909.md。新增客户端错误上报专项；原通知并发以及其他后端 E2E 一并回归。详见 CLIENT-DIAGNOSTICS-20260908.md。

本轮为本地 PostgreSQL 合成环境，不能替代所有网页操作、正式协议发布门禁、生产容量或腾讯云验收。未完成范围继续见 ACCEPTANCE.md。