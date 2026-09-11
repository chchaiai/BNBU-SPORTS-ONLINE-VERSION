# 结算报告版本读取

日期：2026-09-08 14:11。Draft 新增 2 个操作，总数 241。

责任教师可调用 GET /class-sections/{classSectionId}/settlement-reports 分页列出版本元数据，limit 默认 20、最多 100，beforeVersion 向旧版本翻页。GET /class-sections/{classSectionId}/settlement-reports/{version} 读取保存的完整报告。读取使用 RepeatableRead，验证组织与责任教师；不重新生成历史快照。列表不携带学生明细，详情包含该版本保存的教师报告。

新增两个权限登记和 3 个响应 Schema，生成产物由 Draft OpenAPI 重新生成。原正式发布历史及前端布局未改。

## 验证结果

- docker-settlement-report-read-first-20260908.txt、docker-settlement-report-read-final-20260908.txt：本地 Docker HTTP/SQL、JSON Schema、原版/更正版一致性、分页、参数错误、缺少版本、未登录及管理员/学生/其他教师/其他组织拒绝通过，进程退出 0。
- settlement-report-read-parity-final-20260908.txt：241 操作/241 handler 对应通过；生成产物检查通过。
- settlement-report-read-contract-20260908.txt：旧检查器首次返回 405 条问题。修正本轮新增策略 ID 格式、权限登记和枚举传输约束后，retest 日志为 391 条。
- settlement-report-read-contract-baseline-20260908.txt：从当前提交 4b856698 的 OpenAPI、权限矩阵、错误枚举和检查脚本构建隔离副本，同样 391 条。delta 原始比较仅登记数/操作数不同；delta-final 验证除总数变化外所有诊断相同。当前登记 128/241、原版 126/239，均缺 113 项；不能将旧检查器整体标记通过。

本机 tools/backend-contracts 缺少 yaml 安装，直接命令首次 ERR_MODULE_NOT_FOUND；验证时通过 .local/backend-yaml-hook.mjs 使用已安装的后端 yaml。隔离基线保存在 .local/report-read-baseline，未覆盖当前源码。准备脚本曾遇到 YAML 对象类型错误，修正后完成生成；最终差异仅新增协议内容，无全文件格式重排。原始诊断与日志保留，代码/手写文档空白检查单独通过。

## 交接与剩余依赖

完整三端目标仍进行中。初次正式结算端点、报告导出、学生本人结果、管理员摘要、学期切换、其他事实纠错及原页面接线还需完成。读取测试的初版为合成存储夹具，纠错通过真实 HTTP；不能作为初次结算验收。旧 Draft 契约检查的 391 条问题尚未处理。

没有新增迁移或云环境修改，持续浏览器服务未在本包重建；当前运行证据来自本地隔离 Docker 测试。所有本轮测试进程结束。
