# 体测原始结果专项纠错

2026-09-08。新增 POST /enrollments/{enrollmentId}/physical-results/corrections，责任教师填写原结果版本、项目、秒数、测试日期和非空原因。项目匹配与免测限制继续执行；普通体测写入在结算/归档后仍拒绝。

专项在既有 Serializable 幂等事务中追加原始结果、通知、FACT_CORRECTED 审计及新版报告。报告服务核验对应事件和第一版结算前已有的体测事实，缺少原报告/事实则整体回滚。纠错元数据增加 enrollmentId/physicalVersion 分支，运动记录及内部成绩分支保持兼容。未新增迁移或更改 UI/UX。

## 验证

- docker-physical-correction-first-20260908.txt：退出0。课程真实正式结算、真实切换归档后，将原271秒更正为272秒，结果/报告版本追加、旧记录及报告保留、通知只新增一次；空原因/不匹配项目、管理员/其他教师拒绝、旧版本拒绝、同键回放及报告Schema通过。
- docker-physical-correction-rollback-20260908.txt：退出0。隔离库临时触发器使报告追加失败，预期500时结果历史、通知数和体测审计保持不变；finally 删除测试触发器和函数，同键重试成功。
- docker-physical-report-grade-regression-20260908.txt：退出0。共用报告逻辑的成绩纠错并发、缺原事实拒绝、故障回滚及运动记录纠错回归通过。
- physical-correction-parity-20260908.txt：249操作/249handler、生成一致。首轮契约392诊断中新增的一处响应枚举标注已修复；contract-retest及delta确认回到旧391且无新增，旧检查器整体未通过。

测试的历史规则和名单原始行仍是隔离夹具，但本次报告、学期归档及体测纠错均由实际HTTP产生。尚需体测纠错并发、无原体测/报告、免测拒绝、学生本人更正版读取专项与页面接线。其他事实纠错和完整三端验收继续；持续浏览器后端本包未重建。源码及手写文档检查空白，原始日志保留。
