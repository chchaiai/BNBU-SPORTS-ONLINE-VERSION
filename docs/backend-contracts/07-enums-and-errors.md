# 统一枚举、错误码与客户端国际化边界

> 阶段：7（契约设计，不是客户端或数据库实施）
> 基线：`02-data-dictionary.md`、`03-state-machines.md`、`04-business-rules.md`、`05-permission-matrix.md`
> 适用范围：Android、未来 iOS、未来 Web 学生端、Web 教师端、Web 管理端、统一后端与数据库
> 限制：本阶段冻结枚举、错误码、错误响应与 i18n 边界，并同步阶段 3–6 及 OpenAPI 的契约引用；不修改客户端代码、数据库 schema 或共享常量模块。

## 1. 规范性约束

1. 新增枚举优先使用稳定英文 `UPPER_SNAKE_CASE`；数据库保存同一稳定语义，不保存中文展示文本。第 3.1 节登记的现有小写代码和数值选项保持原 wire value，不能为格式统一破坏已实现接口。
2. API JSON 字段仍使用 `camelCase`，数据库列使用 `snake_case`。枚举值的大小写不随字段命名风格变化。
3. 客户端只根据枚举值或错误 `code` 分支；不得匹配中文/英文 `message`、按钮文案或 HTTP reason phrase。
4. 客户端 i18n key 是展示合同，不是 wire value。服务端可提供安全默认 `message`，客户端优先用本地资源按 key 展示。
5. 新写接口只接受本文“当前枚举”中的值。旧值仅由兼容 adapter 读取，并按第 5 节映射；不得重新写回数据库。
6. 已发布枚举值和错误码不可原地改名或复用为新含义。确需替换时增加新值/新码、标记旧值 deprecated、保留调用遥测和迁移窗口。
7. 未知安全相关枚举 fail closed：服务端请求返回 `VALIDATION_ENUM_UNSUPPORTED`；客户端遇到未知响应值时禁用相应写操作、显示升级提示并上报遥测。
8. “终态”只描述该枚举所属生命周期。`不适用` 表示分类/来源/事件枚举，不存在状态转换语义。
9. 本文件未冻结的候选枚举不得进入新 OpenAPI、数据库约束或客户端共享常量；先补业务决策或 ADR。

## 2. 国际化键约定

| 类型 | 格式 | 示例 | 缺失时行为 |
|---|---|---|---|
| 枚举标签 | `enum.<enumType>.<lowerCamelValue>` | `enum.enrollmentStatus.active` | 显示安全通用标签，不直接展示原始数据库值；记录缺失遥测 |
| 错误提示 | `error.<category>.<lowerCamelCondition>` | `error.auth.tokenExpired` | 使用响应中的安全默认 `message`；不得据此执行业务逻辑 |
| 字段校验 | `validation.<resource>.<field>.<rule>` | `validation.exerciseRecord.description.required` | 聚焦对应字段，并使用 `details.fieldErrors` |
| 审计动作 | `enum.auditActionType.<lowerCamelValue>` | `enum.auditActionType.reviewResultChanged` | 管理端显示通用“未知操作”，不丢失原 action value |

服务端不根据客户端 locale 改变 `code`、枚举值或 `details` 结构。locale 只影响 `message`；日志和指标按稳定 code 聚合。

## 3. 当前核心枚举

### 3.1 UserRole

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `UserRole` | `STUDENT` | 学生角色，只能操作本人和本人入班关系范围 | 不适用 | `enum.userRole.student` | 否 |
| `UserRole` | `TEACHER` | 教师角色，仍须校验明确分配的教学班 | 不适用 | `enum.userRole.teacher` | 否 |
| `UserRole` | `ADMIN` | 组织管理员，不等于跨组织 root，也不默认代行教师 | 不适用 | `enum.userRole.admin` | 否 |

### 3.2 UserStatus

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `UserStatus` | `PENDING_CONTACT_BINDING` | 新学生尚未验证邮箱；仅允许本人信息、邮箱验证、刷新和退出 | 否；邮箱验证成功后进入 `ACTIVE` | `enum.userStatus.pendingContactBinding` | 否 |
| `UserStatus` | `ACTIVE` | 账户可按角色和资源范围建立/使用会话 | 否 | `enum.userStatus.active` | 否 |
| `UserStatus` | `LOCKED` | 因安全策略临时锁定；不得建立新会话 | 否 | `enum.userStatus.locked` | 否 |
| `UserStatus` | `DISABLED` | 组织治理流程已禁用账户，所有既有会话应撤销 | 静止态；受控恢复需独立治理流程 | `enum.userStatus.disabled` | 否 |

### 3.3 Gender

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `Gender` | `MALE` | 男性 | 不适用 | `enum.gender.male` | 否 |
| `Gender` | `FEMALE` | 女性 | 不适用 | `enum.gender.female` | 否 |
| `Gender` | `OTHER` | 其他经业务允许的性别值 | 不适用 | `enum.gender.other` | 否 |

缺失值使用字段的 `null` 语义，不新增 `UNKNOWN` 来掩盖未采集、未核验或迁移失败。

### 3.3a CourseJoinGender

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `CourseJoinGender` | `MALE` | 扫码加入课程时选择男性 | 不适用 | `enum.courseJoinGender.male` | 否 |
| `CourseJoinGender` | `FEMALE` | 扫码加入课程时选择女性 | 不适用 | `enum.courseJoinGender.female` | 否 |

该专用请求枚举只收窄二维码入班资料，不替代全局 `Gender`；历史资料和官方名单中的 `Gender.OTHER` 继续有效。

### 3.4 EnrollmentSource

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `EnrollmentSource` | `OFFICIAL_IMPORT` | 由经核验的官方名单导入建立 | 不适用 | `enum.enrollmentSource.officialImport` | 否 |
| `EnrollmentSource` | `QR_CODE` | 学生通过有效课程二维码/邀请直接加入 | 不适用 | `enum.enrollmentSource.qrCode` | 否 |
| `EnrollmentSource` | `MANUAL` | 任课教师在授权教学班内手动添加 | 不适用 | `enum.enrollmentSource.manual` | 否 |
| `EnrollmentSource` | `SYSTEM_SYNC` | 受信学校系统同步建立 | 不适用 | `enum.enrollmentSource.systemSync` | 否 |

### 3.5 EnrollmentStatus

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `EnrollmentStatus` | `ACTIVE` | 当前有效入班关系 | 否 | `enum.enrollmentStatus.active` | 否 |
| `EnrollmentStatus` | `WITHDRAWN` | 学生主动退出；自助退出/重入仍受 ADR-054 控制 | 否，可按获批规则重入/恢复 | `enum.enrollmentStatus.withdrawn` | 否 |
| `EnrollmentStatus` | `REMOVED` | 任课教师移出；历史事实保留 | 否，可由任课教师显式恢复 | `enum.enrollmentStatus.removed` | 否 |

正常加入直接进入当前有效关系，不经过申请审批中间态。

### 3.6 RosterAlignmentStatus

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `RosterAlignmentStatus` | `MATCHED` | 官方名单条目和平台 Enrollment 唯一一致 | 是（该 comparisonRevision） | `enum.rosterAlignmentStatus.matched` | 否 |
| `RosterAlignmentStatus` | `MISSING_IN_PLATFORM` | 官方名单有该学生，平台目标教学班没有对应 Enrollment | 是（该 comparisonRevision） | `enum.rosterAlignmentStatus.missingInPlatform` | 否 |
| `RosterAlignmentStatus` | `EXTRA_IN_PLATFORM` | 平台目标教学班有 Enrollment，官方名单没有该学生 | 是（该 comparisonRevision） | `enum.rosterAlignmentStatus.extraInPlatform` | 否 |
| `RosterAlignmentStatus` | `WRONG_COURSE` | 学生可唯一匹配，但平台教学班与官方归属不同 | 是（该 comparisonRevision） | `enum.rosterAlignmentStatus.wrongCourse` | 否 |
| `RosterAlignmentStatus` | `IDENTITY_CONFLICT` | 学号匹配但受核对身份字段冲突，或仅有候选匹配 | 是（该 comparisonRevision） | `enum.rosterAlignmentStatus.identityConflict` | 否 |
| `RosterAlignmentStatus` | `DUPLICATED` | 官方或平台快照存在无法唯一匹配的重复项 | 是（该 comparisonRevision） | `enum.rosterAlignmentStatus.duplicated` | 否 |

### 3.7 ExerciseSessionStatus

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `ExerciseSessionStatus` | `IN_PROGRESS` | 服务端正在累计有效运动区间 | 否 | `enum.exerciseSessionStatus.inProgress` | 否 |
| `ExerciseSessionStatus` | `PAUSED` | 会话暂停，暂停区间不计入有效时长 | 否 | `enum.exerciseSessionStatus.paused` | 否 |
| `ExerciseSessionStatus` | `COMPLETED` | 手动结束或达到 7200 秒封顶后完成 | 是 | `enum.exerciseSessionStatus.completed` | 否 |
| `ExerciseSessionStatus` | `CANCELLED` | 学生取消且未形成已提交 Record | 是 | `enum.exerciseSessionStatus.cancelled` | 否 |
| `ExerciseSessionStatus` | `EXPIRED` | 因恢复/超时策略失效 | 是 | `enum.exerciseSessionStatus.expired` | 否 |

### 3.8 ExerciseRecordStatus

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `ExerciseRecordStatus` | `DRAFT` | 已关联完成会话、尚未提交，可编辑允许字段和绑定媒体 | 否 | `enum.exerciseRecordStatus.draft` | 否 |
| `ExerciseRecordStatus` | `SUBMITTED` | 学生已提交，等待任课教师处理 | 否 | `enum.exerciseRecordStatus.submitted` | 否 |
| `ExerciseRecordStatus` | `REVIEWED` | 当前 ReviewResult 已为 `VALID` 或 `INVALID` | 否，可显式重开审核 | `enum.exerciseRecordStatus.reviewed` | 否 |
| `ExerciseRecordStatus` | `CANCELLED` | 草稿放弃或按获批规则撤回；原事实不删除 | 是 | `enum.exerciseRecordStatus.cancelled` | 否 |

ADR-055 已确认：v1 可写枚举只包含下表所列值，不提供补材料状态或补材料转换。

### 3.9 ReviewResult

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `ReviewResult` | `PENDING` | 尚无最终裁决，或旧裁决已显式重开 | 否 | `enum.reviewResult.pending` | 否 |
| `ReviewResult` | `VALID` | 任课教师确认记录有效；按当前基线沿用 Record 折算秒数 | 否，可追加 PENDING 版本重开 | `enum.reviewResult.valid` | 否 |
| `ReviewResult` | `INVALID` | 任课教师确认记录无效，贡献 0 秒 | 否，可追加 PENDING 版本重开 | `enum.reviewResult.invalid` | 否 |

### 3.10 MediaType

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `MediaType` | `IMAGE` | 图片凭证 | 不适用 | `enum.mediaType.image` | 否 |
| `MediaType` | `VIDEO` | 视频凭证 | 不适用 | `enum.mediaType.video` | 否 |
| `MediaType` | `DOCUMENT` | PDF 免测证明文件 | 不适用 | `enum.mediaType.document` | 否 |

### 3.11 MediaUploadStatus

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `MediaUploadStatus` | `PENDING_UPLOAD` | 上传会话已创建，等待上传和确认 | 否 | `enum.mediaUploadStatus.pendingUpload` | 否 |
| `MediaUploadStatus` | `UPLOADED` | 对象存在且完成最小完整性确认，尚未绑定 | 否 | `enum.mediaUploadStatus.uploaded` | 否 |
| `MediaUploadStatus` | `BOUND` | 已确认与目标 session/record 的业务绑定 | 否 | `enum.mediaUploadStatus.bound` | 否 |
| `MediaUploadStatus` | `PROCESSING` | 正在扫描、签名校验、转码或生成派生资源 | 否 | `enum.mediaUploadStatus.processing` | 否 |
| `MediaUploadStatus` | `AVAILABLE` | 必需处理均成功，可按父资源授权读取和提交 | 否，可按保留策略删除 | `enum.mediaUploadStatus.available` | 否 |
| `MediaUploadStatus` | `FAILED` | 上传确认或处理失败，具有机器可读失败原因 | 否；仅可重试失败允许恢复 | `enum.mediaUploadStatus.failed` | 否 |
| `MediaUploadStatus` | `DELETED` | 逻辑删除完成，物理清理可由后台重试 | 是 | `enum.mediaUploadStatus.deleted` | 否 |

ADR-058 已确认：ExerciseRecord 提交前，所有必需媒体必须为 `AVAILABLE`。

### 3.12 CaptureSource

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `CaptureSource` | `IN_APP_CAMERA` | 由受控 App 内相机采集；v1 正常打卡唯一允许来源 | 不适用 | `enum.captureSource.inAppCamera` | 否 |
| `CaptureSource` | `FILE_PICKER` | 由系统文件/相册选择器选择；仅供明确批准的非打卡用途 | 不适用 | `enum.captureSource.filePicker` | 否 |
| `CaptureSource` | `SYSTEM_IMPORT` | 由受信迁移/系统导入产生，不得冒充学生现场拍摄 | 不适用 | `enum.captureSource.systemImport` | 否 |

枚举存在不等于用途获授权；后端必须联合校验 `businessPurpose + captureSource + mediaType`。

### 3.13 ScoreStatus

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `ScoreStatus` | `NOT_CALCULATED` | 尚无完整、适用规则下的计算结果 | 否 | `enum.scoreStatus.notCalculated` | 否 |
| `ScoreStatus` | `CALCULATED` | 后端已生成未发布计算修订 | 否 | `enum.scoreStatus.calculated` | 否 |
| `ScoreStatus` | `ADJUSTED` | 未发布工作修订已存在可追溯人工调整 | 否 | `enum.scoreStatus.adjusted` | 否 |
| `ScoreStatus` | `PUBLISHED` | 指定修订已发布给学生 | 否；只能保留旧发布修订并创建新工作修订 | `enum.scoreStatus.published` | 否 |
| `ScoreStatus` | `LOCKED` | 已发布修订因归档/治理冻结 | 是（该修订） | `enum.scoreStatus.locked` | 否 |

### 3.13a Stage 18 Score 枚举

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `QualificationStatus` | `NOT_QUALIFIED` | 有效总秒数小于 72000 | 否 | `enum.qualificationStatus.notQualified` | 否 |
| `QualificationStatus` | `QUALIFIED` | 有效总秒数达到 72000 | 是（本修订） | `enum.qualificationStatus.qualified` | 否 |
| `ScoreRuleStatus` | `DRAFT` | 不可用于计算的不可变草稿 | 否 | `enum.scoreRuleStatus.draft` | 否 |
| `ScoreRuleStatus` | `PENDING_APPROVAL` | 等待两名合格 ADMIN 批准 | 否 | `enum.scoreRuleStatus.pendingApproval` | 否 |
| `ScoreRuleStatus` | `ACTIVE` | 当前 ClassSection 正式规则 | 否 | `enum.scoreRuleStatus.active` | 否 |
| `ScoreRuleStatus` | `REJECTED` | 审批被拒绝 | 是 | `enum.scoreRuleStatus.rejected` | 否 |
| `ScoreRuleStatus` | `SUPERSEDED` | 被新 ACTIVE 规则取代 | 是 | `enum.scoreRuleStatus.superseded` | 否 |
| `ScoreAdjustmentType` | `FINAL_SCORE_DELTA` | 在当前最终分数上增减 | 不适用 | `enum.scoreAdjustmentType.finalScoreDelta` | 否 |
| `ScoreAdjustmentType` | `FINAL_SCORE_REPLACEMENT` | 用批准值替换最终分数 | 不适用 | `enum.scoreAdjustmentType.finalScoreReplacement` | 否 |
| `ScoreAdjustmentType` | `CALCULATION_CORRECTION` | 用批准值修正规则应用错误 | 不适用 | `enum.scoreAdjustmentType.calculationCorrection` | 否 |
| `ScoreAdjustmentStatus` | `PENDING_APPROVAL` | 等待 ADMIN 裁决 | 否 | `enum.scoreAdjustmentStatus.pendingApproval` | 否 |
| `ScoreAdjustmentStatus` | `APPROVED` | 已批准并生成 working revision | 是 | `enum.scoreAdjustmentStatus.approved` | 否 |
| `ScoreAdjustmentStatus` | `REJECTED` | 已拒绝且不生成修订 | 是 | `enum.scoreAdjustmentStatus.rejected` | 否 |

