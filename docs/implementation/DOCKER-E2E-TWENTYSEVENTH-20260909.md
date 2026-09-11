# 第 27 次 Docker 全量回归

2026-09-09。本地隔离 PostgreSQL、Mailpit、MinIO 和后端构建容器 `bnbu-v81-e2e-twentyseventh-20260909`，容器保留。

97/97 测试、25 suites，0 fail/skip，135792.719269ms。运行协议覆盖 218/218 启用成功、252/252 错误/权限响应、34 fail-closed，通过。

本轮修复候选结构化申请列表的 REVOKED 枚举，既有认证批准/撤销 E2E 新增撤销后学生和责任教师结构化列表回读断言；后台撤销仍校验身份、版本、维护状态、结算/归档边界，追加历史并重算进度。

原始日志 `docker-backend-e2e-twentyseventh-20260909.txt`；报告 `runtime-conformance-twentyseventh-20260909.json/.md`。浏览器验证另见 CERTIFICATION-REVOKE-WEB-20260909.md。原始日志空白保留。

该结果只证明本地当前候选及所覆盖的请求，正式发布、云端配置和剩余业务验收仍未完成。
