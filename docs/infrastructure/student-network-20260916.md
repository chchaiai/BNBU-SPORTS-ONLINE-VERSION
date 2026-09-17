# 学生端网络提示修复与部署 · 2026-09-16

已部署 `/opt/bnbu-sports-production/releases/student-network-20260916`，上一个版本为 `photo-capture-20260916`。

修复 `js/api.js`、`js/app.js`、`js/screens/startup.js`：系统状态查询失败不再制造 MAINTENANCE；未知/缺失状态按服务响应异常处理。设备离线显示“当前无网络连接，请检查网络后重试”，连接失败及超时显示“网络连接不稳定，请稍后重试”。仅明确 MAINTENANCE 投影或 SYSTEM_MAINTENANCE 错误码进入维护页。网络提示带“重新尝试”，online 事件重新读取系统状态并刷新已登录学生工作区。API 连接及响应读取设置 20 秒超时；不会自动重放业务写入。已明确的维护状态在后续网络失败时保留，直到读取到 NORMAL。

验证：专项 Node 测试 10/10；本地和公网已部署页面浏览器模拟分别通过连接失败、重试、普通 503、离线、联网自动请求、明确维护、维护恢复 7 项。浏览器测试拦截系统状态响应，不修改生产维护设置或业务数据。

完整学生 smoke 有 3 个既有失败（摄像时长、日期截止规则、媒体时长允许值）；在替换为修复前线上三个文件和 HEAD 原始测试的隔离副本中复现同样 3 项失败。本次未引入新增 smoke 失败。

发布前核对三个文件线上基线 SHA-256；复制线上完整 release，仅覆盖三个验证后的学生文件，原子切换 current；失败自动回指旧版本。部署后三个公网文件 SHA-256 一致，readiness HTTP 200，Backend/Portal 容器 ID、镜像和启动时间一致。

证据：`evidence/student-network-20260916/deployment.json`、`baseline-smoke.log`、`offline.png`、`connection-failed.png`。