### 3.14 AuditActionType

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `AuditActionType` | `AUTHENTICATION_SUCCEEDED` | 认证成功 | 不适用（事件） | `enum.auditActionType.authenticationSucceeded` | 否 |
| `AuditActionType` | `AUTHENTICATION_FAILED` | 认证失败安全摘要 | 不适用（事件） | `enum.auditActionType.authenticationFailed` | 否 |
| `AuditActionType` | `AUTH_SESSION_REVOKED` | 会话被退出、禁用或安全流程撤销 | 不适用（事件） | `enum.auditActionType.authSessionRevoked` | 否 |
| `AuditActionType` | `USER_PROFILE_UPDATED` | 用户/Profile 白名单字段更新 | 不适用（事件） | `enum.auditActionType.userProfileUpdated` | 否 |
| `AuditActionType` | `USER_STATUS_CHANGED` | 账户状态发生治理变更 | 不适用（事件） | `enum.auditActionType.userStatusChanged` | 否 |
| `AuditActionType` | `COURSE_CREATED` | 课程定义创建 | 不适用（事件） | `enum.auditActionType.courseCreated` | 否 |
| `AuditActionType` | `COURSE_UPDATED` | 课程定义字段更新 | 不适用（事件） | `enum.auditActionType.courseUpdated` | 否 |
| `AuditActionType` | `COURSE_STATUS_CHANGED` | 课程启用状态变化 | 不适用（事件） | `enum.auditActionType.courseStatusChanged` | 否 |
| `AuditActionType` | `CLASS_SECTION_CREATED` | 教学班创建 | 不适用（事件） | `enum.auditActionType.classSectionCreated` | 否 |
| `AuditActionType` | `CLASS_SECTION_UPDATED` | 教学班配置更新 | 不适用（事件） | `enum.auditActionType.classSectionUpdated` | 否 |
| `AuditActionType` | `CLASS_SECTION_CLOSED` | 教学班关闭 | 不适用（事件） | `enum.auditActionType.classSectionClosed` | 否 |
| `AuditActionType` | `COURSE_INVITE_CHANGED` | 课程邀请生成、轮换或撤销 | 不适用（事件） | `enum.auditActionType.courseInviteChanged` | 否 |
| `AuditActionType` | `ENROLLMENT_CREATED` | 入班关系创建 | 不适用（事件） | `enum.auditActionType.enrollmentCreated` | 否 |
| `AuditActionType` | `ENROLLMENT_STATUS_CHANGED` | 入班关系退出、移出或恢复 | 不适用（事件） | `enum.auditActionType.enrollmentStatusChanged` | 否 |
| `AuditActionType` | `ROSTER_IMPORTED` | 官方名单版本导入 | 不适用（事件） | `enum.auditActionType.rosterImported` | 否 |
| `AuditActionType` | `ROSTER_ALIGNED` | 名单对齐修订生成 | 不适用（事件） | `enum.auditActionType.rosterAligned` | 否 |
| `AuditActionType` | `ROSTER_RESOLUTION_CHANGED` | 名单异常处置状态改变 | 不适用（事件） | `enum.auditActionType.rosterResolutionChanged` | 否 |
| `AuditActionType` | `ROSTER_VERSION_ROLLED_BACK` | 当前名单指针回滚/切换 | 不适用（事件） | `enum.auditActionType.rosterVersionRolledBack` | 否 |
| `AuditActionType` | `EXERCISE_SESSION_STARTED` | 运动会话开始 | 不适用（事件） | `enum.auditActionType.exerciseSessionStarted` | 否 |
| `AuditActionType` | `EXERCISE_SESSION_PAUSED` | 运动会话暂停 | 不适用（事件） | `enum.auditActionType.exerciseSessionPaused` | 否 |
| `AuditActionType` | `EXERCISE_SESSION_RESUMED` | 运动会话恢复 | 不适用（事件） | `enum.auditActionType.exerciseSessionResumed` | 否 |
| `AuditActionType` | `EXERCISE_SESSION_COMPLETED` | 运动会话完成或达到封顶 | 不适用（事件） | `enum.auditActionType.exerciseSessionCompleted` | 否 |
| `AuditActionType` | `EXERCISE_SESSION_CANCELLED` | 运动会话取消 | 不适用（事件） | `enum.auditActionType.exerciseSessionCancelled` | 否 |
| `AuditActionType` | `EXERCISE_SESSION_RECONCILED` | 运动会话进行保守同步 | 不适用（事件） | `enum.auditActionType.exerciseSessionReconciled` | 否 |
| `AuditActionType` | `EXERCISE_SESSION_ENDED` | 会话完成、取消或过期 | 不适用（事件） | `enum.auditActionType.exerciseSessionEnded` | 否 |
| `AuditActionType` | `EXERCISE_RECORD_DRAFT_CREATED` | 学生创建打卡草稿 | 不适用（事件） | `enum.auditActionType.exerciseRecordDraftCreated` | 否 |
| `AuditActionType` | `EXERCISE_RECORD_DRAFT_UPDATED` | 学生更新打卡草稿 | 不适用（事件） | `enum.auditActionType.exerciseRecordDraftUpdated` | 否 |
| `AuditActionType` | `EXERCISE_RECORD_SUBMITTED` | 打卡记录正式提交 | 不适用（事件） | `enum.auditActionType.exerciseRecordSubmitted` | 否 |
| `AuditActionType` | `EXERCISE_RECORD_DISCARDED` | 学生放弃未提交草稿 | 不适用（事件） | `enum.auditActionType.exerciseRecordDiscarded` | 否 |
| `AuditActionType` | `EXERCISE_RECORD_WITHDRAWN` | 打卡记录按获批规则撤回 | 不适用（事件） | `enum.auditActionType.exerciseRecordWithdrawn` | 否 |
| `AuditActionType` | `MEDIA_BOUND` | 媒体与业务父对象绑定 | 不适用（事件） | `enum.auditActionType.mediaBound` | 否 |
| `AuditActionType` | `MEDIA_DELETED` | 媒体被授权删除/清理 | 不适用（事件） | `enum.auditActionType.mediaDeleted` | 否 |
| `AuditActionType` | `MEDIA_ACCESSED` | 高敏媒体原件被授权读取 | 不适用（事件） | `enum.auditActionType.mediaAccessed` | 否 |
| `AuditActionType` | `REVIEW_RESULT_CHANGED` | 追加 ReviewRecord 使当前审核结果变化 | 不适用（事件） | `enum.auditActionType.reviewResultChanged` | 否 |
| `AuditActionType` | `SCORE_RULE_CHANGED` | ScoreRule 新建、激活或退役 | 不适用（事件） | `enum.auditActionType.scoreRuleChanged` | 否 |
| `AuditActionType` | `SCORE_RECALCULATED` | StudentScore 生成新计算修订 | 不适用（事件） | `enum.auditActionType.scoreRecalculated` | 否 |
| `AuditActionType` | `SCORE_ADJUSTED` | 追加人工成绩调整 | 不适用（事件） | `enum.auditActionType.scoreAdjusted` | 否 |
| `AuditActionType` | `SCORE_PUBLISHED` | 成绩修订发布 | 不适用（事件） | `enum.auditActionType.scorePublished` | 否 |
| `AuditActionType` | `SCORE_LOCKED` | 已发布成绩修订锁定 | 不适用（事件） | `enum.auditActionType.scoreLocked` | 否 |
| `AuditActionType` | `PERMISSION_CHANGED` | 教师教学班权限或有效授权变化 | 不适用（事件） | `enum.auditActionType.permissionChanged` | 否 |
| `AuditActionType` | `SYSTEM_MODE_CHANGED` | 系统模式变更 | 不适用（事件） | `enum.auditActionType.systemModeChanged` | 否 |
| `AuditActionType` | `DATA_EXPORTED` | 名单、成绩或审计数据导出 | 不适用（事件） | `enum.auditActionType.dataExported` | 否 |
| `AuditActionType` | `AUDIT_LOG_READ` | 管理员读取组织范围内的脱敏 AuditLog 投影 | 不适用（事件） | `enum.auditActionType.auditLogRead` | 否 |

## 4. 支持枚举

这些枚举在 02–05 中已有足够语义证据，随核心枚举一并冻结。

| 枚举类型 | 枚举值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `SemesterTermCode` | `FIRST` | 第一学期 | 不适用 | `enum.semesterTermCode.first` | 否 |
| `SemesterTermCode` | `SECOND` | 第二学期 | 不适用 | `enum.semesterTermCode.second` | 否 |
| `SemesterTermCode` | `SUMMER` | 夏季学期 | 不适用 | `enum.semesterTermCode.summer` | 否 |
| `SemesterStatus` | `UPCOMING` | 尚未成为当前学期 | 否 | `enum.semesterStatus.upcoming` | 否 |
| `SemesterStatus` | `CURRENT` | 组织当前学期 | 否 | `enum.semesterStatus.current` | 否 |
| `SemesterStatus` | `ARCHIVED` | 学期已归档，默认只读 | 是 | `enum.semesterStatus.archived` | 否 |
| `CourseStatus` | `ACTIVE` | 课程目录可用于创建新的 ClassSection | 否 | `enum.courseStatus.active` | 否 |
| `CourseStatus` | `INACTIVE` | 课程目录已停用；历史 ClassSection 仍可读但不可基于它新开班 | 是（目录可用性） | `enum.courseStatus.inactive` | 否 |
| `ClassSectionStatus` | `UPCOMING` | 教学班尚未开放日常业务 | 否 | `enum.classSectionStatus.upcoming` | 否 |
| `ClassSectionStatus` | `ACTIVE` | 教学班处于可按配置开展业务的阶段 | 否 | `enum.classSectionStatus.active` | 否 |
| `ClassSectionStatus` | `CLOSED` | 教师已关闭教学班，默认拒绝业务写 | 否；归档动作仍可发生 | `enum.classSectionStatus.closed` | 否 |
| `ClassSectionStatus` | `ARCHIVED` | 教学班已归档，只读 | 是 | `enum.classSectionStatus.archived` | 否 |
| `CheckInWindowMode` | `AVAILABLE` | 使用配置的日期/每日时间窗口判断 | 不适用 | `enum.checkInWindowMode.available` | 否 |
| `CheckInWindowMode` | `UNAVAILABLE` | 禁止创建新运动会话/提交正式记录 | 不适用 | `enum.checkInWindowMode.unavailable` | 否 |
| `CreditType` | `COURSE_RELATED` | 课程相关运动贡献分类 | 不适用 | `enum.creditType.courseRelated` | 否 |
| `CreditType` | `GENERAL` | 其他一般运动贡献分类 | 不适用 | `enum.creditType.general` | 否 |
| `RosterImportSource` | `FILE` | 教师上传文件导入 | 不适用 | `enum.rosterImportSource.file` | 否 |
| `RosterImportSource` | `OFFICIAL_API` | 受信教务/学校 API 导入 | 不适用 | `enum.rosterImportSource.officialApi` | 否 |
| `RosterFileFormat` | `CSV` | V1 严格 UTF-8 CSV（允许一个 BOM）；`.csv` + `text/csv` + 文本内容联合校验 | 不适用 | `enum.rosterFileFormat.csv` | 否 |
| `RosterFileFormat` | `XLSX` | 直接读取电子表格名单，原件及行校验结果保留；不转图片做 OCR | 不适用 | `enum.rosterFileFormat.xlsx` | 否 |
| `RosterImportStatus` | `RECEIVED` | 文件/API 数据已安全接收，等待结构校验 | 否 | `enum.rosterImportStatus.received` | 否 |
| `RosterImportStatus` | `VALIDATING` | 正在解析和校验 | 否 | `enum.rosterImportStatus.validating` | 否 |
| `RosterImportStatus` | `VALIDATED` | 该导入版本完成结构校验，可用于对齐 | 是（该导入版本） | `enum.rosterImportStatus.validated` | 否 |
| `RosterImportStatus` | `FAILED` | 该导入版本校验失败；修复后应创建新版本/重试任务 | 是（该尝试） | `enum.rosterImportStatus.failed` | 否 |
| `RosterRowValidationStatus` | `VALID` | 源行结构有效且非重复 | 是（该导入版本） | `enum.rosterRowValidationStatus.valid` | 否 |
| `RosterRowValidationStatus` | `INVALID` | 源行结构或字段校验失败 | 是（该导入版本） | `enum.rosterRowValidationStatus.invalid` | 否 |
| `RosterRowValidationStatus` | `DUPLICATED` | 同一导入中该标准化学号重复 | 是（该导入版本） | `enum.rosterRowValidationStatus.duplicated` | 否 |
| `RosterResolutionStatus` | `PENDING` | 异常尚未确认/处置 | 否 | `enum.rosterResolutionStatus.pending` | 否 |
| `RosterResolutionStatus` | `CONFIRMED` | 教师确认异常真实但尚未修复 | 否 | `enum.rosterResolutionStatus.confirmed` | 否 |
| `RosterResolutionStatus` | `RESOLVED` | 有可追溯证据表明异常已解决 | 否，可重新打开 | `enum.rosterResolutionStatus.resolved` | 否 |
| `RosterResolutionStatus` | `IGNORED` | 按获批策略将异常作为例外；ADR-057 前不得写入 | 否，可重新打开 | `enum.rosterResolutionStatus.ignored` | 否 |
| `RosterAlignmentRunStatus` | `RUNNING` | 已冻结输入并正在生成不可变结果 | 否 | `enum.rosterAlignmentRunStatus.running` | 否 |
| `RosterAlignmentRunStatus` | `COMPLETED` | 全部 Snapshot 与 Result 已原子发布 | 是 | `enum.rosterAlignmentRunStatus.completed` | 否 |
| `RosterAlignmentRunStatus` | `FAILED` | 运行失败且未发布部分结果 | 是 | `enum.rosterAlignmentRunStatus.failed` | 否 |
| `RosterResolutionAction` | `CONFIRM` | 确认异常真实但尚未修复 | 不适用（事件） | `enum.rosterResolutionAction.confirm` | 否 |
| `RosterResolutionAction` | `RESOLVE` | 使用已验证证据标记当前处置投影为已解决 | 不适用（事件） | `enum.rosterResolutionAction.resolve` | 否 |
| `RosterResolutionAction` | `REOPEN` | 将可处置的 RESOLVED/历史 IGNORED 投影重开为 PENDING | 不适用（事件） | `enum.rosterResolutionAction.reopen` | 否 |
| `RosterResolutionEvidenceType` | `NEW_ALIGNMENT_RESULT` | 同组织、同 subject 的更新对齐结果 | 不适用 | `enum.rosterResolutionEvidenceType.newAlignmentResult` | 否 |
| `RosterResolutionEvidenceType` | `ENROLLMENT_STATUS_EVENT` | 同组织、相关学生的真实 EnrollmentStatusEvent | 不适用 | `enum.rosterResolutionEvidenceType.enrollmentStatusEvent` | 否 |
| `RosterResolutionEvidenceType` | `OFFICIAL_ROSTER_VERSION` | 同教学班的真实后续官方名单版本 | 不适用 | `enum.rosterResolutionEvidenceType.officialRosterVersion` | 否 |
| `RosterDifferenceField` | `FULL_NAME` | 官方姓名与平台 Profile 姓名快照存在差异 | 不适用 | `enum.rosterDifferenceField.fullName` | 否 |
| `RosterDifferenceField` | `GENDER` | 官方性别与平台 Profile 性别快照存在差异 | 不适用 | `enum.rosterDifferenceField.gender` | 否 |
| `RosterDifferenceField` | `GRADE_YEAR` | 官方年级与平台 Profile 年级快照存在差异 | 不适用 | `enum.rosterDifferenceField.gradeYear` | 否 |
| `RosterDifferenceField` | `CLASS_SECTION` | 同学期唯一 ACTIVE Enrollment 位于其他教学班 | 不适用 | `enum.rosterDifferenceField.classSection` | 否 |
| `SessionEndReason` | `USER_COMPLETED` | 学生主动结束 | 不适用 | `enum.sessionEndReason.userCompleted` | 否 |
| `SessionEndReason` | `DURATION_LIMIT_REACHED` | 服务端有效时长达到 7200 秒封顶 | 不适用 | `enum.sessionEndReason.durationLimitReached` | 否 |
| `SessionEndReason` | `USER_CANCELLED` | 学生取消会话 | 不适用 | `enum.sessionEndReason.userCancelled` | 否 |
| `SessionEndReason` | `SESSION_EXPIRED` | 后端恢复/超时策略使会话过期 | 不适用 | `enum.sessionEndReason.sessionExpired` | 否 |
| `MediaBusinessPurpose` | `EXERCISE_RECORD` | 体育打卡凭证 | 不适用 | `enum.mediaBusinessPurpose.exerciseRecord` | 否 |
| `MediaBusinessPurpose` | `EXEMPTION_APPLICATION` | 免测申请私有材料 | 不适用 | `enum.mediaBusinessPurpose.exemptionApplication` | 否 |
| `ReviewReasonCode` | `INSUFFICIENT_EVIDENCE` | 凭证不足以支持有效裁决 | 不适用 | `enum.reviewReasonCode.insufficientEvidence` | 否 |
| `ReviewReasonCode` | `INVALID_MEDIA` | 媒体无效、损坏或不符合凭证要求 | 不适用 | `enum.reviewReasonCode.invalidMedia` | 否 |
| `ReviewReasonCode` | `DURATION_INCONSISTENT` | 凭证与服务端时长事实不一致 | 不适用 | `enum.reviewReasonCode.durationInconsistent` | 否 |
| `ReviewReasonCode` | `IDENTITY_MISMATCH` | 凭证中的主体与学生身份不一致 | 不适用 | `enum.reviewReasonCode.identityMismatch` | 否 |
| `ReviewReasonCode` | `DUPLICATE_SUBMISSION` | 与另一正式提交重复 | 不适用 | `enum.reviewReasonCode.duplicateSubmission` | 否 |
| `ReviewReasonCode` | `OUTSIDE_ALLOWED_SCOPE` | 活动不在允许范围内 | 不适用 | `enum.reviewReasonCode.outsideAllowedScope` | 否 |
| `ReviewReasonCode` | `OTHER` | 经教师说明的其他受控原因；必须同时提供非空 reason | 不适用 | `enum.reviewReasonCode.other` | 否 |
| `ReviewReasonCode` | `UNCLEAR_EVIDENCE` | 材料不清晰；退回补证或判为无效 | 不适用 | `enum.reviewReasonCode.unclearEvidence` | 否 |
| `ReviewReasonCode` | `MISSING_REQUIRED_EVIDENCE` | 必需材料缺失（含要求的前后照）；退回补证或判为无效 | 不适用 | `enum.reviewReasonCode.missingRequiredEvidence` | 否 |
| `ReviewReasonCode` | `SESSION_MISMATCH` | 材料与本次运动不符；退回补证或判为无效 | 不适用 | `enum.reviewReasonCode.sessionMismatch` | 否 |
| `ReviewReasonCode` | `INCONSISTENT_EVIDENCE` | 材料信息矛盾；退回补证或判为无效 | 不适用 | `enum.reviewReasonCode.inconsistentEvidence` | 否 |
| `ReviewReasonCode` | `AUTHENTICITY_REQUIRES_CLARIFICATION` | 材料真实性待核实；仅退回补证 | 不适用 | `enum.reviewReasonCode.authenticityRequiresClarification` | 否 |
| `ReviewReasonCode` | `CONFIRMED_REUSE_OR_MISUSE` | 经核实存在重复使用或冒用材料；仅判为无效 | 不适用 | `enum.reviewReasonCode.confirmedReuseOrMisuse` | 否 |
| `ScoreAdjustmentReasonCode` | `VERIFIED_DATA_ERROR` | 修正经核验的事实错误 | 不适用 | `enum.scoreAdjustmentReasonCode.verifiedDataError` | 否 |
| `ScoreAdjustmentReasonCode` | `APPROVED_POLICY_EXCEPTION` | 使用已有内部批准依据 | 不适用 | `enum.scoreAdjustmentReasonCode.approvedPolicyException` | 否 |
| `ScoreAdjustmentReasonCode` | `CALCULATION_ERROR` | 修正规则或计算应用错误 | 不适用 | `enum.scoreAdjustmentReasonCode.calculationError` | 否 |
| `ExportType` | `ROSTER_ALIGNMENT` | 名单对齐导出分类 | 不适用 | `enum.exportType.rosterAlignment` | 否 |
| `ExportType` | `EXERCISE_RECORDS` | 打卡记录导出分类 | 不适用 | `enum.exportType.exerciseRecords` | 否 |
| `ExportType` | `STUDENT_SCORES` | 学生成绩导出分类 | 不适用 | `enum.exportType.studentScores` | 否 |
| `ExportType` | `AUDIT_LOGS` | 审计日志导出分类 | 不适用 | `enum.exportType.auditLogs` | 否 |
| `ScoreRuleApprovalAction` | `APPROVE` | 追加规则批准事件 | 不适用 | `enum.scoreRuleApprovalAction.approve` | 否 |
| `ScoreRuleApprovalAction` | `REJECT` | 追加规则拒绝事件 | 不适用 | `enum.scoreRuleApprovalAction.reject` | 否 |
| `ScoreAdjustmentApprovalAction` | `APPROVE` | 追加调整批准事件 | 不适用 | `enum.scoreAdjustmentApprovalAction.approve` | 否 |
| `ScoreAdjustmentApprovalAction` | `REJECT` | 追加调整拒绝事件 | 不适用 | `enum.scoreAdjustmentApprovalAction.reject` | 否 |
| `AuditOutcome` | `SUCCEEDED` | 动作成功 | 不适用（事件结果） | `enum.auditOutcome.succeeded` | 否 |
| `AuditOutcome` | `REJECTED` | 业务/权限校验拒绝，未发生业务副作用 | 不适用（事件结果） | `enum.auditOutcome.rejected` | 否 |
| `AuditOutcome` | `FAILED` | 执行期间失败或可靠副作用未完成 | 不适用（事件结果） | `enum.auditOutcome.failed` | 否 |
| `SystemMode` | `NORMAL` | 按正常规则允许读写 | 不适用 | `enum.systemMode.normal` | 否 |
| `SystemMode` | `MAINTENANCE` | 仅允许健康检查、认证恢复和批准的运维白名单 | 不适用 | `enum.systemMode.maintenance` | 否 |

