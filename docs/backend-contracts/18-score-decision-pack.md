# Stage 18A Score / Review Correction Decision Pack

状态：**USER_APPROVAL_REQUIRED**。以下 20 项均未获批准；推荐项只是基于当前权威证据的工程建议。`SCORE-DEC-01`–`13`、`16`–`19` 共 17 项阻塞 Score Core；`14`、`15`、`20` 可分别以 default deny、独立迁移 Gate、独立 Export Gate 保持关闭。

## 共同固定事实

时长为整数秒；成功 Record 只记 3600/7200；不足 3600 不得提交；只有 current VALID Review 贡献，INVALID=0，reopen/PENDING 暂停贡献；同一 calculation revision/Record 唯一；总资格门槛 72000；客户端不计算最终成绩；Rule 版本化；Revision/Contribution/Adjustment 不可变或 append-only；PUBLISHED 不静默覆盖；Review 不改 Record 时长；override 继续 fail closed；最终分用 Decimal/numeric。

## SCORE-DEC-01：最终计分模型（阻塞 Core）

- **问题/证据**：ADR-018 PROPOSED；仓库只有 72000 秒门槛，没有获批公式。
- **互斥选项**：A 达标制：`qualified=T>=72000`，正式分为批准的 `S_pass`，未达标交给 DEC-02；B 线性：`raw=Smin+(min(T,C)/C)*(Smax-Smin)`，`C`/超额由 DEC-03 定义；C 阶梯：批准有序断点 `(b_i,s_i)`，`raw=s_i` 当 `b_i<=T<b_(i+1)`；D 自定义（须给完整公式和参数域）。
- **优缺点**：A 最简单可解释但区分度低；B 连续透明但对边界/舍入敏感；C 贴合政策档位但断点维护复杂；D 灵活但验证和审计成本最高。
- **影响**：DB=Rule formula schema/Revision Decimal；OpenAPI=`calculationDefinition`；权限=Rule approval；Review/Record=只消费固定贡献链；客户端=仅展示服务端结果；历史=需按版本重算或保留旧版；Production=公式错误会批量影响成绩。
- **推荐**：B，参数化线性且封顶；理由是可解释、测试面有限、无需客户端算法。**用户批准：未填写。**

## SCORE-DEC-02：未达到 72000 秒（阻塞 Core）

- **证据**：ADR-061 只冻结资格门槛，没有冻结分值。
- **互斥选项**：A `finalScore=0`；B 按 DEC-01 比例；C 固定 `S_below`；D `qualification=NOT_QUALIFIED` 且 `finalScore=null`；E 自定义。
- **优缺点**：A 简单但把未计算与零分混淆；B 有进度激励但可能弱化门槛；C 易沟通但有跳变；D 语义最清楚但发布/导出需处理 null。
- **影响**：DB=nullable score/qualification；OpenAPI=student projection；权限=无新增；Review/Record=有效秒变化可改变资格；客户端=明确“未达标”而非“0”；历史=旧 0 需判别；Production=申诉与导出语义。
- **推荐**：D；发布/Export 只输出明确状态。**用户批准：未填写。**

## SCORE-DEC-03：超过 72000 秒（阻塞 Core）

- **互斥选项**：A 计分输入封顶 72000、仍展示实际有效秒；B 按批准区间继续加分至 `C>S_threshold`；C 分数封顶但保留超额进度徽标；D 自定义。
- **优缺点**：A 稳定简单；B 增加激励但需要新上限；C 兼顾展示但多一个派生字段。
- **影响**：DB=Rule cap/Revision actual vs scoring seconds；API=进度字段；权限=Rule approval；Review=撤销贡献仍重算；客户端=是否展示超额；历史=旧封顶规则需版本化；Production=极端输入测试。
- **推荐**：C（计算按 A，展示超额）；理由是保持 72000 的政策含义且不丢事实。**用户批准：未填写。**

## SCORE-DEC-04：范围、精度与舍入（阻塞 Core）

