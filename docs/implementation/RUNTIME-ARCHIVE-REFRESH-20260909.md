# 运行日志归档刷新恢复

2026-09-09。承接 RUNTIME-ARCHIVE-BROWSER-20260909.md，修复组件卸载或刷新丢失归档请求键的问题。

## 行为

- 在请求服务器前，将原日期和请求键写入按管理员 userId 隔离的 sessionStorage。未确认创建和已受理任务均保留原请求，刷新后由原按钮重放并查询同一任务。
- 成功校验下载或服务器明确返回终态后清理；访问拒绝、网络失败和未知响应保留。无身份、损坏存储或不能持久写入时阻止新创建，避免静默覆盖原请求。
- 不保存凭据、能力链接或 ZIP 字节。没有增加页面元素、样式或布局。页面日期输入即使被清空，待确认原请求仍使用保存的日期，现有消息说明正在检查的日期范围。

## 当前证据

- `runtime-archive-reload-browser-20260909.txt`：真实管理员登录，Docker 后端已创建但丢弃响应，刷新并重新进入审计页，原键同日期重放得到同一任务，实际工作器归档和 ZIP 校验下载 PASS。
- `runtime-archive-download-reload-browser-20260909.txt`：同时覆盖上述创建响应丢失及后续 ZIP 内容响应丢失；两次刷新、三次同键创建受理始终指向同一个任务，最终 214970 字节、SHA-256 和 manifest.archiveId 一致；成功后无待确认存储，PASS。
- `runtime-archive-reload-docker-unit-20260909.txt`：3/3 PASS，覆盖同身份恢复、其他身份隔离、完成清理、损坏状态不覆盖、身份缺失和存储写入失败阻止新请求。纯客户端模块和测试复制到现有本地测试容器 `/tmp/archive-client` 后运行 `node --import tsx --test`，没有重启或修改后台进程。
- `runtime-archive-reload-typecheck-20260909.txt`：Portal `npx tsc --noEmit -p tsconfig.json` exit 0。

本轮未修改后端业务，最新全量仍为第二十轮 97/97。本地合成组织和 MinIO，不代表腾讯云或真实学校验收。sessionStorage 只覆盖当前标签页；关闭标签页、清除浏览器数据和跨设备不承诺恢复。实际登出再登录、下载时令牌刷新与移动视口尚未由本轮浏览器证明。