`ReviewReasonCode` 是历史读取与当前公开原因的联合枚举。前七项保留历史记录读取，不表示当前 V81 教师写入可以使用；当前审核输入仅接受新增六类，并按教师业务文档第 9.2.1 节限制动作。通过不要求原因；退回和无效须选适用分类，可选公开补充说明原文向本人展示，不设置隐藏审核备注。`AUTHENTICITY_REQUIRES_CLARIFICATION` 仅退回，`CONFIRMED_REUSE_OR_MISUSE` 仅无效；疑似不等于已核实。`ScoreAdjustmentReasonCode` 与 `ExportType` 的保留闭集不表示旧成绩调整工作流启用。

### 3.1 V8.1 现行接口枚举登记

以下保留现有接口和数据库的稳定值，包括既有小写代码和数值选项；不为统一大小写改写历史或改变网页传输。i18n key 是登记标识，本轮未生成客户端翻译资源。具体字段绑定见 v81-enum-bindings.json；允许值不表示所有转换都可由客户端写入，各写入接口仍限定各自子集。

| 枚举类型 | 值 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|
| `V81AdminKind` | `SUPER` | 管理员身份类别：`SUPER` | 见所属业务状态机 | `enum.v81AdminKind.SUPER` | 否 |
| `V81AdminKind` | `SUB` | 管理员身份类别：`SUB` | 见所属业务状态机 | `enum.v81AdminKind.SUB` | 否 |
| `V81AdminPermission` | `COURSE_VIEW` | 分管理员八项权限：`COURSE_VIEW` | 见所属业务状态机 | `enum.v81AdminPermission.COURSE_VIEW` | 否 |
| `V81AdminPermission` | `SEMESTER_MANAGE` | 分管理员八项权限：`SEMESTER_MANAGE` | 见所属业务状态机 | `enum.v81AdminPermission.SEMESTER_MANAGE` | 否 |
| `V81AdminPermission` | `USER_ACCOUNTS` | 分管理员八项权限：`USER_ACCOUNTS` | 见所属业务状态机 | `enum.v81AdminPermission.USER_ACCOUNTS` | 否 |
| `V81AdminPermission` | `STUDENT_FEEDBACK` | 分管理员八项权限：`STUDENT_FEEDBACK` | 见所属业务状态机 | `enum.v81AdminPermission.STUDENT_FEEDBACK` | 否 |
| `V81AdminPermission` | `GLOBAL_RULES` | 分管理员八项权限：`GLOBAL_RULES` | 见所属业务状态机 | `enum.v81AdminPermission.GLOBAL_RULES` | 否 |
| `V81AdminPermission` | `SYSTEM_MODE` | 分管理员八项权限：`SYSTEM_MODE` | 见所属业务状态机 | `enum.v81AdminPermission.SYSTEM_MODE` | 否 |
| `V81AdminPermission` | `HELP_CENTER` | 分管理员八项权限：`HELP_CENTER` | 见所属业务状态机 | `enum.v81AdminPermission.HELP_CENTER` | 否 |
| `V81AdminPermission` | `AUDIT_QUERY` | 分管理员八项权限：`AUDIT_QUERY` | 见所属业务状态机 | `enum.v81AdminPermission.AUDIT_QUERY` | 否 |
| `V81CreatedAccountStatus` | `ACTIVE` | 建号成功账户状态：`ACTIVE` | 见所属业务状态机 | `enum.v81CreatedAccountStatus.ACTIVE` | 否 |
| `V81SwimIntakeKind` | `ON_TIME` | 游泳材料受理类型：`ON_TIME` | 见所属业务状态机 | `enum.v81SwimIntakeKind.ON_TIME` | 否 |
| `V81SwimIntakeKind` | `OFFLINE_DELAYED` | 游泳材料受理类型：`OFFLINE_DELAYED` | 见所属业务状态机 | `enum.v81SwimIntakeKind.OFFLINE_DELAYED` | 否 |
| `V81EvidencePhase` | `BEFORE` | 运动材料阶段：`BEFORE` | 见所属业务状态机 | `enum.v81EvidencePhase.BEFORE` | 否 |
| `V81EvidencePhase` | `AFTER` | 运动材料阶段：`AFTER` | 见所属业务状态机 | `enum.v81EvidencePhase.AFTER` | 否 |
| `V81EvidencePhase` | `OTHER` | 运动材料阶段：`OTHER` | 见所属业务状态机 | `enum.v81EvidencePhase.OTHER` | 否 |
| `V81SettlementCheckStatus` | `CLEAR` | 结算检查状态：`CLEAR` | 见所属业务状态机 | `enum.v81SettlementCheckStatus.CLEAR` | 否 |
| `V81SettlementCheckStatus` | `BLOCKED` | 结算检查状态：`BLOCKED` | 见所属业务状态机 | `enum.v81SettlementCheckStatus.BLOCKED` | 否 |
| `V81SettlementCheckStatus` | `UNAVAILABLE` | 结算检查状态：`UNAVAILABLE` | 见所属业务状态机 | `enum.v81SettlementCheckStatus.UNAVAILABLE` | 否 |
| `V81FeedbackCategory` | `BUG` | 反馈分类：`BUG` | 见所属业务状态机 | `enum.v81FeedbackCategory.BUG` | 否 |
| `V81FeedbackCategory` | `SUGGESTION` | 反馈分类：`SUGGESTION` | 见所属业务状态机 | `enum.v81FeedbackCategory.SUGGESTION` | 否 |
| `V81FeedbackCategory` | `ACCESSIBILITY` | 反馈分类：`ACCESSIBILITY` | 见所属业务状态机 | `enum.v81FeedbackCategory.ACCESSIBILITY` | 否 |
| `V81FeedbackCategory` | `PRIVACY` | 反馈分类：`PRIVACY` | 见所属业务状态机 | `enum.v81FeedbackCategory.PRIVACY` | 否 |
| `V81FeedbackCategory` | `OTHER` | 反馈分类：`OTHER` | 见所属业务状态机 | `enum.v81FeedbackCategory.OTHER` | 否 |
| `V81FeedbackStatus` | `OPEN` | 反馈处理状态：`OPEN` | 见所属业务状态机 | `enum.v81FeedbackStatus.OPEN` | 否 |
| `V81FeedbackStatus` | `IN_PROGRESS` | 反馈处理状态：`IN_PROGRESS` | 见所属业务状态机 | `enum.v81FeedbackStatus.IN_PROGRESS` | 否 |
| `V81FeedbackStatus` | `WAITING_TECH` | 反馈处理状态：`WAITING_TECH` | 见所属业务状态机 | `enum.v81FeedbackStatus.WAITING_TECH` | 否 |
| `V81FeedbackStatus` | `RESOLVED` | 反馈处理状态：`RESOLVED` | 见所属业务状态机 | `enum.v81FeedbackStatus.RESOLVED` | 否 |
| `V81FeedbackStatus` | `CLOSED` | 反馈处理状态：`CLOSED` | 见所属业务状态机 | `enum.v81FeedbackStatus.CLOSED` | 否 |
| `V81HelpCategory` | `login` | 帮助主题分类：`login` | 见所属业务状态机 | `enum.v81HelpCategory.login` | 否 |
| `V81HelpCategory` | `enrollment` | 帮助主题分类：`enrollment` | 见所属业务状态机 | `enum.v81HelpCategory.enrollment` | 否 |
| `V81HelpCategory` | `checkin` | 帮助主题分类：`checkin` | 见所属业务状态机 | `enum.v81HelpCategory.checkin` | 否 |
| `V81HelpCategory` | `evidence` | 帮助主题分类：`evidence` | 见所属业务状态机 | `enum.v81HelpCategory.evidence` | 否 |
| `V81HelpCategory` | `course` | 帮助主题分类：`course` | 见所属业务状态机 | `enum.v81HelpCategory.course` | 否 |
| `V81HelpCategory` | `exemption` | 帮助主题分类：`exemption` | 见所属业务状态机 | `enum.v81HelpCategory.exemption` | 否 |
| `V81HelpCategory` | `organization` | 帮助主题分类：`organization` | 见所属业务状态机 | `enum.v81HelpCategory.organization` | 否 |
| `V81HelpCategory` | `notification` | 帮助主题分类：`notification` | 见所属业务状态机 | `enum.v81HelpCategory.notification` | 否 |
| `V81HelpCategory` | `maintenance` | 帮助主题分类：`maintenance` | 见所属业务状态机 | `enum.v81HelpCategory.maintenance` | 否 |
| `V81HelpCategory` | `feedback` | 帮助主题分类：`feedback` | 见所属业务状态机 | `enum.v81HelpCategory.feedback` | 否 |
| `V81HelpStatus` | `draft` | 帮助发布状态：`draft` | 见所属业务状态机 | `enum.v81HelpStatus.draft` | 否 |
| `V81HelpStatus` | `published` | 帮助发布状态：`published` | 见所属业务状态机 | `enum.v81HelpStatus.published` | 否 |
| `V81HelpStatus` | `archived` | 帮助发布状态：`archived` | 见所属业务状态机 | `enum.v81HelpStatus.archived` | 否 |
| `V81EnduranceGender` | `male` | 换算表性别：`male` | 见所属业务状态机 | `enum.v81EnduranceGender.male` | 否 |
| `V81EnduranceGender` | `female` | 换算表性别：`female` | 见所属业务状态机 | `enum.v81EnduranceGender.female` | 否 |
| `V81EnduranceCohort` | `freshman_sophomore` | 换算表年级组：`freshman_sophomore` | 见所属业务状态机 | `enum.v81EnduranceCohort.freshman_sophomore` | 否 |
| `V81EnduranceCohort` | `junior_senior` | 换算表年级组：`junior_senior` | 见所属业务状态机 | `enum.v81EnduranceCohort.junior_senior` | 否 |
| `V81RunType` | `800m` | 原始体测项目：`800m` | 见所属业务状态机 | `enum.v81RunType.800m` | 否 |
| `V81RunType` | `1000m` | 原始体测项目：`1000m` | 见所属业务状态机 | `enum.v81RunType.1000m` | 否 |
| `V81EnduranceTier` | `excellent` | 换算表档位：`excellent` | 见所属业务状态机 | `enum.v81EnduranceTier.excellent` | 否 |
| `V81EnduranceTier` | `good` | 换算表档位：`good` | 见所属业务状态机 | `enum.v81EnduranceTier.good` | 否 |
| `V81EnduranceTier` | `pass` | 换算表档位：`pass` | 见所属业务状态机 | `enum.v81EnduranceTier.pass` | 否 |
| `V81EnduranceTier` | `fail` | 换算表档位：`fail` | 见所属业务状态机 | `enum.v81EnduranceTier.fail` | 否 |
| `V81MissingPhysicalStatus` | `NOT_RECORDED` | 未录入数值体测状态：`NOT_RECORDED` | 见所属业务状态机 | `enum.v81MissingPhysicalStatus.NOT_RECORDED` | 否 |
| `V81MissingPhysicalStatus` | `EXEMPT` | 未录入数值体测状态：`EXEMPT` | 见所属业务状态机 | `enum.v81MissingPhysicalStatus.EXEMPT` | 否 |
| `V81RegistrationStatus` | `MATCHED` | 名单注册对应状态：`MATCHED` | 见所属业务状态机 | `enum.v81RegistrationStatus.MATCHED` | 否 |
| `V81RegistrationStatus` | `PENDING_REGISTRATION` | 名单注册对应状态：`PENDING_REGISTRATION` | 见所属业务状态机 | `enum.v81RegistrationStatus.PENDING_REGISTRATION` | 否 |
| `V81RegistrationStatus` | `IDENTITY_CONFLICT` | 名单注册对应状态：`IDENTITY_CONFLICT` | 见所属业务状态机 | `enum.v81RegistrationStatus.IDENTITY_CONFLICT` | 否 |
| `V81RegistrationStatus` | `EXTRA_IN_PLATFORM` | 名单注册对应状态：`EXTRA_IN_PLATFORM` | 见所属业务状态机 | `enum.v81RegistrationStatus.EXTRA_IN_PLATFORM` | 否 |
| `V81RosterRowStatus` | `VALID` | 名单源行状态：`VALID` | 见所属业务状态机 | `enum.v81RosterRowStatus.VALID` | 否 |
| `V81RosterRowStatus` | `DUPLICATED` | 名单源行状态：`DUPLICATED` | 见所属业务状态机 | `enum.v81RosterRowStatus.DUPLICATED` | 否 |
| `V81RosterSourceKind` | `ELECTRONIC` | 名单依据来源：`ELECTRONIC` | 见所属业务状态机 | `enum.v81RosterSourceKind.ELECTRONIC` | 否 |
| `V81RosterSourceKind` | `OCR` | 名单依据来源：`OCR` | 见所属业务状态机 | `enum.v81RosterSourceKind.OCR` | 否 |
| `V81PhysicalStatus` | `EXEMPT` | 体测事实状态：`EXEMPT` | 见所属业务状态机 | `enum.v81PhysicalStatus.EXEMPT` | 否 |
| `V81PhysicalStatus` | `RECORDED` | 体测事实状态：`RECORDED` | 见所属业务状态机 | `enum.v81PhysicalStatus.RECORDED` | 否 |
| `V81PhysicalStatus` | `NOT_RECORDED` | 体测事实状态：`NOT_RECORDED` | 见所属业务状态机 | `enum.v81PhysicalStatus.NOT_RECORDED` | 否 |
| `V81JoinableSectionStatus` | `UPCOMING` | 可入班教学班状态：`UPCOMING` | 见所属业务状态机 | `enum.v81JoinableSectionStatus.UPCOMING` | 否 |
| `V81JoinableSectionStatus` | `ACTIVE` | 可入班教学班状态：`ACTIVE` | 见所属业务状态机 | `enum.v81JoinableSectionStatus.ACTIVE` | 否 |
| `V81OcrPurpose` | `ROSTER` | OCR用途：`ROSTER` | 见所属业务状态机 | `enum.v81OcrPurpose.ROSTER` | 否 |
| `V81OcrPurpose` | `PHYSICAL` | OCR用途：`PHYSICAL` | 见所属业务状态机 | `enum.v81OcrPurpose.PHYSICAL` | 否 |
| `V81OcrAttemptStatus` | `SUCCEEDED` | OCR尝试结果：`SUCCEEDED` | 见所属业务状态机 | `enum.v81OcrAttemptStatus.SUCCEEDED` | 否 |
| `V81OcrAttemptStatus` | `FAILED` | OCR尝试结果：`FAILED` | 见所属业务状态机 | `enum.v81OcrAttemptStatus.FAILED` | 否 |
| `V81OcrJobStatus` | `QUEUED` | OCR任务状态：`QUEUED` | 见所属业务状态机 | `enum.v81OcrJobStatus.QUEUED` | 否 |
| `V81OcrJobStatus` | `RUNNING` | OCR任务状态：`RUNNING` | 见所属业务状态机 | `enum.v81OcrJobStatus.RUNNING` | 否 |
| `V81OcrJobStatus` | `SUCCEEDED` | OCR任务状态：`SUCCEEDED` | 见所属业务状态机 | `enum.v81OcrJobStatus.SUCCEEDED` | 否 |
| `V81OcrJobStatus` | `FAILED` | OCR任务状态：`FAILED` | 见所属业务状态机 | `enum.v81OcrJobStatus.FAILED` | 否 |
| `V81OcrField` | `studentNumber` | OCR草稿字段：`studentNumber` | 见所属业务状态机 | `enum.v81OcrField.studentNumber` | 否 |
| `V81OcrField` | `name` | OCR草稿字段：`name` | 见所属业务状态机 | `enum.v81OcrField.name` | 否 |
| `V81OcrField` | `runType` | OCR草稿字段：`runType` | 见所属业务状态机 | `enum.v81OcrField.runType` | 否 |
| `V81OcrField` | `elapsed` | OCR草稿字段：`elapsed` | 见所属业务状态机 | `enum.v81OcrField.elapsed` | 否 |
| `V81OcrField` | `testedOn` | OCR草稿字段：`testedOn` | 见所属业务状态机 | `enum.v81OcrField.testedOn` | 否 |
| `V81MaterialVersion` | `1` | 材料版本：`1` | 见所属业务状态机 | `enum.v81MaterialVersion.1` | 否 |
| `V81MaterialVersion` | `2` | 材料版本：`2` | 见所属业务状态机 | `enum.v81MaterialVersion.2` | 否 |
| `V81MakeupStatus` | `SCHEDULED` | 补练授权状态：`SCHEDULED` | 见所属业务状态机 | `enum.v81MakeupStatus.SCHEDULED` | 否 |
| `V81MakeupStatus` | `OPEN` | 补练授权状态：`OPEN` | 见所属业务状态机 | `enum.v81MakeupStatus.OPEN` | 否 |
| `V81MakeupStatus` | `ENDED` | 补练授权状态：`ENDED` | 见所属业务状态机 | `enum.v81MakeupStatus.ENDED` | 否 |
| `V81MakeupStatus` | `REVOKED` | 补练授权状态：`REVOKED` | 见所属业务状态机 | `enum.v81MakeupStatus.REVOKED` | 否 |
| `V81SemesterStatus` | `UPCOMING` | 学期状态：`UPCOMING` | 见所属业务状态机 | `enum.v81SemesterStatus.UPCOMING` | 否 |
| `V81SemesterStatus` | `CURRENT` | 学期状态：`CURRENT` | 见所属业务状态机 | `enum.v81SemesterStatus.CURRENT` | 否 |
| `V81SemesterStatus` | `ARCHIVED` | 学期状态：`ARCHIVED` | 见所属业务状态机 | `enum.v81SemesterStatus.ARCHIVED` | 否 |
| `V81AuditSource` | `FOUNDATION` | 审计存储来源：`FOUNDATION` | 见所属业务状态机 | `enum.v81AuditSource.FOUNDATION` | 否 |
| `V81AuditSource` | `V81` | 审计存储来源：`V81` | 见所属业务状态机 | `enum.v81AuditSource.V81` | 否 |
| `V81RuntimeArchiveStatus` | `QUEUED` | 运行归档状态：`QUEUED` | 见所属业务状态机 | `enum.v81RuntimeArchiveStatus.QUEUED` | 否 |
| `V81RuntimeArchiveStatus` | `RUNNING` | 运行归档状态：`RUNNING` | 见所属业务状态机 | `enum.v81RuntimeArchiveStatus.RUNNING` | 否 |
| `V81RuntimeArchiveStatus` | `SUCCEEDED` | 运行归档状态：`SUCCEEDED` | 见所属业务状态机 | `enum.v81RuntimeArchiveStatus.SUCCEEDED` | 否 |
| `V81RuntimeArchiveStatus` | `FAILED` | 运行归档状态：`FAILED` | 见所属业务状态机 | `enum.v81RuntimeArchiveStatus.FAILED` | 否 |
| `V81RuntimeArchiveStatus` | `CANCELLED` | 运行归档状态：`CANCELLED` | 见所属业务状态机 | `enum.v81RuntimeArchiveStatus.CANCELLED` | 否 |
| `V81RuntimeArchiveStatus` | `EXPIRED` | 运行归档状态：`EXPIRED` | 见所属业务状态机 | `enum.v81RuntimeArchiveStatus.EXPIRED` | 否 |
| `V81OcrConfigSource` | `ADMIN_REVISION` | OCR配置来源：`ADMIN_REVISION` | 见所属业务状态机 | `enum.v81OcrConfigSource.ADMIN_REVISION` | 否 |
| `V81OcrConfigSource` | `DEPLOYMENT_ENVIRONMENT` | OCR配置来源：`DEPLOYMENT_ENVIRONMENT` | 见所属业务状态机 | `enum.v81OcrConfigSource.DEPLOYMENT_ENVIRONMENT` | 否 |
| `V81OcrProvider` | `DISABLED` | OCR提供方：`DISABLED` | 见所属业务状态机 | `enum.v81OcrProvider.DISABLED` | 否 |
| `V81OcrProvider` | `TENCENT_TABLE_V3` | OCR提供方：`TENCENT_TABLE_V3` | 见所属业务状态机 | `enum.v81OcrProvider.TENCENT_TABLE_V3` | 否 |
| `V81IdentityVerificationStatus` | `VERIFIED` | 邮箱核验成功状态：`VERIFIED` | 见所属业务状态机 | `enum.v81IdentityVerificationStatus.VERIFIED` | 否 |
| `V81ManagedAccountStatus` | `ACTIVE` | 受管理账户状态：`ACTIVE` | 见所属业务状态机 | `enum.v81ManagedAccountStatus.ACTIVE` | 否 |
| `V81ManagedAccountStatus` | `DISABLED` | 受管理账户状态：`DISABLED` | 见所属业务状态机 | `enum.v81ManagedAccountStatus.DISABLED` | 否 |
| `V81RecordWorkflowStage` | `PENDING_AI` | 运动审核阶段：`PENDING_AI` | 见所属业务状态机 | `enum.v81RecordWorkflowStage.PENDING_AI` | 否 |
| `V81RecordWorkflowStage` | `TECHNICAL` | 运动审核阶段：`TECHNICAL` | 见所属业务状态机 | `enum.v81RecordWorkflowStage.TECHNICAL` | 否 |
| `V81RecordWorkflowStage` | `PENDING_TEACHER` | 运动审核阶段：`PENDING_TEACHER` | 见所属业务状态机 | `enum.v81RecordWorkflowStage.PENDING_TEACHER` | 否 |
| `V81RecordWorkflowStage` | `AWAITING_SUPPLEMENT` | 运动审核阶段：`AWAITING_SUPPLEMENT` | 见所属业务状态机 | `enum.v81RecordWorkflowStage.AWAITING_SUPPLEMENT` | 否 |
| `V81RecordWorkflowStage` | `VALID` | 运动审核阶段：`VALID` | 见所属业务状态机 | `enum.v81RecordWorkflowStage.VALID` | 否 |
| `V81RecordWorkflowStage` | `INVALID` | 运动审核阶段：`INVALID` | 见所属业务状态机 | `enum.v81RecordWorkflowStage.INVALID` | 否 |
| `V81RosterAlignmentRule` | `ROSTER_ALIGNMENT_V1` | 名单核对规则版本：`ROSTER_ALIGNMENT_V1` | 见所属业务状态机 | `enum.v81RosterAlignmentRule.ROSTER_ALIGNMENT_V1` | 否 |
| `V81RosterAlignmentRule` | `ROSTER_ALIGNMENT_V2` | 名单核对规则版本：`ROSTER_ALIGNMENT_V2` | 见所属业务状态机 | `enum.v81RosterAlignmentRule.ROSTER_ALIGNMENT_V2` | 否 |
| `V81ExerciseMinimumMinutes` | `30` | 课程单次最低分钟：`30` | 见所属业务状态机 | `enum.v81ExerciseMinimumMinutes.30` | 否 |
| `V81ExerciseMinimumMinutes` | `45` | 课程单次最低分钟：`45` | 见所属业务状态机 | `enum.v81ExerciseMinimumMinutes.45` | 否 |
| `V81ExerciseMinimumMinutes` | `60` | 课程单次最低分钟：`60` | 见所属业务状态机 | `enum.v81ExerciseMinimumMinutes.60` | 否 |
| `V81WeeklyRecordLimit` | `2` | 课程每周计入条数：`2` | 见所属业务状态机 | `enum.v81WeeklyRecordLimit.2` | 否 |
| `V81WeeklyRecordLimit` | `3` | 课程每周计入条数：`3` | 见所属业务状态机 | `enum.v81WeeklyRecordLimit.3` | 否 |
| `V81WeeklyRecordLimit` | `4` | 课程每周计入条数：`4` | 见所属业务状态机 | `enum.v81WeeklyRecordLimit.4` | 否 |
| `V81TeacherReviewAction` | `VALID` | 教师审核动作：`VALID` | 见所属业务状态机 | `enum.v81TeacherReviewAction.VALID` | 否 |
| `V81TeacherReviewAction` | `INVALID` | 教师审核动作：`INVALID` | 见所属业务状态机 | `enum.v81TeacherReviewAction.INVALID` | 否 |
| `V81TeacherReviewAction` | `RETURN_FOR_SUPPLEMENT` | 教师审核动作：`RETURN_FOR_SUPPLEMENT` | 见所属业务状态机 | `enum.v81TeacherReviewAction.RETURN_FOR_SUPPLEMENT` | 否 |
| `V81SupplementHours` | `24` | 补证时限小时数：`24` | 见所属业务状态机 | `enum.v81SupplementHours.24` | 否 |
| `V81SupplementHours` | `72` | 补证时限小时数：`72` | 见所属业务状态机 | `enum.v81SupplementHours.72` | 否 |
| `V81ProgressStatus` | `COMPLETED` | 学生目标完成状态：`COMPLETED` | 见所属业务状态机 | `enum.v81ProgressStatus.COMPLETED` | 否 |
| `V81ProgressStatus` | `IN_PROGRESS` | 学生目标完成状态：`IN_PROGRESS` | 见所属业务状态机 | `enum.v81ProgressStatus.IN_PROGRESS` | 否 |
| `V81CertificationType` | `SCHOOL_TEAM` | 认证类型：`SCHOOL_TEAM` | 见所属业务状态机 | `enum.v81CertificationType.SCHOOL_TEAM` | 否 |
| `V81CertificationType` | `STUDENT_CLUB` | 认证类型：`STUDENT_CLUB` | 见所属业务状态机 | `enum.v81CertificationType.STUDENT_CLUB` | 否 |
| `V81CertificationStatus` | `DRAFT` | 认证申请状态：`DRAFT` | 见所属业务状态机 | `enum.v81CertificationStatus.DRAFT` | 否 |
| `V81CertificationStatus` | `SUBMITTED` | 认证申请状态：`SUBMITTED` | 见所属业务状态机 | `enum.v81CertificationStatus.SUBMITTED` | 否 |
| `V81CertificationStatus` | `SUPPLEMENT_REQUIRED` | 认证申请状态：`SUPPLEMENT_REQUIRED` | 见所属业务状态机 | `enum.v81CertificationStatus.SUPPLEMENT_REQUIRED` | 否 |
| `V81CertificationStatus` | `APPROVED` | 认证申请状态：`APPROVED` | 见所属业务状态机 | `enum.v81CertificationStatus.APPROVED` | 否 |
| `V81CertificationStatus` | `REJECTED` | 认证申请状态：`REJECTED` | 见所属业务状态机 | `enum.v81CertificationStatus.REJECTED` | 否 |
| `V81CertificationStatus` | `REVOKED` | 认证申请状态：`REVOKED` | 见所属业务状态机 | `enum.v81CertificationStatus.REVOKED` | 否 |
| `V81SemesterTerm` | `FIRST` | 学期学段：`FIRST` | 见所属业务状态机 | `enum.v81SemesterTerm.FIRST` | 否 |
| `V81SemesterTerm` | `SECOND` | 学期学段：`SECOND` | 见所属业务状态机 | `enum.v81SemesterTerm.SECOND` | 否 |
| `V81SemesterTerm` | `SUMMER` | 学期学段：`SUMMER` | 见所属业务状态机 | `enum.v81SemesterTerm.SUMMER` | 否 |

