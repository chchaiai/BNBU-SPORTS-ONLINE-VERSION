# Stage 13 Roster Operation Inventory

## 1. 文档状态与权威边界

本文是在 `backend/official-roster-alignment` 分支、Stage 12 HEAD `7f1e00000c49a86ab1fa88bd2893bdbd22913851` 之上冻结的 Stage 13 operation inventory。它只定义 Official Roster Import / Roster Alignment 的目标合同和验收账本，不代表 Controller、Migration、Resolver、OpenAPI 或 runtime 已经完成。

权威边界如下：

- 现行 `docs/backend-contracts/openapi.yaml` 有 86 个 operation，其中 Roster 有 11 个。
- Stage 13 新增且只新增 2 个 Roster operation：`getCurrentRosterImport` 与 `rollbackRosterImport`。
- 合同闭合后 OpenAPI 总数必须为 88，Roster operation 总数必须为 13；不能把生成的 Swagger、policy manifest、Web Mock 或本文当成第二套 runtime 事实。
- 13 个 operation 的目标 runtime 账本为：12 个 `IMPLEMENTED_VERIFIED`，1 个 `IMPLEMENTED_DEFAULT_DENY`。`ignoreRosterAlignmentResult` 是唯一 default-deny operation。
- 所有路径均为 OpenAPI 相对路径；实际 HTTP 路径统一加 `/api/v1` 前缀。
- 基础角色仍只有 `STUDENT`、`TEACHER`、`ADMIN`。Roster read 只允许责任教师读取本人班和 ADMIN 读取本组织只读投影；所有 mutation 只允许责任教师操作本人班；STUDENT 全部禁止。

## 2. Operation 数量与 runtime 真实增量

| 账本项                     | Stage 12 基线 | Stage 13 闭合目标 | 真实增量 |
| -------------------------- | ------------: | ----------------: | -------: |
| OpenAPI operation 总数     |            86 |                88 |       +2 |
| Roster operation 总数      |            11 |                13 |       +2 |
| `IMPLEMENTED_VERIFIED`     |            28 |                40 |      +12 |
| `IMPLEMENTED_DEFAULT_DENY` |             1 |                 2 |       +1 |
| `NOT_IMPLEMENTED`          |            51 |                41 |      -10 |
| `BLOCKED_BY_ADR`           |             6 |                 5 |       -1 |

上述目标计数以 Stage 13 不改变其他模块状态为前提。两条新增 operation 在 86-operation 基线中不存在，因此不会先进入基线的 `NOT_IMPLEMENTED` 计数；它们随 OpenAPI 增量直接以真实 Controller、policy、test 和 runtime evidence 闭合为 `IMPLEMENTED_VERIFIED`。

## 3. 统一权限语义

所有 13 个 operation 均使用：

- `authentication: ACCESS_TOKEN`
- `organizationScope: PRINCIPAL_ORGANIZATION`
- `defaultDeny: true`

读取 operation 统一冻结为：

- `allowedRoles: [TEACHER, ADMIN]`
- `resourceScope: ROLE_SCOPED`
- TEACHER 只能读取 `ClassSection.teacherId = principal.teacherProfileId` 的本人班。
- ADMIN 只能读取 `resource.organizationId = principal.organizationId` 的本组织最小只读治理投影，不能借读取权限执行导入、rollback、align 或 resolution mutation。

Mutation operation 统一冻结为：

- `allowedRoles: [TEACHER]`
- `resourceScope: TEACHER_CLASS_SECTION`
- Resolver 必须从服务端资源链解析 `organizationId`、`classSectionId` 和责任教师；请求体自报的 role、organizationId、teacherId 或 classSectionId 不能扩大权限。

## 4. 冻结的 13 个 operation

