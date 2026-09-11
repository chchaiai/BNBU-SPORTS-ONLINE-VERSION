# Stage 18A Score Permission Proposal

所有项默认 deny，直到对应决策、合同、Controller 和测试完成。ADMIN 不默认代行教师。

| 能力                        | STUDENT             | TEACHER                | ADMIN                        | resource scope                      | organization scope | 高风险审批/边界                | 是否待批准       |
| --------------------------- | ------------------- | ---------------------- | ---------------------------- | ----------------------------------- | ------------------ | ------------------------------ | ---------------- |
| ScoreRule list/get          | 禁止                | 本人 ClassSection 只读 | 本组织治理只读               | rule→ClassSection                   | principal org      | 不返回内部审批备注             | 是 DEC-06/19     |
| ScoreRule create            | 禁止                | 禁止（候选可提案）     | 本组织 scope                 | approved scope                      | principal org      | 只建 DRAFT                     | 是 DEC-07        |
| ScoreRule request approval  | 禁止                | 本人班候选             | 本组织候选                   | exact rule version                  | principal org      | actor 不得自批                 | 是 DEC-08        |
| ScoreRule approve/activate  | 禁止                | 禁止                   | 与发起者不同的 approver 候选 | exact rule version                  | principal org      | append-only approval           | 是 DEC-08        |
| StudentScore list/get       | 本人安全 projection | 本人班                 | 本组织只读治理               | Enrollment/ClassSection             | principal org      | role-specific projection       | 是 DEC-18/19     |
| contribution detail         | 禁止或仅摘要        | 本人班完整业务来源     | 本组织审计只读候选           | revision→record                     | principal org      | 不暴露 storageKey/internalNote | 是 DEC-18/19     |
| recalculate                 | 禁止                | 本人班手动修复         | 禁止                         | StudentScore→ClassSection.teacherId | principal org      | system 自动为主、幂等          | 是 DEC-17/19     |
| publish Score               | 禁止                | 本人班                 | 禁止                         | latest working revision             | principal org      | 完整性+expectedVersion         | 是 DEC-11/19     |
| create adjustment           | 禁止                | 本人班发起             | 禁止直接教学执行             | score→ClassSection                  | principal org      | 不同 ADMIN 批准候选            | 是 DEC-12/13     |
| approve adjustment          | 禁止                | 禁止自批               | 本组织治理批准候选           | exact request                       | principal org      | reason/evidence、防自批        | 是 DEC-13        |
| list adjustment             | 本人仅安全摘要候选  | 本人班                 | 本组织审计只读               | score                               | principal org      | evidence 最小化                | 是 DEC-13/18/19  |
| open archived correction    | 禁止                | 发起申请候选           | 开限时窗口候选               | locked score/class                  | principal org      | ADR-026 未批继续 deny          | 是 DEC-14        |
| execute archived correction | 禁止                | 有效窗口内本人班候选   | 禁止默认代行                 | correction window                   | principal org      | 旧 LOCKED 不变                 | 是 DEC-14        |
| Export                      | 禁止                | 独立 Gate              | 独立合规 Gate                | published revision                  | principal org      | 本阶段全部 deny                | 是 DEC-20/Export |

每个 mutation 还必须复用 authentication、session/user status、role、PolicyEngine、SystemMode、Idempotency-Key、expectedVersion、transaction、AuditLog、Outbox 和 stable error envelope。
