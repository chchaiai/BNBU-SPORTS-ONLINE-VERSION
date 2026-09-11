# 结算后原始体测更正浏览器验证

2026-09-09，现有 Docker 本地后端、PostgreSQL v81_browser_test 和 Portal 开发服务，使用此前真实接口结算的合成课程。没有修改数据库历史事实或报告。

浏览器复测通过：空白更正原因被拒绝并显示明确提示；提交 1000m、271 秒、2026-09-07 和合成更正原因；服务端 201 响应被测试脚本丢弃后刷新页面，使用原幂等键恢复相同体测 v2；只产生结算报告 v2；报告更正关联的体测版本和原因正确；旧报告完整对象逐字段比较不变；再次刷新可见体测 v2。

首次失败：表单已拒绝空白原因，但组件把普通 Error 统一映射成“网络连接失败”。已用局部 PhysicalValidationError 区分明确的表单校验文案，网络及后端错误继续使用统一错误映射。保留 physical-correction-browser-20260909.txt，修复后 physical-correction-browser-retest-20260909.txt 为 PASS。完整 Portal typecheck 通过，日志 physical-correction-portal-typecheck-20260909.txt。没有后端实现修改，第 24 次后端全量结果仍适用。

测试脚本：tools/local-integration/v81-physical-correction-browser-probe.mjs。合成课程当前实时体测由 270 秒变为 271 秒，保存的结算 v1 仍为 270 秒。因此既有结算浏览器测试的实时 XLSX 断言改为对照当前后端体测，v1 快照断言继续固定原值，避免把合法更正误判成故障。

更正后的结算导出回归也通过：实时 XLSX 与当前 271 秒一致，保存的 v1 XLSX 仍为 270 秒，刷新报告历史正常。日志 settlement-after-physical-correction-browser-20260909.txt；其中未发布规则的其他合成课程 progress-target 404 为已有预期缺配置路径。

边界：本次课程已结算但尚未归档；归档后教师入口和最终 INT 成绩更正仍待完成，不能据此宣称全三端已验收。
