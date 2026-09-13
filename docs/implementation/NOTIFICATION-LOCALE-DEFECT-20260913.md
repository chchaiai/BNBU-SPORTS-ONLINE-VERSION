# 审核通知固定文案未随语言切换

状态：已复现，待修复。2026-09-13 当前发布 `student-notification-copy-20260913`。

TEST ZETA 从中文切换到英文后，通知面板说明、筛选和已读提示均变为英文，但已有“运动记录有效”通知的标题与正文仍为中文。截图：`evidence/ocr-triplatform-20260913/notification-language-defect.png`。

业务依据：`docs/business/10-student-flow.md` 第 265、358 行要求审核固定分类按当前语言显示，教师补充说明保留原文。

根因路径：`backend/src/modules/v8/v81-notifications.ts` 的 `notifyRecord` 按生成时的偏好选择语言，将系统原因和教师补充说明合并写入正文；学生 `api.js` 的 `mapServerNotification` 直接映射 title/body，`screens/notifications.js` 原样渲染。通知尚未携带足够的结构化分类信息来可靠区分系统原因与教师原文。

修复要求：固定结果与原因支持当前语言投影，保留通知发生时的审核事实与教师说明；不能根据最新记录状态重写历史通知，也不能全局字符串替换教师说明。需要覆盖已有通知、新通知、语言切换和包含相同系统词语的教师说明。必要的协议、数据及客户端修复完成并上线后再关闭此项。

最新版本 51 项读取与拒绝检查通过，但没有覆盖此显示缺陷，不能用该结果消除本缺陷。

## 本地实现进度

新增 `notification-text.js`，按结构化 `reviewContent`（version、stage、reasonCode、publicComment）显示固定文案。通知列表与详情已接入，API 映射保留该字段。4 项独立测试通过：语言切换、教师原文中包含系统词语、无说明时固定结果、未知或历史格式保留原文。语法检查通过。

此为未部署的局部实现。服务端尚未提供 reviewContent，旧通知仍使用原文；必须继续完成持久化字段、接口约束、历史事实处理、集成验证与生产复测，不能以这些本地测试关闭缺陷。

## 服务端本地实现

新增迁移 0076 的可空 review_content，生成新审核通知时在同一事务保存结果、原因和教师说明。通知投影仅在类型匹配且结构有效时输出允许字段；旧通知仍原样返回。OpenAPI 新增可选 reviewContent 并重新生成产物。Prisma 生成、TypeScript 检查、3 项后端单元测试和 OpenAPI 一致性检查均通过。

尚未执行数据库迁移、历史通知处理、集成测试或生产部署；此前“服务端尚未提供”是上一阶段状态，目前已有本地代码，但线上仍缺此字段。下一步须用真实 PostgreSQL 验证持久化及约束，并依据不可变历史事实处理旧通知，随后完成部署和页面复测。

## PostgreSQL 约束与历史匹配

`notification-migration-postgres.json`：真实 PostgreSQL 18 临时表中执行原迁移，旧行不变、合法结构可写、5 类非法结构及其他通知类型被拒绝，随后 ROLLBACK。该结果不是整库迁移或完整应用集成证据。

新增历史匹配函数：输入只能来自同组织同记录的不可变历史，分别重现原中英文标题正文；语义事实唯一匹配才返回结构化内容。教师说明与系统标题相同时，若存在两个可能事实则拒绝推断。新增 4 项历史匹配测试，与投影测试合计 7 项通过。尚需历史事实查询、只读匹配统计、持久化集成测试及部署；线上缺陷未关闭。

## 生产历史只读统计

`notification-history-audit.json`：共 38 条审核通知，初始以保存的 createdAt 为截止只能匹配 32 条。另 6 条均为退回补证事件，事件时间比通知保存的事务起始时间晚 1 毫秒，但事件 UUID 早于通知 UUID。改以通知 UUIDv7 生成时刻和 ID 顺序同时限定事件范围，再严格比较完整原文，38 条均唯一匹配。未读取或输出教师正文到证据，未更新任何通知。

该统计仅证明当前样本可以恢复结构化事实；尚未执行 backfill。后续写入必须再次检查原文、空字段及匹配唯一性，并保留原 title/body。仍需应用集成、迁移部署与中英文页面复测。

## 候选构建与门禁

后端构建、289 项单元测试通过。发布检查补齐 0076 的 manifest 和 migration-registry 登记，重新生成迁移清单；6 项迁移兼容测试及 35 项契约测试通过，登记后再次构建成功。证据见 notification-candidate-validation.json。当前仍未部署，不应将构建通过当作生产迁移或历史补写成功。

## 持久化集成验证

`notification-persistence-postgres.json`：实际调用当前 notifyRecord，经 Prisma 写入 PostgreSQL，核对结构化内容、投影及已读更新后事实不变。迁移和合成数据全部回滚。首次选到的旧 local-validation 库缺少账号字段，失败已保留；随后使用确认有 75 条迁移的 full-integration 库通过。该测试未经过 HTTP，也未执行生产迁移。
# 发布包准备核对

