# 名单文件大小完整链路验证

2026-09-08 12:52。业务依据：`docs/business/20-teacher-flow.md` 第 8.1 节，单文件最大 100 MB，最多 500 个人员行。本实现沿用仓库已有 104857600 字节口径。

## 修改与结果

名单 multipart 采用独立的 100 MiB 文件上限及 64 KiB 元数据余量，不再继承通用 JSON 的 2 MiB 限制。Busboy 配置预留一字节，实际写入完成检查使用包含边界的上限；超限失败会清理上传对象。前端大小校验与原位置中英文提示同步更新，500 行限制不变。没有修改 UI 布局、CSS 或增加控件。

- Docker 构建及 5 项测试通过：12 MiB、100 MiB 实际流式数据成功；100 MiB 加 1 字节失败且清理对象；原 CSV 严格校验通过。该测试验证传输边界，XLSX 测试流本身不作为正式工作簿解析证据。
- 前端 3 项测试通过：文件元数据边界、CSV/XLSX 的 500/501 行；TypeScript 检查退出码 0。
- 持续 Docker 后端已重建。实际 12 MiB XLSX 与恰好 104857600 字节 XLSX 均由本地 Edge 网页完成上传、正式确认丢响应后同键重试、刷新、核对及异常确认。
- 大文件包含两行 Synthetic 名单与不参与名单解析的合成附件，字节未经压缩；不是大量学生行。确认来源 SHA-256 与独立文件哈希相等，前导零和两行名单保留。
- 独立 Docker SQL 回读为 VALIDATED / 2 / 2，哈希 `0c1fe7ed348eff33f8506fada3db7b175f70c844c4beb9a306433e87b8d23ee7`，与本地恰好 100 MiB 文件一致。

## 原始失败与测试调整

所有原始输出保留，没有把失败改写为通过。

1. 构造恰好 100 MiB ZIP 时，空附件未计入 ZIP 目录开销，测试断言发现多 124 字节；改以非空附件计算固定开销。
2. Playwright 不接受超过 50 MiB 的 buffer 文件传递。改用忽略目录中的本地文件路径，原件内容一致。工具实现依据为当前安装 `playwright-core/lib/coreBundle.js` 的明确错误说明。
3. 大请求导致 Chromium 调试缓存逐出上传响应，读取 `response.json()` 失败。产品上传已返回 201；测试改用独立捕获的实际确认结果获取来源 ID，再通过 GET 回读摘要和行。最终整条链路通过。

## 证据文件

- `docker-roster-upload-size-first-20260908.txt`：构建及 5 项测试。
- `roster-file-size-frontend-unit-20260908.txt`、`roster-file-size-typecheck-20260908.txt`：前端验证。
- `browser-roster-large-xlsx-first-20260908.txt`：12 MiB 级别文件完整链路。
- `browser-roster-100mib-xlsx-first-20260908.txt`、`browser-roster-100mib-xlsx-retest-20260908.txt`、`browser-roster-100mib-xlsx-filepath-20260908.txt`、`browser-roster-100mib-xlsx-diagnostic-20260908.txt`：失败和诊断。
- `browser-roster-100mib-xlsx-final-20260908.txt`：100 MiB 最终完整链路。
- `docker-roster-100mib-persistence-20260908.txt`、`roster-100mib-source-evidence-20260908.txt`：独立持久化及源文件证据。

## 下一步

旧名单导入以 validRowCount 为准拒绝全重复文件，旧核对只查询 VALID 行，算法也拒绝官方重复身份。这与 V8.1 保留重复歧义及分母核对中的要求不一致，下一步需要联合修正导入、数据库约束、算法与页面展示；现有 V8.1 registration-preview 投影已经支持分母未确认，但旧页面未完整利用。不能只改导入按钮绕过后端。

正式结算、纠错和学期切换等三端目标仍未完成，结算业务问题仍待答复。当前测试进程均结束；持续本地 Docker 与网页服务保留。本报告不证明腾讯云生产资源已验收。

存档检查：原始 Docker 构建输出保留其行尾空格；除这两份原始构建日志外，源码、脚本、手写文档及其余证据的差异空白检查通过。
