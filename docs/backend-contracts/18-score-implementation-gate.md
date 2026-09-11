# Stage 18B Score Implementation Gate

当前判定：**YES — APPROVED CONTRACT READY FOR IMPLEMENTATION**。

| Gate 条件                               | 当前结果   | 证据/下一动作                                |
| --------------------------------------- | ---------- | -------------------------------------------- |
| 17 个阻塞 Core 的 SCORE-DEC 已填写 | 是 | `18-score-approval-template.md` |
| 用户明确批准 | 是 | `PROJECT_OWNER（用户本人明确批准）`；2026-08-04；`CURRENT_TASK_EXPLICIT_USER_APPROVAL` |
| Approval commit | 是 | `bff46c95c4f31ae1693158bc0741bcdef5356ecd` |
| Approval SHA-256 | 是 | `4e0a255f7fe974972ac97f8de60ab68b40a4a33d1da9ebc42910502f3b30f139` |
| 对应 ADR ACCEPTED 或 SUPERSEDED | 是 | decision-log Stage 18 approval note；ADR-070–074 未改变 |
| OpenAPI 已按批准内容更新 | 是 | 92 operations；双审批入口；无语义重叠旧入口 |
| 字段字典/领域模型已更新 | 是 | 01/02 正式冻结补充 |
| 状态机已更新 | 是 | Rule、Revision、Adjustment、Publication |
| 权限矩阵已更新 | 是 | 学生本人、教师本人班、管理员本组织治理 |
| 枚举/错误码已更新 | 是 | 含永久 `SCORE_CORRECTION_NOT_ALLOWED` |
| 公式向量拥有唯一数值预期 | 是 | 0/1/3599/3600/7199/7200/36000/71999/72000/72001/90000/144000 |
| Rule scope 明确 | 是 | 精确 ClassSection，无 fallback/继承 |
| 发布/锁定明确 | 是 | working/published 双指针；归档锁定 |
| adjustment 类型/权限明确 | 是 | 三类型；教师申请、不同 ADMIN 审批 |
| 已发布成绩变化明确 | 是 | 保留 published，新建 working |
| archived correction 明确 | 是 | 永久真实 default deny，无副作用 |
| Rule 激活审批明确 | 是 | 两名不同 ACTIVE ADMIN，创建者不得批准 |
| 0009 物理模型明确 | 是 | 九表、append-only history、Decimal、Outbox/Audit |
| Stage 17 基线持续通过 | 是 | 本任务在 PostgreSQL 18.4 重跑 181/181 |
| Runtime Generation Gate | 是 | 92-operation OpenAPI/permission/runtime source 一致 |
| 工作树 clean | 提交后是 | 合同提交完成后核验并在 clean HEAD 创建实现分支 |

## 当前十项 Gate

- Evidence Inventory：是
- Decision Options：是
- Formula Test Vector：是（唯一数值结果）
- Domain Proposal：是
- State Machine Proposal：是
- Permission Proposal：是
- Contract Delta Proposal：是
- User Approval：是
- Implementation Readiness：是
- Score Core：否

合同提交完成并在 clean HEAD 重跑 `runtime-coverage:check`、`contract:check`、`generate:check` 与 `git diff --check` 后，允许创建 `backend/score-core` 和 forward-only `0009_score`。Score Core Gate 仍需实现、五层测试和 Docker 全链路验收才能变为“是”。
