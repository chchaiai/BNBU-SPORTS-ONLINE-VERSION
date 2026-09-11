# 教学结构端到端复测（2026-09-08）

独立 Docker/PostgreSQL 构建，runtime-conformance-hook 开启，teaching-structure.e2e.test.ts 最终 8/8、退出 0。日志 `docker-teaching-e2e-current-final-20260908.txt`。

本套件账号补齐已改密状态，管理员为 SUB 且仅 COURSE_VIEW。首次 6/8，`docker-teaching-e2e-current-first-20260908.txt` 保留管理员创建旧课程预期和 READ_ONLY 数据库拒绝失败。现行业务 docs/business/20-teacher-flow.md 要求教师创建并命名本人课程、管理员课程目录只读，系统模式仅 NORMAL/MAINTENANCE。

课程创建测试改为网页 course-rules-api.ts 实际调用的 POST /teacher/courses，仅输入 displayName；验证自动生成课程/教学班、单次创建事件、同键无重复、同键不同请求409、管理员只读、教师修改、旧版本409及修改审计/outbox。保留教师/管理员直接旧 /courses 创建拒绝。中间错误调用旧 /class-sections 而缺课程代码的 7/8 失败，见 `docker-teaching-e2e-current-retest-20260908.txt`；未因此放宽旧 DTO。

READ_ONLY 改为数据库明确拒绝，维护模式继续验证503且无新增教学班。其余角色范围、游标、日程排除日原子替换、关闭历史、归属/机构隔离、归档学期和失效课程、学生空投影及写入拒绝原有场景通过。

本轮仅测试/证据改动，没有修改产品接口或原UI。旧 /courses 的协议说明仍写管理员可创建，需后续与现行只读治理集中清理；本套件未宣告整个协议无缺陷。完整E2E、运动记录/名单/导出审计/旧成绩等及三端验收继续。
