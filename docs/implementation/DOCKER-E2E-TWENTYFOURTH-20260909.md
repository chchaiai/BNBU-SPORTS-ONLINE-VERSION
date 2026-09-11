# 第 24 次本地 Docker 全量回归

2026-09-09。独立 compose.v81-full-integration.yml，PostgreSQL 18.4 临时数据库、Mailpit、MinIO；未使用腾讯云服务。保留容器 bnbu-v81-e2e-twentyfourth-20260909。

- 原始日志 docker-backend-e2e-twentyfourth-20260909.txt，退出 0。
- 97/97 测试，25 suites，约 121.14 秒，零失败/取消/跳过。
- runtime-conformance-twentyfourth-20260909.json/.md 从该容器复制：251 操作，217/217 enabled success，251/251 error/access，34 default-deny，1860 合规事件，0 不合规，gatePassed=true。
- 覆盖新增实际体测日期拒绝的后端回归；六项网页浏览器证据分别列于 SIX-ENTRY-HANDOFF-20260909.md，不以全量后端替代页面操作证明。

原日志含测试主动注入的审计/事务错误以及 Docker 构建输出，保留原始格式。源码空白检查排除原始 .txt 日志，不重写日志以制造干净输出。正式发布配置/历史兼容性差异、腾讯配置与实际云端验收仍未完成。
