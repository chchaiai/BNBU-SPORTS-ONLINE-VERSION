# 权限编号与登记同步（2026-09-08）

基线 6d8704ba。依据 05-permission-matrix 的全局唯一大写连字符要求，将 113 个早期 camelCase policyId 规范化；映射完整保存在 permission-policy-id-mapping-20260908.json。语义比较将新旧编号归一后，整个 OpenAPI 对象严格相同：角色、认证、组织/资源范围、resolver、defaultDeny、operationId、请求和响应均未变。编号仅影响后续请求权限日志标识，旧日志和审计不回写；已检查幂等实现不引用该权限编号。

新增 generate-permission-registry.mjs，默认只读核对、--write 只替换指定标记区块，缺失/重复标记、重复 operationId、非法表格字段拒绝。登记从 136 补齐为 249，同步旧媒体解析器和三个旧读取入口角色行，以当前 OpenAPI 为源。它是机器登记，不替代服务层权限验证或业务确认。脚本已纳入默认契约检查，05 文档记录运行命令。

extend-v81-contract 的新增操作编号生成同步改为大写连字符，防止后续重新引入相同命名错误。本轮没有执行该历史扩展脚本，以免覆盖后续已修正的 schema；正式生成仍由 generate-openapi 完成。

生成及 249 操作/handler、错误目录对应检查通过，登记只读核对通过。主契约检查从 390 降至 159，日志 contract-permission-retest-20260908.txt，仍退出 1。剩余命名枚举 3、内联枚举 155、旧每日唯一记录断言 1；inline-enum-inventory-20260908.json 保存当前缺项路径和值，供逐项确定业务枚举或传输限制，不等于自动认可现有值。

Docker 全量结果另见 DOCKER-E2E-TWELFTH-20260908.md。本轮未修改 UI/UX、运行时角色或资源校验。当前浏览器和业务矩阵、完整契约及最终交接仍待完成。
