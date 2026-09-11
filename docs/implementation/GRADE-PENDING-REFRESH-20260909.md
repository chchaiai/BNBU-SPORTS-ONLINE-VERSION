# 成绩未确认请求刷新恢复

2026-09-09：教师成绩写入原先仅存在组件内 Map，刷新后丢失请求键和原始版本。现在在发请求之前写入按教师 userId 隔离的 sessionStorage；成功或明确拒绝后按现有错误分类清理。恢复后沿用原请求键、成绩、发布标记、expectedVersion；现有成绩弹窗优先填入未确认成绩。没有新增元素、样式或布局。

浏览器连接本地 Docker 后端，grade-pending-reload-browser-20260909.txt 退出 0：

- 保存 124 分，服务端已提交但浏览器响应被主动丢弃；刷新并重新进入成绩册，原输入恢复；重试同键同体，版本保持 1。
- 注入另一请求写入 126 分，原 125 分请求 409；未自动覆盖，用户显式重试后版本从 2 到 3。
- 发布响应丢失后刷新，再次进入发布流程；原键重放，版本保持 4。

这是对当前合成测试学生的真实 HTTP 写入和浏览器接线检查，不代表学校正式成绩。新增合成学生使脚本选择的首行版本从 1 开始，未修改旧归档证据。使用 GRADE_RELOAD=1 运行 tools/local-integration/v81-grade-retry-browser-probe.mjs。

final-grade-intents.test.mjs 本机及 Docker 均 3/3，通过身份隔离、同身份恢复、损坏存储保留并阻止写入、存储失败不能静默丢失重试信息；grade-pending-unit-20260909.txt、grade-pending-docker-unit-20260909.txt。Portal TypeScript 检查通过，grade-pending-typecheck-final-20260909.txt。Docker 单元通过复制该纯客户端模块和测试脚本运行，不改服务进程。

sessionStorage 限于当前浏览器标签页；关闭标签页、清除浏览器数据、跨设备和实际重新登录后的浏览器流程尚未验证。不得宣称持久离线队列或完整结算已完成。正式结算网页入口仍按原待确认范围处理。