- **互斥选项**：A 0–100、2 位、HALF_UP、只在最终步骤舍入；B 0–100、整数、HALF_UP；C 0–100、2 位、FLOOR；D 银行家舍入；E 自定义范围/精度。
- **优缺点**：A 与当前 DecimalScore `0.01` 候选一致且保真；B 易展示但损失信息；C 保守但系统性偏低；D 统计偏差小但用户难理解。
- **影响**：DB=numeric precision/check；API=minimum/maximum/multipleOf；权限=无；Review=无事实变化；客户端=格式化不重算；历史=旧整数/浮点归一；Production=跨语言一致性。
- **推荐**：A。**用户批准：未填写。**

## SCORE-DEC-05：course/general 分类（阻塞 Core）

- **互斥选项**：A 只看总 72000；B 固定组织级两类配额；C Semester/Course 级配额；D ClassSection 级配额；E 分层继承。若选 B–E 还必须填写两类秒数、配额不足结果、配置者和冻结时点。
- **优缺点**：A 已有接受门槛、上线最稳；B 一致但不适配课程；C/D 灵活但治理复杂；E 最灵活也最难解释。
- **影响**：DB=nullable quota/scope；API=Rule request；权限=配置治理；Review/Record=按 CreditType 聚合；客户端=分类进度；历史=旧 10/10 只能候选；Production=配置漂移。
- **推荐**：A 作为 V1；不把 Android 10/10 或教师端双目标升级为事实。**用户批准：未填写。**

## SCORE-DEC-06：ScoreRule 作用范围（阻塞 Core）

- **互斥选项**：A Organization；B Semester；C Course；D ClassSection；E 分层继承。
- **优缺点**：A/B 易治理但粒度粗；C 适合同课共享；D 与当前 OpenAPI 路径/责任教师最一致；E 复用高但 fallback/冲突复杂。
- **影响**：DB=scope 外键、`(scope,ruleCode,ruleVersion)` 唯一；API=路径/筛选；权限=组织治理+班级读取；Review=按 Enrollment→ClassSection 选规则；客户端=显示实际规则版本；历史=必须快照 scope；Production=错误 fallback。
- **推荐**：D；不做隐式 fallback。**用户批准：未填写。**

## SCORE-DEC-07：DRAFT 创建权限（阻塞 Core）

- **互斥选项**：A ADMIN；B 责任 TEACHER；C 学校受信同步身份；D TEACHER 提案+ADMIN 落草稿。
- **优缺点**：A 治理清晰且符合当前 OpenAPI；B 贴近教学但规则泛滥；C 自动化但 Connector 未就绪；D 分工清楚但流程更长。
- **影响**：DB=createdBy/source；API=create role；权限=ADMIN 不代教学；Review/Record=无；客户端=管理入口；历史=creator snapshot；Production=身份与审批分离。
- **推荐**：A；教师只提交业务建议，不直接创建治理规则。**用户批准：未填写。**

## SCORE-DEC-08：激活审批（阻塞 Core）

- **互斥选项**：A 单一 ADMIN 激活；B 两个不同 ADMIN；C TEACHER 申请+不同 ADMIN 批准；D 受信系统同步批准。
- **优缺点**：A 快但误操作风险高；B 风险低但人力高；C 教学/治理分离且可解释；D 可规模化但依赖未有 Connector。
- **影响**：DB=append-only approval events、防自批约束；API=request/approve/activate delta；权限=高风险审批；Review=激活后触发新工作 revision；客户端=规则生效提示；历史=审批链；Production=批量影响。
- **推荐**：C。**用户批准：未填写。**

## SCORE-DEC-09：规则变更对未发布成绩（阻塞 Core）

- **互斥选项**：A 自动创建并计算新工作 revision；B 教师手动触发；C 新 Rule 仅作用未来 Record；D 建 revision 后等待教师确认才算。
- **优缺点**：A 一致但需可靠 worker；B 可控但易陈旧；C 简单但同学期双规则解释困难；D 可审查但延迟。
- **影响**：DB=currentWorkingRevision/sourceFingerprint；API=recalculate；权限=自动系统+手动修复；Review=贡献按新 Rule 重建；客户端=不暴露工作版；历史=旧工作 revision 保留；Production=Outbox 重放。
- **推荐**：A，并保留手动修复命令。**用户批准：未填写。**

## SCORE-DEC-10：规则变更对已发布成绩（阻塞 Core）

