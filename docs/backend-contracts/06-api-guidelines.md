# 体育打卡统一 API 契约指南

> 阶段：6（API 契约设计，不是后端实现）
> 版本前缀：`/api/v1`
> 机器可读合同：`docs/backend-contracts/openapi.yaml`
> 上游基线：`01-domain-model.md`、`02-data-dictionary.md`、`03-state-machines.md`、`04-business-rules.md`、`05-permission-matrix.md`
> 限制：Greenfield 权威路径和技术基线已接受，但当前仍没有已部署后端、staging/production 数据或生产调用遥测；本文不修改旧远程黑盒，也不把合同或 `PROPOSED` 方案伪装成已实现/已上线能力。

## 1. 契约裁决顺序与边界

1. 资源边界和关系来自 `01-domain-model.md`。
2. 业务字段、API `camelCase`、数据库 `snake_case`、单位和隐私级别来自 `02-data-dictionary.md`。
3. 状态枚举、当前状态、目标状态和允许转换来自 `03-state-machines.md`。
4. 守卫、时长折算、每日唯一、媒体数量和成绩阻塞来自 `04-business-rules.md`。
5. 角色和资源范围来自 `05-permission-matrix.md`。
6. 若上游文件互相冲突，API 不发明第三套规则：状态转换以阶段 3 为准，字段以阶段 2 为准，未决业务能力保持禁用并返回稳定错误码。
7. Foundation 已实现 Password Auth、Refresh、Logout 和 `/me`；具体 TTL 全部来自环境配置。Stage 12 已实现 CourseInvite、JoinCapability、原子 QR Join 与 Enrollment 核心；学生 withdraw/rejoin 仍按 ADR-054 default deny。ExportType 只冻结四值枚举，ExportJob 执行保持关闭。

## 2. HTTP、版本和认证

| 项目 | 唯一规范 |
|---|---|
| Base path | 所有新业务接口位于 `/api/v1`；禁止同时发布无版本、`/v1` 和 `/api/v1` 三套新写入口 |
| 协议 | 生产只允许 HTTPS；JSON 使用 UTF-8 |
| 认证 | 每个 operation 由自身 `x-access-policy.authentication` 决定：`PUBLIC`、`ACCESS_TOKEN` 或 `JOIN_CAPABILITY`；禁止依赖全局 Bearer 推断资源权限 |
| Token 来源 | 后端验证并从会话解析 `userId/role/organizationId`；请求体中的同名字段不构成授权 |
| 资源隐藏 | 无权获知资源是否存在时返回 `404 PERMISSION_RESOURCE_NOT_FOUND`；已知资源但无动作权限时返回 403 |
| 时间 | RFC 3339 带时区，例如 `2026-08-02T09:30:00+08:00`；数据库实现应归一到 UTC |
| 业务日期 | `YYYY-MM-DD`，由服务端按 Organization.timezone 计算 |
| 时长 | 非负整数秒；禁止在新 API 写入小时、分钟或浮点秒 |
| 枚举 | 稳定英文 `UPPER_SNAKE_CASE`；客户端用 i18n key 显示中文/英文 |
| 版本策略 | v1 只做向后兼容新增；删除/改名/收紧必填属于破坏性变更，需弃用期、调用遥测和新主版本 |

### 2.1 Bearer 与会话

- Access token 只放 Authorization header，不放 query、URL fragment、普通日志或业务表。
- Refresh token 只发送给 `/auth/refresh`；刷新时轮换，旧 token 重放返回 `AUTH_SESSION_REVOKED`。
- 登出、账户禁用和 credential `tokenVersion` 变化必须使相关会话可撤销。具体有效期与多设备策略受 ADR-022/053 阻塞。
- Join Capability 使用独立 header security scheme，只保存不可逆摘要并一次性消费；Invite Token、Join Capability 和 refresh token 均不得进入普通日志。
- ExportType 是已冻结 transport enum；任何 ExportJob、假任务或假下载链接仍未获批准。

### 2.2 operation 权限机器合同

每个 operation 必须有唯一 `x-access-policy`，字段固定为 `policyId`、`authentication`、`allowedRoles`、`organizationScope`、`resourceScope`、`resourceResolver`、`defaultDeny`。公开接口也必须显式声明 PUBLIC policy 和空角色集；受保护接口不能用全局 Bearer 代替资源解析。policyId 与 `05-permission-matrix.md` 的 operation registry 一一对应，双向差异必须为 0；未知 policy、resolver、role 或 scope 一律 fail closed。

## 3. 请求 ID、唯一成功信封与唯一错误结构

客户端可以发送 `X-Request-ID`。后端校验其长度与字符后复用，否则生成新值；响应 header `X-Request-ID` 与成功响应的 `meta.requestId` 或错误响应的 `requestId` 必须一致。该 ID 贯穿网关、业务事务、outbox、审计和错误日志。