## 5. 废弃枚举与迁移别名

下表值**不是当前枚举成员**，新 OpenAPI 不得接受。兼容 adapter 在 F1–F5 可读取并映射，F6 移除；无法无歧义映射的值必须进入迁移异常报告。

| 枚举类型/来源 | 废弃值 | 当前值/处理 | 业务含义 | 是否终态 | 客户端国际化 Key | 是否已废弃 |
|---|---|---|---|---|---|---|
| `UserRole` | `student/teacher/admin` | `STUDENT/TEACHER/ADMIN` | 旧小写角色值 | 不适用 | 使用当前值 key | 是 |
| `SystemMode` | `READ_ONLY` | 不接受新写入，不自动映射为 NORMAL 或 MAINTENANCE | 当前业务仅正常和维护两种模式，旧状态保留诊断依据 | 不适用 | `enum.systemMode.readOnly`（历史） | 是 |
| `Gender` | `male/female/other`、`男/女/其他` | `MALE/FEMALE/OTHER` | 旧大小写或中文展示值 | 不适用 | 使用当前值 key | 是 |
| `EnrollmentSource` | `qr` | `QR_CODE` | 二维码入班来源 | 不适用 | `enum.enrollmentSource.qrCode` | 是 |
| `EnrollmentSource` | `manual_import` / `IMPORT` | 按证据映射 `MANUAL` 或 `OFFICIAL_IMPORT` | 旧值混合人工添加与名单导入 | 不适用 | 映射后使用当前值 key | 是；不得机械映射 |
| `EnrollmentStatus` | `enrolled` | `ACTIVE` | 旧已入班 | 否 | `enum.enrollmentStatus.active` | 是 |
| `EnrollmentStatus` | `exited/withdrawn` | `WITHDRAWN` | 仅有证据表明学生主动退出时映射 | 否 | `enum.enrollmentStatus.withdrawn` | 是 |
| `EnrollmentStatus` | `removed` | `REMOVED` | 教师移出 | 否 | `enum.enrollmentStatus.removed` | 是 |
| `EnrollmentStatus` | `disabled/completed` | 不自动映射 | 混合账户、教学班或完成语义 | 不适用 | `error.validation.enumUnsupported` | 是；人工核对 |
| `EnrollmentStatus` | `PENDING_APPROVAL` | 不进入新 Enrollment 状态机 | 旧申请入班过程态；已批准且已形成成员关系时才迁移为 `ACTIVE`，其余归档或人工核对 | 不适用 | 使用迁移结果 key | 是；仅迁移读取 |
| `RosterAlignmentStatus` | `NOT_JOINED` | `MISSING_IN_PLATFORM` | 官方有、平台无 | 是（旧快照） | `enum.rosterAlignmentStatus.missingInPlatform` | 是 |
| `RosterAlignmentStatus` | `NOT_IN_OFFICIAL_ROSTER` | `EXTRA_IN_PLATFORM` | 平台有、官方无 | 是（旧快照） | `enum.rosterAlignmentStatus.extraInPlatform` | 是 |
| `RosterAlignmentStatus` | `INFO_MISMATCH/POSSIBLE_MATCH` | `IDENTITY_CONFLICT` | 身份冲突或候选匹配 | 是（旧快照） | `enum.rosterAlignmentStatus.identityConflict` | 是 |
| `RosterAlignmentStatus` | `DUPLICATE` | `DUPLICATED` | 重复条目/成员 | 是（旧快照） | `enum.rosterAlignmentStatus.duplicated` | 是 |
| `RosterAlignmentStatus` | `PENDING_CONFIRMATION/RESOLVED` | 移到 `RosterResolutionStatus` | 旧值把分类与人工处置混在同一字段 | 不适用 | 使用 resolution key | 是 |
| `RosterImportStatus` | `UPLOADED` | `RECEIVED` | 04 中旧流程名；接收不等于业务媒体上传状态 | 否 | `enum.rosterImportStatus.received` | 是 |
| `RosterImportStatus` | `READY` | `VALIDATED` | 04 中旧流程名；表示完成结构校验 | 是（旧版本） | `enum.rosterImportStatus.validated` | 是 |
| `ExerciseSessionStatus` | `Idle` | 不存在 Session | 客户端空闲 UI 状态 | 不适用 | 无服务端枚举 key | 是 |
| `ExerciseSessionStatus` | `Active/Paused/Finished` | `IN_PROGRESS/PAUSED/COMPLETED` | Android 旧本地状态 | 按当前状态 | 使用当前值 key | 是 |
| `ExerciseSessionStatus` | `Submitted` | Session=`COMPLETED` + 独立 Record 状态 | 旧值混合会话和提交 | 不适用 | 分别使用当前值 key | 是 |
| `ExerciseRecordStatus` | `NEEDS_REVISION` | Record=`SUBMITTED` + Review=`PENDING` | v1 不提供补材料流程（ADR-055） | 不适用 | 使用映射后 key | 是；仅迁移读取 |
| `ReviewResult` | `pending/valid/invalid` | `PENDING/VALID/INVALID` | 旧小写审核值 | 按当前结果 | 使用当前值 key | 是 |
| `ReviewResult` | `APPROVED/REJECTED` | `VALID/INVALID`（仅语义证据充分时） | 旧通过/拒绝值 | 按当前结果 | 使用当前值 key | 是 |
| `MediaType` | `image/video` | `IMAGE/VIDEO` | 旧小写媒体类型 | 不适用 | 使用当前值 key | 是 |
| `ScoreStatus` | `published: true/false` | true→`PUBLISHED/LOCKED`；false 不自动映射 | 旧 boolean 无法表达五态 | 不适用 | 映射后使用当前值 key | 是 |

