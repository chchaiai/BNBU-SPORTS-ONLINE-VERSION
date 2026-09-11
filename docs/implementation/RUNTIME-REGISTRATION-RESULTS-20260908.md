# 成绩、体测与归档接口证据登记（2026-09-08）

在efa83aba的127条登记基础上补12条：最终成绩3、原始体测4、运行归档5。逐条核对OperationPolicy、服务方法、数据库表和对应迁移文件；更正指向v81-settlement.e2e.test.ts和各自专项报告，普通成绩/体测分别指向score及v81-physical-results，归档指向v81-runtime-archives。

contractTest引用的是实际执行严格响应hook的HTTP测试文件，同时补contractValidation=scripts/runtime-conformance-hook.mjs，避免把不包含新控制器的旧静态contract测试当作新接口证明。源规则/身份夹具、内存对象存储和云端未验证范围仍以各专项报告为准。

当前139/249条登记（105普通+34停用），110条未登记。Docker静态登记一致性检查及报告准确性单元5/5通过，日志docker-runtime-registration-results-20260908.txt。此轮没有重跑业务全量，最新完整业务证据仍第十轮92/92；不把静态登记视为新增业务验收。

未修改产品代码或UI。其余110条、三端浏览器与最终交接继续。