成功 JSON 响应只有两个顶层字段：`data` 与 `meta`。错误 JSON 响应不套成功信封，只使用顶层 `code/message/details/requestId/timestamp`。两种结构各自唯一，禁止新增 `records/items/result/error` 等变体。

成功示例：

```json
{
  "data": {
    "id": "rec_01JABC123",
    "status": "SUBMITTED"
  },
  "meta": {
    "requestId": "req_01JABC123"
  }
}
```

错误示例：

```json
{
  "code": "CONFLICT_VERSION_MISMATCH",
  "message": "The resource changed. Refresh and try again.",
  "details": {
    "resourceType": "EXERCISE_RECORD",
    "resourceId": "rec_01JABC123",
    "expectedVersion": 3,
    "actualVersion": 4
  },
  "requestId": "req_01JABC123",
  "timestamp": "2026-08-02T12:00:00Z"
}
```

约束：

- `message` 只供人阅读，不稳定；客户端分支只能依赖 `code`。
- 错误时五个顶层字段全部存在，`details` 无明细时为 `{}`；字段错误放在 `details.fieldErrors`，批量逐项错误放在 `details.itemErrors`；不得返回 `data/meta`。
- 成功时不得返回顶层 `code/message/details/timestamp`。
- 删除、登出和无实体动作也返回 `data: null`，不使用无信封的 204。
- 业务拒绝不伪装成 HTTP 200。422 表示字段/业务输入不合法；409 表示状态、版本、幂等或唯一约束冲突。

## 4. 列表、分页、排序、筛选和搜索

所有集合读取统一使用 cursor pagination：

| 参数 | 规则 |
|---|---|
| `cursor` | 后端签名/opaque；客户端不得解析；省略表示第一页 |
| `limit` | 默认 20，范围 1..100 |
| `sort` | 逗号分隔字段，`-field` 为降序；每个端点只接受白名单 |
| `q` | 可选搜索词，trim 后 1..100；只搜索端点声明的字段 |
| 筛选 | 使用明确 query 字段，如 `classSectionId`、`status`、`businessDateFrom`；禁止通用 JSON filter |

列表 `data` 直接是数组；分页信息位于 `meta.pagination`：

```json
{
  "data": [{ "id": "rec_01JABC123" }],
  "meta": {
    "requestId": "req_01JABC123",
    "pagination": {
      "nextCursor": "eyJpZCI6Ii4uLiJ9",
      "hasMore": true,
      "limit": 20
    }
  }
}
```

- 游标必须绑定 organization、principal scope、筛选和排序摘要；改变条件后旧 cursor 返回 `VALIDATION_FORMAT_INVALID`。
- 稳定排序必须追加 `id` tie-breaker。未知 sort/filter 返回 `VALIDATION_FAILED`，不能静默忽略。
- 搜索必须应用与普通列表相同的角色 projection；搜索不能扩大教师教学班或学生本人范围。
- 不返回昂贵或可能泄漏总量的 `totalCount`，除非某端点明确需要且有权限。

## 5. 写入、幂等、批量和乐观锁

### 5.1 Idempotency-Key

- 所有创建、提交、状态动作、媒体确认、审核、调整、发布和导出请求都要求 `Idempotency-Key`。
- 键为 1..128 个可打印 ASCII 字符；作用域为 authenticated principal + HTTP method + canonical route。
- 后端保存规范化请求摘要和最终业务响应。相同 key + 相同摘要返回首次结果且不重复通知/审计；相同 key + 不同摘要返回 409 `CONFLICT_IDEMPOTENCY_KEY_REUSED`。
- 客户端重试必须复用原 key；用户明确发起新动作才生成新 key。

### 5.2 expectedVersion

- 可变聚合的 PATCH/动作请求体必须包含 `expectedVersion`，为当前非负/正整数版本。
- Review append-only 命令使用 `expectedReviewVersion`；Score 仍使用 StudentScore `expectedVersion`。
- 不匹配返回 409 `CONFLICT_VERSION_MISMATCH` 或领域更精确的版本错误，不发生部分副作用。
- 创建新资源通常没有 expectedVersion；创建后的响应必须返回资源 `version`。

### 5.3 批量操作

批量 API 不共享第一项的授权和版本判断。每项重复认证后的资源加载、组织、ownership、教师 `ClassSection.teacherId == principal.teacherId`、状态、版本和规则校验；不得引入不存在的多教师关联旁路。

