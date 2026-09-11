# 教师本人学期与归档展示

2026-09-09。新增候选只读 GET /teacher/semesters，操作 listV81TeacherSemesters。仅 TEACHER，按当前组织及责任教师课程关系过滤，分页 limit 1–100、after UUID。每条仅 id、academicYear、termCode、displayName、status、startDate、endDate、version 八字段；无学生、其他教师、管理员资料或治理计数。无需数据库迁移，现有学期及教学班关系是权威来源。正式 contracts 未修改；docs/backend-contracts 候选协议及生成物为 252 个操作。

Portal 使用该接口关联课程学期名称，所属学期 ARCHIVED 时按已归档展示，避免课程自身仍 ACTIVE 时误显示进行中。沿用现有卡片及弹窗；归档课程保留历史入口，隐藏关闭动作并禁用设置保存。学期分页游标循环或课程学期缺失时停止不完整展示。

本地浏览器：原账号 30 门课程、1 个学期的真实名称核对 PASS；增加明确标注的合成历史读取前提后，2 个本人学期、31 门课程、1 个归档课程核对 PASS，未关联学期不返回，八字段投影核对通过，归档课程关闭入口不可见、设置保存禁用。teacher-semesters-browser-20260909.txt、teacher-semesters-archived-browser-20260909.txt。Portal 完整 typecheck 及复测均通过。

合成前提失败保留：首次复制当前教学班打卡日期到 1986 年测试学期被数据库日期约束拒绝；第二次误用 excludedDates 普通数组被 Prisma 关系类型校验拒绝，两次事务均回滚。核对 schema 后使用关闭的打卡窗口、空日期且不写关系字段，第三次成功。见 teacher-semesters-fixture-20260909.txt、teacher-semesters-fixture-retest-20260909.txt、teacher-semesters-fixture-retest2-20260909.txt。测试没有伪装实际学期切换，也未变更其他已有学期状态。

第 25 次 Docker 回归 96/97：受保护操作数断言仍是旧 236，新增后实际 237，导致未认证逐操作测试提前退出；覆盖清单也仍为 251。修正固定数量并登记新增实现映射，保留 docker-backend-e2e-twentyfifth-20260909.txt。第 26 次复测 97/97、25 suites，218/218 启用成功、252/252 错误权限及 34 默认拒绝均通过，见 DOCKER-E2E-TWENTYSIXTH-20260909.md。没有降低权限或跳过新增操作检查。

剩余：管理员成功切换当前学期，原学期真实归档后教师课程/成绩/报告回读和纠错的完整网页联调；关闭前合法运动、补证及申请等分支的网页收尾。云上服务、正式合同发布与真实模型依赖沿用现有交接，不据本次本地结果宣称上线完成。
