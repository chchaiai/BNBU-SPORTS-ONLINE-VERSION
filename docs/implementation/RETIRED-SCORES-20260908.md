# 旧成绩流程关闭（2026-09-08）

依据 docs/business/20-teacher-flow.md 第12.1节（责任教师直接维护 INT 最终成绩、版本保留、不需管理员审批）及30-admin-flow.md第12节（全局规则仅耐力换算表、无单个成绩审批）。旧 ScoresService 仍包含规则审批、自动重算及调整流程，管理员守卫拒绝并不能保证教师无法继续使用旧路径。

在旧 ScoresController 增加统一403拒绝守卫，关闭旧规则、分数和调整的14个入口；既有 openStudentScoreCorrection 保留原拒绝响应路径。数据库历史和内部服务代码保留，新的 final-grades、physical-results、进度与结算服务不在此控制器。Web源代码检索旧路径只命中生成协议类型。

专用 Docker PostgreSQL、真实 HTTP、严格协议校验，score.e2e.test.ts 3/3通过：新内部成绩草稿/发布历史、重放、并发版本、无备注、跨主体权限、学生不见分数；新增教师旧规则读取及创建拒绝、无规则写入。日志 docker-retired-scores-e2e-first-20260908.txt。

后续工作：逐个旧操作补充有身份拒绝证据，同步 Draft 协议停用说明和运行覆盖清单；本轮不能把3个测试作为14个旧入口完整验收。尚未重跑全量。未修改UI/UX、未删除历史。
