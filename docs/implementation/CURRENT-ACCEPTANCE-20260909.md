# 当前验收矩阵（2026-09-09 最新）

整体状态：按用户当前确认范围完成本地三端业务交付。教师课程参数授权后的新课程完整链已通过，见 COURSE-PARAMETERS-WEB-20260909.md；云端和正式发布依赖保留。下方日期增量保留历史状态，以本段及当前交接为准。此文件统一当前判断；历史失败日志和阶段报告继续保留。业务依据为 docs/business 及对话已确认决定。下表的“已有证据”仅证明列出的场景，不扩张为该模块所有分支完成。

| 范围 | 当前已有证据 | 尚需处理/证据限制 |
|---|---|---|
| 本地 Docker / 数据库 / 协议 | 第41次101/101、25套件、类型检查通过；253候选操作，219成功/253错误权限覆盖，34明确关闭；59迁移 | 门禁不是完整网页验收；候选协议差异已核对，正式发布/兼容门禁仍未通过 |
| 学生/教师/管理员业务接线 | 下列独立闭环及同期浏览器原始日志 | 尚无最终逐入口总验收证明；不能以全量后端通过替代 |
| 教师首次改密 | [TEACHER-FIRST-PASSWORD-20260909.md](TEACHER-FIRST-PASSWORD-20260909.md)：临时密码门禁、错误、刷新/丢响应、新密码登录 | 旧“入口缺失”已解决；其他账号边界按实际需求复核 |
| 学生图片申请 | [APPLICATION-REAL-UPLOAD-20260909.md](APPLICATION-REAL-UPLOAD-20260909.md)：真实PNG/WebP上传、累计三图、关闭后补充、教师批准、学生回读 | 第二次实际完成业务，最终只读回读PASS；不能声称最终一轮重新上传；更大材料/中断恢复未全覆盖 |
| 学生 smoke | [STUDENT-SMOKE-ALIGNMENT-20260909.md](STUDENT-SMOKE-ALIGNMENT-20260909.md)：Docker86/86和图片规则2/2 | 旧8项失败已解决；含请求替身，不替代浏览器 |
| 后端完整类型检查 | [BACKEND-TYPECHECK-REPAIR-20260909.md](BACKEND-TYPECHECK-REPAIR-20260909.md)，第38次再次通过 | 旧78条错误及中间失败已解决，原日志保留 |
| 关闭前合法运动续办 | [CLOSED-COURSE-EXISTING-WEB-CHAIN-20260909.md](CLOSED-COURSE-EXISTING-WEB-CHAIN-20260909.md)：关闭后结束、首次材料、一次补证、审核和学生回读 | 同批续传期限与更广边界尚未形成最终全面结论 |
| 关闭后的电子名单/OCR | [ELECTRONIC-ROSTER-CLOSED-20260909.md](ELECTRONIC-ROSTER-CLOSED-20260909.md)、[OCR-CLOSED-CONTINUATION-20260909.md](OCR-CLOSED-CONTINUATION-20260909.md)：HTTP受理恢复、确认、权限与历史 | [网页OCR已接线](OCR-WEB-20260909.md)，单页名单/体测、丢响应刷新、学生回读通过；WebP/大小限制已衔接并通过Docker，真实腾讯OCR仍待验证 |
| 认可调整、撤销及报告 | [RECOGNITION-SETTLEMENT-WEB-20260909.md](RECOGNITION-SETTLEMENT-WEB-20260909.md)：普通结算和归档各v1/v2/v3、原键恢复、旧文件不变；第38次涵盖报告失败事务回滚 | 旧“结算/归档更正缺失”已解决；测试材料与身份为合成 |
| 结算待办 | [SETTLEMENT-UNSUBMITTED-SESSION-20260909.md](SETTLEMENT-UNSUBMITTED-SESSION-20260909.md)：修复完成会话但尚无记录的漏计，取消会话不计 | 长期未交材料的业务终结策略未由本轮新增；名单未注册时保持UNAVAILABLE，不冒称可结算 |
| 通知 | [NOTIFICATION-SOURCE-AUDIT-20260909.md](NOTIFICATION-SOURCE-AUDIT-20260909.md)：来源核对；教师课程/打卡/申请、管理员反馈/课程导航浏览器通过 | 一些验证通知为合成插入，不能证明自动投递；不再把无业务来源的所有预留targetType当作待实现需求 |
| 学校日历/SLA | ARCHITECTURE既有业务决定明确排除学校统一工作日日历及其SLA验收，保留教师轮次事实 | 不自行改成48小时，不重新列为本轮阻断；近期来源审计中将其再列待验收不准确，现纠正 |
| 学生注销/教师删除 | 按用户决定暂缓，提示“暂时功能无法实现，敬请期待”，后端拒绝 | 不恢复已排除的删除业务 |
| UI/UX | 本轮近期通知仅复用原弹窗/卡片，未改CSS；既有最小必要界面调整按对话授权 | 最终全范围视觉/交互审核未证明；OCR额外内容已获确认，限现有弹窗内必要内容 |
| 腾讯云架构 | [ARCHITECTURE.md](ARCHITECTURE.md)：CVM运行API/任务，PostgreSQL事务事实，COS私有对象，短期授权 | COS桶/角色/CORS、CVM/PG连接及CA、生产邮件、备份恢复与真实模型验证为云端依赖；本轮没有部署 |
| 本地存档/交接 | 每阶段精确路径Git提交，原始失败与复测记录保留 | 最终整体交接未完成；敏感测试凭据仅在忽略目录 |