## 6. 尚未冻结的候选枚举

| 候选类型 | 02–05 当前证据 | 保守合同 | 阻塞项 |
|---|---|---|---|
| `OrganizationStatus` | 只明确示例 `ACTIVE` | 未知/其他值 fail closed；不新增写接口 | 组织停用/恢复生命周期 |
| `StudentProfileStatus` / `TeacherProfileStatus` / `AdminProfileStatus` | 只明确示例 `ACTIVE` | 不复用 UserStatus，也不猜 `INACTIVE/ARCHIVED` | 各 Profile 生命周期 |
| `SportType` | 仅有 `RUNNING`、`OTHER` 示例，未有完整项目目录 | 新 API 不宣称示例即完整枚举；未知值不自动写 `OTHER`，只有显式 OTHER 才要求 sportName | 业务项目白名单与历史映射 |
| `RoundingMode` | 仅示例 `HALF_UP`，公式仍受 ADR-018 阻塞 | 不激活正式 ScoreRule | 公式、精度、舍入决策 |
| `AuditTargetType` | 已知目标对象很多，但阶段 6/OpenAPI 尚未冻结全部资源 | 审计服务内部白名单；未知值不下发为受支持 API | OpenAPI 资源清单同步 |
| CourseInvite / JoinCapability 状态 | Stage 12 Enrollment/QR Join Core Gate 已通过 | `0003_identity_enrollment_qr_join` 已实现邀请轮换、摘要、一次性 capability、专用加密 escrow 与原子消费；学生 withdraw/rejoin 仍受 ADR-054 默认拒绝 | 后续只按新 forward migration 演进；不得改写 0003 |
| ExportJob / ExportStatus | Export Gate 关闭 | 仅冻结 ExportType；V1 不持久化任务、不创建制品或下载链接 | Export 模块状态机、权限与持久化合同 |

## 7. 统一错误响应

### 7.1 ErrorResponse

所有非 2xx 单项 API 响应必须返回以下结构；网关/依赖异常也应由边界层转换，无法转换的网络中断是传输失败而非业务错误响应。

