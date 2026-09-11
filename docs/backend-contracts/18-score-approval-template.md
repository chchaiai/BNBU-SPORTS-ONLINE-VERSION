# Stage 18 Score User Approval Record

状态：**APPROVED**

- 批准人：PROJECT_OWNER（用户本人明确批准）
- 批准日期：2026-08-04
- 批准来源：CURRENT_TASK_EXPLICIT_USER_APPROVAL
- 用户指令：全部采用 Stage 18A 决策包对应的最终推荐方案，授权写入审批模板、ADR、权威合同和 Score Core 实现。

## 二十项唯一选择

| 决策         | 正式选择 | 冻结摘要                                                             |
| ------------ | -------- | -------------------------------------------------------------------- |
| SCORE-DEC-01 | B        | `rawScore=scoringSeconds*100/72000`，Decimal 线性封顶                |
| SCORE-DEC-02 | B        | 未达标按比例；`NOT_QUALIFIED`；舍入到 100 时保护为 99.99             |
| SCORE-DEC-03 | C        | scoringSeconds 封顶 72000，保留 excessSeconds                        |
| SCORE-DEC-04 | A        | 0.00–100.00、2 位、HALF_UP、仅最终舍入                               |
| SCORE-DEC-05 | A        | V1 只看总 72000 秒；分类仅展示/解释                                  |
| SCORE-DEC-06 | D        | ScoreRule 精确绑定 ClassSection，无 fallback/继承                    |
| SCORE-DEC-07 | A        | 仅同组织 ACTIVE ADMIN 创建 DRAFT                                     |
| SCORE-DEC-08 | B        | 两名不同 ACTIVE ADMIN 批准；创建者不得批准                           |
| SCORE-DEC-09 | A        | 新 Rule 激活后自动创建并计算新 working revision                      |
| SCORE-DEC-10 | A        | 保留旧 PUBLISHED，创建 working revision，重新发布后切换              |
| SCORE-DEC-11 | A        | 责任 TEACHER 发布；归档且无修正时 LOCKED；不原地撤回                 |
| SCORE-DEC-12 | D        | ScoreAdjustment 只处理最终分数层面；其他能力独立建模                 |
| SCORE-DEC-13 | B        | 责任 TEACHER 发起，不同 ACTIVE ADMIN 批准，证据引用必填              |
| SCORE-DEC-14 | A        | V1 归档成绩修正永久禁止，真实 default deny                           |
| SCORE-DEC-15 | B        | 历史仅迁移可核验记录；本 Stage 不执行真实迁移                        |
| SCORE-DEC-16 | C        | 未发布自动新 working；已发布保留并标记待重发                         |
| SCORE-DEC-17 | D        | Outbox 自动触发 + 责任教师手动修复，fingerprint 幂等                 |
| SCORE-DEC-18 | C        | 学生看进度与最新发布安全投影，不看 working score                     |
| SCORE-DEC-19 | A        | TEACHER 本班教学操作；ADMIN 本组织治理；STUDENT 本人安全读           |
| SCORE-DEC-20 | A        | 未来 Export 只绑定 latest PUBLISHED/LOCKED revision；本 Stage 不实现 |

## 补充 Review 决策

- ADR-019：接受学期中责任教师 single/batch Review，并在发布前检查审核完整性；V1 不规定 SLA、提醒频率、自动期末批处理或工作量指标。
- ADR-047：永久禁止 Review 覆盖 credited duration；非空 `creditedDurationOverrideSeconds` 继续返回 `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED`。

## 总体批准声明

- 我确认上述 20 项均已逐项选择且互不矛盾：YES
- 我确认所有阻塞 Score Core 的选择将形成 ACCEPTED/SUPERSEDED ADR：YES
- 我确认公式向量将在合同冻结后具有唯一数值预期：YES
- 我授权进入 Stage 18B（不包含 Export/Production）：YES
- 批准人：PROJECT_OWNER（用户本人明确批准）
- 批准日期：2026-08-04
- 批准提交 hash：`bff46c95c4f31ae1693158bc0741bcdef5356ecd`
