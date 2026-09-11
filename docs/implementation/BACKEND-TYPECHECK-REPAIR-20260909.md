# 后端完整类型检查修复

2026-09-09。第 31 次验收记录的 78 条类型错误已处理，仍使用原 `tsconfig.json`、strict、noUncheckedIndexedAccess 和 exactOptionalPropertyTypes，检查范围未缩减。

修改包括：对查询结果、OCR 页、来源行、体测行和导出工作表添加实际存在性断言；给故意构造异常 OCR 数据的测试输入使用可表达非法字段的类型；学期分页不再传入显式 undefined；账户身份列表采用固定元组；联调 HTTP 返回对象先验证形状；补齐导入的 `.mjs` 探针入口声明，涵盖 Prisma、测试夹具、请求回调、身份、邮箱读取及可选存储参数。

新增 `required` 测试辅助函数在数据缺失时抛出断言失败，不用非空断言跳过运行时检查。本轮没有修改业务服务、数据库、协议或前端页面。

首次修复后仍有 7 条声明边界错误：请求返回类型是 unknown，以及其他组织教师标识缺少 role 字段。随后补充对象验证及 role 类型，第二次本地完整 typecheck 通过。两个输出分别保留在 `backend-typecheck-repair-first-20260909.txt`、`backend-typecheck-repair-second-20260909.txt`，旧 78 条错误日志也保留。

Docker 第 34 次在同一隔离环境先部署 59 迁移，完整 typecheck 及两个受影响单元测试文件的 6/6 测试通过；之后全量 E2E 为 96/97。补练探针读取通知数组时，被新加的仅允许对象断言拒绝。这是本轮测试助手修改引入的问题，保留原日志。

通用探针返回类型改为对象或数组，并使用 responseContainer 做运行时检查。修复过程一度把原有只读对象的 data 助手也扩大成联合类型，产生 18 条类型诊断；随后仅保留通用探针的联合返回类型，恢复原 data 助手，本地完整检查通过。第三次和最终类型日志均保留在 `backend-typecheck-repair-third-20260909.txt`、`backend-typecheck-repair-final-20260909.txt`。完整 Docker 原始输出为 `docker-backend-e2e-thirtyfourth-20260909.txt`、`docker-backend-e2e-thirtyfifth-20260909.txt`；第 35 次结果在结束后补充。

第 35 次最终通过：Docker 完整 typecheck、97/97 E2E、25 suites、0 fail/skip，122970.597674 ms；运行协议 219/219 启用成功、253/253 错误权限、34 默认拒绝。证据为 `runtime-conformance-thirtyfifth-20260909.json/.md`。业务源码未改，本地预览继续使用上一轮已验证的服务。

后续继续结算后认可调整/撤销网页操作、刷新恢复与报告下载，以及申请补材料、名单/OCR等全范围业务。类型检查通过不代表三端全范围验收完成，也不代表云上服务已验证。
