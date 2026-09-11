# 管理员运行日志 ZIP 网页验证

2026-09-09。本地合成组织，Portal localhost:3300、Docker API 3199、PostgreSQL v81_browser_test、私有 MinIO；未验证腾讯云环境。

## 实现

- 原有日期输入和下载按钮改接 `/admin/runtime-archives` 创建、查询、能力链接及内容接口。创建采用固定原键和日期；创建响应丢失后，在当前页面重试原请求。
- 内容请求使用登录凭据，限制为当前归档的相对内容路径、拒绝重定向，诊断路由不带能力参数；下载前验证 ZIP 类型、字节数及 SHA-256。临时浏览器对象链接在下载后释放。
- 查询或下载暂时失败保留当前任务。任务仍在生成时使用原按钮再次检查。未知创建请求和已知任务目前只保存在组件内存中，刷新恢复尚未验证和实现。
- 页面现有文案说明范围为所选日期、本组织当前可用的 HTTP 记录和诊断，不代表完整历史进程日志。未增加元素或修改布局、样式。
- 本地浏览器服务开启 info 日志并将实际服务 stdout 写入私有 `server.ndjson`，复用既有启动探针方式；文件及下载 ZIP 均在忽略目录，不纳入存档。正式运行环境仍需配置、保留和轮转日志源。

## 验证及失败记录

- `runtime-archive-browser-20260909.txt`：首次测试误将异步创建 202 断言为 201，失败；修正测试。
- `runtime-archive-browser-retest-20260909.txt`：等待下载超时；只读数据库检查确认归档失败码 RUNTIME_LOG_SOURCE_UNAVAILABLE。本地服务原 LOG_LEVEL=silent 且未写入日志源，已修复启动配置。失败任务和审计历史保留。
- `runtime-archive-browser-rebuild-20260909.txt`、`runtime-archive-browser-rebuild-retest-20260909.txt`：两次实际 Docker 重建记录；最终容器 healthy。
- `runtime-archive-browser-retest2-20260909.txt`：PASS。实际管理员登录、缺日期提示、真实创建后模拟丢响应、两次创建同键得到同一个任务、真实后台工作器生成并下载 ZIP。189699 字节及 SHA-256 与服务端一致；解压 manifest.archiveId 与任务一致。覆盖标识 AVAILABLE_SCOPED_HTTP_RECORDS_ONLY。
- `runtime-archive-portal-typecheck-verified-20260909.txt`：`npx tsc --noEmit -p tsconfig.json` exit 0。此前两份类型检查日志一并保留。
- `runtime-archive-browser-verified-20260909.png`：已查看的实际页面，显示校验下载成功。

测试工具 `tools/local-integration/v81-runtime-archive-browser-probe.mjs`。本轮未修改后端业务实现；此前完整 Docker 第二十轮 97/97 仍为最新全量证据，本轮不能当作新的全量运行。

## 继续验证

跨刷新未确认任务恢复、账号切换、下载时令牌过期刷新、更多故障与移动视口仍需验证。三端整体目标继续；首次改密、结算、本人名单和教师补练窗口相关最小 UI 调整仍待答复。腾讯 COS/CVM、真实邮箱投递及正式发布依赖见当前交接记录。

原始 Docker 文本中的工具尾随空白按原样保留；源码和 Markdown 执行差异空白检查。