```json
{
  "data": {
    "items": [
      { "itemKey": "row-1", "status": "SUCCEEDED", "data": { "id": "rev_01" } },
      {
        "itemKey": "row-2",
        "status": "FAILED",
        "error": {
          "code": "CONFLICT_VERSION_MISMATCH",
          "message": "The resource changed. Refresh and try again.",
          "details": { "expectedVersion": 3, "actualVersion": 4 },
          "requestId": "req_01JABC123",
          "timestamp": "2026-08-02T12:00:00Z"
        }
      }
    ]
  },
  "meta": { "requestId": "req_01JABC123" }
}
```

- HTTP 200 表示批处理请求本身被解析；逐项结果表达部分成功。整批认证/格式失败仍返回 4xx。
- `itemKey` 在本批唯一；每项可以携带 `idempotencyKey` 和 expected version。
- 成功项独立提交领域历史、审计和 outbox；失败项不得留下半成品。

## 6. 媒体上传五步流

1. `POST /media-uploads`：只接受 `businessPurpose=EXERCISE_RECORD`；申请时创建稳定 `mediaId` 和 PENDING_UPLOAD MediaEvidence，并返回短期私有对象存储目标、必须 header、`uploadSessionId` 与该 `mediaId`。`declaredContentSha256` 可空且不可信。
2. 客户端直接把二进制上传到对象存储；二进制不进入 ExerciseRecord JSON，也不进入 API 服务器普通日志。
3. `POST /media-uploads/{uploadSessionId}/confirm`：服务端验证对象存在、大小、真实 MIME 和内容 hash，把可信结果写入 `verifiedContentSha256`；继续返回申请阶段的同一个 `mediaId`，不得创建第二个 ID。
4. `POST /media/{mediaId}/bind`：把本人媒体绑定到本人 session/record 草稿，进入 `BOUND -> PROCESSING -> AVAILABLE`；客户端轮询 `GET /media/{mediaId}`。
5. `POST /exercise-records/{recordId}/submit`：请求只携带 `mediaIds`，服务端要求 1..7 项均属于本人、同 session/record、用途正确且 `AVAILABLE`，并在事务中冻结绑定。

正常打卡当前只接受 `IN_APP_CAMERA`，最多 6 张 IMAGE 和 1 个 VIDEO，提交至少 1 项。上传 URL、storageKey、thumbnailStorageKey、签名 header 和安全扫描诊断不得进入学生/教师业务 projection。

## 7. API 模块

| # | 模块 | 主要 v1 资源/接口 | 角色和边界 |
|---:|---|---|---|
| 0 | Foundation Status | `/health/live`、`/health/ready`、`/system-mode`、`/organizations/current`、`/semesters/current` | 健康/系统模式公开安全投影；组织和当前学期使用 Access Token 与本人组织范围 |
| 1 | Authentication | `/auth/password-login`、`/auth/refresh`、`/auth/logout` | 教师/管理员 seed 密码登录；短 Access + 可轮换 Refresh；TTL/密钥来自配置；学生密码登录不在本轮 |
| 2 | Current User | `GET /me`、`POST /me/email-verification-challenges`、`POST /me/email-verification-challenges/{challengeId}/verify` | 三角色读取本人；首次邮箱绑定验证新邮箱，邮箱换绑同时验证当前和新邮箱 |
| 3 | Students | `GET /students`、`GET/PATCH /students/{studentId}` | 学生本人；教师本人班；管理员本组织治理 |
| 4 | Teachers | `GET /teachers/{teacherId}`、`GET /teachers/{teacherId}/class-sections` | 教师本人或管理员组织范围；学生只经班级投影看公开名称 |
| 5 | Courses | `GET/POST /courses`、`GET/PATCH /courses/{courseId}` | ADR-067 已接受：ADMIN 管本组织目录；TEACHER 只读 ACTIVE Course；STUDENT 读取依赖 ACTIVE Enrollment |
| 6 | Class Sections | `GET/POST /class-sections`、`GET/PATCH /class-sections/{classSectionId}`、close action | TEACHER 仅本人班；ADMIN 本组织只读治理且不代行；STUDENT 读取依赖 ACTIVE Enrollment |
| 7 | Enrollments | 集合/单项读取、manual add、withdraw/remove/restore | STUDENT 本人；TEACHER 本人班；未决 withdraw/rejoin 默认关闭 |
| 8 | QR Course Joining | invite 创建/轮换、预览、join-capability、join | 预览 → 资料校验 → 短期一次性 Join Capability → 原子 Join；Join 不要求 Access Token，本轮不实现完整业务 |
| 9 | Official Roster Imports | UTF-8 CSV 导入、历史、current、单版本读取、rollback | TEACHER 本人班可写；ADMIN 本组织最小只读治理；STUDENT 禁止；原文件 private 且无下载 operation |
| 10 | Roster Alignment | align、结果列表、confirm/resolve/ignore/reopen | TEACHER 仅 `ClassSection.teacherId == principal.teacherId` 的本人班；ADMIN 本组织只读；ADR-057 前 ignore 真实 default deny；分类不可手改 |
| 11 | Exercise Sessions | start、active/read、pause/resume/finish/cancel/reconcile | STUDENT 本人；服务端计时；同人最多一个活动 session |
| 12 | Exercise Records | draft/list/read/update、submit/discard/withdraw | 学生本人写；教师本人班读取/直接审核；无 claim-review、多人领取或管理员代审 |
| 13 | Media Uploads | initiate、confirm、bind、status、access-url | 学生本人上传；教师仅经 Record 审核访问；ADMIN 默认无正文 |
| 14 | Exercise Reviews | history、append decision、reopen、batch | 仅责任 TEACHER；每次追加 ReviewRecord，不覆盖 |
| 15 | Score Rules | 教学班规则列表/创建、读取、publish | 读取按班；ADR-061 固定总门槛 72000 秒，ADR-062 分类配额未决；ADR-018/062/069 前激活默认拒绝 |
| 16 | Student Scores | 本人/班级列表、read、recalculate、publish/open-correction | 学生只读允许投影；正式计算、发布和修正均由 Score Gate/default deny 阻塞 |
| 17 | Score Adjustments | score 下历史与追加调整 | 仅冻结原因 enum；人工调整与归档修正关闭 |
| 18 | Exports | create/status/download-url | 只冻结 transport 与 ExportType；所有执行/任务/链接接口 default deny，不创建假任务 |
| 19 | Audit Logs | list/read | 仅 ADMIN 本组织可读脱敏 projection；TEACHER 不得读取原始 AuditLog；只读且读取也审计 |