公开说明修复已发布为 `public-note-locale-20260913`，公开 SHA256 `e29a54ae64556aa9d23cacfb0cf81a91d6650f6d58c73aa249c842d7eaeeb17b` 校验通过。真实 Edge 先加载英文记录，随后同会话切中文，公开说明、审核状态、照片标签均正确；中文偏好已恢复。证据 `public-note-locale-browser.json`，范围为无教师评语的有效记录，不代表所有审核状态。发布脚本准备第一次因 PowerShell 引号解析失败，未执行远程操作；改用固定 here-string 生成后发布成功。

`checkin-locale-browser.json` 已补齐真实 Edge 中英文通知、详情状态及照片标签切换验证。后续发现生成的公开说明沿用缓存中文；候选已改为依据独立原始审核字段在渲染时生成系统说明，教师评语直接保留原文。语法和 diff 检查通过，本次公开说明候选尚未部署。当前测试页语言为英文，后续验收后恢复中文。

详情语言修复已发布为 `checkin-locale-20260913`。`getLanguage()` 返回 `en`，详情错误比较 `en-US`，已修正；仅对 `media:` 来源且匹配系统生成名称的媒体标签按当前语言呈现，其他文件名保留。发布前生产源文件与 Git HEAD 标准化换行后逐字一致，语法及 diff 检查通过。公开文件 SHA256 `c89c82e16e011ec5567da41e89bd0a730183f89208ac83e352c3b2ad319cc795` 验证通过。未重启容器或修改数据；本次详情页面浏览器复测仍待执行。

历史投影已发布：`notification-history-20260913`，镜像 `c7253e550053e45b5f40bb0d447e4c971db54790554b9d658b7d07d627118ccb`。无数据库迁移、无历史数据修改，公开 readiness 通过。Edge 新页面中 TEST ZETA 的历史通知标题及正文均为 `Exercise record accepted`，点击进入本人 1 分钟、1 张照片记录；已恢复中文偏好。旧打开页面需刷新获取页面脚本。复测发现详情英文模式仍有中文审核状态和照片标签，继续修复；详见 `notification-history-browser.json`。

历史读取修复候选：新增 `notification-history.projection.ts`，对已授权通知页使用一次批量查询，按组织、运动记录及通知生成时间范围获取不可变审核事实；列表与标记已读响应均使用同一投影。新通知直接使用已存结构化内容，历史内容只在唯一精确匹配时生成，原文保留。无需改动通知触发器或回填数据库。真实生产 PostgreSQL READ ONLY 事务验证 38/38 匹配，查询前后原始行完全一致；类型检查及现有 289 项单元测试通过。服务接线尚未部署，HTTP 和浏览器仍待验证。

后续实际发布：`notification-locale-20260913` 已上线，0076 已执行，后端镜像 `59eedded13c53c0c7a93ea71083e9f9eabe7532cc12041bbae2a0e6957c0fc9b`。候选模块导入、76 个迁移清单及原 75 个校验一致性通过；生产 readiness、三个静态文件公开哈希通过，portal 容器未重启。私有备份 `/opt/bnbu-sports-production/backups/before-bugfix-20260913T042343Z.dump`，4,653,872 字节；详见 `notification-locale-deployment.json`。

历史回填 dry-run 失败并回滚：现行 0011 `guard_notification_mutation()` 只允许未读到已读的一次版本变更，拒绝 `review_content` 回填，报 `notification update must be one unread-to-read version transition`。未禁用触发器，未正式执行回填。历史通知语言修复仍未完成；后续需要保留不可修改规则的历史读取投影，或准备独立且明确审批的维护方案。新增通知的结构化字段已部署，尚需线上浏览器验收。

生产现场核对：当前仍为 `student-notification-copy-20260913`，后端健康，镜像 `c676a33218fc069cc6c57a14d36a96420bfeb8bb36facb84939cff8826b68055`；迁移基础镜像为 `bd7e9f60eab967dccb0347a148712c71caf2dd6e721d26b6e824a8ba92347524`。

`tools/production/prepare-notification-release.py` 已生成 `.local/notification-locale-release-v3/validation.json` 及 406 个文件的哈希清单。覆盖通知运行模块、生成 Prisma、OpenAPI、迁移清单及三个学生页面文件；0076 从已提交 Git 对象获取，SQL SHA256 为 `96852a28e23c1771028b2c58bbfba16cc9735170157920e2898b44fc65cf6210`。未包含工作区 0061 的未提交改动。首次准备因投影模块目录错误停止，修正路径后成功；早期部分目录保留在本地，不作为发布包。

本项仅证明发布材料已准备。尚未构建生产候选镜像、执行生产迁移或回填历史通知。应用回退兼容性从现行 migration-compatibility.service 确认其检查预期迁移集合，允许数据库存在后续迁移；仍需实际部署及在线验证。
