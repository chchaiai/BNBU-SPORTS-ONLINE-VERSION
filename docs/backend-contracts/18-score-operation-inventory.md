# Stage 18 Final Score Operation Inventory

批准日期：2026-08-04。来源：权威 `openapi.yaml` 与项目负责人显式批准。所有路径均在 `/api/v1` 下。

| operationId | method | path | policyId | Stage 18 目标 |
|---|---|---|---|---|
| `listScoreRules` | GET | `/class-sections/{classSectionId}/score-rules` | SCORE-RULE-LIST | IMPLEMENTED_VERIFIED |
| `createScoreRule` | POST | `/class-sections/{classSectionId}/score-rules` | SCORE-RULE-CREATE | IMPLEMENTED_VERIFIED |
| `getScoreRule` | GET | `/score-rules/{scoreRuleId}` | SCORE-RULE-READ | IMPLEMENTED_VERIFIED |
| `submitScoreRuleForApproval` | POST | `/score-rules/{scoreRuleId}/submit-approval` | SCORE-RULE-SUBMIT-APPROVAL | IMPLEMENTED_VERIFIED |
| `approveScoreRule` | POST | `/score-rules/{scoreRuleId}/approve` | SCORE-RULE-APPROVE | IMPLEMENTED_VERIFIED |
| `rejectScoreRule` | POST | `/score-rules/{scoreRuleId}/reject` | SCORE-RULE-REJECT | IMPLEMENTED_VERIFIED |
| `listStudentScores` | GET | `/student-scores` | STUDENT-SCORE-LIST | IMPLEMENTED_VERIFIED |
| `getStudentScore` | GET | `/student-scores/{studentScoreId}` | STUDENT-SCORE-READ | IMPLEMENTED_VERIFIED |
| `recalculateStudentScore` | POST | `/student-scores/{studentScoreId}/recalculate` | STUDENT-SCORE-RECALCULATE | IMPLEMENTED_VERIFIED |
| `publishStudentScore` | POST | `/student-scores/{studentScoreId}/publish` | STUDENT-SCORE-PUBLISH | IMPLEMENTED_VERIFIED |
| `openStudentScoreCorrection` | POST | `/student-scores/{studentScoreId}/open-correction` | STUDENT-SCORE-OPEN-CORRECTION | IMPLEMENTED_DEFAULT_DENY |
| `listScoreAdjustments` | GET | `/student-scores/{studentScoreId}/adjustments` | SCORE-ADJUSTMENT-LIST | IMPLEMENTED_VERIFIED |
| `createScoreAdjustment` | POST | `/student-scores/{studentScoreId}/adjustments` | SCORE-ADJUSTMENT-CREATE | IMPLEMENTED_VERIFIED |
| `approveScoreAdjustment` | POST | `/score-adjustments/{scoreAdjustmentId}/approve` | SCORE-ADJUSTMENT-APPROVE | IMPLEMENTED_VERIFIED |
| `rejectScoreAdjustment` | POST | `/score-adjustments/{scoreAdjustmentId}/reject` | SCORE-ADJUSTMENT-REJECT | IMPLEMENTED_VERIFIED |

旧的 `publishScoreRule` 已删除，不保留语义重叠入口。规则激活由两名不同且均非创建者的 ACTIVE ADMIN 追加批准事件完成。`openStudentScoreCorrection` 必须经过真实认证和资源范围校验后稳定返回 `SCORE_CORRECTION_NOT_ALLOWED`，且不写领域事件、成功 AuditLog、业务 Outbox 或 version。

合同冻结时 runtime coverage 为 `63 verified / 3 default-deny / 26 not-implemented / 0 blocked`；Stage 18 实现完成目标为 `77 / 4 / 11 / 0`，最终数字必须由 generator 实际产生。
