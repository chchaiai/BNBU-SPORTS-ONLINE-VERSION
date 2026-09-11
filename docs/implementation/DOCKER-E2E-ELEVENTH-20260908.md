# 第十一轮全量 Docker E2E（2026-09-08）

执行基线 5065e397，加本轮 46 项接口登记；产品及测试代码未变。专用 bnbu-v81-full-integration、PostgreSQL 18.4、57 迁移、真实 Nest HTTP 与严格响应 hook。92/92 测试、25 套件通过，0 失败/跳过/取消；测试 115.36 秒，不含构建；退出 0。

运行时覆盖门禁首次通过：249/249 操作有有效响应，215/215 启用操作具成功证据，249/249 具错误或访问控制证据；34 个停用入口拒绝验证通过，1581 条有效响应，0 非法响应，0 缺口。测试层及 --write 输出为同一次运行，不计两轮。原始日志和报告见 docker-backend-e2e-full-eleventh-20260908.txt、runtime-conformance-eleventh-20260908.json/.md。

登记补齐 46 项，控制器/方法由 AST 提取，相关 v81 SQL 标识匹配迁移引用；auth/system-mode/V81 拆分控制器另读取实际 service。登记引用真实专项 E2E、严格协议 hook 和已有报告。总计 249：215 普通、34 停用。完整运行后仅将 getV81OwnRosterStatus 报告引用改为 ROSTER-BASIS-E2E；全路径存在检查与路线图静态检查通过，该文档引用变化未重跑 Docker。

独立契约检查并未通过。首次本机缺少 yaml，日志 contract-current-eleventh-20260908.txt；按锁文件 npm ci --ignore-scripts --no-audit --no-fund 安装工具依赖成功，日志 contract-tools-install-eleventh-20260908.txt。复测 contract-current-eleventh-retest-20260908.txt 报 407 条：较历史 391 增加的 16 条为已停用旧课程/成绩接口无成功响应。尚需按现行业务处理检查器假设及真实协议问题；后续 lint、兼容和发布检查尚未执行，不宣称契约全绿。

运行时覆盖不等于全部业务和三端验收。HTTP 用例中的合成身份/历史事实、内存存储、模拟 OCR 范围见专项报告。当前三端浏览器需刷新后复验；全范围验收表存在旧条目，需要以现行四份业务文档及本对话决定重核。腾讯云架构和正式邮件/COS 配置依赖继续交接。未修改产品代码及 UI，未进行云端操作。
