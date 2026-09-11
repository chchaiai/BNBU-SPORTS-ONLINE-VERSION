# 第十五次本地 Docker 后端全量回归

2026-09-08，通知共享事务修复后，容器 bnbu-v81-e2e-fifteenth-20260908 退出 0。npm run test:e2e：93/93，25 suites，137.08 秒（不含构建）。运行覆盖：216/216 已启用操作成功、250/250 错误/权限响应、34 默认拒绝，门禁通过。250 操作、57 迁移维持不变。

证据：docker-backend-e2e-full-fifteenth-20260908.txt、runtime-conformance-fifteenth-20260908.json、runtime-conformance-fifteenth-20260908.md。此轮新增 24 条通知并发幂等与不可重复事件断言，具体诊断和修复见 NOTIFICATION-CONCURRENCY-FIX-20260908.md。

本地隔离 PostgreSQL 合成数据验证；不证明全部网页动作、正式协议发布门禁、真实 OCR/VLM 或腾讯云环境已验收。先前失败保留，正式协议配置差异和其他三端缺口仍需处理。