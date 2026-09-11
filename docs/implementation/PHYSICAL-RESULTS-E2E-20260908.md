# 体测原始结果 HTTP E2E（2026-09-08）

依据 docs/business/20-teacher-flow.md 第 11 节，女生 800 米、男生 1000 米由责任教师确认，学生只看项目、原始用时及日期，教师修正正式数据追加历史。新增 v81-physical-results.e2e.test.ts，使用专用 Docker PostgreSQL、真实 Nest HTTP 和严格 OpenAPI 响应校验。

两个性别场景均通过（2/2）：初始未记录及空历史；错误性别项目、负数/小数用时、不存在日期返回 422；学生/管理员写入 403，其他教师读写 404且未留下结果；教师录入及幂等重放；相同版本并发更新只有一次 201、另一次409；学生读取最新胜出用时，响应不含操作者、姓名、学号、成绩、评分或创建时间；历史分页完整保留版本1和2；教师不能读取学生专用入口，其他学生404；数据库只存在两个版本且通知恰好两条。

首轮跨教师访问触发严格协议校验失败，三个接口缺少404声明。已补 appendV81PhysicalResult、listV81PhysicalResults、getV81StudentPhysicalResult 的 NotFound 声明并生成产物；249操作/249handler静态对应检查通过。首轮和复测分别保留 docker-physical-results-e2e-first-20260908.txt、docker-physical-results-e2e-retest-20260908.txt。未修改界面布局。

测试账号及成员关系为合成数据库夹具，教师通过真实密码登录，学生使用测试JWT。此专项不是现场跑步、真实体测数据、OCR导入、免测批准或结算后纠错验收。完整门禁最新仍第六轮88项缺口；其他业务、最新浏览器和云服务依赖继续核对。
