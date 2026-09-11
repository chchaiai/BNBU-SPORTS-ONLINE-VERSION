# 正式结算 HTTP 入口

日期：2026-09-08 14:29。Draft 共 244 操作。

新增 GET /class-sections/{classSectionId}/settlement-preview，返回综合名单、确认指纹、当前报告版本、待办及 canConfirm；新增 POST /class-sections/{classSectionId}/settlement-reports，要求 expectedVersion=0、previewFingerprint 和幂等键。后端在 Serializable 事务及组织/课程锁内重新检查权限、模式、学期、时间、待办、名单指纹，追加第一版报告及审计。

预检查 CONFIRMED_COMPOSITE_ROSTER 现在读取实际报告：未确认 BLOCKED/1，已确认 CLEAR/0。旧的恒定 UNAVAILABLE 已移除。结算预览 canConfirm 仅表示当前可提交，提交仍重新判断；已有报告的课程不会允许重复初次结算。缺注册/体测的政策未定时，仍按 UNAVAILABLE 拒绝，未擅自当作通过。

## 验证

- docker-settlement-http-first-20260908.txt：实际 HTTP 预览、缺项拒绝、旧指纹拒绝、权限、并发仅一个 201/另一 409、同键回放、变更请求冲突、回读/导出及单份审计通过。
- docker-settlement-http-final-20260908.txt：加入预览/报告 JSON Schema 校验和已结算后体测 HTTP 写入 409 验证后通过；结算检查实际 CLEAR，ready=true。
- docker-settlement-command-correction-regression-20260908.txt：审核纠错、更正版、报告故障回滚、历史读取和导出回归通过。
- settlement-command-parity-20260908.txt：244 操作与 244 handler 对应；生成产物检查通过。
- settlement-command-contract-first-20260908.txt 仍有 391 条已有诊断；delta 日志验证与上一包相同，权限登记变为 131/244，缺口仍 113。旧检查器整体未通过。

三次 Docker 进程均退出 0。成功结算测试使用真实服务器时钟；隔离 v81_runtime_test 库准备 2026 年 8 月发布、9 月 7 日结束收尾的历史模板/课程规则夹具，名单确认和体测补齐走真实 HTTP，最终报告由正式 POST 生成。没有修改服务器时钟、注入已结算报告或访问云环境。课程目标未达成事实仍保留在报告中，不把待办批量无效化。此测试证明已准备历史课程的结算流程，不证明从开课经过整个学期的实时时序验收。

## 交接

初次正式结算接口现已开放于代码和本地隔离 Docker。继续学生本人结果、管理员摘要、其他事实纠错、学期切换和原页面接线。现有前端未新增结算入口，UI/UX 布局未变；持续浏览器后端本包未重建。旧契约检查 391 条问题及缺项业务政策仍是剩余事项。完整三端目标尚未完成。原始日志保留工具空白，源码/协议/手写文档单独检查。