- **互斥选项**：A 保留旧 PUBLISHED，创建工作 revision，重新发布后切换；B 已发布永不受本学期新规则影响；C 每次变更需独立修正窗口；D 自定义。
- **优缺点**：A 最新且可追溯；B 稳定但可能不公平；C 控制强但运营重。
- **影响**：DB=published pointer/work pointer/supersession；API=hasUnpublishedChanges；权限=重新发布；Review=输入变化不改旧快照；客户端=继续显示旧版并提示待更新；历史=永久保留版本，保留期另批；Production=通知与申诉。
- **推荐**：A。**用户批准：未填写。**

## SCORE-DEC-11：发布与锁定（阻塞 Core）

- **互斥选项**：A 责任教师发布，学期归档自动 LOCK；B 教师发布+ADMIN 二次批准；C ADMIN 发布；撤回发布分别可选“禁止”或“创建新工作版”。
- **优缺点**：A 符合教学职责且简洁；B 降风险但增加瓶颈；C 违背 ADMIN 不代教学。
- **影响**：DB=publishedAt/By、lockedAt、revision pointer；API=publish/lock delta；权限=teacher scope；Review=发布前 current Review 完整性；客户端=只见 published；历史=禁止原地撤回；Production=学期关闭竞态。
- **推荐**：A；发布前完整性检查，归档时无进行中修正才锁定，撤回只创建新版。**用户批准：未填写。**

## SCORE-DEC-12：人工调整类型（阻塞 Core）

- **互斥选项**：A 全部禁用；B 仅最终分数 adjustment；C typed 模型：`DURATION_CORRECTION`、`RULE_INPUT_EXCEPTION`、`FINAL_SCORE_DELTA/REPLACEMENT`、`EXEMPTION`、`TEAM_CLUB_OFFSET`、`HISTORICAL_MIGRATION`、`CALCULATION_CORRECTION`；D 分拆成各自领域对象，仅 final score 留在 ScoreAdjustment。
- **优缺点**：A 安全但无法处理合法例外；B 简单但丢来源语义；C 统一审计但对象过载；D 语义最强但模型较多。
- **影响**：DB=type/unit/amount/source ref；API=current create request 不足；权限=按类型；Review/Record=不改原始事实，override 继续禁用；客户端=分类摘要；历史=旧 approvedHours 不直导；Production=证据保留。
- **推荐**：D。**用户批准：未填写。**

## SCORE-DEC-13：人工调整权限与证据（阻塞 Core）

- **互斥选项**：A 责任教师独立执行；B TEACHER 发起+不同 ADMIN 批准；C 两名教师；D ADMIN 治理执行。
- **优缺点**：A 快但高风险；B 职责分离且不让 ADMIN 代教学；C 教学专业性强但第二教师范围难定；D 容易越权。
- **影响**：DB=requester/approver/reasonCode/evidenceReference/notification；API=approval workflow；权限=防自批+组织/班级 scope；Review=不变；客户端=学生通知与申诉入口；历史=append-only；Production=证据隐私。
- **推荐**：B；已发布成绩必须重新发布。**用户批准：未填写。**

## SCORE-DEC-14：归档成绩修正（不阻塞 Core，未批继续 deny）

- **互斥选项**：A 永久禁止；B 教师申请→ADMIN 开限时窗口→教师执行→系统关闭；C ADMIN 执行；D 双人 ADMIN。
- **优缺点**：A 最安全但无法纠错；B 职责清楚；C/D 管理员代教学风险高。窗口时长必须另填，不得编造。
- **影响**：DB=correction request/window/events；API=open-correction 当前合同需拆；权限=teacher+admin；Review=可能允许受控 reopen；客户端=通知；历史=LOCKED 快照不改；Production=高风险审计。
- **推荐**：B。**用户批准：未填写。**

## SCORE-DEC-15：历史“提交即有效”迁移（不阻塞 Greenfield Core）

- **互斥选项**：A 全部自动 VALID migration Review；B 只对可核验记录生成 VALID；C 全部 PENDING；D B+批准抽检比例。
- **优缺点**：A 保分但放大错误；B 平衡但需验证规则；C 最安全但成绩突降；D 风险最好但运营成本高。
- **影响**：DB=migration review/source marker；API=无公开写；权限=专用 migration identity；Review=append-only；客户端=历史差异；历史=保护旧 PUBLISHED；Production=真实数据迁移另 Gate。
- **推荐**：D，抽检比例由用户批准。**用户批准：未填写。**

