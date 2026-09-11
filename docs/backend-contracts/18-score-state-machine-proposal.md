# Stage 18A Score State Machine Proposal

候选状态不能在批准前写入 Prisma/OpenAPI。建议把规则生命周期、计算修订状态和发布状态拆开，避免一个 `status` 同时表达三个维度。

## 候选维度

- ScoreRule lifecycle：`DRAFT`、`PENDING_APPROVAL`、`ACTIVE`、`SUPERSEDED`、`REJECTED`。
- StudentScore aggregate：`NOT_CALCULATED`、`HAS_WORKING_REVISION`、`HAS_PUBLISHED_REVISION`、`HAS_UNPUBLISHED_CHANGES`（可派生，不一定持久化）。
- Revision calculation：`CALCULATED`、`ADJUSTED`、`STALE/INVALIDATED`。
- Revision publication：`WORKING`、`PUBLISHED`、`LOCKED`。

## ScoreRule 转换

| 当前状态         | 操作               | 目标状态         | 角色               | 前置条件              | 副作用                   | 审计 | Outbox                  | 是否待批准   |
| ---------------- | ------------------ | ---------------- | ------------------ | --------------------- | ------------------------ | ---- | ----------------------- | ------------ |
| 不存在           | createDraft        | DRAFT            | ADMIN 候选         | scope 合法、版本唯一  | 写不可变 version         | 是   | RULE_DRAFTED            | 是 DEC-06/07 |
| DRAFT            | requestApproval    | PENDING_APPROVAL | TEACHER/ADMIN 候选 | 公式/向量完整         | append approval event    | 是   | RULE_APPROVAL_REQUESTED | 是 DEC-08    |
| PENDING_APPROVAL | approveAndActivate | ACTIVE           | 不同 ADMIN 候选    | 防自批、无冲突 ACTIVE | 激活并 supersede 旧 Rule | 是   | RULE_ACTIVATED          | 是 DEC-08    |
| PENDING_APPROVAL | reject             | REJECTED         | approver           | 理由必填              | append rejection         | 是   | RULE_REJECTED           | 是           |
| ACTIVE           | activateNewVersion | SUPERSEDED       | system             | 新版本已批准          | 旧版只读                 | 是   | RULE_SUPERSEDED         | 是 DEC-09/10 |

## Score/Revision 转换

| 当前状态                    | 操作           | 目标状态               | 角色                  | 前置条件                                      | 副作用                             | 审计 | Outbox                  | 是否待批准      |
| --------------------------- | -------------- | ---------------------- | --------------------- | --------------------------------------------- | ---------------------------------- | ---- | ----------------------- | --------------- |
| 无 revision                 | calculate      | CALCULATED+WORKING     | SYSTEM                | ACTIVE Rule、current VALID 输入、资格规则明确 | revision+contributions+fingerprint | 是   | SCORE_CALCULATED        | 是 DEC-01–05    |
| CALCULATED+WORKING          | recalculate    | 新 CALCULATED+WORKING  | SYSTEM/TEACHER repair | fingerprint 变化或精确重放                    | 新 revision；旧版保留              | 是   | SCORE_RECALCULATED      | 是 DEC-09/16/17 |
| CALCULATED+WORKING          | adjust         | ADJUSTED+WORKING       | 批准角色              | typed adjustment 已批准                       | adjustment+新 revision             | 是   | SCORE_ADJUSTED          | 是 DEC-12/13    |
| CALCULATED/ADJUSTED+WORKING | publish        | PUBLISHED              | 责任 TEACHER 候选     | 完整性、expectedVersion、最新工作版           | 更新 published pointer、通知       | 是   | SCORE_PUBLISHED         | 是 DEC-11       |
| PUBLISHED                   | sourceChanged  | PUBLISHED + 新 WORKING | SYSTEM                | Review/Rule/Adjustment fingerprint 变化       | 旧发布不变；新工作版               | 是   | SCORE_UPDATE_PENDING    | 是 DEC-10/16    |
| PUBLISHED                   | lock           | LOCKED                 | SYSTEM                | 学期归档且无修正窗口                          | 冻结 revision                      | 是   | SCORE_LOCKED            | 是 DEC-11       |
| LOCKED                      | openCorrection | LOCKED + 新 WORKING    | 批准流程              | 有有效限时窗口                                | 不解锁旧版                         | 是   | SCORE_CORRECTION_OPENED | 是 DEC-14       |

禁止：PUBLISHED/LOCKED 原地修改；LOCKED 降级；NOT_CALCULATED 直接发布；用 `published:boolean` 替代 revision；用 Review mutation 修改 credited seconds。