## 8. 动作接口合同

下表中的“关闭”表示接口可以出现在合同中，但后端在相关 ADR `ACCEPTED` 前必须稳定拒绝，不表示已经实现。

### 8.1 教学班、入班、名单

| 接口 | 当前 → 目标 | 角色 | 请求体 | 幂等与副作用 | 主要错误 |
|---|---|---|---|---|---|
| `POST /class-sections/{id}/close` | 可写 → 关闭（外部 ClassSection 状态） | TEACHER | `reason, expectedVersion` | 必须幂等；关闭新写、保留历史、审计/通知 | `COURSE_CLASS_SECTION_NOT_WRITABLE`, `CONFLICT_VERSION_MISMATCH` |
| `POST /course-invites/{token}/join-capabilities` | 已验证邀请/资料 → 短期一次性 capability | PUBLIC | `fullName, studentNumber, gender, gradeYear` | 只返回一次明文 capability；数据库只保存不可逆摘要、目标 ClassSection、配置 TTL 与资料摘要 | `COURSE_INVITE_INVALID`, `COURSE_INVITE_EXPIRED`, `COURSE_INVITE_REVOKED`, `USER_PROFILE_INVALID` |
| `POST /course-invites/{token}/join` | 无 Enrollment → ACTIVE；ACTIVE 幂等重试仍 ACTIVE | JOIN_CAPABILITY | 无普通 Access Token；capability 由独立 header 携带 | 单事务消费 capability 并创建/复用 User、StudentProfile、ACTIVE Enrollment、AuthSession；成功原子返回三者，失败无半成品 | `AUTH_REQUIRED`, `COURSE_INVITE_EXPIRED`, `ENROLLMENT_SEMESTER_CONFLICT`, `USER_IDENTITY_CONFLICT` |
| `POST /class-sections/{id}/enrollments` | 不存在 → ACTIVE | TEACHER | `studentId, reason` | 手工来源、通知、审计；唯一关系兜底 | `USER_NOT_FOUND`, `PERMISSION_COURSE_SCOPE_DENIED` |
| `POST /enrollments/{id}/withdraw` | ACTIVE → WITHDRAWN | STUDENT | `reason, expectedVersion` | ADR 未确认时关闭；保留 ID/历史 | `ENROLLMENT_WITHDRAWAL_DISABLED`, `ENROLLMENT_HAS_BLOCKING_WORK` |
| `POST /enrollments/{id}/remove` | ACTIVE → REMOVED | TEACHER | `reason, expectedVersion` | 禁止后续写、通知学生、审计 | `VALIDATION_FIELD_REQUIRED`, `PERMISSION_COURSE_SCOPE_DENIED` |
| `POST /enrollments/{id}/restore` | WITHDRAWN/REMOVED → ACTIVE | TEACHER | `reason, expectedVersion` | 复用 Enrollment；重做学期冲突 | `VALIDATION_FIELD_REQUIRED`, `ENROLLMENT_SEMESTER_CONFLICT` |
| `POST /roster-imports/{id}/rollback` | 当前 VALIDATED 版本 → 指定历史 VALIDATED 版本 | TEACHER | `expectedCurrentRosterImportId, expectedVersion, reason` | 原子切换 current；保留版本号/历史；写审计/Outbox；不自动 align | `ROSTER_IMPORT_NOT_READY`, `CONFLICT_VERSION_MISMATCH` |
| `POST /roster-imports/{id}/align` | 无运行 → 新不可变六分类 Run/Result | TEACHER | `expectedRosterImportVersion` | 后端冻结快照/生成 fingerprint；同输入去重；全成或全不发布；旧结果不覆盖 | `ROSTER_ALIGNMENT_SNAPSHOT_STALE`, `ROSTER_ALIGNMENT_IN_PROGRESS` |
| `POST /roster-alignment-results/{id}/{action}`（action 为 confirm、resolve、ignore 或 reopen） | resolutionStatus 按阶段 3 表转换 | TEACHER | `reason` 或 `resolutionNote + evidenceType + evidenceReferenceId`，均带 `expectedVersion` | 追加处置历史；typed evidence 必须真实同组织；不改算法 status；ADR-057 前 ignore 不执行任何副作用 | `ROSTER_IGNORE_NOT_ALLOWED`, `ROSTER_RESOLUTION_EVIDENCE_REQUIRED`, `CONFLICT_VERSION_MISMATCH` |

