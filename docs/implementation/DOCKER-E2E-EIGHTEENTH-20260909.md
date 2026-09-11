# 第十八次完整 Docker 后端回归 2026-09-09

使用 tools/local-integration/compose.v81-full-integration.yml，专用临时 PostgreSQL、SMTP 测试容器及合成账号。保留容器 bnbu-v81-e2e-eighteenth-20260909。docker-backend-e2e-eighteenth-20260909.txt 退出 0：25 suites、96/96 tests、127.22 秒测试时长（不含镜像构建）。运行时协议门禁通过：217/217 enabled successes、251/251 error/access、34 default-deny；报告 runtime-conformance-eighteenth-20260909.json/.md。251 操作、390 schemas、58 迁移维持不变。基本协议检查通过，不代表冻结正式发布配置已通过。

新增八项分管理员权限专项和公开学校维护范围用例纳入本次全量；管理员维护中读取本人身份允许，教师仍拒绝。第十七次 95/96 失败及报告完整保留，唯一问题是 /me 缺少 503 声明，已经补齐并由本次复测覆盖。

网页维护接线与三轮失败修复详见 SYSTEM-MODE-BROWSER-20260909.md；当前浏览器切换、同键重试、公告、刷新恢复通过。完整后端回归不能替代剩余所有网页动作、真实腾讯云提供商与学校业务验收，目标继续。
