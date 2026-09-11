# 准备阶段失败与修正

这些失败未计入正式阶梯容量数据，保留以便复核。

1. 首次 `docker ps` 使用 ubuntu 普通身份，因未加入 docker 组被拒绝；改为现有 sudo 运维权限读取，无权限配置变更。
2. 首次隔离 fixture helper 漏挂已有 mail.env，正式环境校验拒绝运行；增加现有配置挂载后创建成功，没有发送邮件。
3. 06:40 UTC 首次业务预检 progress-target 404，停止预检。新建测试课程没有已发布规则。
4. 规则发布最初 422：合成课程缺 dailyStartTime/dailyEndTime。按现行业务要求补齐独立测试课程后重试。
5. 重试规则模板出现 409：首次模板已创建成功。读取该合成组织既有模板，避免重复发布；最终规则发布成功。
6. 06:42 UTC 业务预检 20/20；运动开始、暂停、继续、取消 4/4。后续阶梯采用真实 student-progress 聚合接口。
7. 云数据库 CPU 监控 GetMonitorData 返回 AuthFailure.UnauthorizedOperation；浏览器工具无法列出可用浏览器。未扩大 IAM 权限。
8. pg_stat_statements 不存在（42P01）；保留数据库活动统计和有界 EXPLAIN 作为可获取证据。

客户端硬上限负向检查：201 VU 在读取凭据、联网和启动监控之前被 Outside approved bounds 拒绝。
