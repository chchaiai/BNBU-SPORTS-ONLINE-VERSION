# 学生本人结算结果

2026-09-08 14:42。新增 GET /student/enrollments/{enrollmentId}/settlement-result，Draft 245 操作对应 245 handler。

接口在 RepeatableRead 事务中验证组织和本人入班关系，读取最新已保存报告的本人行。尚无结果返回 available=false 与空结果；存在更正版时返回最新版本。显式逐层选择注册状态、待办数量、体测原始结果和运动计入/剩余目标；内部成绩、姓名、学号、排名及审核信息不进入学生响应。其他学生返回 404，教师和管理员返回 403。未增加页面或改变 UI/UX。

## 验证证据

- docker-student-settlement-first-20260908.txt：首次失败保留。跨学生测试夹具学号包含小写字符，违反现有数据库约束；修正为大写合成后缀。
- docker-student-settlement-retest-20260908.txt：Docker 实际 HTTP/数据库复测退出 0，覆盖未结算、更正版读取、原始内部成绩不泄露、响应 Schema、未登录、角色及本人范围隔离，并通过原有人工审核、纠错、计入和导出回归。
- docker-student-settlement-unit-20260908.txt：2 项测试通过，验证嵌套白名单、输入不变和未知事实保持 null。
- student-settlement-parity-20260908.txt：生成产物及操作对应检查通过。
- student-settlement-contract-20260908.txt / student-settlement-contract-delta-20260908.txt：旧检查器仍为 391 条诊断，与上一包归一化比较差异 0；权限登记增加一项，原有缺口仍为 113。

本包更正测试的初始报告是明确标注的数据库夹具，后续纠错和学生读取走真实 HTTP；它不替代正式结算全链验收。初次正式结算 HTTP 的独立证据见 SETTLEMENT-HTTP-20260908.md。首轮问题属于新增测试数据，未因此放宽数据库约束。

## 剩余工作

学生页面尚未接入此新接口，持续浏览器后端本包未重建。管理员结算摘要、其他事实纠错、学期切换、现有页面接线和完整三端回归继续进行；缺注册或体测的结算政策仍待答复。腾讯云真实服务依赖仍保留，三端整体目标未完成。源码及手写文档进行空白检查；原始 Docker 日志保留工具输出空白。
