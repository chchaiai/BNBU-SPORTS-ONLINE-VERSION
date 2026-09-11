# 名单导入与核对端到端复测（2026-09-08）

独立 Docker/PostgreSQL 构建后运行 official-roster-alignment.e2e.test.ts，runtime-conformance-hook 开启，最终2/2、退出0。日志 docker-roster-e2e-current-final-20260908.txt。

教师A/B补已改密安全记录，分管理员使用COURSE_VIEW权限。成功导入样本去掉非法公式学号，保持2条合法行与2条重复行；公式学号转入失败/同键重放用例，验证失败版本不设当前、错误行保留INVALID、原对象与失败事件可追溯。成功版本、旧版本不可变、同键冲突、角色字段脱敏及跨教师拒绝继续验证。

核对结果补DUPLICATED分类，并验证重复组恰有一条代表结果，studentId/enrollmentId均为null。与现行业务保留重复身份、避免误匹配规则及此前完整集成测试结论一致。冻结快照和确认/解决/重开/禁止忽略等原有检查仍通过。

首次专项0/2（docker-roster-e2e-current-first-20260908.txt）：非法行成功预期及重复组漏项。第二轮1/2（docker-roster-e2e-current-retest-20260908.txt）：失败文件的旧“0行”断言不适用于可解析的非法数据行，改为明确INVALID行保留。最终2/2。产品规则和数据库约束未修改。

本套件使用内存对象存储替身，HTTP/PostgreSQL真实；不代表COS或真实XLSX网络上传专项，也不替代新注册核对网页验收。仅测试及证据变更，UI未改。运动记录、导出审计、旧成绩及全量协议/三端验收继续。
