# 反馈跨组织隔离专项

依据 docs/business/30-admin-flow.md 第 11 节的反馈管理职责及现有组织授权边界，补充真实 HTTP 验证。

docker-feedback-tenant-isolation-20260908.txt 退出 0：Docker 构建、52 项迁移检查、四组基础账号首次改密及反馈专项通过。两个合成组织各有总管理员和通过真实 Mailpit 邮件验证码登录的学生，学生分别提交隐私类型反馈。

- 双向共 8 个越权请求：其他组织学生读取详情/处理历史、其他组织管理员读取详情/修改状态，均返回 404；响应无反馈正文和提交人邮箱。
- 拒绝修改后，本组织管理员读回完整详情一致，通知数量不变。
- 按另一组织反馈编号、提交人邮箱、正文搜索均无结果，汇总只计入本组织 1 条反馈。
- 本组织管理员正常处理后版本递增，学生读回 1 条公开回复；通知只到对应学生，另一组织学生无该反馈通知。

复现命令：

```powershell
docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --build --rm -e V81_FEEDBACK_TENANT_ISOLATION=1 backend-startup
```

本次仅修改测试入口、专项及共享合成学生邮件登录辅助函数，未改产品源码和前端界面。帮助中心专项因复用登录辅助函数而重跑，结果另见 docker-help-student-isolation-shared-login-20260908.txt。此证据不包含浏览器操作、真实/演示页面复用决定、全部权限组合或全量回归。既有测试失败保持未修复，三端完整目标仍未达到。

存档检查：本次明确暂存9个文件。git diff --cached --check退出2，仅两个原始Docker日志的尾随空格，保留输出并记录未通过。帮助中心共享登录重跑退出0；测试服务已停止，卷保留。