|   # | Tag                     | Method | Path                                                      | operationId                    | policyId                     | Auth           | Roles           | Organization scope       | Resource scope          | Resolver                      | Request                                                                                                                                                                                             | Success                                                                                                                                         | 当前 runtime status                       | 目标 runtime status                        | ADR / Gate 依赖                                                                                       |
| --: | ----------------------- | ------ | --------------------------------------------------------- | ------------------------------ | ---------------------------- | -------------- | --------------- | ------------------------ | ----------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
|   1 | Official Roster Imports | GET    | `/class-sections/{classSectionId}/roster-imports`         | `listRosterImports`            | `ROSTER-IMPORT-LIST`         | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED`           | `ROSTER_CLASS_SECTION_READ_SCOPE` | `ClassSectionId`, `RequestIdHeader`, `Cursor`, `Limit`, `Sort`, optional `status: RosterImportStatus`; no body                                                                                  | `200 RosterImportListSuccess` → `OfficialRosterImport[] + PagedMeta`                                                                            | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; ADR-045 `PROPOSED`，采用保守 retention，不阻塞只读实现                            |
|   2 | Official Roster Imports | GET    | `/class-sections/{classSectionId}/roster-imports/current` | `getCurrentRosterImport`       | `ROSTER-IMPORT-CURRENT-READ` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED`           | `ROSTER_CLASS_SECTION_READ_SCOPE` | `ClassSectionId`, `RequestIdHeader`; no body                                                                                                                                                    | `200 RosterImportSuccess` → `OfficialRosterImport + SuccessMeta`; 无 current 时 `404 ROSTER_IMPORT_NOT_FOUND`                                   | 基线 OpenAPI 与 runtime 均不存在          | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; ADR-045 `PROPOSED`，不暴露 storage key 或原始文件 URL                             |
|   3 | Official Roster Imports | POST   | `/class-sections/{classSectionId}/roster-imports`         | `createRosterImport`           | `ROSTER-IMPORT-CREATE`       | `ACCESS_TOKEN` | `TEACHER`       | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `CLASS_SECTION_FROM_PATH`     | `ClassSectionId`, `RequestIdHeader`, required `IdempotencyKeyHeader`; multipart `CreateRosterImportRequest`                                                                                         | FILE：`201 RosterImportSuccess` → 新不可变 `OfficialRosterImport + SuccessMeta`; OFFICIAL_API：`422 ROSTER_IMPORT_SOURCE_UNSUPPORTED`，无副作用 | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`（仅 FILE 成功分支） | ADR-007 `ACCEPTED`; ADR-045 `PROPOSED`; Trusted Official Connector Gate 未闭合，OFFICIAL_API 稳定拒绝 |
|   4 | Official Roster Imports | GET    | `/roster-imports/{rosterImportId}`                        | `getRosterImport`              | `ROSTER-IMPORT-READ`         | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED`           | `ROSTER_IMPORT_READ_SCOPE`    | `RosterImportId`, `RequestIdHeader`; no body                                                                                                                                                        | `200 RosterImportSuccess` → `OfficialRosterImport + SuccessMeta`                                                                                | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; ADR-045 `PROPOSED`，只返回授权 projection                                         |
|   5 | Official Roster Imports | GET    | `/roster-imports/{rosterImportId}/entries`                | `listRosterEntries`            | `ROSTER-ENTRY-LIST`          | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED`           | `ROSTER_IMPORT_READ_SCOPE`    | `RosterImportId`, `RequestIdHeader`, `Cursor`, `Limit`, `Sort`, `Search`, optional `rowValidationStatus: RosterRowValidationStatus`; no body                                                        | `200 RosterEntryListSuccess` → `OfficialRosterEntry[] + PagedMeta`                                                                              | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; ADR-045 `PROPOSED`; role-specific sensitive-field projection                      |
|   6 | Official Roster Imports | POST   | `/roster-imports/{rosterImportId}/rollback`               | `rollbackRosterImport`         | `ROSTER-IMPORT-ROLLBACK`     | `ACCESS_TOKEN` | `TEACHER`       | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_IMPORT_FROM_PATH`     | `RosterImportId`, `RequestIdHeader`, required `IdempotencyKeyHeader`; required `RollbackRosterImportRequest` (`expectedCurrentRosterImportId`, `expectedVersion`, `reason`)                           | `200 RosterImportSuccess` → 被原子切换为 current 的 `OfficialRosterImport + SuccessMeta`                                                        | 基线 OpenAPI 与 runtime 均不存在          | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; ADR-045 `PROPOSED`，保留全部历史且不物理删除                                      |
|   7 | Roster Alignment        | POST   | `/roster-imports/{rosterImportId}/align`                  | `alignRosterImport`            | `ROSTER-IMPORT-ALIGN`        | `ACCESS_TOKEN` | `TEACHER`       | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_IMPORT_FROM_PATH`     | `RosterImportId`, `RequestIdHeader`, required `IdempotencyKeyHeader`; required JSON `RunAlignmentRequest` (`expectedRosterImportVersion`)                                                           | `202 AlignmentRunSuccess` → `AlignmentRun + SuccessMeta`                                                                                        | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; 无未决 ADR 阻塞确定性对齐                                                         |
|   8 | Roster Alignment        | GET    | `/roster-alignment-results`                               | `listRosterAlignmentResults`   | `ROSTER-ALIGNMENT-LIST`      | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED`           | `ROSTER_ALIGNMENT_LIST_SCOPE` | `RequestIdHeader`, `Cursor`, `Limit`, `Sort`, `Search`, optional `classSectionId`, `rosterImportId`, `alignmentRunId`, `currentOnly`, `status`, `resolutionStatus`; no body                         | `200 AlignmentResultListSuccess` → `RosterAlignmentResult[] + PagedMeta`                                                                        | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; ADMIN 仅本组织最小治理 projection                                                 |
|   9 | Roster Alignment        | GET    | `/roster-alignment-results/{alignmentResultId}`           | `getRosterAlignmentResult`     | `ROSTER-ALIGNMENT-READ`      | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED`           | `ROSTER_ALIGNMENT_READ_SCOPE` | `AlignmentResultId`, `RequestIdHeader`; no body                                                                                                                                                    | `200 AlignmentResultSuccess` → `RosterAlignmentResult + SuccessMeta`                                                                            | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; ADMIN 不能通过 projection 获得 mutation 能力                                      |
|  10 | Roster Alignment        | POST   | `/roster-alignment-results/{alignmentResultId}/confirm`   | `confirmRosterAlignmentResult` | `ROSTER-ALIGNMENT-CONFIRM`   | `ACCESS_TOKEN` | `TEACHER`       | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_ALIGNMENT_FROM_PATH`  | `AlignmentResultId`, `RequestIdHeader`, required `IdempotencyKeyHeader`; required `VersionedReasonBody` (`reason`, `expectedVersion`)                                                               | `200 AlignmentResultSuccess` → 更新后的 resolution projection                                                                                   | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; 不依赖 ADR-057                                                                    |
|  11 | Roster Alignment        | POST   | `/roster-alignment-results/{alignmentResultId}/resolve`   | `resolveRosterAlignmentResult` | `ROSTER-ALIGNMENT-RESOLVE`   | `ACCESS_TOKEN` | `TEACHER`       | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_ALIGNMENT_FROM_PATH`  | `AlignmentResultId`, `RequestIdHeader`, required `IdempotencyKeyHeader`; required `ResolveAlignmentRequest` (`resolutionNote`, `evidenceType`, `evidenceReferenceId`, `expectedVersion`)             | `200 AlignmentResultSuccess` → 更新后的 resolution projection                                                                                   | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; 不依赖 ADR-057；不得改 Enrollment 或 StudentProfile                               |
|  12 | Roster Alignment        | POST   | `/roster-alignment-results/{alignmentResultId}/ignore`    | `ignoreRosterAlignmentResult`  | `ROSTER-ALIGNMENT-IGNORE`    | `ACCESS_TOKEN` | `TEACHER`       | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_ALIGNMENT_FROM_PATH`  | `AlignmentResultId`, `RequestIdHeader`, required `IdempotencyKeyHeader`; required `VersionedReasonBody` (`reason`, `expectedVersion`)                                                               | 当前保留未来 `200 AlignmentResultSuccess` 合同；Stage 13 一律 `409 ROSTER_IGNORE_NOT_ALLOWED`，无副作用                                         | `BLOCKED_BY_ADR`，且尚非真实 default deny | `IMPLEMENTED_DEFAULT_DENY`                 | ADR-057 `PROPOSED`；只实现真实稳定拒绝，不创建 `IGNORED`                                              |
|  13 | Roster Alignment        | POST   | `/roster-alignment-results/{alignmentResultId}/reopen`    | `reopenRosterAlignmentResult`  | `ROSTER-ALIGNMENT-REOPEN`    | `ACCESS_TOKEN` | `TEACHER`       | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_ALIGNMENT_FROM_PATH`  | `AlignmentResultId`, `RequestIdHeader`, required `IdempotencyKeyHeader`; required `VersionedReasonBody` (`reason`, `expectedVersion`)                                                               | `200 AlignmentResultSuccess` → 重开后的 resolution projection                                                                                   | `NOT_IMPLEMENTED`                         | `IMPLEMENTED_VERIFIED`                     | ADR-007 `ACCEPTED`; ADR-057 不阻塞重开历史 `IGNORED` 数据，但不得新建 `IGNORED`                       |

## 5. Request 与 success schema 冻结

### 5.1 通用 transport

- `RequestIdHeader` 可选；服务端必须返回接受或生成的 requestId。
- 所有 POST 必须要求 `Idempotency-Key`。同 key + 同一规范化请求重放第一次结果；同 key + 不同内容返回 `CONFLICT_IDEMPOTENCY_KEY_REUSED`。
- 所有可变聚合 mutation 必须携带 `expectedVersion`；rollback、confirm、resolve、ignore、reopen 在 PostgreSQL transaction 内提交事实、history、AuditLog 与 Outbox。
- 所有列表 cursor 必须绑定 principal role、organization、授权 ClassSection 集合、filter 与 sort，不能用 ADMIN cursor 扩大 TEACHER scope，反之亦然。

### 5.2 `createRosterImport` 分支

Stage 13 的可成功 transport 只有 `source=FILE`：

- 文件只接受 UTF-8 CSV；不接受 XLS、XLSX、ODS、PDF、OCR、ZIP、远程 URL 或其他编码。
- `source=FILE`、`fileFormat=CSV`、`file` 与 `fieldMappingSnapshot` 必填；原始文件名只从 multipart 元数据读取并净化，SHA-256 由服务端流式计算，可选客户端声明只能用于一致性校验。
- 创建永远产生新的不可变版本；不覆盖旧 Import/Entry。切换历史 current 只能调用显式 rollback operation。
- 原文件进入私有 roster source storage；公共 response、日志、AuditLog 与 Outbox 不返回 `storageKey`、永久 URL、文件正文或完整原始行。

`source=OFFICIAL_API` 是已声明但未启用的分支：

- 在解析、对象存储、Import 创建或 current pointer 更新前稳定返回 HTTP 422 + `ROSTER_IMPORT_SOURCE_UNSUPPORTED`。
- 不创建假 Connector，不返回假成功，不把临时 HTTP 调用或 Web Mock 当受信学校系统。
- 只有受信系统身份、签名、transport、重放保护和学校错误合同全部另行闭合后，才能通过新的权威决策启用。

### 5.3 Read projection

- TEACHER projection 只覆盖本人 ClassSection 的业务必要字段。
- ADMIN projection 只覆盖本组织只读治理字段；不能默认取得原始源文件、内部 storage key、永久下载 URL 或不必要的完整学号/原始行。
- `OfficialRosterImport`、`OfficialRosterEntry`、`RosterAlignmentResult` 与 `Enrollment` 是独立事实；read operation 不得通过 projection 静默创建、删除或修复 Enrollment。

### 5.4 Rollback

- `rosterImportId` 指向要恢复为 current 的历史 `VALIDATED` 版本；`FAILED`、跨组织或非本人班目标必须拒绝。
- rollback 只原子切换 current pointer 并追加历史，不修改或删除任何 Import/Entry，不复用旧 alignment 结果冒充新 current comparison。
- 成功 response 返回已成为 current 的 `OfficialRosterImport`；幂等、version、AuditLog 与 Outbox 必须与 current pointer 处于同一事务边界。

### 5.5 Ignore default deny

- Stage 13 必须注册真实 POST 路由、完成 authentication、role、organization/resource scope 与稳定 ErrorEnvelope 测试后，返回 `ROSTER_IGNORE_NOT_ALLOWED`。
- 不新增 resolution event、不修改 `resolutionStatus`、不写业务成功 AuditLog/Outbox、不返回通用 404 或假 `200`。
- 只有 ADR-057 从 `PROPOSED` 变为 `ACCEPTED` 且合同、权限、状态机、Migration 与测试同步更新后，才可把目标状态改为 `IMPLEMENTED_VERIFIED`。

## 6. 86-operation 基线到 88-operation 合同闭合清单

后续实现必须按以下顺序保持单一事实来源：

1. 在唯一人工维护的 `openapi.yaml` 新增 `getCurrentRosterImport` 与 `rollbackRosterImport`，并把六个 read operation 冻结为 `TEACHER,ADMIN + ROLE_SCOPED`。
2. 为 `ROSTER_IMPORT_SOURCE_UNSUPPORTED` 登记稳定 ErrorCode 和 ErrorEnvelope 语义。
3. 重新生成 operation policy、Swagger document 与 manifest；生成物不得手改。
4. 将 permission registry 与 88-operation OpenAPI 双向核对。
5. 只有拥有真实 Controller、PolicyEngine resolver、service/use case、repository、Migration 0004、Contract/E2E/Security 测试和 Docker runtime evidence 后，才把 12 个 operation 记为 `IMPLEMENTED_VERIFIED`。
6. `ignoreRosterAlignmentResult` 必须有真实 Controller 和稳定拒绝测试，才能记为 `IMPLEMENTED_DEFAULT_DENY`；路由不存在或通用 404 仍是未实现。
7. runtime coverage 最终必须证明总数 88、Stage 13 Roster 13、目标 `40 IMPLEMENTED_VERIFIED / 2 IMPLEMENTED_DEFAULT_DENY / 41 NOT_IMPLEMENTED / 5 BLOCKED_BY_ADR`，且总和严格等于 88。