### 8.2 Session、Record、Media、Review

| 接口 | 当前 → 目标 | 角色 | 请求体 | 幂等与副作用 | 主要错误 |
|---|---|---|---|---|---|
| `POST /exercise-sessions` | 不存在 → IN_PROGRESS | STUDENT | `enrollmentId, clientObservedAt` | 同键返回原 session；服务端写 startedAt/businessDate | `ENROLLMENT_NOT_ACTIVE`, `COURSE_CHECKIN_WINDOW_CLOSED`, `SESSION_ALREADY_ACTIVE` |
| `POST /exercise-sessions/{id}/pause` | IN_PROGRESS → PAUSED | STUDENT | `expectedVersion, clientObservedAt` | 固化片段；重复返回首次结果 | `PERMISSION_RESOURCE_SCOPE_DENIED`, `SESSION_TRANSITION_NOT_ALLOWED` |
| `POST /exercise-sessions/{id}/resume` | PAUSED → IN_PROGRESS | STUDENT | 同上 | 结束暂停区间；达到封顶不得恢复 | `SESSION_RESUME_WINDOW_EXPIRED`, `SESSION_DURATION_CAP_REACHED` |
| `POST /exercise-sessions/{id}/finish` | IN_PROGRESS/PAUSED → COMPLETED | STUDENT | 同上 | 服务端冻结整数秒；不自动提交 Record | `SESSION_TIMELINE_INVALID`, `CONFLICT_VERSION_MISMATCH` |
| `POST /exercise-sessions/{id}/cancel` | IN_PROGRESS/PAUSED → CANCELLED | STUDENT | `reason, expectedVersion` | 保留可信时长；处理孤立媒体 | `SESSION_ALREADY_USED`, `PERMISSION_RESOURCE_SCOPE_DENIED` |
| `POST /exercise-sessions/{id}/reconcile` | 保持当前或由 SYSTEM 过期 | STUDENT | `expectedVersion, clientEvents[]` | 只接纳可验证事件；不创建平行 session | `SESSION_EVENT_OUT_OF_ORDER`, `SESSION_RECONCILIATION_REQUIRED` |
| `POST /exercise-records` | 无 Record → DRAFT | STUDENT | `sessionId, creditType, sportType, sportName, description?` | sessionId 唯一；注入身份/班级/时长；`GENERAL` 说明必填，`COURSE_RELATED` 可省略/null | `SESSION_NOT_COMPLETED`, `EXERCISE_RECORD_ALREADY_EXISTS_FOR_SESSION`, `VALIDATION_FAILED` |
| `POST /exercise-records/{id}/submit` | DRAFT → SUBMITTED + Review v1 PENDING | STUDENT | `mediaIds, expectedVersion` | 原子冻结、创建 PENDING Review、占用每日提交、通知 | `EXERCISE_RECORD_MEDIA_INCOMPLETE`, `MEDIA_NOT_AVAILABLE`, `EXERCISE_RECORD_DAILY_LIMIT_REACHED` |
| `POST /exercise-records/{id}/discard` | DRAFT → CANCELLED | STUDENT | `reason, expectedVersion` | 不删除事实；安全清理/解绑媒体 | `PERMISSION_RESOURCE_SCOPE_DENIED`, `CONFLICT_STATE_TRANSITION` |
| `POST /exercise-records/{id}/withdraw` | 无转换（V1 关闭） | STUDENT | `reason, expectedVersion` | 在写入前拒绝；不取消、不解绑、不释放每日槽位 | `EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED` |
| `POST /media-uploads` | 不存在 → stable mediaId/PENDING_UPLOAD | STUDENT | MIME/size/duration?/declaredContentSha256?/purpose=EXERCISE_RECORD/source/session | MIME 白名单为 JPEG/PNG、MP4/MOV/3GP/WebM；打卡视频 duration 必填且最多 15 秒；返回同一 mediaId 和短期直传参数；不记录 signed URL；不要求 GPS | `MEDIA_COUNT_LIMIT_EXCEEDED`, `MEDIA_TYPE_NOT_ALLOWED`, `MEDIA_SIZE_EXCEEDED`, `MEDIA_VIDEO_DURATION_EXCEEDED`, `MEDIA_PURPOSE_MISMATCH` |
| `POST /media-uploads/{uploadSessionId}/confirm` | PENDING_UPLOAD → UPLOADED | STUDENT | `etag` | 按原始字节验证 MIME/真实容器/size/SHA-256；视频必须有视频轨、音轨且不超过 15 秒；可识别位置元数据拒绝且不保存；返回申请时同一 mediaId | `MEDIA_UPLOAD_SESSION_EXPIRED`, `MEDIA_OBJECT_NOT_FOUND`, `MEDIA_INTEGRITY_MISMATCH`, `MEDIA_VIDEO_DURATION_EXCEEDED`, `MEDIA_AUDIO_TRACK_REQUIRED`, `MEDIA_LOCATION_METADATA_NOT_ALLOWED` |
| `POST /media/{mediaId}/bind` | UPLOADED → BOUND | STUDENT | `recordId/sessionId, expectedVersion` | 建稳定绑定并触发处理；不可跨人复用 | `MEDIA_BIND_TARGET_INVALID`, `MEDIA_ALREADY_BOUND`, `MEDIA_PURPOSE_MISMATCH` |
| `POST /exercise-records/{id}/reviews` | PENDING → VALID/INVALID；Record SUBMITTED → REVIEWED | TEACHER | `result, reasonCode?, reason?, publicComment?, internalNote?, creditedDurationOverrideSeconds?, expectedReviewVersion, expectedVersion` | 无领取；expectedVersion + expectedReviewVersion + 唯一 reviewVersion + 事务；INVALID 必有 enum code，OTHER 必有 reason；override 非 null 稳定拒绝 | `REVIEW_RESULT_REQUIRED`, `REVIEW_INVALID_REASON_REQUIRED`, `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED`, `CONFLICT_VERSION_MISMATCH` |
| `POST /exercise-records/{id}/reviews/reopen` | VALID/INVALID → PENDING；Record REVIEWED → SUBMITTED | TEACHER | `reason, expectedReviewVersion, expectedVersion` | 事务追加 PENDING、临时移除贡献、触发重算 | `VALIDATION_FIELD_REQUIRED`, `SCORE_LOCKED`, `SCORE_CORRECTION_WINDOW_REQUIRED`, `CONFLICT_VERSION_MISMATCH` |
| `POST /exercise-reviews/batch` | 每项独立转换 | TEACHER | `items[]` 各含版本、结果和幂等键 | 部分成功逐项返回；逐项授权/审计/重算 | `REVIEW_BATCH_ITEM_FAILED` + 单项错误 |

