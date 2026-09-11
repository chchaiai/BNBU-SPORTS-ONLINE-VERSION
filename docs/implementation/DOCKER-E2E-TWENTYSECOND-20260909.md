# 第二十二次完整 Docker 后端回归

2026-09-09，隔离 PostgreSQL、Mailpit、MinIO 与真实 Nest HTTP；保留容器 bnbu-v81-e2e-twentysecond-20260909。

docker-backend-e2e-twentysecond-20260909.txt exit 0：97/97 tests、25 suites，0 fail/cancelled/skipped/todo，测试时长 129.49 秒（不含构建）。217/217 enabled successes、251/251 error/access、34/34 fail-closed，运行协议覆盖通过。runtime-conformance-twentysecond-20260909.json/.md 从本轮容器复制，overall gate passed=true。

本轮包括原始体测审计结果修复，以及 11 模块/16 处成功事务事件补齐；换算表新增精确事件结果/身份/条数断言。业务范围与限制见 BUSINESS-AUDIT-OUTCOME-20260909.md。未增加操作、迁移或测试条目；后端完整通过仍不等于六项缺失网页入口已完成。

持续浏览器后端已重建并验证 healthy，原始重建日志独立保存。所有运行均为本地合成数据及服务，未部署腾讯云。原始 Docker 工具行尾空格保留，源码/Markdown 单独检查。
