# 重复名单真实业务闭环

2026-09-08 13:11，依据 `docs/business/20-teacher-flow.md` 第 8.1 节：重复身份属于核对差异，保留原始行和处理状态；分母未唯一确认时显示核对中。

## 实现

- 新增迁移 0057，允许至少一行合法或纯重复行的名单进入 VALIDATED；保留行数守恒和既有不可变约束。正式确认额外检查重复行不能隐藏格式错误。历史 V1 核对记录继续可读，新计算使用 V2。
- 导入保留全部重复源行；格式错误仍为 INVALID，不能被重复标记覆盖。含 INVALID 的导入为 FAILED，不替换当前名单，不能正式确认。
- 核对读取 VALID 与 DUPLICATED 行。按学号输出一条重复身份核对结果，来源引用选择确定且不受输入顺序影响；所有原始行仍分别保存在名单及确认快照中。重复身份不自动绑定学生或成员。
- 网页可提交只含重复身份、其他字段合法的文件；原有总人数卡片显示“核对中”，原差异说明展示涉及的源行及姓名。教师确认异常仍不把身份歧义当作已解决，也不伪造入班或确认人数。
- Draft OpenAPI 和 Web 快照允许读取 V1/V2，相关生成物已再生成；维持 239 个后端操作。正式已发布历史与当前正式版本记录未改写。
- 补齐核对中及原始重复行说明的英文显示，语言扫描发现的 20 条教师接线提示也已补齐。没有更改 CSS、原有控件或 UI/UX 布局。

## 验证

1. Docker 最终 11 项相关单元测试通过，覆盖解析、确定性核对、失败运行留存与分阶段导入；前端相关 9 项测试、2 项语言测试和 TypeScript 检查通过。
2. Docker runtime_test 的 57 项迁移成功，就绪 200，原有账户、认证、审核、名单与综合成绩回归通过。持续 browser_test 也为 57 项已完成迁移。
3. 本地 Edge 的全重复 CSV 与 XLSX 均完成原件上传、确认丢响应后同键重试、刷新、运行核对、教师确认异常。确认快照保留两行同学号不同姓名；registration-preview 返回 denominator=null、denominatorConfirmed=false、registrationComplete=false。确认前后页面均显示核对中与重复记录。
4. 真实 HTTP 反例：重复行之一含公式错误，上传返回 ROSTER_IMPORT_FAILED / 422，错误导入可回读，INVALID 与 DUPLICATE 错误均保留；当前名单未被替换，正式确认返回 409。
5. 独立 SQL：测试当前名单 VALIDATED / valid=0 / invalid=0 / duplicate=2 / confirmation=1；错误导入均 FAILED / invalid=1 / duplicate=1 / current=false / confirmation=0；核对 V2 / COMPLETED / 1 条身份结果，状态 DUPLICATED / CONFIRMED。
6. 后端生成物、迁移清单及 239 操作/239 handler 协议对应检查通过；Web 快照指纹和生成类型检查通过。

## 证据与原始失败

- `docker-roster-duplicates-tests-verified-20260908.txt`：11 项最终通过；`docker-roster-duplicates-retest-20260908.txt`：57 项迁移及实际业务回归。
- `browser-roster-duplicates-retest-20260908.txt`、`browser-roster-duplicates-xlsx-20260908.txt`：两种格式的完整网页闭环。
- `roster-invalid-duplicate-api-passed-20260908.txt`、`docker-roster-duplicates-persistence-20260908.txt`：错误文件反例及 SQL。
- `roster-duplicates-client-tests-final-20260908.txt`、`roster-duplicates-i18n-retest-20260908.txt`、`roster-duplicates-typecheck-verified-20260908.txt`、`roster-duplicates-client-contract-check-20260908.txt`、`roster-duplicates-contract-parity-20260908.txt`：前端与协议检查。
- 原始失败均保留：旧测试曾用合法重复身份制造“内部错误”，现改用畸形适配器数据；分阶段测试缺少既有课程锁和课程状态桩，已补齐。首次浏览器在重建未就绪时得到 502，等待实际就绪 200 后复测。独立反例脚本先后修正登录字段/幂等头、预期错误响应与错误详情隐藏资源 ID 的读取方式。语言扫描发现缺失提示并已修复。
- Docker 原始构建日志保留行尾空格；源码、生成物、脚本和手写文档另行进行空白检查，不把原始输出警告描述为全部通过。

## 接续与边界

所有本轮测试进程已结束，持续 Docker、Portal 3300、学生网页 4274 服务保留。浏览器合成课程 `01a07f65-c440-725f-a4fe-76ef011bf685` 保留当前重复名单及三个被拒绝的错误导入；不删除历史事实来制造绿色测试。

完整三端目标仍未完成。继续推进正式结算与纠错报告、学期切换、未决写入在整页刷新后的恢复及其他未覆盖场景。结算前未注册/未入班或未录体测且未免测的处理规则仍待业务答复。腾讯云 COS/CVM/PostgreSQL 与正式 SMTP 未在本轮进行生产验证。
