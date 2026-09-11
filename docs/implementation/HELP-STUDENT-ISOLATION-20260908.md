# 帮助中心学生跨组织隔离专项

2026-09-08：Docker 退出 0，原始输出见 docker-help-student-isolation-20260908.txt。

新增独立专项 V81_HELP_STUDENT_ISOLATION=1，不经过运动课程发布。两个合成组织各建立学生，通过真实后端验证码接口、Mailpit 邮件及验证码核验获取会话。组织 A 管理员通过 HTTP 创建帮助草稿，依次发布、下线、重新发布。

- 英文与简体中文列表：发布时 A 学生可见，下线时不可见；B 学生始终为空。
- 两种语言详情：发布时 A 学生返回 200，下线时返回 404；B 学生始终返回 404，错误响应不包含文章标题或正文。
- 管理员读回最终版本 4。Docker 构建通过，52 项迁移无待应用项，四组基础账号首次改密通过。

运行命令：

```powershell
docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --build --rm -e V81_HELP_STUDENT_ISOLATION=1 backend-startup
```

本次补足 ACCEPTANCE.md 帮助中心一项“跨组织学生隔离”的专项证据。未改产品源码或原前端；管理员页面管理接线、三端浏览器验收、内容安全和全量回归仍未完成。既有测试失败未修复。测试后 PostgreSQL、MinIO、Mailpit 已停止，测试卷保留。

存档检查：暂存范围仅本专项7个文件；git diff --cached --check退出1，全部为空白检查指出的原始Docker日志尾随空格，保留原始输出。该项未通过，不计作产品测试通过。
