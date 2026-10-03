# 课程展示与未入班名单发布

2026-09-28，教师端 https://www.teacher.bnbusports.cn/ 已发布。

## 功能

- 课程管理新增「现有视图 / 卡片视图」切换，默认保留现有视图。卡片使用自动填充的响应式网格，容器变窄时自动换行，课程按钮仍可使用。
- 「检查学生进班」继续调用现有真实名单导入与对齐接口，按学号比对应入班名单和实际入班名单，默认展示未进本班学生。
- 明确学校或教师提供的应入班名单说明，新增「导出未入班名单」Excel 按钮，导出所有未入班结果，不受当前搜索与分页影响。包含 MISSING_IN_PLATFORM 和 WRONG_COURSE；重复学号仍需核实。
- 学号保留文本及前导零；公式形式的姓名按文本写入，不执行公式。中英文界面文案已补齐。

## 验证

- 类型检查、生产构建通过。
- 名单导入、投影、模拟服务、导出测试 16/16；最终翻译和导出测试 4/4；后端名单算法与服务测试 6/6。
- 前端完整原测试集 141/144，通过数与上线基线一致。既有失败：teacher workspace exposes invalid records and direct correction wording；keeps teacher overview metrics single-sourced and separate from status filters；uses one portal-backed AppSelect instead of native browser selects。无新增失败。
- 本地浏览器：1440px 下原视图两列、卡片视图三列；390px 下单列，未发现页面横向溢出。切换和课程名单入口正常。
- 本地示例名单检出两名未入班学生。浏览器下载 Excel 后读取验证，实际文件恰好包含这两名学生。
- 线上 9 个发布资源 SHA-256 校验通过，公网健康接口 READY/UP。后端容器和现有发布文件保持一致，未执行数据库迁移或业务写入。
- 浏览器业务验证使用本地示例数据；真实教师账户与学校名单导入的线上验收尚未执行。

## 发布与回滚

- 当前发布：`/opt/bnbu-sports-production/releases/course-roster-20260928`
- 上一发布：`/opt/bnbu-sports-production/releases/query-index-20260928`
- 教师端镜像：`sha256:460ff17a96888dee5009db7aeb030d97ee0b23bc4646a0b2d70f50b763a374cb`
- 服务器回滚：`sudo python3 /home/ubuntu/course-roster-20260928/deploy.py --rollback`
- 发布脚本验证当前版本及基线镜像，候选容器健康后切换；切换后校验失败会自动恢复上一发布。
- 证据目录：`evidence/course-roster-20260928/`。