## SCORE-DEC-16：Review 状态变化后的重算（阻塞 Core）

- **互斥选项**：A 所有变化自动新 revision；B 只标 stale、教师手动；C 自动处理未发布，已发布需 correction；D 自定义。
- **状态矩阵**：VALID→PENDING/INVALID 撤销旧贡献；INVALID/PENDING→VALID 新增贡献；每次都使用新的 current Review id，不改旧 Contribution。
- **优缺点**：A 一致但 worker 压力；B 可控但陈旧；C 平衡但双路径复杂。
- **影响**：DB=new revision/fingerprint；API=stale/hasUpdates；权限=system trigger+teacher repair；Review/Record=追加历史不改时长；客户端=已发布仍旧版；历史=不可变；Production=通知策略。
- **推荐**：C，未发布自动；已发布创建工作版并等待重发。**用户批准：未填写。**

## SCORE-DEC-17：重算触发方式（阻塞 Core）

- **互斥选项**：A Review Outbox 自动；B 教师手动；C 定时批处理；D 自动+手动修复。
- **优缺点**：A 新鲜但依赖 worker；B 简单但易漏；C 可批量但延迟；D 可恢复且覆盖面最好。
- **影响**：DB=event dedupe、job attempt；API=recalculate repair；权限=system/teacher scope；Review=事件只带 ID/version；客户端=状态；历史=fingerprint 去重；Production=lease/retry/dead-letter。
- **推荐**：D；以 `(enrollmentId,ruleVersion,sourceFingerprint)` 幂等，重复 Outbox 返回同 revision。**用户批准：未填写。**

## SCORE-DEC-18：学生展示（阻塞 Core）

- **互斥选项**：A 只显示有效秒/门槛；B A+最新发布分数；C B+待发布更新提示/分类/规则版本/计算时间/来源摘要/调整摘要/申诉状态；D 暴露工作分数。
- **优缺点**：A 最小但信息少；B 清晰；C 最可解释但字段较多；D 透明却会把草稿误认为正式。
- **影响**：DB=无第二事实；API=role projection；权限=student self only；Review=只汇总安全状态；客户端=明确 work/published；历史=latestPublishedRevision；Production=隐私/申诉。
- **推荐**：C，但不返回工作分数、internalNote、教师身份或证据存储键。**用户批准：未填写。**

## SCORE-DEC-19：Teacher / ADMIN Projection（阻塞 Core）

- **互斥选项**：A TEACHER 本班全明细/触发/发布，ADMIN 本组织只读治理；B ADMIN 也可全部教学动作；C TEACHER 只看汇总、ADMIN 管理全部；D 自定义。
- **优缺点**：A 符合冻结职责；B/C 权限集中且违背“不默认代行教师”。
- **影响**：DB=无；API=policy/resolvers；权限=teacherId/organizationId；Review=贡献明细只给责任教师；客户端=不同 projection；历史=actor snapshot；Production=批量查询与最小化。
- **推荐**：A；规则创建/审批按 DEC-07/08 单独治理。**用户批准：未填写。**

## SCORE-DEC-20：Export 与 Score 快照（不阻塞 Core，Export 独立 Gate）

- **互斥选项**：A 只导出 latest PUBLISHED/LOCKED revision；B 导出工作版并显著标记；C 调用者选择；D 禁止 Export。
- **优缺点**：A 权威稳定；B/C 容易误用草稿；D 最安全但无业务交付。
- **影响**：DB=ExportJob 保存 revisionId/ruleVersion/sourceFingerprint；API=Export 合同；权限=独立 Export policy；Review=旧文件不随改审变化；客户端=下载标识；历史=文件绑定快照；Production=保留/访问/签名 URL。
- **推荐**：A；规则变化不改旧文件。**用户批准：未填写。**

## Review 补充决策映射

- ADR-019：推荐“学期中实时 single/batch + 发布前完成性检查”，SLA、提醒和完成度仍需批准；不改变 Stage 17 数据模型。
- ADR-047：推荐永久禁止 Review 内覆盖，把合法异常放入独立 correction/typed source；批准前继续 `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED`。