### 8.3 成绩与导出

| 接口 | 当前 → 目标 | 角色 | 请求体 | 幂等与副作用 | 主要错误 |
|---|---|---|---|---|---|
| `POST /score-rules/{id}/publish` | DRAFT → ACTIVE | ADMIN/获批流程 | `expectedVersion, effectiveFrom` | ADR-018/062/069 任一未决时默认拒绝；ADR-061 的 72000 秒总门槛仍生效；旧版本不覆盖 | `SCORE_RULE_ACTIVATION_BLOCKED`, `SCORE_FORMULA_UNCONFIRMED` |
| `POST /student-scores/{id}/recalculate` | NOT_CALCULATED/CALCULATED → 新 CALCULATED 修订 | TEACHER（命令），SYSTEM（执行） | `expectedVersion` | 新 fingerprint/contributions；旧修订保留；ADR-018 前已有成绩的重算稳定拒绝 | `SCORE_RULE_NOT_FOUND`, `SCORE_INPUT_INCOMPLETE`, `SCORE_FORMULA_UNCONFIRMED`, `SCORE_RECALCULATION_POLICY_REQUIRED` |
| `POST /student-scores/{id}/adjustments` | 无转换（Score Gate 关闭） | TEACHER | `previousScore, adjustedScore, reasonCode, reason, expectedVersion` | 仅校验已冻结 ScoreAdjustmentReasonCode 后稳定拒绝；不追加 Adjustment | `SCORE_ADJUSTMENT_NOT_ALLOWED` |
| `POST /student-scores/{id}/publish` | 无转换（Score Gate 关闭） | TEACHER | `expectedVersion` | 稳定拒绝；不创建发布快照/通知 | `SCORE_NOT_PUBLISHABLE` |
| `POST /student-scores/{id}/open-correction` | PUBLISHED → 新 CALCULATED 工作修订 | TEACHER | `reason, expectedVersion` | 保留发布版；ADR-026/修正窗口守卫 | `SCORE_CORRECTION_WINDOW_REQUIRED`, `VALIDATION_FIELD_REQUIRED` |
| `POST /exports` | 无转换（Export Gate 关闭） | TEACHER/ADMIN | `exportType, filters, purpose` | 只接受已冻结四类值后稳定拒绝；不创建任务、对象或下载链接 | `SYSTEM_MODE_UNSUPPORTED` |

