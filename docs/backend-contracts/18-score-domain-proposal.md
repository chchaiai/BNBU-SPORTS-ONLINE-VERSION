# Stage 18A Score Domain Proposal

本提案不修改 Prisma。所有字段、唯一键和状态都必须在用户批准后再进入 0009。

## ScoreRule

- 每行是不可变 `ruleVersion`，不原地覆盖。
- 候选字段：`organizationId`、批准 scope 外键、`ruleCode/ruleVersion`、公式类型与版本化 definition、72000 总门槛、可空分类配额、范围/精度/rounding、状态、生效区间、创建/批准/激活 actor 与时间、`version`。
- 候选唯一键：`(scopeType,scopeId,ruleCode,ruleVersion)`；同 scope 最多一个 ACTIVE 需要受控排他约束。
- 未批准前 `calculationDefinition/roundingMode/category quotas` 保持 null，ACTIVE 禁止。

## StudentScore

- 是 `(organizationId,enrollmentId)` 的当前聚合索引，不是原始成绩事实。
- 只保存 `currentWorkingRevisionId`、`latestPublishedRevisionId`、派生 current status、并发 `version`；不得复制可变贡献事实。
- Enrollment/ClassSection 关系用于 scope；姓名和 studentNumber 不作为键。

## StudentScoreRevision

- 一次不可变计算修订：`studentScoreId`、递增 `calculationRevision`、`scoreRuleId/ruleVersion`、`sourceFingerprint`、总/分类有效秒、qualification、raw/calculated/final Decimal、计算时间、publication status、published/locked actor/time、`supersedesRevisionId`。
- 唯一候选：`(studentScoreId,calculationRevision)` 与 `(studentScoreId,scoreRuleId,sourceFingerprint)`；第二个支持精确幂等。
- 工作、发布、锁定是 revision 事实；已发布 revision 永不原地重算。

## ScoreContribution

- 每个 revision 的不可变来源：`revisionId`、`recordId`、采用的 current VALID `reviewId/reviewVersion`、`scoreRuleId`、`creditType`、credited seconds、contribution result、createdAt。
- 唯一：`(revisionId,recordId)`；PENDING/INVALID 不得建贡献。
- Review 后续变化只生成新 revision，不修改旧贡献。

## ScoreAdjustment

- append-only 人工/迁移事实，不修改旧 adjustment。
- 候选字段：typed `adjustmentType`、`amount/unit`、reasonCode、reason、evidence reference（不可公开 storageKey）、actor、approver、approval event、目标/产生的 revision、requestId、createdAt。
- 秒数 correction、规则输入、最终分、豁免/抵扣、迁移必须按 DEC-12 分开；不能用一个 `adjustedScore` 掩盖来源。

## ScoreRuleApprovalEvent（仅 DEC-08 批准时）

- append-only `REQUESTED/APPROVED/REJECTED/CANCELLED` 候选事件。
- 引用固定 ScoreRule version；保存 actor/role/reason/time/requestId；数据库和服务同时防自批。
- approval 完成不等于静默激活；激活必须是独立、幂等、审计的转换。

## 不变量

1. Revision/Contribution/Adjustment/ApprovalEvent 不更新历史业务字段。
2. 所有组织与 Enrollment/ClassSection/Record/Review/Rule 引用必须同 scope。
3. 所有最终分使用 PostgreSQL numeric 与应用 Decimal；禁止 binary float 持久化。
4. `sourceFingerprint` 覆盖排序后的 record/review/rule/adjustment IDs、versions 和规范值。
5. Review/Score correction 不修改 ExerciseSession、ExerciseRecord 或旧 ReviewRecord。
