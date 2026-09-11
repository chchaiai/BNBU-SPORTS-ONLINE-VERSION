# 管理员课程结算摘要

2026-09-08。新增 GET /admin/class-sections/{classSectionId}/settlement-summary，要求 COURSE_VIEW，组织范围内读取。RepeatableRead 事务复用课程结算检查，并读取最新报告版本和保存时间；只返回课程级结算状态及阻塞，不返回学生行、内部成绩、审核人或报告内容。

docker-admin-settlement-summary-first-20260908.txt 退出 0：正式结算前 settled=false、版本和时间 null；真实结算后 settled=true/version=1/ready=true，阻塞与教师同源，响应 Schema 校验通过。教师拒绝、跨组织拒绝、分管理员无权限/仅学期权限拒绝、COURSE_VIEW 允许和字段隐私检查通过。单课程结算→切换→归档报告保留回归同时通过。

admin-settlement-parity-20260908.txt 为 247 操作对应 247 handler、生成产物一致；admin-settlement-contract-20260908.txt 仍有 391 条旧诊断，delta 确认相对上一基线归一化差异 0。检查器整体仍未通过。

本包未接管理员课程目录页面，持续浏览器后端未重建；最新更正版摘要、归档后的汇总和更广角色边界仍需扩展验证。UI/UX 未改变，未增加迁移。完整三端目标未完成。源码和手写文档检查空白，原始 Docker 日志保留。