## 9. Projection 与敏感字段

- 学生 ExerciseRecord 的 `currentReview` 精确包含 `result/reasonCode/publicComment`；不返回 `ReviewRecord.internalNote`、reason 正文、完整审核历史、媒体 storage keys、密码/验证码/token、教师安全备注或其他学生数据。
- 教师只接收本人教学班的数据；管理员默认只读教学数据，默认不看媒体正文，也不代教师审核/调分。
- 列表、include、搜索、导出和短期媒体 URL 都重复执行相同资源范围检查。
- `accessUrl`、上传 URL、refresh token 和 invite token 是 transport 临时值，不落入核心领域 schema，不进入普通日志。
- OpenAPI 的资源 schema 是允许字段集合，不表示每个角色都得到全部字段；具体响应使用角色 projection。

## 10. 旧接口兼容性清单

| 现有接口 | 新接口 | 影响客户端 | 是否破坏兼容 | 兼容方式 | 迁移阶段 |
|---|---|---|---|---|---|
| `/auth/login`、`/auth/login/email`、`/v1/auth/login/phone` | `/api/v1/auth/password-login`（教师/管理员邮箱）与 `/api/v1/auth/student-sign-in-codes`（学生邮箱 OTP） | Android/Web | 是 | Android 删除手机入口；旧 `PHONE` channel 稳定 422 且不创建 challenge；响应统一 envelope | F1–F6 |
| `/sport/summary` | `/api/v1/student-scores?enrollmentId=...` | Android | 是 | 旧 summary 由 StudentScore/Enrollment projection 生成，不保存第二套汇总 | F1–F6 |
| `/sport/identity` | `/api/v1/me` | Android | 是 | 旧字段 alias 只读；显式返回 User 与 StudentProfile 投影 | F1–F6 |
| `GET/POST /sport/records` | `GET /api/v1/exercise-records` + draft/submit 动作 | Android | 是 | 旧 POST adapter 拆 draft/submit；小时严格转整数秒；新记录一律 PENDING Review | F1–F6 |
| `GET /sport/records/{id}` | `GET /api/v1/exercise-records/{recordId}` | Android | 轻微 | 保留旧读路由，转换统一字段/枚举/envelope | F1–F5 |
| `/student/checkin-time-window` | `GET /api/v1/class-sections/{id}` 的时间窗投影 | Android | 是 | 旧只读 projection；窗口事实只存 ClassSection | F1–F6 |
| `/upload/proof` multipart | `/api/v1/media-uploads` → 对象存储 → confirm/bind | Android | 是 | 旧端点短期代理新五步流或只对旧版本开放；不得直接删除 | F1–F6 |
| `/student/courses` | `/api/v1/class-sections` + Enrollment 筛选 | Android | 是 | 兼容投影把 Course/ClassSection 分离后组装旧 DTO | F1–F6 |
| `GET /v1/course-invites/{code}` | `GET /api/v1/course-invites/{token}/preview` | Android | 是 | gateway alias；旧 code 映射由 Enrollment Gate 的受控邀请服务处理，明文不得落普通日志 | F1–F6 |
| `POST /courses/{courseId}/join` | `POST .../{token}/join-capabilities` 后使用 Join Capability 调 `POST .../{token}/join` | Android | 是 | 兼容层确认旧 courseId 实为 ClassSection；不得在资料校验前签发普通 Access Token | F1–F6 |
| `/student/grades` | `/api/v1/student-scores` | Android | 是 | 未发布字段按角色投影；客户端计算仅作非权威预览 | F1–F6 |
| `/api/v1/teacher/courses/{courseId}/official-roster...` | `/api/v1/class-sections/{id}/roster-imports` | Web 教师 | 是 | 保留 Mock 标识；真实 adapter 在 courseId→classSectionId 映射确认后启用 | F1–F6 |
| `/api/v1/.../roster-reconciliations...` | `/api/v1/roster-imports/{id}/align` 与 `/roster-alignment-results` | Web 教师 | 是 | 映射旧分类枚举；分类与 resolutionStatus 拆分；旧 Mock 不迁生产 | F1–F6 |
| 浏览器 state/localStorage 的审核、调分、发布 | `/api/v1/exercise-records/{id}/reviews`、`/student-scores/...` | Web 教师/管理 | 是 | 不提供假“兼容成功”；切换到真实 API 后才标在线，旧本地数据只作人工迁移输入 | F1–F6 |
| 当前不存在的 Export 后端 | `/api/v1/exports` | Web 教师/管理 | 新增 | 只冻结 ExportType/transport；所有 operation default deny，不得声称任务、文件或恢复能力存在 | 待 Export Gate |

