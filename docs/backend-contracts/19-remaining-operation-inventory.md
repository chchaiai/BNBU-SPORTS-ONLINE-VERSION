# Stage 19 剩余 Operation 权威盘点

盘点日期：2026-08-04。

输入基线：`backend/score-core` / `b526d299e98ca5f33abc8c79328f599fca113d6b`。

本清单由 `docs/backend-contracts/openapi.yaml` 的全部 `operationId` 减去 `backend/runtime-coverage.manifest.json` 中的 `implemented` 与 `implementedDefaultDeny` 自动得到。生成器复核结果为 OpenAPI 92、verified 77、default-deny 4、`NOT_IMPLEMENTED` 11、`BLOCKED_BY_ADR` 0；差集恰好 11 项。

| operationId | method | path | tag/module | policyId | roles | organization scope | resource scope | resolver | request schema | success schema | current error | blocker | Stage19 disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `requestCurrentUserEmailChallenge` / `verifyCurrentUserEmailChallenge` | POST | `/me/email-verification-challenges[/{challengeId}/verify]` | Current User / Users | `USER-EMAIL-VERIFY` | STUDENT, TEACHER, ADMIN | principal organization | self | `PRINCIPAL_USER` | 邮箱 challenge request / verify | challenge acceptance / `CurrentUserResponse` | — | ADR-101 已批准首次绑定和双邮箱换绑 | `IMPLEMENT_VERIFIED` |
| `listStudents` | GET | `/students` | Students / Users | `STUDENT-LIST` | TEACHER, ADMIN | principal organization | Teacher 本人教学班；Admin 本组织 | `STUDENT_LIST_SCOPE` | cursor/limit/sort/q/classSectionId/status | `StudentListResponse` | — | 无；合同已定义角色、组织与教学关系 scope | `IMPLEMENT_VERIFIED` |
| `getStudent` | GET | `/students/{studentId}` | Students / Users | `STUDENT-READ` | STUDENT, TEACHER, ADMIN | principal organization | Student 本人；Teacher 本人教学班；Admin 本组织 | `STUDENT_FROM_PATH` | path `studentId` | `StudentResponse` | safe 404 | 无；合同已定义本人/教学班/组织 scope | `IMPLEMENT_VERIFIED` |
| `updateStudent` | PATCH | `/students/{studentId}` | Students / Users | `STUDENT-UPDATE` | STUDENT, TEACHER, ADMIN（当前运输合同） | principal organization | role-scoped | `STUDENT_FROM_PATH` | `UpdateStudentRequest` | `StudentResponse` | 尚无专用 default-deny 标记 | Domain 明确教师不得修改、学生仅可改未列明的非权威字段、Admin/同步维护权威字段；当前请求 schema 未区分字段权限 | `USER_DECISION_REQUIRED` |
| `getTeacher` | GET | `/teachers/{teacherId}` | Teachers / Users | `TEACHER-READ` | STUDENT, TEACHER, ADMIN | principal organization | Student 所属 ACTIVE 教学班教师；Teacher 本人；Admin 本组织 | `TEACHER_FROM_PATH` | path `teacherId` | `TeacherResponse` | safe 404 | 无；Domain 与权限总则已定义最小读取 scope | `IMPLEMENT_VERIFIED` |
| `listExports` | GET | `/exports` | Exports | `EXPORT-LIST` | TEACHER, ADMIN | principal organization | role-scoped placeholder | `EXPORT_LIST_SCOPE` | cursor/limit/sort/exportType/status | `ExportListResponse` | `SYSTEM_MODE_UNSUPPORTED` | `EXPORT_GATE`；V1 明确不持久化 ExportJob | `IMPLEMENT_DEFAULT_DENY` |
| `createExport` | POST | `/exports` | Exports | `EXPORT-CREATE` | TEACHER, ADMIN | principal organization | role-scoped placeholder | `EXPORT_SCOPE_FROM_BODY` | `CreateExportRequest` | `ExportResponse` | `SYSTEM_MODE_UNSUPPORTED` | Export lifecycle、格式、持久化、重试、retention、TTL 未冻结 | `IMPLEMENT_DEFAULT_DENY` |
| `getExport` | GET | `/exports/{exportId}` | Exports | `EXPORT-READ` | TEACHER, ADMIN | principal organization | role-scoped placeholder | `EXPORT_FROM_PATH` | path `exportId` | `ExportResponse` | `SYSTEM_MODE_UNSUPPORTED` | 不存在可授权读取的持久化 ExportJob | `IMPLEMENT_DEFAULT_DENY` |
| `createExportDownloadUrl` | POST | `/exports/{exportId}/download-url` | Exports | `EXPORT-DOWNLOAD-URL` | TEACHER, ADMIN | principal organization | role-scoped placeholder | `EXPORT_FROM_PATH` | purpose body | `ExportDownloadResponse` | `SYSTEM_MODE_UNSUPPORTED` | 不存在 artifact；download TTL 与 retention 未批准 | `IMPLEMENT_DEFAULT_DENY` |
| `listAuditLogs` | GET | `/audit-logs` | Audit Logs / Audit | `AUDIT-LOG-LIST` | ADMIN | principal organization | organization | `PRINCIPAL_ORGANIZATION` | cursor/limit/sort/q/actor/action/target/time filters | `AuditLogListResponse` | `PERMISSION_AUDIT_SCOPE_DENIED` | 无；须落实递归安全投影、cursor 绑定和 read-of-read 审计 | `IMPLEMENT_VERIFIED` |
| `getAuditLog` | GET | `/audit-logs/{auditLogId}` | Audit Logs / Audit | `AUDIT-LOG-READ` | ADMIN | principal organization | organization | `AUDIT_LOG_FROM_PATH` | path `auditLogId` | `AuditLogResponse` | `PERMISSION_AUDIT_SCOPE_DENIED` / safe 404 | 无；须落实递归安全投影和 read-of-read 审计 | `IMPLEMENT_VERIFIED` |

## 裁决说明

- Export 的四条路线和 `/me` PATCH 已有精确的 `SYSTEM_MODE_UNSUPPORTED` 合同，Stage 19 只建立真实认证、策略、DTO 校验与零成功副作用 default-deny。
- `updateStudent` 不能从宽泛的运输 schema 猜测字段级治理。Stage 19 将记录 PROPOSED 决策，并在正式批准前使用同一精确、可测试、无副作用的治理 default-deny；不得把 Teacher 的合同角色列表解释为可修改学生档案。
- Student/Teacher read scope 以本人、ACTIVE Enrollment/责任教学班与同组织三层裁决；知道 ID 不扩大权限。
- Audit Read 由 ADMIN 同组织读取，响应只含当前 OpenAPI 白名单；查询结果先冻结，再追加本次读取审计，避免把读操作递归包含进自己的结果。

最终 runtime 数量只能由 `npm run runtime-coverage:generate` 计算，不手工编辑生成 roadmap。