| 字段 | 类型 | 必填 | 约束 |
|---|---|---:|---|
| `code` | string | 是 | 本文标准错误码；`UPPER_SNAKE_CASE`；客户端唯一业务分支依据 |
| `message` | string | 是 | 安全、简短的服务端默认文本；可按 locale 翻译，但不得包含秘密、堆栈或资源存在性泄露 |
| `details` | object | 是 | 至少为 `{}`；只使用受控字段，见 7.2；不得放任意异常对象 |
| `requestId` | string | 是 | 与请求上下文、AuditLog 和服务端日志一致；不得由客户端覆盖为其他请求 ID |
| `timestamp` | string(date-time) | 是 | 服务端生成 RFC 3339 时间点；数据库/日志按 UTC 保存 |

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
  "timestamp": "2026-08-02T18:30:00Z"
}
```

### 7.2 details 白名单

| 字段 | 类型 | 适用错误 | 规则 |
|---|---|---|---|
| `fieldErrors` | array<object> | `VALIDATION_*` | 元素为 `field/code/i18nKey/params`；不得回显密码、token、完整媒体或未净化输入 |
| `resourceType` | string enum | 资源/冲突错误 | 使用受控资源类型；不暴露内部表名 |
| `resourceId` | string | 调用者本就有权知道的资源 | 无权获知资源存在时省略 |
| `currentState` | string enum | 状态冲突 | 只返回调用者可见状态 |
| `allowedActions` | array<string> | 可恢复状态冲突 | 仅作提示；后端仍在下一次请求重新授权 |
| `expectedVersion` / `actualVersion` | integer | 版本冲突 | 资源可见时返回；客户端刷新后要求用户确认，不自动覆盖 |
| `retryAfterSeconds` | integer | 429/503/处理中 | 非负整数；同时可使用标准 `Retry-After` header |
| `idempotencyKey` | string | 幂等冲突 | 仅回显调用者本次提供的安全键摘要，不返回其他主体的键 |
| `itemErrors` | array<object> | 批量操作 | 每项包含安全 `itemId` 和完整子 `ErrorResponse` 核心字段；不得用首项权限代替逐项授权 |
| `migrationReference` | string | 迁移异常 | 只返回可公开工单/批次引用，不返回原始敏感快照 |

`details` 不得包含 stack trace、SQL、token、验证码、password hash、完整联系方式/学号、`storageKey`、签名 URL、媒体正文或其他人的资源 ID。

### 7.3 HTTP 与重试语义

| HTTP | 用途 | 自动重试原则 |
|---:|---|---|
| 400 | 请求语法、邀请格式或无法解析的输入 | 修正请求后重试；原请求不得自动循环 |
| 401 | 未认证、token 无效/过期/撤销 | 最多刷新一次；仍失败则清理会话并重新认证 |
| 403 | 已认证且资源存在可见，但角色/范围明确拒绝 | 不自动重试；刷新权限只能由治理流程完成 |
| 404 | 资源不存在，或为防止越权枚举而隐藏存在性 | 按不存在处理，不展示目标敏感信息 |
| 409 | 状态、并发、唯一性、幂等或业务前置冲突 | 读取最新资源/等待冲突解除后，由用户或幂等流程重试 |
| 410 | 邀请、上传会话等凭证已过期或撤销 | 获取新凭证，不重放旧凭证 |
| 413 | 文件/请求体超过上限 | 缩小输入后重试 |
| 415 | MIME/文件签名或媒体类型不支持 | 更换文件类型，不以改扩展名绕过 |
| 422 | 请求结构可解析，但字段或业务值无效 | 按 `fieldErrors` 修正后重试 |
| 429 | 速率限制 | 仅按 `Retry-After` 退避重试 |
| 500 | 未预期内部错误或数据不变量破坏 | 写请求只用同一幂等键有限重试；持续失败联系支持并提供 requestId |
| 503 | 维护、只读、依赖不可用或暂时过载 | 按 `Retry-After` 退避；不改变本地业务事实 |

同一 `Idempotency-Key` + 同一规范化请求已成功时应返回首次成功结果，不返回错误；正在处理才返回 `CONFLICT_REQUEST_IN_PROGRESS`；同一 key 被不同请求复用返回 `CONFLICT_IDEMPOTENCY_KEY_REUSED`。

## 8. 标准错误码目录

“可重试”中的“修正后/刷新后/等待后”不是无条件自动重试。所有 mutation 必须复用原幂等键或生成符合端点合同的新键。

### 8.1 AUTH

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `AUTH_REQUIRED` | 401 | 需要有效认证会话 | 请求未携带可用认证凭证 | 是，认证后 | 打开登录/验证流程；保留非敏感导航意图 | `error.auth.required` |
| `AUTH_CREDENTIAL_INVALID` | 401 | 登录凭证无效 | 账号/密码或其他凭证校验失败 | 是，修正后 | 不说明账号是否存在；允许用户重输 | `error.auth.credentialInvalid` |
| `AUTH_VERIFICATION_CODE_INVALID` | 401 | 验证码无效 | 验证码错误、已使用或与挑战不匹配 | 是，获取/输入新码后 | 清空验证码输入；保留受限倒计时 | `error.auth.verificationCodeInvalid` |
| `AUTH_TOKEN_INVALID` | 401 | access token 无法验证 | 签名、issuer、audience、格式或 claims 无效 | 是，重新认证后 | 不循环刷新无效 token；清理会话 | `error.auth.tokenInvalid` |
| `AUTH_TOKEN_EXPIRED` | 401 | access token 已过期 | 当前时间超过 token 有效期 | 是，刷新一次 | 尝试一次受控刷新；失败则重新认证 | `error.auth.tokenExpired` |
| `AUTH_SESSION_REVOKED` | 401 | 当前会话已撤销 | 退出、账户禁用、tokenVersion 或 token family 失效 | 是，重新认证且政策允许时 | 清理全部本地会话秘密并回登录页 | `error.auth.sessionRevoked` |
| `AUTH_JOIN_CAPABILITY_INVALID` | 401 | Join Capability 无法验证或目标不匹配 | header 缺失、摘要不匹配、格式错误或未绑定当前 ClassSection | 否；重新完成资料校验 | 丢弃 capability，回到邀请预览/资料步骤 | `error.auth.joinCapabilityInvalid` |
| `AUTH_JOIN_CAPABILITY_EXPIRED` | 410 | Join Capability 已过期 | 当前时间超过环境配置 TTL | 否；重新签发 | 丢弃旧 capability，重新提交资料 | `error.auth.joinCapabilityExpired` |
| `AUTH_JOIN_CAPABILITY_ALREADY_USED` | 409 | Join Capability 已被一次性消费 | 同一 capability 被非幂等地再次使用 | 否；读取已有结果或重新开始 | 先按同一幂等键查询结果，不创建第二份身份 | `error.auth.joinCapabilityAlreadyUsed` |
| `AUTH_ACCOUNT_DISABLED` | 403 | 账户已禁用 | UserStatus=`DISABLED` | 否 | 停止刷新，显示联系管理员入口 | `error.auth.accountDisabled` |
| `AUTH_RATE_LIMITED` | 429 | 认证尝试过于频繁 | 触发账号/IP/设备速率策略 | 是，等待后 | 按 Retry-After 禁用重复提交 | `error.auth.rateLimited` |

### 8.2 USER

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `USER_NOT_FOUND` | 404 | 用户或目标 Profile 不存在 | 有权范围内按 opaque ID 查无目标 | 否 | 刷新列表；不要按姓名/学号自行关联 | `error.user.notFound` |
| `USER_IDENTITY_CONFLICT` | 409 | 学号与内部身份或权威资料冲突 | 同一组织学号匹配到不同内部身份，或关键身份字段冲突 | 否，需核对 | 停止自动加入/合并；显示人工核对引用 | `error.user.identityConflict` |
| `USER_PROFILE_INVALID` | 422 | Profile 缺少或包含无效业务字段 | 姓名、学号、gender、gradeYear 等未通过规则 | 是，修正后 | 按 fieldErrors 聚焦字段，不修改内部 ID | `error.user.profileInvalid` |
| `USER_STATUS_NOT_ACTIVE` | 409 | Profile/账户当前不可参与该业务 | 相关主体不处于业务允许状态 | 否，治理后 | 刷新本人状态并显示受限提示 | `error.user.statusNotActive` |

### 8.3 COURSE

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `COURSE_NOT_FOUND` | 404 | 课程定义不存在 | 有权范围内 courseId 查无 Course | 否 | 返回课程列表并刷新 | `error.course.notFound` |
| `COURSE_CLASS_SECTION_NOT_FOUND` | 404 | 教学班不存在 | 有权范围内 classSectionId 查无资源 | 否 | 返回教学班列表并刷新 | `error.course.classSectionNotFound` |
| `COURSE_CLASS_SECTION_NOT_JOINABLE` | 409 | 教学班当前不可加入 | 状态、容量、开放开关或学期不允许加入 | 是，状态变化后 | 刷新教学班预览；关闭加入操作 | `error.course.classSectionNotJoinable` |
| `COURSE_CLASS_SECTION_NOT_WRITABLE` | 409 | 教学班当前不可写 | 教学班关闭/归档或外部守卫拒绝 mutation | 是，状态变化后 | 切换只读视图并刷新状态 | `error.course.classSectionNotWritable` |
| `COURSE_SEMESTER_ARCHIVED` | 409 | 学期已归档 | mutation 指向 ARCHIVED Semester | 否，除非获批修正流程 | 保持只读；不要尝试普通写接口 | `error.course.semesterArchived` |
| `COURSE_DEADLINE_PASSED` | 409 | 提交截止时间已过 | 服务端时间晚于 submissionDeadlineAt | 否 | 保存本地非正式草稿并提示截止 | `error.course.deadlinePassed` |
| `COURSE_CHECKIN_WINDOW_CLOSED` | 409 | 当前不在打卡窗口 | 日期、每日时段、排除日或 window mode 不允许 | 是，窗口开放后 | 显示服务端窗口，不依赖设备时钟绕过 | `error.course.checkinWindowClosed` |
| `COURSE_INVITE_INVALID` | 400 | 二维码/邀请凭证无效 | 格式、签名、目标或 nonce 无法验证 | 否；需新凭证 | 停止加入并重新扫码 | `error.course.inviteInvalid` |
| `COURSE_INVITE_EXPIRED` | 410 | 二维码/邀请凭证已过期 | 当前时间超过服务端有效期 | 否；需新凭证 | 提示联系任课教师获取新码 | `error.course.inviteExpired` |
| `COURSE_INVITE_REVOKED` | 410 | 邀请凭证已撤销/轮换 | token 已被教师或系统撤销 | 否；需新凭证 | 丢弃缓存凭证并重新扫码 | `error.course.inviteRevoked` |
| `COURSE_WRITE_DISABLED` | 409 | 历史客户端所识别的课程写关闭码 | ADR-067 接受前的 Course 写请求；阶段 11 起权威 operation 不再返回此码 | 否；升级客户端 | 刷新权限和合同；不得把旧码解释为当前 ADMIN 仍被关闭 | `error.course.writeDisabled` |
| `COURSE_TEACHER_ASSIGNMENT_CONFLICT` | 409 | 教学班教师责任归属不允许该变更 | V1 `ClassSection.teacherId` 已有单一责任教师，第二教师、代课或交接未开放 | 否，未来版本治理后 | 保持当前责任教师；不得用数组或管理员代审绕过 | `error.course.teacherAssignmentConflict` |

### 8.4 ENROLLMENT

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `ENROLLMENT_NOT_FOUND` | 404 | 入班关系不存在 | 有权范围内 enrollmentId 查无资源 | 否 | 刷新本人课程/班级列表 | `error.enrollment.notFound` |
| `ENROLLMENT_NOT_ACTIVE` | 409 | 入班关系不是 ACTIVE | 开始 Session、提交 Record 等动作需要 ACTIVE | 是，恢复后 | 刷新 Enrollment；禁用相关写入口 | `error.enrollment.notActive` |
| `ENROLLMENT_ALREADY_ACTIVE` | 409 | 学生已在该教学班 | 非幂等新加入与现有 ACTIVE 关系重复 | 否 | 读取并进入已有 Enrollment；不要创建第二条 | `error.enrollment.alreadyActive` |
| `ENROLLMENT_SEMESTER_CONFLICT` | 409 | 与同学期入班唯一规则冲突 | 学生已有互斥 ACTIVE Enrollment | 否，处理冲突后 | 展示冲突课程的安全摘要并停止加入 | `error.enrollment.semesterConflict` |
| `ENROLLMENT_TRANSITION_NOT_ALLOWED` | 409 | 当前 Enrollment 状态不允许该动作 | 请求边不在已启用状态机中 | 是，刷新后 | 刷新状态和 allowedActions | `error.enrollment.transitionNotAllowed` |
| `ENROLLMENT_WITHDRAWAL_DISABLED` | 409 | 学生自助退出未启用 | ADR-054 未批准或已过允许窗口 | 否 | 隐藏/禁用退出，并说明需联系教师 | `error.enrollment.withdrawalDisabled` |
| `ENROLLMENT_REJOIN_DISABLED` | 409 | 学生自助重入未启用 | ADR-054 未批准或关系不满足重入条件 | 否 | 获取新邀请或联系任课教师 | `error.enrollment.rejoinDisabled` |
| `ENROLLMENT_HAS_BLOCKING_WORK` | 409 | 存在阻止退出/移出的业务事实 | 已提交 Record、在途 Session 或获批规则定义的阻塞项存在 | 否，处理后 | 展示可公开阻塞摘要；不删除历史 | `error.enrollment.hasBlockingWork` |

### 8.5 ROSTER

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `ROSTER_IMPORT_NOT_FOUND` | 404 | 官方名单导入版本不存在 | rosterImportId 在授权教学班内不存在 | 否 | 刷新导入历史 | `error.roster.importNotFound` |
| `ROSTER_FILE_INVALID` | 422 | 名单文件本身无效 | 文件损坏、签名/MIME 不符、空文件或安全校验失败 | 是，更换文件后 | 显示文件级错误，不展示内部解析堆栈 | `error.roster.fileInvalid` |
| `ROSTER_SCHEMA_INVALID` | 422 | 名单列或行结构不符合模板 | 缺列、字段无法解析或行级结构错误 | 是，修正后 | 下载/展示模板；使用 fieldErrors/itemErrors | `error.roster.schemaInvalid` |
| `ROSTER_IMPORT_DUPLICATE` | 409 | 同一导入内容/请求重复 | checksum、幂等键或版本唯一约束命中 | 否；读取已有版本 | 导航到已有导入，不重复上传 | `error.roster.importDuplicate` |
| `ROSTER_IMPORT_NOT_READY` | 409 | 导入版本尚不能用于对齐 | 状态不是 VALIDATED | 是，等待/修复后 | 轮询受控状态或显示校验错误 | `error.roster.importNotReady` |
| `ROSTER_IMPORT_FAILED` | 422 | 名单导入版本已安全失败 | 文件/结构校验后该版本进入 FAILED | 是，修复文件并创建新版本 | 读取安全 failureCode；不得展示 parser stack | `error.roster.importFailed` |
| `ROSTER_IMPORT_SOURCE_UNSUPPORTED` | 409 | 已登记的导入来源当前未实现 | `OFFICIAL_API` 尚无受信 Connector | 否 | 仅允许选择 FILE；不得显示假同步成功 | `error.roster.importSourceUnsupported` |
| `ROSTER_ALIGNMENT_IN_PROGRESS` | 409 | 同教学班已有对齐任务进行中 | 互斥任务锁或同输入任务已在运行 | 是，等待后 | 按 retryAfterSeconds 查询现有任务 | `error.roster.alignmentInProgress` |
| `ROSTER_ALIGNMENT_SNAPSHOT_STALE` | 409 | 平台/名单快照已过期 | 对齐期间 current roster 或 Enrollment 集合变化 | 是，刷新后 | 重新读取当前版本并重跑 | `error.roster.alignmentSnapshotStale` |
| `ROSTER_ALIGNMENT_INPUT_VERSION_CONFLICT` | 409 | 对齐输入版本与请求不一致 | rosterImportId/comparisonRevision/平台快照版本不匹配 | 是，刷新后 | 刷新输入版本，要求用户确认后重跑 | `error.roster.alignmentInputVersionConflict` |
| `ROSTER_ALIGNMENT_EXCEPTION` | 409 | 未解决名单异常阻塞当前动作 | 某动作要求干净对齐，但存在 PENDING/CONFIRMED 异常 | 否，处置后 | 打开异常列表；列表查询本身不得返回此错误 | `error.roster.alignmentException` |
| `ROSTER_RESOLUTION_INVALID` | 422 | 名单异常处置请求无效 | resolution、原因或证据结构不合法 | 是，修正后 | 标记处置字段错误 | `error.roster.resolutionInvalid` |
| `ROSTER_ALIGNMENT_RESULT_SUPERSEDED` | 409 | 对齐结果已被新修订替代 | 对旧 comparisonRevision 执行处置 | 是，刷新后 | 跳转当前结果并保留用户未提交备注 | `error.roster.alignmentResultSuperseded` |
| `ROSTER_IGNORE_NOT_ALLOWED` | 409 | 该异常类型不允许忽略 | ADR-057 未批准，或类型为禁止忽略项 | 否 | 只提供确认/修复操作 | `error.roster.ignoreNotAllowed` |
| `ROSTER_RESOLUTION_EVIDENCE_REQUIRED` | 422 | 标记已解决缺少证据 | RESOLVE 未关联修复动作或新对齐结果 | 是，补充后 | 引导选择可追溯证据 | `error.roster.resolutionEvidenceRequired` |

### 8.6 SESSION

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `SESSION_NOT_FOUND` | 404 | 运动会话不存在 | 授权范围内按 sessionId 查无目标 | 否 | 刷新会话列表并停止提交 | `error.session.notFound` |
| `SESSION_ALREADY_ACTIVE` | 409 | 当前 Enrollment 已有活动会话 | 创建会话命中单活动会话约束 | 是，结束或恢复现有会话后 | 导航到现有会话；不得新建第二条 | `error.session.alreadyActive` |
| `SESSION_OUTSIDE_TIME_WINDOW` | 409 | 当前时间不允许开始或结束会话 | 服务端时间不在课程允许窗口 | 是，窗口开放后 | 展示服务端窗口；不依赖设备时间绕过 | `error.session.outsideTimeWindow` |
| `SESSION_TRANSITION_NOT_ALLOWED` | 409 | 会话状态不允许该动作 | 请求边不在已启用状态机中 | 是，刷新后 | 刷新状态及 allowedActions | `error.session.transitionNotAllowed` |
| `SESSION_DURATION_CAP_REACHED` | 409 | 会话已达到可记录时长上限 | 继续/恢复会超过服务端时长上限 | 否 | 要求结束会话并按规则提交 | `error.session.durationCapReached` |
| `SESSION_ALREADY_COMPLETED` | 409 | 会话或当前 Enrollment 的合格打卡要求已完成 | 对 COMPLETED 会话重复结束或写事件；或无活动会话且最新有效计入时长已达到 72000 秒时再次开始 | 否；教师后续复核导致低于门槛后可再开始 | 会话操作展示既有完成时间；开始操作提示“已达到合格打卡时长，无需继续打卡”；均不重复写入 | `error.session.alreadyCompleted` |
| `SESSION_ALREADY_USED` | 409 | 会话已被记录消费 | sessionId 已关联 ExerciseRecord | 否；读取现有记录 | 打开已有记录，不重复提交 | `error.session.alreadyUsed` |
| `SESSION_NOT_COMPLETED` | 409 | 会话尚未完成 | 创建记录要求 COMPLETED，但当前仍 ACTIVE/PAUSED | 是，完成会话后 | 返回会话页完成合法动作 | `error.session.notCompleted` |
| `SESSION_EXPIRATION_NOT_ALLOWED` | 409 | 当前会话不可标记过期 | 非系统任务、状态不符或 ADR-021 未批准相应超时路径 | 否 | 不展示人工过期入口；刷新状态 | `error.session.expirationNotAllowed` |
| `SESSION_RESUME_WINDOW_EXPIRED` | 409 | 暂停会话已超过恢复窗口 | 当前时间超过 resumeUntil | 否 | 引导结束/过期处理，不创建伪造续段 | `error.session.resumeWindowExpired` |
| `SESSION_TIMELINE_INVALID` | 409 | 会话时间线不满足不变量 | endAt 早于 startAt、片段重叠或有效时长不一致 | 否，需核对 | 停止自动修复；保留 requestId 联系支持 | `error.session.timelineInvalid` |
| `SESSION_EVENT_OUT_OF_ORDER` | 409 | 会话事件顺序冲突 | 客户端基于旧 revision 提交开始、暂停、恢复或结束事件 | 是，刷新后 | 拉取最新时间线并由用户确认后重试 | `error.session.eventOutOfOrder` |
| `SESSION_RECONCILIATION_REQUIRED` | 409 | 会话需要人工核对 | 离线事件、服务端时钟或历史数据导致时间线无法自动确定 | 否，核对后 | 标记待核对，不自行推断有效时长 | `error.session.reconciliationRequired` |

### 8.7 EXERCISE_RECORD

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `EXERCISE_RECORD_NOT_FOUND` | 404 | 运动记录不存在 | 授权范围内按 recordId 查无目标 | 否 | 刷新记录列表 | `error.exerciseRecord.notFound` |
| `EXERCISE_RECORD_ALREADY_EXISTS_FOR_SESSION` | 409 | 会话已生成运动记录 | 同一 sessionId 再次创建记录 | 否；读取现有记录 | 导航到已有 recordId | `error.exerciseRecord.alreadyExistsForSession` |
| `EXERCISE_RECORD_DUPLICATE_SUBMISSION` | 409 | 业务等价的记录提交已存在 | 同一学生、会话或服务端唯一业务键命中重复 | 否；读取现有记录 | 显示已有记录，不生成副本 | `error.exerciseRecord.duplicateSubmission` |
| `EXERCISE_RECORD_DURATION_NOT_CREDITABLE` | 422 | 本次时长不能计入有效运动 | 有效时长低于最小值、超过上限或与会话不一致 | 是，合法修正后 | 展示规则参数；不得仅改客户端显示值 | `error.exerciseRecord.durationNotCreditable` |
| `EXERCISE_RECORD_MEDIA_INCOMPLETE` | 422 | 记录证据未满足提交条件 | 必需媒体缺失、未 AVAILABLE 或尚未完成绑定/校验 | 是，补齐后 | 回到证据步骤并轮询受控状态 | `error.exerciseRecord.mediaIncomplete` |
| `EXERCISE_RECORD_DAILY_LIMIT_REACHED` | 409 | 已达到当日可提交记录上限 | 按服务端业务时区统计达到 daily limit | 否，下一业务日后 | 禁用当日新增；展示服务端日期与规则 | `error.exerciseRecord.dailyLimitReached` |
| `EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED` | 409 | 记录撤回未启用或当前不可撤回 | ADR-020 未批准，或记录已进入不可撤回状态 | 否 | 隐藏/禁用撤回；引导联系教师处理 | `error.exerciseRecord.withdrawalNotAllowed` |

### 8.8 MEDIA

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `MEDIA_EVIDENCE_REQUIRED` | 422 | 缺少必需的媒体证据 | 提交所需 proof 数量为零或缺少指定类型 | 是，补齐后 | 打开证据选择/拍摄步骤 | `error.media.evidenceRequired` |
| `MEDIA_COUNT_LIMIT_EXCEEDED` | 422 | 媒体数量超过业务上限 | 请求内或目标记录累计数量超过限制 | 是，移除后 | 显示上限并要求用户删除多余项 | `error.media.countLimitExceeded` |
| `MEDIA_SIZE_EXCEEDED` | 413 | 文件大小超过上限 | 原始或解码后文件超过配置上限 | 是，压缩/重拍后 | 在上传前提示大小，保留其他合格项 | `error.media.sizeExceeded` |
| `MEDIA_VIDEO_DURATION_EXCEEDED` | 422 | 打卡视频超过 15 秒 | 客户端声明或服务端探测的累计实际录制时长超过 15 秒 | 是，重新录制后 | 提示视频最多录制 15 秒；暂停时间不计入 | `error.media.videoDurationExceeded` |
| `MEDIA_AUDIO_TRACK_REQUIRED` | 422 | 打卡视频缺少声音 | 服务端未在打卡视频容器中探测到可解析音轨 | 是，重新录制后 | 提示必须开启麦克风并重新录制有声视频 | `error.media.audioTrackRequired` |
| `MEDIA_LOCATION_METADATA_NOT_ALLOWED` | 422 | 凭证包含位置元数据 | 服务端在 JPEG GPS IFD、EXIF 或视频容器/WebM 标签中识别到位置字段 | 是，移除元数据或重新拍摄后 | 不申请定位权限；提示用户移除位置元数据或重新拍摄，不展示或上传坐标 | `error.media.locationMetadataNotAllowed` |
| `MEDIA_TYPE_NOT_ALLOWED` | 415 | 媒体格式不受支持 | MIME、文件签名或 MediaType 不在白名单 | 是，更换文件后 | 展示允许类型；不得只改扩展名 | `error.media.typeNotAllowed` |
| `MEDIA_CAPTURE_SOURCE_NOT_ALLOWED` | 422 | 当前业务不允许该采集来源 | CaptureSource 不符合端点或课程策略 | 是，更换来源后 | 仅展示允许的拍摄/选择入口 | `error.media.captureSourceNotAllowed` |
| `MEDIA_UPLOAD_SESSION_EXPIRED` | 410 | 上传会话已过期 | 当前时间超过上传凭证或分片会话有效期 | 是，创建新会话后 | 丢弃旧签名 URL，重新申请上传 | `error.media.uploadSessionExpired` |
| `MEDIA_OBJECT_NOT_FOUND` | 404 | 已声明的存储对象不存在 | 完成上传时对象存储无对应对象 | 是，重新上传后 | 重新上传；不继续绑定空引用 | `error.media.objectNotFound` |
| `MEDIA_INTEGRITY_MISMATCH` | 422 | 媒体完整性校验失败 | checksum、实际大小或 MIME 与声明不符 | 是，重新上传后 | 丢弃本次上传结果并重新传输 | `error.media.integrityMismatch` |
| `MEDIA_BIND_TARGET_INVALID` | 422 | 媒体绑定目标无效 | 目标类型、目标 ID 或主体关系不符合业务合同 | 否，修正请求后 | 返回正确业务步骤，不猜测目标 | `error.media.bindTargetInvalid` |
| `MEDIA_ALREADY_BOUND` | 409 | 媒体已绑定业务对象 | 同一 MediaEvidence 再绑定到不允许的第二目标 | 否；读取现有绑定 | 展示现有绑定，不复制引用 | `error.media.alreadyBound` |
| `MEDIA_PURPOSE_MISMATCH` | 409 | 媒体用途与目标不匹配 | 上传时 purpose 与绑定/提交用途不同 | 否；重新上传 | 为正确用途创建新的上传会话 | `error.media.purposeMismatch` |
| `MEDIA_NOT_AVAILABLE` | 409 | 媒体尚未达到可用状态 | 目标 MediaUploadStatus 不是 AVAILABLE | 是，处理完成后 | 轮询有限次数；失败则提供重传 | `error.media.notAvailable` |
| `MEDIA_ACCESS_DENIED` | 403 | 无权读取或操作该媒体 | 主体、课程、记录或审计范围校验失败 | 否 | 关闭预览/操作入口，不泄露签名 URL | `error.media.accessDenied` |
| `MEDIA_BOUND_TO_IMMUTABLE_RECORD` | 409 | 媒体已属于不可变记录 | 记录提交/审核后请求解绑、替换或删除证据 | 否 | 保持证据；走经批准的纠错流程 | `error.media.boundToImmutableRecord` |
| `MEDIA_HAS_ACTIVE_BINDING` | 409 | 活跃业务绑定阻止删除 | 删除 MediaEvidence 时存在有效绑定 | 否，先完成合法解绑 | 展示绑定摘要；不得级联删除记录 | `error.media.hasActiveBinding` |
| `MEDIA_PROCESSING_ALREADY_STARTED` | 409 | 媒体处理已开始 | 对同一对象重复触发处理任务 | 是，读取现有任务 | 轮询现有处理状态 | `error.media.processingAlreadyStarted` |
| `MEDIA_PROCESSING_INCOMPLETE` | 409 | 媒体处理尚未完成 | 校验、转码、病毒扫描等仍在进行 | 是，等待后 | 按 retryAfterSeconds 轮询 | `error.media.processingIncomplete` |
| `MEDIA_VERIFICATION_INCOMPLETE` | 409 | 媒体校验尚未完成 | 必需完整性或安全校验未给出结论 | 是，等待后 | 不提交记录；继续显示处理中 | `error.media.verificationIncomplete` |
| `MEDIA_TRANSITION_NOT_ALLOWED` | 409 | 媒体状态不允许该动作 | 请求边不在 MediaUploadStatus 状态机中 | 是，刷新后 | 拉取最新媒体状态及可用动作 | `error.media.transitionNotAllowed` |
| `MEDIA_FAILURE_NOT_RETRYABLE` | 409 | 当前失败媒体不能原地重试 | 失败类型要求创建新的 MediaEvidence/上传会话 | 否；新建上传 | 丢弃旧上传任务，保留错误摘要 | `error.media.failureNotRetryable` |
| `MEDIA_RETENTION_HOLD` | 409 | 留存策略阻止删除媒体 | 审计、申诉或法定留存期尚未结束 | 否，留存期结束后 | 隐藏删除；显示可公开的留存原因 | `error.media.retentionHold` |
| `EXEMPTION_APPLICATION_NOT_FOUND` | 404 | 免测申请不存在 | 申请不存在或不在当前角色可见范围 | 否 | 刷新申请列表 | `error.exemption.notFound` |
| `EXEMPTION_APPLICATION_TRANSITION_NOT_ALLOWED` | 409 | 免测申请状态不可转换 | 当前状态不允许修改、提交或审核 | 是，刷新后按新状态处理 | 刷新详情并更新可用操作 | `error.exemption.transitionNotAllowed` |
| `EXEMPTION_APPLICATION_MEDIA_INVALID` | 422 | 免测申请材料不可用 | 媒体用途、学生、Enrollment、状态或组织范围不匹配 | 是，重新上传或选择合法材料 | 保留草稿并提示重新选择材料 | `error.exemption.mediaInvalid` |
| `PERMISSION_EXEMPTION_REVIEW_SCOPE_DENIED` | 403 | 无权审核该免测申请 | 当前教师不是申请所属 ClassSection 的唯一责任教师 | 否 | 返回本人负责教学班列表 | `error.permission.exemptionReviewScopeDenied` |

### 8.9 REVIEW

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `REVIEW_NOT_FOUND` | 404 | 审核任务不存在 | 授权范围内按 reviewId 查无目标 | 否 | 刷新审核队列 | `error.review.notFound` |
| `REVIEW_ALREADY_INITIALIZED` | 409 | 记录已初始化审核历史 | 同一 recordId 已有初始 PENDING ReviewRecord，仍重复初始化 | 否；读取现有记录 | 打开该 Record 的当前 ReviewRecord 与历史 | `error.review.alreadyInitialized` |
| `REVIEW_ALREADY_STARTED` | 409 | 审核任务已经开始 | 重复执行开始审核且请求并非同一幂等操作 | 否；读取现有状态 | 打开现有审核，不重复创建事件 | `error.review.alreadyStarted` |
| `REVIEW_ALREADY_COMPLETED` | 409 | 记录已经完成审核 | 对 VALID/INVALID 记录再次提交审核结果 | 否，除非经批准重开 | 显示既有结果和历史；不覆盖 | `error.review.alreadyCompleted` |
| `REVIEW_RESULT_REQUIRED` | 422 | 审核完成缺少明确结果 | 教师追加最终 ReviewRecord 时未提供 VALID 或 INVALID | 是，补充后 | 聚焦结果控件 | `error.review.resultRequired` |
| `REVIEW_INVALID_REASON_REQUIRED` | 422 | 无效审核缺少合规原因 | ReviewResult=INVALID 但 reasonCode/说明不完整 | 是，补充后 | 要求选择受控原因并填写必要说明 | `error.review.invalidReasonRequired` |
| `REVIEW_CHANGE_NOT_ALLOWED` | 409 | 当前审核结果不可直接变更 | 完成后请求直接编辑、删除或绕过重开流程 | 否 | 仅展示经批准的重开/纠错入口 | `error.review.changeNotAllowed` |
| `REVIEW_BATCH_ITEM_FAILED` | 422 | 批量审核中的单项失败 | 某一 recordId 独立校验、授权或并发检查失败 | 视子错误而定 | 按 itemErrors 逐项展示；成功项不回滚为失败 | `error.review.batchItemFailed` |
| `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED` | 409 | 人工覆盖计分时长尚无批准规则 | 请求 override creditedDuration，而 ADR-047 未批准 | 否，治理完成后 | 移除覆盖值并按默认计算；禁用入口 | `error.review.creditOverrideNotApproved` |
| `REVIEW_CREDIT_DURATION_INVALID` | 422 | 审核计分时长无效 | creditedDuration 为负、超过有效时长或违反规则 | 是，修正后 | 显示允许范围并要求重新确认 | `error.review.creditDurationInvalid` |

### 8.10 SCORE

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `SCORE_NOT_FOUND` | 404 | 成绩结果不存在 | 授权范围内按 scoreId 或学生学期键查无结果 | 否 | 刷新成绩列表 | `error.score.notFound` |
| `SCORE_ALREADY_EXISTS` | 409 | 同一计分作用域已有结果 | 创建命中学生、课程、学期等唯一键 | 否；读取现有结果 | 导航到已有 Score | `error.score.alreadyExists` |
| `SCORE_RULE_NOT_FOUND` | 404 | 指定计分规则不存在 | scoreRuleId 在组织/学期授权范围内查无目标 | 否 | 刷新规则列表 | `error.score.ruleNotFound` |
| `SCORE_RULE_NOT_CONFIGURED` | 409 | 当前作用域没有可用计分规则 | 计算或发布时找不到适用规则 | 否，配置后 | 禁用计算/发布；提示管理员配置 | `error.score.ruleNotConfigured` |
| `SCORE_RULE_APPROVAL_REQUIRED` | 409 | 规则尚未获得两名合格 ADMIN 批准 | 激活前审批数量、身份或状态不满足 | 是，补齐审批后 | 展示安全审批进度 | `error.score.ruleApprovalRequired` |
| `SCORE_RULE_SELF_APPROVAL_NOT_ALLOWED` | 409 | 规则创建者不能批准自己的规则 | 创建者调用 approve | 否 | 更换合格 ADMIN | `error.score.ruleSelfApprovalNotAllowed` |
| `SCORE_RULE_DISTINCT_APPROVER_REQUIRED` | 409 | 规则需要另一名不同批准者 | 同一 ADMIN 重复批准 | 否 | 更换第二名合格 ADMIN | `error.score.ruleDistinctApproverRequired` |
| `SCORE_SOURCE_DATA_INCONSISTENT` | 409 | 计分源数据不满足不变量 | 审核记录、有效时长、版本或课程范围互相矛盾 | 否，核对后 | 标记待核对；不发布推测结果 | `error.score.sourceDataInconsistent` |
| `SCORE_INPUT_INCOMPLETE` | 422 | 计分输入缺失 | 必需的审核通过记录、规则参数或权重为空 | 是，补齐后 | 展示缺失项摘要 | `error.score.inputIncomplete` |
| `SCORE_INPUT_INVALID` | 422 | 计分输入值无效 | 数值范围、日期范围或组合规则校验失败 | 是，修正后 | 按 fieldErrors 修正 | `error.score.inputInvalid` |
| `SCORE_INPUT_VERSION_CONFLICT` | 409 | 计分源数据版本已变化 | 请求携带的 sourceRevision 与当前值不同 | 是，刷新并确认后 | 重新加载源数据，不自动覆盖 | `error.score.inputVersionConflict` |
| `SCORE_SOURCE_NOT_CHANGED` | 409 | 源数据未变化，无需新版本 | 重算输入摘要与当前 ScoreVersion 相同 | 否；使用当前版本 | 展示当前结果，不制造空版本 | `error.score.sourceNotChanged` |
| `SCORE_ADJUSTMENT_INVALID` | 422 | 成绩调整内容无效 | 调整值、原因、证据或边界不符合规则 | 是，修正后 | 聚焦调整字段并保留草稿 | `error.score.adjustmentInvalid` |
| `SCORE_ADJUSTMENT_NOT_ALLOWED` | 409 | 当前成绩或状态不允许申请调整 | 范围、状态或前置条件不符 | 否 | 隐藏申请入口 | `error.score.adjustmentNotAllowed` |
| `SCORE_ADJUSTMENT_APPROVAL_REQUIRED` | 409 | 调整仍在等待 ADMIN 裁决 | 尚无批准事件 | 是，治理完成后 | 展示待审批状态 | `error.score.adjustmentApprovalRequired` |
| `SCORE_ADJUSTMENT_SELF_APPROVAL_NOT_ALLOWED` | 409 | 调整发起人不能批准自己的申请 | 发起人调用 approve | 否 | 更换合格 ADMIN | `error.score.adjustmentSelfApprovalNotAllowed` |
| `SCORE_ADJUSTMENT_EVIDENCE_INVALID` | 422 | 调整证据引用格式无效 | evidenceReference 不是受控 opaque reference | 是，修正后 | 仅提交内部引用 | `error.score.adjustmentEvidenceInvalid` |
| `SCORE_NOT_PUBLISHABLE` | 409 | 当前成绩尚不能发布 | 规则未激活、输入不完整、校验失败或状态不符 | 是，前置条件完成后 | 展示阻塞项，不提供绕过发布 | `error.score.notPublishable` |
| `SCORE_LOCKED` | 409 | 成绩已锁定 | 发布/归档后请求普通修改 | 否，除非经批准纠错 | 切换只读并显示版本历史 | `error.score.locked` |
| `SCORE_CORRECTION_NOT_ALLOWED` | 409 | V1 永久不提供归档成绩纠错窗口 | 调用 openStudentScoreCorrection | 否 | 使用独立 Adjustment 审批流程 | `error.score.correctionNotAllowed` |

### 8.11 VALIDATION

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `VALIDATION_FAILED` | 422 | 请求字段未通过校验 | 存在一个或多个可定位的字段错误 | 是，修正后 | 按 fieldErrors 显示，不解析 message | `error.validation.failed` |
| `VALIDATION_FIELD_REQUIRED` | 422 | 必填字段缺失 | 普通字段、reasonCode、说明或证据引用缺失 | 是，补充后 | 聚焦 details.fieldErrors 指定字段 | `error.validation.fieldRequired` |
| `VALIDATION_ENUM_UNSUPPORTED` | 422 | 枚举值不受支持 | 客户端发送未发布、已移除或错误大小写的值 | 是，升级/修正后 | 对未知值安全降级并刷新合同 | `error.validation.enumUnsupported` |
| `VALIDATION_DURATION_INVALID` | 422 | 时长字段无效 | 时长为负、精度错误、单位错误或超过字段级上限 | 是，修正后 | 展示允许范围和单位 | `error.validation.durationInvalid` |
| `VALIDATION_FORMAT_INVALID` | 422 | 字段格式无效 | 日期、UUID、学号、分页游标等格式校验失败 | 是，修正后 | 按字段提示，不回显敏感原值 | `error.validation.formatInvalid` |

### 8.12 PERMISSION

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `PERMISSION_DENIED` | 403 | 当前角色无权执行该动作 | 角色能力矩阵明确拒绝，且无需进一步区分范围 | 否 | 隐藏动作并刷新权限；不循环重试 | `error.permission.denied` |
| `PERMISSION_RESOURCE_NOT_FOUND` | 404 | 目标不存在或必须隐藏其存在性 | 跨主体/跨组织访问时采用防枚举语义 | 否 | 按不存在处理，不显示权限推断 | `error.permission.resourceNotFound` |
| `PERMISSION_RESOURCE_SCOPE_DENIED` | 403 | 资源不在调用者授权范围 | 资源可见但写入、审核或管理范围不匹配 | 否 | 返回上一级授权列表 | `error.permission.resourceScopeDenied` |
| `PERMISSION_COURSE_SCOPE_DENIED` | 403 | 教师无该教学班责任范围 | `ClassSection.teacherId` 与当前教师不一致，或请求跨班 | 否 | 只显示本人责任教学班；不得让客户端选择越权 ID | `error.permission.courseScopeDenied` |
| `PERMISSION_REVIEW_SCOPE_DENIED` | 403 | 教师无该记录审核范围 | 记录所属教学班不由当前教师负责，或审核作用域不匹配 | 否 | 从审核队列移除该项并刷新 | `error.permission.reviewScopeDenied` |
| `PERMISSION_AUDIT_SCOPE_DENIED` | 403 | 无权读取原始审计日志 | 非 ADMIN 请求原始 AuditLog，或 ADMIN 跨组织访问 | 否 | 教师改用授权业务历史投影；不得降级泄露原始日志 | `error.permission.auditScopeDenied` |

### 8.13 CONFLICT

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `CONFLICT_STATE_TRANSITION` | 409 | 通用资源状态迁移冲突 | 没有更具体领域码且请求边未启用 | 是，刷新后 | 按 resourceType 刷新；不从 message 推断动作 | `error.conflict.stateTransition` |
| `CONFLICT_VERSION_MISMATCH` | 409 | 乐观锁版本冲突 | expectedVersion 与当前 version 不一致 | 是，刷新并确认后 | 比较最新内容；不得自动覆盖 | `error.conflict.versionMismatch` |
| `CONFLICT_IDEMPOTENCY_KEY_REUSED` | 409 | 幂等键被不同请求复用 | 同一 Idempotency-Key 的规范化请求摘要不同 | 否；更正调用缺陷 | 停止重放并生成合规新键 | `error.conflict.idempotencyKeyReused` |
| `CONFLICT_REQUEST_IN_PROGRESS` | 409 | 同一幂等请求仍在处理 | 同键同请求尚未产生最终结果 | 是，等待后 | 按 retryAfterSeconds 查询/重放同键 | `error.conflict.requestInProgress` |
| `CONFLICT_RESOURCE_ALREADY_EXISTS` | 409 | 唯一业务资源已存在 | 创建请求命中唯一键且没有更具体领域码 | 否；读取现有资源 | 导航到已有资源 | `error.conflict.resourceAlreadyExists` |
| `CONFLICT_UNSUPPORTED_RESOURCE_STATE` | 409 | 当前资源状态不受该端点支持 | 端点只处理一组明确状态，而目标处于其他已知状态 | 是，合法迁移后 | 展示只读状态及 allowedActions | `error.conflict.unsupportedResourceState` |

### 8.14 SYSTEM

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `SYSTEM_INTERNAL_ERROR` | 500 | 未预期的服务端错误 | 未被领域合同覆盖的内部异常 | 是，写请求仅同键有限重试 | 显示通用错误与 requestId；不显示内部信息 | `error.system.internal` |
| `SYSTEM_SERVICE_UNAVAILABLE` | 503 | 服务暂时不可用 | 过载、关键依赖不可用或发布切换 | 是，退避后 | 按 Retry-After 重试并保留本地非敏感草稿 | `error.system.serviceUnavailable` |
| `SYSTEM_READ_ONLY` | 503 | 系统当前只读 | 全局写保护启用，读取仍可服务 | 是，只读结束后 | 禁用 mutation，保留读取与刷新 | `error.system.readOnly` |
| `SYSTEM_MAINTENANCE` | 503 | 系统处于维护模式 | SystemMode=MAINTENANCE | 是，维护结束后 | 展示维护页及可公开恢复时间 | `error.system.maintenance` |
| `SYSTEM_MODE_UNSUPPORTED` | 503 | 当前系统模式不支持该请求 | 端点未定义在当前 SystemMode 下的行为 | 否，配置修正后 | 停止请求并显示通用受限提示 | `error.system.modeUnsupported` |
| `SYSTEM_DATA_INTEGRITY_ERROR` | 500 | 关键数据不变量已破坏 | 审核、会话、记录或计分关系互相矛盾 | 否，修复后 | 停止 mutation；记录 requestId 联系支持 | `error.system.dataIntegrity` |
| `SYSTEM_DEPENDENCY_TIMEOUT` | 503 | 关键依赖响应超时 | 对象存储、队列或数据库操作超时且结果未知 | 是，同键退避后 | 不生成新幂等键；先查询结果再重试 | `error.system.dependencyTimeout` |

### 8.15 AUDIT

| 错误码 | HTTP 状态码 | 业务含义 | 触发条件 | 是否可重试 | 客户端处理方式 | 国际化 Key |
|---|---:|---|---|---|---|---|
| `AUDIT_WRITE_FAILED` | 500 | 必需审计记录写入失败 | 高风险 mutation 无法在同一事务/可靠事件中写 AuditLog | 是，同键有限重试 | 将业务写视为失败；保留 requestId，不显示成功 | `error.audit.writeFailed` |
| `AUDIT_RETENTION_POLICY_REQUIRED` | 409 | 审计留存策略尚未批准 | 请求归档/清理 AuditLog，而 ADR-073 的审计留存策略尚未批准；ADR-032 仍约束教学/成绩/媒体留存 | 否，治理完成后 | 隐藏清理入口；保持现有日志 | `error.audit.retentionPolicyRequired` |

## 9. 阶段 3–6 与 OpenAPI 旧错误码替换表

新实现和同步后的 OpenAPI **只发出“标准码”**。下表旧码仅用于文档、兼容层与日志迁移定位，不得继续作为新响应值；未列出的阶段 3–6 引用已与第 8 节标准码同名，无需改名。

| 旧引用 | 标准码 | 主要来源 | 替换说明 |
|---|---|---|---|
| `ACTIVE_SESSION_EXISTS` | `SESSION_ALREADY_ACTIVE` | 03/04/06 | 统一到 Session 分类 |
| `ADJUSTMENT_REASON_REQUIRED` | `VALIDATION_FIELD_REQUIRED` | 03/04/06 | `details.fieldErrors[].field=reasonCode/reason` |
| `ALIGNMENT_ALREADY_RUNNING` | `ROSTER_ALIGNMENT_IN_PROGRESS` | 03/04/06 | 统一 Roster 前缀 |
| `ALIGNMENT_IGNORE_NOT_ALLOWED` | `ROSTER_IGNORE_NOT_ALLOWED` | 03/04/05 | 未决 ignore 动作默认拒绝 |
| `ALIGNMENT_RESULT_SUPERSEDED` | `ROSTER_ALIGNMENT_RESULT_SUPERSEDED` | 03/04 | 统一 Roster 前缀 |
| `AUDIT_SCOPE_DENIED` | `PERMISSION_AUDIT_SCOPE_DENIED` | 03/04/05 | 原始 AuditLog 仅 ADMIN |
| `CHECKIN_WINDOW_CLOSED` | `COURSE_CHECKIN_WINDOW_CLOSED` | 03/04/06 | 时间窗归 Course/ClassSection |
| `CLASS_SECTION_NOT_JOINABLE` | `COURSE_CLASS_SECTION_NOT_JOINABLE` | 04/05 | 统一 Course 分类 |
| `CLASS_SECTION_NOT_WRITABLE` | `COURSE_CLASS_SECTION_NOT_WRITABLE` | 03/04/05 | 统一 Course 分类 |
| `COURSE_SECTION_NOT_WRITABLE` | `COURSE_CLASS_SECTION_NOT_WRITABLE` | 06 | 修正资源全名 |
| `CORRECTION_REASON_REQUIRED` | `VALIDATION_FIELD_REQUIRED` | 03/04/06 | 用 fieldErrors 指明纠错原因字段 |
| `CORRECTION_WINDOW_REQUIRED` | `SCORE_CORRECTION_WINDOW_REQUIRED` | 03/04/06 | 统一 Score 分类 |
| `CREDIT_DURATION_INVALID` | `REVIEW_CREDIT_DURATION_INVALID` | 03/04 | 计分时长覆盖发生在审核域 |
| `CREDIT_OVERRIDE_NOT_APPROVED` | `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED` | 03/04/06 | ADR-047 前默认拒绝 |
| `DAILY_RECORD_LIMIT_REACHED` | `EXERCISE_RECORD_DAILY_LIMIT_REACHED` | 03/04/06 | 统一完整资源前缀 |
| `ENROLLMENT_PROFILE_INVALID` | `USER_PROFILE_INVALID` | 04 | Profile 校验归 User 分类 |
| `ENROLLMENT_TERM_CONFLICT` | `ENROLLMENT_SEMESTER_CONFLICT` | 03/04/06 | 统一为 Semester 业务术语 |
| `EXPORT_PERSISTENCE_MODEL_PENDING` | `SYSTEM_MODE_UNSUPPORTED` | 06/OpenAPI | V1 transport 可见，但所有 Export operation 默认拒绝且不建 ExportJob |
| `EXPORT_SCOPE_DENIED` | `PERMISSION_RESOURCE_SCOPE_DENIED` | 06 | 导出逐资源授权，不另设旁路权限码 |
| `FORBIDDEN_RESOURCE_SCOPE` | `PERMISSION_RESOURCE_SCOPE_DENIED` | 04/05 | 统一 Permission 分类 |
| `IDEMPOTENCY_KEY_REUSED` | `CONFLICT_IDEMPOTENCY_KEY_REUSED` | 03/04 | 统一 Conflict 分类 |
| `IDENTITY_CONFLICT` | `USER_IDENTITY_CONFLICT` | 03/04/06 的错误码引用 | 仅替换错误码；`RosterAlignmentStatus.IDENTITY_CONFLICT` 枚举保持不变 |
| `IGNORE_REASON_REQUIRED` | `VALIDATION_FIELD_REQUIRED` | 03/04 | 用 fieldErrors 指明 ignore 原因字段 |
| `INVALID_REASON_REQUIRED` | `REVIEW_INVALID_REASON_REQUIRED` | 03/04/06 | 统一 Review 分类与 INVALID 术语 |
| `INVITE_EXPIRED` | `COURSE_INVITE_EXPIRED` | 03/04 | 统一 Course 分类 |
| `INVITE_INVALID` | `COURSE_INVITE_INVALID` | 03/04 | 统一 Course 分类 |
| `MEDIA_LIMIT_EXCEEDED` | `MEDIA_COUNT_LIMIT_EXCEEDED` | 04/06 | 明确限制维度为数量 |
| `MEDIA_NOT_FAILABLE` | `MEDIA_TRANSITION_NOT_ALLOWED` | 03 | 统一状态迁移语义 |
| `OFFICIAL_ROSTER_NOT_FOUND` | `ROSTER_IMPORT_NOT_FOUND` | 04 | 后端资源为 RosterImport |
| `PAGINATION_CURSOR_INVALID` | `VALIDATION_FORMAT_INVALID` | 06 | fieldErrors 指明 cursor |
| `RECORD_ALREADY_EXISTS_FOR_SESSION` | `EXERCISE_RECORD_ALREADY_EXISTS_FOR_SESSION` | 03/04/06 | 统一完整资源前缀 |
| `RECORD_DURATION_NOT_CREDITABLE` | `EXERCISE_RECORD_DURATION_NOT_CREDITABLE` | 03/04 | 统一完整资源前缀 |
| `RECORD_MEDIA_INCOMPLETE` | `EXERCISE_RECORD_MEDIA_INCOMPLETE` | 03/04/06 | 统一完整资源前缀 |
| `RECORD_NOT_OWNED` | `PERMISSION_RESOURCE_SCOPE_DENIED` | 03/04/06 | 资源可见时按范围拒绝；不可见时用 404 码 |
| `RECORD_WITHDRAWAL_NOT_ALLOWED` | `EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED` | 03/04/05/06 | ADR-020 前默认拒绝 |
| `REMOVAL_REASON_REQUIRED` | `VALIDATION_FIELD_REQUIRED` | 03/04/06 | 用 fieldErrors 指明 remove 原因字段 |
| `REOPEN_REASON_REQUIRED` | `VALIDATION_FIELD_REQUIRED` | 03/04/06 | 用 fieldErrors 指明 reopen 原因字段 |
| `RESOLUTION_EVIDENCE_REQUIRED` | `ROSTER_RESOLUTION_EVIDENCE_REQUIRED` | 03/04/06 | 统一 Roster 分类 |
| `RESOURCE_NOT_FOUND` | `PERMISSION_RESOURCE_NOT_FOUND` | 04/05/06 | 仅用于需要隐藏存在性的授权边界；普通缺失用领域 NOT_FOUND |
| `RESOURCE_VERSION_CONFLICT` | `CONFLICT_VERSION_MISMATCH` | 03/04/05 | 统一乐观锁语义 |
| `RESTORE_REASON_REQUIRED` | `VALIDATION_FIELD_REQUIRED` | 03/04/06 | 用 fieldErrors 指明 restore 原因字段 |
| `REVIEW_RECORD_INVARIANT_BROKEN` | `SYSTEM_DATA_INTEGRITY_ERROR` | 03/04 | 不把内部不变量伪装成用户可修复错误 |
| `REVIEW_VERSION_CONFLICT` | `CONFLICT_VERSION_MISMATCH` | 03/04 | version 细节放 details |
| `ROSTER_INPUT_VERSION_CONFLICT` | `ROSTER_ALIGNMENT_INPUT_VERSION_CONFLICT` | 03/04 | 明确是对齐输入版本 |
| `ROSTER_SNAPSHOT_STALE` | `ROSTER_ALIGNMENT_SNAPSHOT_STALE` | 03/04/06 | 明确是对齐快照 |
| `SCORE_NOT_READY_TO_PUBLISH` | `SCORE_NOT_PUBLISHABLE` | 03/04/06 | 统一发布守卫用语 |
| `SCORE_RULE_DECISION_PENDING` | `SCORE_FORMULA_UNCONFIRMED` | 03/04 | 明确未决内容为公式/边界 |
| `SCORE_VERSION_CONFLICT` | `CONFLICT_VERSION_MISMATCH` | 03/04/06 | version 细节放 details |
| `SEMESTER_ARCHIVED` | `COURSE_SEMESTER_ARCHIVED` | 03/04/05 | 统一 Course 分类 |
| `SESSION_NOT_EXPIREABLE` | `SESSION_EXPIRATION_NOT_ALLOWED` | 03/04 | 修正命名并统一迁移守卫 |
| `SESSION_NOT_OWNED` | `PERMISSION_RESOURCE_SCOPE_DENIED` | 03/04/06 | 资源可见时按范围拒绝；不可见时用 404 码 |
| `SESSION_STATE_CONFLICT` | `SESSION_TRANSITION_NOT_ALLOWED` | 03/06 | 优先使用具体 Session 状态码 |
| `STATE_TRANSITION_NOT_ALLOWED` | `CONFLICT_STATE_TRANSITION` | 03/04 | 无领域具体码时使用通用冲突码 |
| `STUDENT_IDENTITY_CONFLICT` | `USER_IDENTITY_CONFLICT` | 03/04 | 身份冲突归 User 分类 |
| `STUDENT_NOT_FOUND` | `USER_NOT_FOUND` | 03/04/06 | 统一 User 分类 |
| `SYSTEM_WRITES_DISABLED` | `SYSTEM_READ_ONLY` | 03/04/05 | 全局只读；维护模式另发 SYSTEM_MAINTENANCE |
| `TEACHER_CLASS_SCOPE_REQUIRED` | `PERMISSION_COURSE_SCOPE_DENIED` | 03/04/05/06 | 教师单教学班责任范围 |
| `UNSUPPORTED_RESOURCE_STATE` | `CONFLICT_UNSUPPORTED_RESOURCE_STATE` | 03/04/05 | 统一 Conflict 分类 |
| `UPLOAD_SESSION_EXPIRED` | `MEDIA_UPLOAD_SESSION_EXPIRED` | 03/04/06 | 统一 Media 分类 |
| `VALIDATION_QUERY_UNSUPPORTED` | `VALIDATION_FAILED` | 06 | fieldErrors 标记不支持的 filter/sort/include |

旧码兼容期只允许 gateway 将旧响应映射为标准码；业务服务、数据库、事件和新客户端不得继续写旧码。OpenAPI 的示例、响应枚举和 endpoint 说明必须同步使用标准码。

## 10. 必需错误场景覆盖

| 必需场景 | 标准错误码 | HTTP | 默认客户端动作 |
|---|---|---:|---|
| token 过期 | `AUTH_TOKEN_EXPIRED` | 401 | 受控刷新一次，失败则重新认证 |
| 权限不足 | `PERMISSION_DENIED` | 403 | 隐藏动作，不重试 |
| 课程不存在 | `COURSE_NOT_FOUND` | 404 | 返回课程列表 |
| 教学班不存在 | `COURSE_CLASS_SECTION_NOT_FOUND` | 404 | 返回教学班列表 |
| 重复加入课程 | `ENROLLMENT_ALREADY_ACTIVE` | 409 | 进入已有 Enrollment |
| 二维码无效 | `COURSE_INVITE_INVALID` | 400 | 重新扫码 |
| 二维码过期 | `COURSE_INVITE_EXPIRED` | 410 | 获取新邀请 |
| 身份冲突 | `USER_IDENTITY_CONFLICT` | 409 | 停止自动关联并人工核对 |
| 名单异常未解决 | `ROSTER_ALIGNMENT_EXCEPTION` | 409 | 打开异常处置列表 |
| 重复提交运动记录 | `EXERCISE_RECORD_DUPLICATE_SUBMISSION` | 409 | 打开已有记录 |
| 非法状态迁移 | 领域 `*_TRANSITION_NOT_ALLOWED`，否则 `CONFLICT_STATE_TRANSITION` | 409 | 刷新状态与 allowedActions |
| 运动时长不足/不可计入 | `EXERCISE_RECORD_DURATION_NOT_CREDITABLE` | 422 | 显示服务端规则参数 |
| 缺少媒体证据 | `MEDIA_EVIDENCE_REQUIRED` | 422 | 返回证据步骤 |
| 媒体数量超限 | `MEDIA_COUNT_LIMIT_EXCEEDED` | 422 | 删除多余媒体 |
| 媒体过大 | `MEDIA_SIZE_EXCEEDED` | 413 | 压缩或重拍 |
| 打卡视频超过 15 秒 | `MEDIA_VIDEO_DURATION_EXCEEDED` | 422 | 重新录制最多 15 秒的视频 |
| 媒体格式不支持 | `MEDIA_TYPE_NOT_ALLOWED` | 415 | 更换允许格式 |
| 记录已审核 | `REVIEW_ALREADY_COMPLETED` | 409 | 展示既有结果，不覆盖 |
| 无审核范围 | `PERMISSION_REVIEW_SCOPE_DENIED` | 403 | 从队列移除并刷新 |
| 未配置计分规则 | `SCORE_RULE_NOT_CONFIGURED` | 409 | 禁用计算/发布 |
| 资源版本冲突 | `CONFLICT_VERSION_MISMATCH` | 409 | 刷新、比较、用户确认后重试 |
| 相同请求仍在处理 | `CONFLICT_REQUEST_IN_PROGRESS` | 409 | 保持同一幂等键，退避查询 |
| 幂等键被不同请求复用 | `CONFLICT_IDEMPOTENCY_KEY_REUSED` | 409 | 停止重放并修正调用 |
| 内部错误 | `SYSTEM_INTERNAL_ERROR` | 500 | 显示 requestId；写请求仅同键有限重试 |

## 11. 未决动作的保守默认拒绝

以下码不是“功能已实现”的证明，而是 ADR 未接受前服务端必须稳定返回的安全结果。

| 未决动作 | 默认拒绝码 | 决策门槛 |
|---|---|---|
| 历史版本创建、修改 Course 定义 | `COURSE_WRITE_DISABLED` | ADR-067 已接受；仅保留兼容识别，当前 ADMIN operation 不再 default deny |
| 给 ClassSection 增加第二教师、代课或转移责任 | `COURSE_TEACHER_ASSIGNMENT_CONFLICT` | V1 固定一个 `teacherId`；未来需新 ADR/对象/migration |
| 学生自助退出/重入 | `ENROLLMENT_WITHDRAWAL_DISABLED` / `ENROLLMENT_REJOIN_DISABLED` | ADR-054 |
| 忽略名单异常 | `ROSTER_IGNORE_NOT_ALLOWED` | ADR-057 |
| 撤回已提交 ExerciseRecord | `EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED` | ADR-020 |
| 申请未获批的媒体用途 | `MEDIA_PURPOSE_MISMATCH` | MediaBusinessPurpose 闭集只允许 EXERCISE_RECORD 与 EXEMPTION_APPLICATION |
| ADMIN 读取原始媒体或代教师审核 | `MEDIA_ACCESS_DENIED` / `PERMISSION_REVIEW_SCOPE_DENIED` | V1 角色边界 |
| GPS、位置轨迹或全量物理清理 | `SYSTEM_MODE_UNSUPPORTED` / `AUDIT_RETENTION_POLICY_REQUIRED` | 隐私、数据生命周期与 Production Gate |
| 人工过期 Session | `SESSION_EXPIRATION_NOT_ALLOWED` | ADR-021 及相应状态守卫 |
| 审核时长人工覆盖 | `REVIEW_CREDIT_OVERRIDE_NOT_APPROVED` | ADR-047 |
| 激活 ScoreRule | `SCORE_RULE_ACTIVATION_BLOCKED` | ADR-018/062/069 |
| 重算已有成绩 | `SCORE_RECALCULATION_POLICY_REQUIRED` | ADR-018 |
| 人工调分或调整已发布/归档成绩 | `SCORE_ADJUSTMENT_NOT_ALLOWED` | Score Gate / ADR-026 |
| 发布正式成绩 | `SCORE_NOT_PUBLISHABLE` | Score Gate / ADR-018 |
| 打开成绩纠错 | `SCORE_CORRECTION_WINDOW_REQUIRED` | ADR-026 |
| 非 ADMIN 读取原始 AuditLog | `PERMISSION_AUDIT_SCOPE_DENIED` | 当前权限基线；教师仅可读业务历史投影 |
| ExportJob 创建、执行、状态或下载链接 | `SYSTEM_MODE_UNSUPPORTED` | Export Gate；冻结 ExportType 不代表实现任务 |
| 归档或清理原始 AuditLog | `AUDIT_RETENTION_POLICY_REQUIRED` | ADR-073；ADR-032 仅继续约束教学/成绩/媒体留存 |

## 12. 客户端与服务端实现约束

1. Android、Web、iOS **只按 `code` 分支**；`message` 是面向人的服务端默认文案，可修改、可本地化，不是协议字段。
2. 客户端用 `i18nKey` 对应的本地资源展示文案；服务端错误响应不要求返回 `i18nKey`，本表是代码到本地资源的唯一登记处。
3. 收到未知 `code` 时，客户端按 HTTP 大类安全降级，展示通用错误和 `requestId`；不得把未知值映射成成功或继续 mutation。
4. 服务端 API、事件、数据库列只保存 UPPER_SNAKE_CASE 稳定值，不保存中文；中文只存在文档与 i18n 资源。
5. 批量操作逐项授权并在 `details.itemErrors` 返回子错误；客户端不得用首项成功推断整批成功。
6. 日志至少记录 `requestId/code/httpStatus/actorIdHash/resourceType/resourceIdHash`；不得记录 token、验证码、原始媒体、签名 URL 或敏感 `details`。
7. 发布后的枚举值和错误码不可重定义；需要替换时先标记废弃、提供双读/单写映射与明确迁移窗口，再删除旧读兼容。

## 13. OpenAPI 与阶段文档同步清单

本阶段提交必须同时完成以下契约同步；任何一项遗漏都视为阶段 7 未完成：

- `openapi.yaml` 的错误响应保持顶层 `code/message/details/requestId/timestamp`；`details` 为对象（无细节时 `{}`，字段错误置于 `details.fieldErrors`），不得改为数组或 `meta.error` 嵌套。
- OpenAPI 的错误码示例、operation 描述与可枚举约束改用第 8 节标准码；特别将 `EXPORT_PERSISTENCE_MODEL_PENDING` 替换为 `SYSTEM_MODE_UNSUPPORTED`。
- `06-api-guidelines.md` 的主要错误按第 9 节逐项替换；其中 Course 写、学生退出、Record 撤回、Roster ignore、ScoreRule 激活与原始 AuditLog 读取使用第 11 节默认拒绝码。
- `03-state-machines.md`、`04-business-rules.md`、`05-permission-matrix.md` 的旧码按第 9 节替换，不改变状态机边、业务规则或权限结论。
- `RosterImportStatus` 的旧接收态和旧就绪态分别迁移为 `RECEIVED`、`VALIDATED`；旧值只读兼容，所有新写使用标准值。
- ExerciseRecord v1 只写 `DRAFT/SUBMITTED/REVIEWED/CANCELLED`；不存在审核领取态；旧补材料值仅按第 5 节迁移，不新增状态机边。
- Review 结果只写 `PENDING/VALID/INVALID`；完成判断不得使用旧通过/拒绝词汇。

## 14. 完成定义

- [x] 第 3 节至少覆盖需求列出的 14 类核心枚举，每个值均有业务含义、终态、i18n Key、废弃标志。
- [x] ExerciseRecord v1 无补材料可写状态；ReviewResult 使用 `PENDING/VALID/INVALID`。
- [x] 第 8 节覆盖 AUTH、USER、COURSE、ENROLLMENT、ROSTER、SESSION、EXERCISE_RECORD、MEDIA、REVIEW、SCORE、VALIDATION、PERMISSION、CONFLICT、SYSTEM、AUDIT。
- [x] 每个标准错误码均有 HTTP、含义、触发、可重试、客户端处理和 i18n Key。
- [x] 第 9 节对阶段 3–6 与 OpenAPI 的旧码给出明确替换去向。
- [x] 第 10 节覆盖附件要求的全部错误场景；第 11 节覆盖阶段 5 的保守默认拒绝。
- [x] 所有 Markdown 表列数一致；当前枚举键、标准错误码和错误 i18n Key 均无重复。
