# 帮助与反馈进入统一 E2E（2026-09-08）

新增 backend/test/e2e/v81-help-feedback.e2e.test.ts，由 npm run test:e2e 自动发现。测试启动实际 Nest HTTP 服务，使用专用 Docker PostgreSQL 18.4 数据库与已部署的 57 个迁移，通过正常密码登录取得管理员和教师令牌；学生会话使用合成测试账号。严格运行时 OpenAPI 校验保持开启。

最终专项：3/3 通过，退出码 0，证据 docker-help-feedback-e2e-final-20260908.txt。

覆盖：
- 管理员创建帮助草稿并按同一幂等键重放，发布、归档、重新发布；学生按中英文读取正确内容，草稿和归档详情 404；管理员查询最新版本，旧版本写入 409。
- 六篇帮助跨两页读取无遗漏，两个编辑争用版本仅一个成功；撤销 HELP_CENTER 权限后同一登录令牌立即被拒绝，数据库历史没有新增。
- 学生提交反馈，管理员五次处理与重放；学生看到五条公开回复、隐藏管理员身份；他人反馈历史不可读；每次处理只有一条通知；并发处理 201/409，最终六条历史、六条通知。
- 学生、教师不能读写管理员帮助或处理反馈；管理员不能读取学生帮助详情。不存在的帮助/反馈对象保持 404。

首轮 docker-help-feedback-e2e-first-20260908.txt 两项失败均来自漏写 404 协议；后端权限判断正确。补充六个操作的 NotFound：getV81StudentHelpArticle、getV81StudentFeedbackHistory、getV81HelpArticle、saveV81HelpArticle、getV81FeedbackDetail、handleV81Feedback。最终专项实际触发了全部六种 404。中间复测 2/2 记录在 docker-help-feedback-e2e-retest-20260908.txt。

协议生成检查与 249 操作/249 handler 静态对应检查通过。此次只改变测试、Draft 响应声明与生成产物，无界面布局变更。本套件不是浏览器验收，也未新验证腾讯云服务。完整 E2E 最近结果仍是上一轮 65/65 用例通过且覆盖门禁 136 项失败；没有凭专项结果宣称门禁已通过。下一次完整运行将纳入新增三项及其十个 V81 操作成功响应。