## 接下来按依赖推进

1. 网页OCR和提供方图片输入衔接已实现并验证。回到原始业务章节完成最终逐入口核对，按实际要求补齐必要证据。
2. 对账户安全、模板发布、人工审核、补练、成绩/体测、反馈、帮助、维护、审计等其余原始业务章节进行最终逐入口核对。各模块已有独立证据，旧矩阵中“未接线/待修复”不能直接当成当前结论；也不能仅因找到文件就宣布完成。
3. 对已确认必需的未覆盖分支补测，记录失败、修复和复测；完成后再形成整体交接。避免扩大为任意权限全排列、生产负载或无来源通知等未明确要求的无限测试集合。

当前完整Docker证据：[docker-fortyfirst-20260909.txt](docker-fortyfirst-20260909.txt)、[runtime-conformance-fortyfirst-20260909.md](runtime-conformance-fortyfirst-20260909.md)。

2026-09-09 13:31增量：[ADMIN-RECOVERY-HTTP-20260909.md](ADMIN-RECOVERY-HTTP-20260909.md)补足管理员恢复双旧会话失效与新密码登录，Docker专项14/14。实际邮件/网页恢复和协议命名一致性仍未完成。

新增：[PASSWORD-RECOVERY-BROWSER-20260909.md](PASSWORD-RECOVERY-BROWSER-20260909.md)：教师和分管理员真实 Mailpit 邮件重置、旧会话失效、新密码网页登录通过；修复审计角色漏写和登录框邮箱限制。Docker专项14/14，Portal类型检查通过。

最新增量：[OCR-WEB-20260909.md](OCR-WEB-20260909.md)，含原始失败、恢复、真实本地业务与提供方替身边界。第41次101/101通过。

最新增量：[OCR-IMAGE-INPUT-20260909.md](OCR-IMAGE-INPUT-20260909.md)：WebP准备、大小限制提示、关闭后WebP完整HTTP链通过；第41次101/101。

本轮逐章节审计：[BUSINESS-CHAPTER-AUDIT-20260909.md](BUSINESS-CHAPTER-AUDIT-20260909.md)保留原文30项主流程。用户已批准总管理员模板、按课程人工模式、OCR治理三个最小表单；学生游泳专用材料步骤及本人结算网页明确暂缓，后端保留。当前OpenAPI生成物已补齐并复查通过，59迁移安全/manifest通过；原整体monorepo/发布检查未通过，候选差异不代表发布兼容。

新增：[ADMIN-REVIEW-SERVICES-WEB-20260909.md](ADMIN-REVIEW-SERVICES-WEB-20260909.md)：总管理员统一模板发布、按课程人工审核及 OCR 配置启停已接线；真实网页8次请求含3次响应丢失刷新重试通过，独立回读与英文切换通过，Docker治理专项8/8、Portal类型检查通过。保留原始测试失败；人工模式与OCR已恢复本地默认状态。

新阻断：[NEW-STUDENT-JOIN-FINDING-20260909.md](NEW-STUDENT-JOIN-FINDING-20260909.md)。真实全新课程默认两类目标为0且输入在真实模式被隐藏，无法发布；门槛和周频次也无教师选择入口。此前有预置目标课程的通过证据不覆盖此分支。已申请现有课程弹窗最小调整，整体目标仍未完成。

新增：[NEW-STUDENT-REGISTRATION-WEB-20260909.md](NEW-STUDENT-REGISTRATION-WEB-20260909.md)：已有合法发布课程下，新学生真实邀请入班→首次Mailpit验证→刷新恢复→教师名单回读通过；全新课程发布问题继续保留。

新增：[INVALID-REPEAT-WEB-20260909.md](INVALID-REPEAT-WEB-20260909.md)：第一条合成相机、真实上传的短时记录判无效后，学生新建第二次会话提交并由教师通过，双历史保留；修复人工模式加载期间输入可操作导致被回读清空的问题，延迟回读测试与Portal类型检查通过。全新课程发布参数调整仍待授权。

新增：[MAKEUP-DEADLINE-FIX-20260909.md](MAKEUP-DEADLINE-FIX-20260909.md)：网页补练提交暴露常规截止投影冲突，后端修复后专项 2/2、第 41 次完整 Docker 101/101 通过。网页复测结果见专项记录，整体任务仍未完成。

新增：[LIVE-REMINDER-WEB-20260909.md](LIVE-REMINDER-WEB-20260909.md)：实际后台任务生成学生/教师期末提醒，网页读取及教师准确课程导航、两条已读数据库回读通过，无产品变更。[当前交接](HANDOFF-20260909-CURRENT.md)汇总已有证据、唯一已确认的新课程本地阻断、暂缓范围及云端依赖。

最后阻断解除：[COURSE-PARAMETERS-WEB-20260909.md](COURSE-PARAMETERS-WEB-20260909.md)，新课程自选参数发布、锁定、邀请入班、首次邮件验证及教师/数据库回读通过，Portal 类型检查通过。最终当前入口为 [HANDOFF-20260909-CURRENT.md](HANDOFF-20260909-CURRENT.md)。
