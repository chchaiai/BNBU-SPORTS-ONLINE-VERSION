# 教师名单原件与核对网页闭环

2026-09-08 12:39，本地 Edge 网页连接持续 Docker 后端、PostgreSQL 与对象存储。所有课程、名单和原因均为 Synthetic 测试数据。

## 已验证

- CSV 和 XLSX 原件上传，独立 SHA-256 与后端确认结果一致；两行学号前导零保留。
- 确认请求实际成功后模拟响应丢失，再次点击使用原幂等键；只上传一次原件，刷新后当前名单版本可读。
- 核对接口返回 202，读取新修订后从现有详情填写原因；确认接口返回 200 / CONFIRMED。未注册学生仍为 MISSING_IN_PLATFORM，确认异常不会伪造入班。
- 连续重新核对与确认浏览器复测通过；完整 CSV 上传、丢响应重试、刷新、核对、确认流程再次通过。
- Docker PostgreSQL 独立回读：新测试课程 000001 为 CONFIRMED，000002 为 PENDING，两行均 MISSING_IN_PLATFORM。
- 两项单元测试通过，包括过期结果拒绝且不发送写请求；Portal TypeScript 检查退出码 0。

## 发现与修复

最早探测错误预期核对返回 201，实际协议为 202；测试已纠正，原失败保留。之后确认操作超时暴露两个产品问题：

1. 新核对生成修订、页面尚未回读完时，旧详情仍能打开；服务适配层对不在最新修订中的 ID 静默跳过，导致没有确认 HTTP 请求却显示成功。现有详情入口在核对期间禁用；过期 ID 显式失败，不再静默成功。
2. 后台重新加载名单时返回整个加载页面，卸载抽屉并清空用户已填写原因。已有数据刷新期间继续展示当前内容；按课程 ID 隔离页面状态，切换课程时重置。

只修改操作状态与接线，无 CSS、页面布局或新控件修改。临时产品诊断日志已移除。

## 证据

- `browser-roster-write-csv-first-20260908.txt`、`browser-roster-write-xlsx-first-20260908.txt`：原件、重试和刷新通过。
- `browser-roster-reconciliation-first-20260908.txt`、`browser-roster-reconciliation-retest-20260908.txt`、`browser-roster-reconciliation-stage-20260908.txt`：原始失败。
- `browser-roster-click-diagnostic-20260908.txt`：点击发生但没有确认 HTTP。
- `browser-roster-mount-diagnostic-20260908.txt`：填写后加载、卸载、重建及原因清空证据。
- `browser-roster-reconciliation-fixed-20260908.txt`、`browser-roster-reconciliation-fixed-retest-20260908.txt`：第一处修复后仍失败，保留。
- `browser-roster-reconciliation-final-20260908.txt`、`browser-roster-full-closure-20260908.txt`：最终通过。
- `docker-roster-browser-persistence-20260908.txt`、`roster-stale-result-unit-20260908.txt`、`roster-reconciliation-typecheck-20260908.txt`：数据库、单元与类型检查。

## 剩余依赖与下一步

该证据覆盖教师名单的一条真实操作链，不代表三端全部验收完成。现有前端 10 MB 与后端通用正文限制需要对齐文档 100 MB；全重复名单的正式导入和差异保留还需审查。正式结算命令、纠错报告、学期切换及其他三端场景继续执行。

结算前名单学生尚未注册/入班、未录体测且未免测是否阻止结算，业务问题仍待答复。腾讯云生产 COS/CVM/PostgreSQL 与正式邮件服务不属于本次本地验证结果。

脚本运行依赖忽略目录中的合成账号配置、Playwright 和本地 Edge。持续 Docker/开发服务保留；本轮测试进程已结束。原始日志按实际输出保留，SQL 表格行尾空格不作内容修改。
