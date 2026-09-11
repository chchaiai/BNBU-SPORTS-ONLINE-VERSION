# 第 26 次 Docker 全量回归

2026-09-09，本地隔离 PostgreSQL、Mailpit、MinIO 和构建的后端容器，保留容器 bnbu-v81-e2e-twentysixth-20260909。

结果：97/97 测试、25 suites、0 fail/skip，122.99 秒。运行协议覆盖 218/218 启用成功、252/252 错误或权限、34 默认拒绝，通过。新增教师本人学期读取包含分页、无权限角色、无身份、非法参数和最小字段投影验证。浏览器另验证真实学期名称及归档状态。

证据：docker-backend-e2e-twentysixth-20260909.txt、runtime-conformance-twentysixth-20260909.json/.md；对照失败 docker-backend-e2e-twentyfifth-20260909.txt（旧受保护操作固定数量、旧覆盖清单）。静态实现登记清单已更新并通过检查。原始 Docker 输出保留空白，不对其做源码空白修正。

本地后端浏览器容器已重建并 healthy；候选协议 252 operations、58 migrations。没有以本次测试代替云上验收、正式合同发布或尚未完成的网页学期成功切换。
