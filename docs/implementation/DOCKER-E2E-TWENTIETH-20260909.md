# 第二十次完整 Docker 后端回归

2026-09-09，隔离 Compose 的 PostgreSQL、Mailpit、新增 MinIO 与 NestJS。容器 bnbu-v81-e2e-twentieth-20260909 保留；docker-backend-e2e-twentieth-20260909.txt 退出 0。

97/97 tests、25 suites，0 fail/cancelled/skipped/todo；测试时长 125.39 秒，不含构建。217/217 enabled successes、251/251 error/access、34 fail-closed，运行时协议覆盖通过；runtime-conformance-twentieth-20260909.json/.md 已独立复制存档。

相对十九轮，既有补练用例扩展到撤销后会话结束、实际 MinIO 上传校验、提交和人工审核、原键重放及私有原图拒绝。先由总管理员启用人工模式，媒体字节处理显式调用生产 worker。没有新增测试条目、后端操作或迁移；本轮不涉及产品界面。具体边界与两次失败见 MAKEUP-MEDIA-20260909.md。

全量通过仍不替代补练有效学时长周期、教师授权窗口网页、剩余业务页和真实腾讯云服务验收。原始 Docker 日志保留工具行尾空格，源码及 Markdown 单独检查。
