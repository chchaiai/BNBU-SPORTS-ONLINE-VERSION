# 管理员课程目录 Docker E2E（2026-09-08）

运动记录 HTTP 套件在人工审核链路增加管理端统计验证：学生提交后 pendingTeacher=1，退回后 pendingSupplement=1，审核有效后 validRecords=1、creditedSeconds=3600，教师更正无效后 invalidRecords=1、validRecords=0、creditedSeconds=0，与学生进度同步。教师、学生读取管理目录均 403，目录限定当前学期，排除归档及异组织教学班，不含学生号、材料所有者、内部备注。另读取人工审核模式，确认 enabled=true、version=1。

首轮 11/11 通过。复核发现初始跨组织断言使用课程 ID 比较教学班 ID，未能证明隔离；改为查询实际异组织教学班 ID 后复测 11/11 通过。最终结果以 docker-course-directory-e2e-retest-20260908.txt 为准，首轮保留为 docker-course-directory-e2e-first-20260908.txt。

此轮为专用 Docker PostgreSQL、真实 Nest HTTP 和严格响应协议验证；运动与材料仍为测试夹具。未更改产品实现、UI 或 UX。此轮不证明移除成员聚合、所有分管理员权限组合及管理端浏览器完整业务验收。
