# 教师真实进度接线（2026-09-08 22:20）

新增 GET /api/v1/teacher-progress：仅 TEACHER，组织内责任教师本人课程；分页游标绑定角色、账号、组织及资源。与学生入口共用 RepeatableRead 下有效打卡和 active 认证的计算。保持学生入口拒绝教师。仅返回已有发布规则的报名进度。没有数据库迁移。

教师数据加载器读取该分页接口，成绩册和学生管理消费同一后端进度；真实模式停用旧前端再次减去认证额度的计算，避免重复抵扣。无 CSS 或页面布局变更。

验证：
- docker-teacher-progress-20260908.txt：11/11，教师和学生在待审核、有效、改判无效阶段完整进度对象一致。
- docker-teacher-progress-scope-20260908.txt：10/11，新增测试账号未建立已改密安全状态，被首次改密守卫拒绝；保留原始失败。
- docker-teacher-progress-scope-retest-20260908.txt：11/11，补齐测试账号安全状态；同校其他教师、跨组织教师看不到目标报名，学生和管理员入口 403。
- teacher-progress-contract-check-20260908.txt：基本协议检查通过，250 operations / 250 permission rows。不是完整发布兼容性门禁。
- teacher-progress-portal-typecheck-20260908.txt：Portal tsc 通过。
- teacher-progress-runtime-coverage-20260908.txt：生成前 roadmap 过期；已使用生成器更新至 250，216 enabled / 34 default-deny。这是静态登记，不是新增全量运行报告。
- teacher-progress-browser-backend-20260908.txt：本地浏览器 Docker 后端已重建，随后 ps 确认 healthy。
- teacher-progress-grade-browser-20260908.txt：首次启动等待课程响应超时；健康确认后 grade-browser-retest 通过（草稿版本 3、发布版本 4、刷新回读 123）。
- teacher-progress-navigation-browser-20260908.txt：教师五页面和课程已发布模板验证通过，确认 teacher-progress 200，无旧 student-scores 请求；未发布规则课程 progress-target 404 保留。

继续项：未发布规则课程的旧默认目标 10/10h 和零进度占位仍需明确展示未配置；认证撤销的教师/学生逐字段对照及新入口分页边界待补；成绩浏览器冲突/响应丢失/部分发布和英文文案待补。完整三端业务矩阵、250 接口全量 Docker 复验、正式契约历史兼容性及云依赖交接尚未完成。现有证据仅本地 synthetic 数据，不是腾讯云生产验收。