任何旧接口只有在真实网关、服务端路由、客户端最低版本和调用遥测确认归零后，才能在单独破坏性变更中移除。

## 11. OpenAPI 实现阻塞与验收

### 11.1 保守关闭项

| 能力 | 未决依据 | v1 合同中的安全行为 |
|---|---|---|
| 学生退出/重入 | 阶段 3 SM-TBD-01、阶段 5 | endpoint 可描述，默认返回 `ENROLLMENT_WITHDRAWAL_DISABLED` |
| 已提交 Record 撤回 | ADR-020 | endpoint 可描述，默认返回 `EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED` |
| Roster ignore | ADR-057 | endpoint 可描述，但默认返回 `ROSTER_IGNORE_NOT_ALLOWED` 且无副作用 |
| Review 时长覆盖 | ADR-047 | `creditedDurationOverrideSeconds` 必须 null，否则 `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED` |
| 双分类目标/公式/激活审批 | ADR-062、ADR-018、ADR-069（ADR-061 总门槛已接受） | 不写分类配额、不激活规则、不生成虚构正式分数、不发布 |
| 心跳/离线容差 | ADR-021 | 无可信区间不计时，拒绝平行 session |
| 媒体 TTL/扫描/保留 | ADR-023/032 | 私有、未 AVAILABLE 不提交、已绑定证据不物理清理 |
| 归档成绩修正 | ADR-026 | LOCKED 不可变；open-correction 拒绝 |
| QR Join/Export 持久化 | Enrollment Core 已实现；Withdrawal/Rejoin 与 Export Gate 仍关闭 | CourseInvite/JoinCapability 摘要、TTL、一次性消费、原子 Join 与专用重放 escrow 已实现；学生 withdraw/rejoin default deny；Export 仍仅 enum/transport 且所有执行接口未实现 |
| 原始 AuditLog 读取 | 阶段 5 | 仅 ADMIN 本组织脱敏读取；TEACHER 默认 403，且不得以班级范围旁路 |

### 11.2 验收检查

- [x] 所有路径最终解析为 `/api/v1`，只有一个成功 envelope 和一个顶层错误结构。
- [x] 每个 operation 有唯一 `x-access-policy`；PUBLIC、ACCESS_TOKEN 与 JOIN_CAPABILITY 显式区分，所有响应带 requestId。
- [x] 所有列表使用 cursor/limit/sort/filter/search 同一语义。
- [x] 所有创建/动作要求 Idempotency-Key；可变资源动作携带 expectedVersion。
- [x] 所有动作的状态、角色、副作用和主要错误与阶段 3–5 一致；不存在 claim-review 或 UNDER_REVIEW 写入合同。
- [x] 所有业务字段来自阶段 2；Join/Export 等 contract-only 边界与上传会话边界均显式标注对应 Gate。
- [x] 媒体严格使用申请、对象存储直传、确认、mediaId、绑定/提交五步流。
- [x] 每个 operation 有稳定 operationId、成功响应和至少一个明确错误响应。
- [x] OpenAPI YAML 可解析，所有本地 `$ref` 可解析，operationId 不重复。
- [x] 旧路由只通过 adapter/投影兼容，不直接删除仍在使用的接口。

## 12. Stage 18 Score API 冻结（2026-08-04）

- ScoreRule 采用 `create -> submit-approval -> two distinct admin approve | reject`，不保留语义重叠的单步 publish/activate 入口。
- Score mutation 均要求 `Idempotency-Key` 和 `expectedVersion`；actor、组织、教师、学生、审批人、指纹、贡献、计算/发布时间由服务端解析或生成。
- `createScoreAdjustment` 只创建 `PENDING_APPROVAL`，approve/reject 是独立 operation。创建请求不得直接改变 StudentScore。
- Score 成功响应沿用 `data/meta`，错误沿用稳定 envelope。永久禁止的归档修正必须命中真实路由并返回 `SCORE_CORRECTION_NOT_ALLOWED`，通用 404 不算实现。
- STUDENT 仅访问自己的安全投影；TEACHER 仅访问本人 ClassSection；ADMIN 可治理规则与 Adjustment，并只读查看本组织成绩。
