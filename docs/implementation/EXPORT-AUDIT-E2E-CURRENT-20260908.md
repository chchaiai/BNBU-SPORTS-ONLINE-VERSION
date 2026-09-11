# 审计与旧导出权限端到端复测（2026-09-08）

独立 Docker/PostgreSQL 构建后运行 export-audit-governance.e2e.test.ts，runtime-conformance-hook 开启，最终4/4、退出0。日志 docker-export-audit-e2e-current-retest-20260908.txt。

仅本套件为教师A/B、管理员准备已改密安全状态。分管理员配置 USER_ACCOUNTS、COURSE_VIEW、AUDIT_QUERY 三项，分别用于资料只读、课程查看、审计查询，不授予SUPER。

首次2/4，日志 docker-export-audit-e2e-current-first-20260908.txt：管理员修改学生资料及旧通用导出被现行 V81AdminPermissionGuard 先以403拒绝，旧测试仍期待503。更新为具体权限错误，保留学生版本、audit/outbox无变化及旧export表不存在的检查；运行时权限没有改变。

通过场景包含学生/教师资料按角色和机构读取、管理员学生资料写入拒绝、旧通用导出四入口拒绝且不落库、审计仅授权管理员读取且递归脱敏并记录读取行为。

本套件没有验证新运行归档或教师业务报告成功生成/下载；那些是独立API与已有专项，不能把这里的旧导出拒绝4/4表述为导出业务完成。原UI未改，产品代码未改。运动记录、旧成绩、完整协议及三端总体验收继续。
