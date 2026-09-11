# 指定版本结算报告导出

日期：2026-09-08 14:17。Draft 新增 exportV81SettlementReport，共 242 操作。

GET /class-sections/{classSectionId}/settlement-reports/{version}/export 复用责任教师报告读取权限，输出该版本保存的 XLSX。渲染器与实时预览共享，历史导出不调用实时预览查询。说明表保留报告标识、版本、保存时间、数据库规范 JSON 摘要与更正原因；名单内外分表，另列保存的结算检查。未知数量显示“未知”，没有检查快照的历史版本明确说明缺失。

## 验证

- docker-settlement-report-export-first-20260908.txt：首次 Docker HTTP/Excel 解析验证通过。
- docker-settlement-report-export-final-20260908.txt：补摘要说明及未知数量显示后复测通过。第 1 版导出 3600 秒计入量，第 2 版 0 秒，各自匹配保存的报告；版本、摘要、保存时间、检查项数量、学号文本单元格、无公式及越权/错误版本拒绝通过。原实时预览导出回归通过。
- settlement-report-export-parity-20260908.txt：242 操作/handler 对应通过；生成产物检查通过。
- settlement-report-export-contract-20260908.txt：旧检查器仍失败 391 条。contract-delta 日志验证与上一包诊断相同，仅登记总数从 128/241 变为 129/242，缺口均为 113；未增加新诊断。

两次 Docker 进程退出 0，无本轮产品测试失败。初版报告使用合成存储夹具，更正版经真实纠错 HTTP 生成，不能证明初次正式结算已开放。没有 UI/UX 布局或迁移变更。原始日志保留工具空白；源代码、协议和手写文档单独检查。

## 交接

继续初次正式结算协议/幂等端点、学生本人结果、管理员摘要、其他事实纠错及学期切换、原页面接线和完整三端验收。旧契约检查 391 条问题仍待处理。持续浏览器服务本轮未重建，云环境未操作；本轮测试均已结束。
