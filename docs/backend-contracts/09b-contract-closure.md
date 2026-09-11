# Greenfield 确定性合同闭合记录

> 日期：2026-08-02 · 分支：`backend/greenfield-foundation` · 作用：记录 Foundation 开工前可由本轮指令直接裁决的合同修复；不代表全部业务实现或 production 验收。

## 1. 权威链路

合同权威顺序为：已接受业务决策/ADR → 统一业务规则 → `openapi.yaml` → 后端实现 → 客户端实现 → Mock/展示文档。`openapi.yaml` 是唯一人工维护的 API 机器合同；后端只生成只读运行时 document、manifest 和 policy metadata。

旧远程 API、Android 旧 DTO 与 Web Mock 均不是 schema 或业务规则来源。未知旧服务未被连接、修改、删除或声明兼容。

## 2. 本轮确定性闭合

| 项目                    | 闭合结果                                                                                 | 权威依据        |
| ----------------------- | ---------------------------------------------------------------------------------------- | --------------- |
| Review claim            | 删除 `claim-review` operation、`CLAIM_REVIEW` 和可写 `UNDER_REVIEW`；单责任教师直接审核  | ADR-077/078     |
| Review 并发             | `expectedVersion`、`expectedReviewVersion`、唯一 review version 与事务                   | ADR-078         |
| 每日唯一                | 统一为 `(enrollmentId,businessDate)`；V1 CANCELLED 不释放槽位                            | ADR-064/086     |
| ReviewRecord            | 系统初始 PENDING 可无 teacher；教师 VALID/INVALID 必有 actor，原因/公开/内部备注边界固定 | ADR-082/086     |
| 学生投影                | `currentReview` 只含 `result/reasonCode/publicComment`，不泄漏 internalNote 或完整历史   | ADR-082/086     |
| Media 身份              | initiate 分配稳定 `mediaId`；declared/verified hash 分离；`storageKey` 不公开            | ADR-066/086     |
| AuditLog                | 精确字段、`permissionId` 必填、敏感 source facts 只存摘要                                | ADR-016/073/086 |
| QR Join transport       | preview → profile → one-time capability → atomic join；合同闭合但模块未实现              | ADR-006/080     |
| 权限机器合同            | 每个 operation 唯一完整 `x-access-policy`；公共接口也显式声明且 default deny             | ADR-079         |
| Review reason           | 7 个 V1 `ReviewReasonCode` 与条件/长度固定                                               | ADR-082         |
| Score adjustment reason | 5 个值冻结，但执行仍关闭                                                                 | ADR-083         |
| ExportType              | 4 个值冻结，V1 不建/执行 ExportJob                                                       | ADR-084         |
| 未批准能力              | 保留 transport 时稳定 default closed，不创建假成功或半成品写入                           | ADR-085         |
| 物理类型                | UUIDv7/PostgreSQL uuid、命名 CHECK 字符串枚举、UTC/RFC3339                               | ADR-086/087     |

这些修复同步覆盖领域模型、字段字典、状态机、业务规则、权限矩阵、API 指南、枚举/错误、OpenAPI 与 consistency audit。`decision-log.md` 保留历史，只追加/更新状态，没有删除阶段 0–9 的形成过程。

## 3. 机器校验结果

2026-08-02 执行 `backend/npm run contract:check`：

| 指标                            |     结果 |
| ------------------------------- | -------: |
| OpenAPI paths                   |       73 |
| OpenAPI operations              |       86 |
| OpenAPI schemas                 |      212 |
| 已检查本地 `$ref`               |    1,249 |
| unresolved refs                 |        0 |
| operation policies              |       86 |
| permission registry rows        |       86 |
| policy 双向 diff                |        0 |
| named enums / values            | 31 / 140 |
| named enum diff                 |        0 |
| ErrorCode                       |      143 |
| ErrorCode diff                  |        0 |
| integer duration fields checked |        9 |

`operationId` 唯一、`x-access-policy` 覆盖率 100%，生成 artifacts 与权威 OpenAPI 一致。后端 contract test 为 3/3，通过 OpenAPI 解析/引用/operation-policy manifest 以及已实现 Foundation HTTP envelope 的针对性断言；没有把未实现的 77 个 operation 冒充运行时验证。

## 4. Redocly warnings

OpenAPI 有效，保留 6 条非阻塞 warning：

1. `info` 尚未提供 license；
2. 三个公开只读探针未声明 4XX response；
3. `ResponseMeta` component 当前未引用；
4. `ScoreContribution` component 当前未引用。

这些 warning 不造成引用、权限、枚举或错误码差异，也未通过关闭 lint 规则隐藏。license 需要项目权利人决定；公开探针和 contract-only component 应在后续兼容评审中处理，不应为了清零 warning 编造错误或删除未来合同。

## 5. 实现边界

当前 86 个合同 operation 中只实现 9 个 Foundation operation：health live/ready、system mode、password login、refresh、logout、me、current organization、current semester。其余 77 个 operation 没有 Controller。

因此本文件只证明“合同的确定性差异已闭合并可生成/校验”，不证明：

- Course/Enrollment/Session/Media/Record/Review/Score/Export 已实现；
- Android/Web 已切换到新 API；
- 旧远程 API 可删除或已兼容；
- staging/production 已建立；
- production 安全、数据生命周期或业务验收已完成。
