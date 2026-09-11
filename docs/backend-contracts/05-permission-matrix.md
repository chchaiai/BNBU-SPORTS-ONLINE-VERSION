# 统一角色、权限与数据访问范围

> 阶段：5
> 模型：RBAC 角色权限 + organization scope + resource ownership + object state
> 基础角色：仅 `STUDENT`、`TEACHER`、`ADMIN`。不存在“外部教师”、社团负责人或隐含超级管理员角色。

V1 基数已冻结：一个 User 只有一个基础 role 并只关联一种对应 Profile；一个 ClassSection 只有一个责任 `teacherId`。不建立 UserRoleAssignment、TeachingAssignment 或 ReviewClaim，不支持多教师、代课、审核领取、管理员代审或交接并发。

## 1. 安全原则

1. 前端路由、隐藏按钮、禁用控件和本地 `canManage` 只改善体验，不构成授权。
2. 每次请求都由后端从已验证 token/session 解析 `userId`、`role`、`organizationId`；不接受请求体自报角色或所属组织。
3. 角色允许之后，必须继续验证组织范围、本人/教学班归属、对象当前状态和版本。
4. 学生只能访问本人 Profile、Enrollment、Session、Record、Media 和 Score。
5. 教师只能访问被明确分配给自己的 `ClassSection` 及其关联 Enrollment/Record/Score；知道 ID 或修改 URL 不扩大权限。
6. 管理员只管理本 `organizationId` 范围，默认不代行课程教学、打卡审核、免测审核或成绩录入。
7. 高风险读取（名单导出、成绩导出、媒体访问、审计查询）同样要授权、记录用途并写审计，不能只保护写操作。
8. 资源不存在与无权获知资源存在时统一返回 `404`；明确存在但操作被拒绝时返回 `403`。
9. 归档/关闭对象默认只读；任何例外必须是单独批准、限时、可审计的业务流程。

## 2. 角色定义

| 角色 | 身份来源 | 主要职责 | 默认数据范围 | 明确禁止 |
|---|---|---|---|---|
| `STUDENT` | 已验证学生 User + StudentProfile | 直接入班、本人运动会话/打卡/媒体、查看本人进度成绩 | 本人 + 本人 Enrollment 所属教学班的学生可见投影 | 访问他人数据、指定任意 studentId、审核、改规则、管理名单 |
| `TEACHER` | 已验证教师 User + TeacherProfile | 管理本人教学班、名单对齐、记录审核、成绩处理 | `ClassSection.teacherId == principal.teacherId` 的教学班 | 访问其他教师班级、管理组织全局账户/系统、绕过归档状态 |
| `ADMIN` | 已验证管理员 User + AdminProfile | 组织级学期、账户、课程目录、系统配置、权限与审计治理 | 与 token 中 `organizationId` 相同的数据 | 默认代教师审核/打分、跨组织访问、通过前端硬编码密码执行危险动作 |

`ADMIN` 是组织管理员，不等于无限制 root。若未来确需跨组织或紧急代行，必须另建有期限、范围、批准人与撤销记录的授权资源；不能扩张 `ADMIN` 固有权限。

## Stage 21 本地集成权限边界

下表描述运行状态，不替代第 11 节由 OpenAPI 生成的逐 operation 权限登记。2026-08-05 的“30 项全部 default deny”已由 ADR-097 取代，但权限链仍必须在业务执行之前完成。

| 能力族 | 当前运行状态 | 数据范围与附加条件 |
|---|---|---|
| 通知列表/已读 | 仅本地集成 | `STUDENT/TEACHER/ADMIN` 均只读本人 recipient；标记已读要求本人、同组织、幂等与事务证据 |
| 推送设备注册/注销 | 仅本地集成 | 三角色均只操作本人当前认证会话登记的设备；token 不投影，注销清除密文；无 APNs/FCM 投递能力 |
| 本人偏好读写 | 仅本地集成 | 三角色均只读写本人、同组织偏好；更新要求 `expectedVersion` |
| 帮助文章读取 | 仅本地集成、公开读取 | 只返回已发布、已到发布时间且通过安全内容约束的文章；无发布/编辑权限 |
| 反馈创建/读取 | 仅本地集成 | `STUDENT/TEACHER` 创建并只读本人；`ADMIN` 只读本组织；无处理、回复或跨组织权限 |
| App 版本政策读取 | 仅本地集成、公开读取 | 只按 `ANDROID/IOS/WEB` 读取当前生效持久化政策；无有效政策返回 503；无管理端发布权限 |
| 验证码/找回、免测、运动目录/折算、GPS | 验证码/找回 4 与免测 6 已本地实现；运动目录/折算 2 与 GPS 6 继续 default deny | STUDENT 仅 OTP；找回仅 TEACHER/ADMIN；免测仅本人写、责任教师审、ADMIN 组织内只读；GPS 原始坐标无任何角色可读 |

## 3. 权限矩阵

符号：`允许` 表示角色能力仍须满足“资源范围/附加条件”；`禁止` 表示后端无对应权限；`禁止（ADR 前）` 表示接口可声明运输合同，但在所列决策被接受前不得开放执行权限。

本节的“权限编号”是供业务阅读的能力族，不等于 OpenAPI 的逐操作 `policyId`。唯一机器权威映射位于第 11 节；一个 `operationId` 必须且只能映射一个唯一 `policyId`，反向也必须一一对应。

### 3.1 认证与账户

| 权限编号 | 操作 | STUDENT | TEACHER | ADMIN | 资源范围 | 附加条件 | 是否审计 |
|---|---|---|---|---|---|---|---|
| AUTH-LOGIN | 登录/验证码验证 | 允许 | 允许 | 允许 | 自己的凭证 | User 非 DISABLED；速率与锁定校验 | 是（成功/失败摘要） |
| AUTH-REFRESH | 刷新 Token | 允许 | 允许 | 允许 | 本人 device session | refresh token 有效、未撤销、版本一致 | 是 |
| AUTH-LOGOUT | 退出登录 | 允许 | 允许 | 允许 | 本人当前或指定本人设备 | token/session 属本人 | 是 |
| USER-SELF-READ | 查看本人信息 | 允许 | 允许 | 允许 | 本人 User/Profile | 字段按角色投影；不返回密钥/内部备注 | 否 |
| USER-SELF-UPDATE | 修改本人可编辑信息 | 允许 | 允许 | 允许 | 本人 Profile | 只允许白名单字段；身份主键不可改 | 是 |
| USER-DISABLE | 禁用账户 | 禁止 | 禁止 | 允许 | 本组织 User | 不得禁用最后一个具备账户管理权限的管理员；必填原因 | 是 |

### 3.2 课程与教学班

| 权限编号 | 操作 | STUDENT | TEACHER | ADMIN | 资源范围 | 附加条件 | 是否审计 |
|---|---|---|---|---|---|---|---|
| COURSE-CREATE | 创建课程定义 | 禁止 | 禁止 | 允许 | 本组织 | ADR-067 已接受；courseCode 组织内唯一；SystemMode/幂等/审计/outbox | 是 |
| SECTION-CREATE | 创建教学班 | 禁止 | 允许 | 禁止 | 本组织、本人作为任课教师 | Semester 可写、Course 有效 | 是 |
| COURSE-READ | 查看 Course 目录/详情 | 仅 ACTIVE Enrollment 关联投影 | 本组织 ACTIVE Course | 本组织全部 Course | principal 组织；学生还需 Enrollment | Enrollment 未实现前学生稳定拒绝，不返回组织目录或假空数组 | 否 |
| COURSE-UPDATE | 修改/启停 Course | 禁止 | 禁止 | 允许 | 本组织 Course | courseCode/organizationId 不可变；version/幂等/状态守卫 | 是 |
| SECTION-READ | 查看 ClassSection | 仅 ACTIVE Enrollment 关联投影 | 本组织且本人责任班 | 本组织治理投影 | 角色特定 projection | Enrollment 未实现前学生稳定拒绝 | 否 |
| SECTION-UPDATE | 修改教学班白名单字段 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 不得改 organization/course/semester/teacher；version/幂等 | 是 |
| SECTION-CLOSE | 关闭教学班 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 必填原因；不删除历史；幂等 | 是 |
| INVITE-GENERATE | 生成/轮换/撤销课程二维码 | 禁止 | 允许 | 禁止 | 教师本人且可写 ClassSection | 过期时间、nonce、状态由后端生成 | 是 |

### 3.3 入班关系

| 权限编号 | 操作 | STUDENT | TEACHER | ADMIN | 资源范围 | 附加条件 | 是否审计 |
|---|---|---|---|---|---|---|---|
| ENROLL-JOIN | 学生扫码/邀请码入班 | 允许 | 禁止 | 禁止 | 本人 + 凭证指向的 ClassSection | 原子身份、凭证、学期冲突、重复和幂等校验；直接 ACTIVE | 是 |
| ENROLL-READ | 查看入班关系 | 允许 | 允许 | 允许 | 本人；本人班；本组织只读治理 | 字段按角色投影 | 否（批量导出除外） |
| ENROLL-MANUAL-ADD | 手动添加学生 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 学生已存在；不绕过一学期一课与唯一约束；必填原因 | 是 |
| ENROLL-REMOVE | 移除学生 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | ACTIVE；历史不删除；必填原因 | 是 |
| ENROLL-WITHDRAW | 学生退出课程 | 禁止（ADR-054 前） | 禁止 | 禁止 | 本人 ACTIVE Enrollment | 自助退出及截止条件未确认；当前统一返回不允许 | 是 |
| ENROLL-RESTORE | 恢复入班关系 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 当前 WITHDRAWN/REMOVED；无新学期冲突；必填原因 | 是 |

### 3.4 官方名单与对齐

| 权限编号 | 操作 | STUDENT | TEACHER | ADMIN | 资源范围 | 附加条件 | 是否审计 |
|---|---|---|---|---|---|---|---|
| ROSTER-IMPORT | 导入官方名单 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | V1 只允许 UTF-8 CSV；每次创建新不可变版本并原子发布 current | 是 |
| ROSTER-HISTORY-READ | 查看导入历史/名单 | 禁止 | 允许 | 允许 | 教师本人班；管理员本组织只读 | 完整学号仅业务必要角色可见 | 是（导出/批量查看） |
| ROSTER-ALIGN | 执行重新对齐 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 当前名单版本存在；任务幂等 | 是 |
| ROSTER-EXCEPTION-READ | 查看对齐异常 | 禁止 | 允许 | 允许 | 教师本人班；管理员本组织只读 | 敏感字段最小化 | 否 |
| ROSTER-FIX | 修复异常 | 禁止 | 允许 | 禁止 | 教师本人班 | 动作不能静默改学生身份；高风险动作二次确认 | 是 |
| ROSTER-IGNORE | 忽略异常 | 禁止 | 禁止（ADR-057 前） | 禁止 | 教师本人班 | 当前所有分类均不得新建 IGNORED；统一返回 `ROSTER_IGNORE_NOT_ALLOWED` | 是 |
| ROSTER-REOPEN | 重开已处置异常 | 禁止 | 允许 | 禁止 | 教师本人班 | 仅当前版本的 RESOLVED 或历史 IGNORED；必填原因；不改 alignmentStatus | 是 |
| ROSTER-ROLLBACK | 回滚当前名单版本 | 禁止 | 允许 | 禁止 | 教师本人班 | 目标版本完整；生成新 current 指针而非删历史 | 是 |

### 3.5 运动会话、媒体与打卡

| 权限编号 | 操作 | STUDENT | TEACHER | ADMIN | 资源范围 | 附加条件 | 是否审计 |
|---|---|---|---|---|---|---|---|
| SESSION-START | 开始运动 | 允许 | 禁止 | 禁止 | 本人 ACTIVE Enrollment | 时间窗、账户/系统模式、无其他活动 session | 是 |
| SESSION-PAUSE | 暂停/继续运动 | 允许 | 禁止 | 禁止 | 本人 session | 合法状态转换、version 匹配 | 否（事件留业务历史） |
| RECORD-DRAFT | 创建/更新打卡草稿 | 允许 | 禁止 | 禁止 | 本人 session/record | 白名单字段；不能指定他人身份 | 否 |
| MEDIA-UPLOAD | 申请/确认媒体上传 | 允许 | 禁止 | 禁止 | 本人 MediaEvidence | EXERCISE_RECORD 绑定本人 Session 且只允许相机；EXEMPTION_APPLICATION 绑定本人 ACTIVE Enrollment 且允许相机/文件选择器；均为私有对象 | 是（安全摘要） |
| RECORD-SUBMIT | 提交打卡 | 允许 | 禁止 | 禁止 | 本人 record + enrollment | session COMPLETED、媒体全部 AVAILABLE 且满足 1..6 图/0..1 视频与来源规则、每日唯一、幂等 | 是 |
| RECORD-WITHDRAW | 撤回打卡 | 禁止（ADR-020 前） | 禁止 | 禁止 | 本人 record | 撤回窗口未确认；当前统一返回 `EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED` | 是 |
| RECORD-SELF-READ | 查看本人打卡 | 允许 | 禁止 | 禁止 | 本人 | 不返回内部备注/存储键 | 否 |
| RECORD-CLASS-READ | 查看教学班打卡 | 禁止 | 允许 | 允许 | 教师本人班；管理员本组织只读治理 | 管理员默认无媒体正文；媒体另校验 | 是（批量/媒体读取） |

### 3.6 审核

| 权限编号 | 操作 | STUDENT | TEACHER | ADMIN | 资源范围 | 附加条件 | 是否审计 |
|---|---|---|---|---|---|---|---|
| REVIEW-PENDING-READ | 查看待审核记录 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | Record 状态允许审核 | 否 |
| REVIEW-MARK-VALID | 标记有效 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | version 匹配；证据可访问；必填或结构化依据 | 是 |
| REVIEW-MARK-INVALID | 标记无效 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 必填原因；原记录不删除 | 是 |
| REVIEW-CHANGE | 修改已审核结果 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 新增 ReviewRecord；必填变更原因；成绩未锁定或获批准流程 | 是 |
| REVIEW-BATCH | 批量审核 | 禁止 | 允许 | 禁止 | 同一教师本人 ClassSection | 每条独立授权/版本校验；部分失败逐项返回 | 是 |

### 3.7 成绩

| 权限编号 | 操作 | STUDENT | TEACHER | ADMIN | 资源范围 | 附加条件 | 是否审计 |
|---|---|---|---|---|---|---|---|
| SCORE-SELF-READ | 查看本人成绩 | 允许 | 禁止 | 禁止 | 本人 Enrollment | 未发布时只返回允许的进度字段 | 否 |
| SCORE-CLASS-READ | 查看教学班成绩 | 禁止 | 允许 | 允许 | 教师本人班；管理员本组织只读治理 | 敏感字段最小化；导出另授权 | 是（批量） |
| SCORE-RULE-UPDATE | 创建不可变成绩规则草稿 | 禁止 | 禁止 | 允许 | 本组织内 ClassSection | 服务端写入固定 V1 公式；草稿变更创建新版本 | 是 |
| SCORE-RULE-APPROVAL | 提交/批准/拒绝规则 | 禁止 | 禁止 | 允许 | 本组织内 ClassSection | 两名不同 ACTIVE ADMIN 批准；创建者不得批准；第二次批准原子激活 | 是 |
| SCORE-RECALCULATE | 正式重新计算成绩 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 服务端从 ACTIVE Rule 与当前 VALID Review 计算；相同指纹幂等 | 是 |
| SCORE-ADJUST | 发起成绩调整 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 只创建 PENDING_APPROVAL；必填原因和 opaque evidence reference | 是 |
| SCORE-ADJUST-APPROVE | 批准/拒绝成绩调整 | 禁止 | 禁止 | 允许 | 管理员本组织 | 批准人不同于发起教师；批准后创建新 working revision | 是 |
| SCORE-PUBLISH | 发布成绩 | 禁止 | 允许 | 禁止 | 教师本人 ClassSection | 完整性、当前指纹、无待批 adjustment、version 均通过 | 是 |
| SCORE-CORRECTION | 打开归档成绩修正 | 禁止 | 禁止 | 禁止 | 教师本人 ClassSection | 永久稳定返回 `SCORE_CORRECTION_NOT_ALLOWED` 且无副作用 | 是（拒绝） |
| SCORE-EXPORT | 执行成绩导出 | 禁止 | 禁止（Export Gate 前） | 禁止（Export Gate 前） | 教师本人班；管理员本组织合规范围 | 仅冻结 ExportType；稳定返回 `SYSTEM_MODE_UNSUPPORTED`，不创建任务/链接 | 是（拒绝） |

### 3.8 系统治理

| 权限编号 | 操作 | STUDENT | TEACHER | ADMIN | 资源范围 | 附加条件 | 是否审计 |
|---|---|---|---|---|---|---|---|
| AUDIT-READ | 查看原始操作日志 | 禁止 | 禁止 | 允许 | 管理员本组织 | 只读；敏感 metadata 脱敏；教师只通过各领域历史投影看本人班事件 | 是 |
| SYSTEM-CONFIG-UPDATE | 修改系统配置/模式 | 禁止 | 禁止 | 允许 | 本组织 | 重认证、version、原因；不能用前端常量当密码 | 是 |
| TEACHER-RESPONSIBILITY-TRANSFER | 变更教学班责任教师 | 禁止 | 禁止 | 禁止（V1） | 本组织 | V1 只有一个 `ClassSection.teacherId`，不支持协同、代课或交接并发；未来需独立 Assignment/迁移 | 是（拒绝） |

## 4. 数据范围规则

### 4.1 学生范围

```text
resource.studentId == principal.studentId
AND resource.organizationId == principal.organizationId
```

请求中的 `studentId` 仅用于路径定位；即使值存在，后端仍以 principal 重写/核对。创建 Session、Record、Media 时，学生和组织字段由服务端注入。

### 4.2 教师范围

```text
resource.classSectionId -> ClassSection.teacherId == principal.teacherId
AND resource.organizationId == principal.organizationId
```

不得用“teacher role 即可”或前端硬编码课程编号代替。Record、Enrollment、Roster、Score 必须先解析到 ClassSection，再校验当前 `ClassSection.teacherId`。V1 不得臆造多人授权关系、多教师数组、审核领取或管理员临时代行。

### 4.3 管理员范围

```text
resource.organizationId == principal.organizationId
AND permission in principal.effectivePermissions
```

当前只有单一 BNBU organization，也仍执行该条件。未来多组织时不需要重写权限语义。

### 4.4 媒体范围

媒体访问先校验业务父对象，而不是只凭 `mediaId`：学生只能读本人已绑定媒体；教师只能读本人班级 Record 的审核必要媒体；管理员默认只看 metadata，不看内容。签名 URL 短期有效且不可被日志记录。

## 5. 后端权限执行顺序

```text
authorize(request, operationPolicy):
  1. rejectUnknownPolicyRoleScopeOrResolver()
  2. credential = authenticateExactly(operationPolicy.authentication)
  3. principal = resolvePrincipalOrCapability(credential)
  4. requireAllowedRoleIfAccessToken(principal.role, operationPolicy.allowedRoles)
  5. resource = resolveWithoutLeakingExistence(operationPolicy.resourceResolver)
  6. requireOrganizationScope(operationPolicy.organizationScope, principal, resource)
  7. requireResourceScope(operationPolicy.resourceScope, principal, resource)
  8. requireAccountAndObjectStateWhenApplicable()
  9. requireExpectedVersionsForMutation(request, resource)
 10. result = executeInTransactionAndEnforceBusinessRules()
 11. appendDomainHistoryAndAuditLog(result, operationPolicy.policyId, requestId)
 12. returnRoleSpecificProjection(result)
```

失败应在任何业务副作用之前发生。批量操作对每一项重复第 4–8 步，不能因为第一项授权就信任整批 ID。

## 6. HTTP 与错误处理

| 情况 | HTTP | 错误码示例 | 客户端行为 |
|---|---:|---|---|
| 无 token、token 无效/过期 | 401 | `AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED` | 清理或刷新会话，重新认证 |
| 已认证但角色无该操作 | 403 | `PERMISSION_DENIED` | 不重试，隐藏操作并提示 |
| 跨组织/跨教师且不应暴露资源存在 | 404 | `PERMISSION_RESOURCE_NOT_FOUND` | 按不存在处理，不展示目标信息 |
| 资源可见但归属不允许该动作 | 403 | `PERMISSION_RESOURCE_SCOPE_DENIED` | 不重试 |
| 对象状态不允许 | 409 | `CONFLICT_STATE_TRANSITION` | 刷新资源状态 |
| 并发版本不匹配 | 409 | `CONFLICT_VERSION_MISMATCH` | 重新读取并让用户确认 |

客户端业务分支只能依赖 `code`，不能匹配中英文 `message`。

## 7. 高风险操作

以下操作要求重认证、明确原因、`requestId`、幂等键/expectedVersion、完整审计；必要时需二人批准（是否启用二人批准待确认）：

- 禁用账户、变更教师权限；
- 名单版本替换/回滚；
- 移除/恢复 Enrollment；
- 修改已审核结果、批量审核；
- 修改 ScoreRule、人工调分、发布/重算成绩；
- 切换系统模式；
- 成绩/名单/审计批量导出；
- 任何数据清理。全量物理清理在 retention 决策完成前禁止实现。

## 8. 审计要求

AuditLog 精确记录：`id`、`organizationId`、`actorUserId`、`actorRoleSnapshot`、`permissionId`、`actionType`、`targetType`、`targetId`、`requestId`、`idempotencyKeyReference`、`outcome`、`reasonCode`、`safeMetadata`、`sourceIpHash`、`deviceFingerprintHash`、`occurredAt`。不得写原始 Idempotency-Key、IP、设备指纹、token、验证码、密码、完整学号、联系方式、storageKey、媒体签名 URL、媒体正文或 internalNote 正文。

审核历史、ScoreAdjustment、Enrollment 状态历史是领域事实；AuditLog 是操作证据。二者都要保留，但不能互相替代。

## 9. 当前前端与目标后端权限差异

| 当前实现 | 当前问题 | 目标处理 |
|---|---|---|
| Web 任意非空账号密码登录、按正则猜角色 | 无真实认证 | 后端验证凭证并签发包含稳定 claims 的 session |
| Web `teacherCourses = courses` | 教师看见全部课程；Course 无 teacherId | 通过 `ClassSection.teacherId` 限制教学班 |
| 名单 Mock 硬编码可管理课程 1–4 | ID 列表不是授权 | 每次解析 ClassSection 并比对当前责任 `teacherId` |
| 管理端全局静态 permission Set | 未绑定当前用户/组织 | 权限来自已验证主体与组织内授权 |
| Android 本地 `isWriteAllowed` | 只能控制 UI | 后端在所有 mutation 上执行系统模式守卫 |
| 教师/管理员操作只改 React/localStorage/sessionStorage | 无持久化、归属、审计 | 真实 API 事务 + audit + version |
| 学生 DTO 接收 `teacherInternalNote`/`cosKey` | 字段越权/实现泄露 | 角色 projection 删除内部字段和 storage key |

## 10. 待确认决策

| 决策 | 选项 | 推荐 | 是否阻塞 |
|---|---|---|---|
| Course 目录由谁创建 | V1 已选本组织 ADMIN；未来学校系统同步 | ADMIN 管理 Course，教师创建本人 ClassSection；未来同步复用同一 application service | ADR-067 已 ACCEPTED；不再阻塞 Course 写 API |
| 学生是否可自助退出 | 永不允许；Add/Drop 截止前；全学期 | Add/Drop 截止前且无已提交记录，具体日期由 Semester 配置 | ADR-054；阻塞 `ENROLL-WITHDRAW` |
| 管理员是否可看完整媒体 | 默认可看；仅事件调查授权；永不 | 仅有期限的事件调查授权 | ADR-068；不阻塞核心审核，阻塞管理员媒体接口 |
| ScoreRule 修改是否双人批准 | 已冻结：两名不同 ACTIVE ADMIN，且创建者不得批准 | 两人审批已获项目负责人批准 | ADR-069 ACCEPTED；不再阻塞规则激活 |
| 归档成绩修正流程 | 已冻结：V1 永久禁止 correction-window 命令 | 调整必须走独立 ScoreAdjustment 审批 | ADR-026 SUPERSEDED；真实 default deny |
| 是否保留管理员代行教师 | 永不；临时授权 | 默认无；如校方确认再建临时授权资源 | ADR-033 已接受“默认无”；临时授权需新 ADR/对象，不阻塞默认权限 |
| 多教师、代课或责任教师交接 | V1 已选单责任教师；未来可建多人 Assignment/限时代课 | 当前固定单一 `ClassSection.teacherId`；未来通过新 ADR、对象和 migration 扩展 | V1 已关闭；不阻塞现有单教师归属校验 |

## 11. OpenAPI 机器权限合同

### 11.1 固定字段与词汇

`openapi.yaml` 中每个 operation 都必须声明完整 `x-access-policy`，字段固定为：`policyId`、`authentication`、`allowedRoles`、`organizationScope`、`resourceScope`、`resourceResolver`、`defaultDeny`。缺字段、未知词汇、重复 ID、无法解析资源或 `defaultDeny != true` 均属于构建失败，运行时也必须在产生副作用前拒绝。

| 字段 | 允许值/规则 |
|---|---|
| `policyId` | 全局唯一、大写 kebab-case；与下方 registry 一一对应 |
| `authentication` | `PUBLIC`、`ACCESS_TOKEN`、`JOIN_CAPABILITY` |
| `allowedRoles` | 仅 `STUDENT`、`TEACHER`、`ADMIN`；`PUBLIC`/`JOIN_CAPABILITY` 必须为空数组 |
| `organizationScope` | `NONE`、`PRINCIPAL_ORGANIZATION`、`CAPABILITY_ORGANIZATION` |
| `resourceScope` | `NONE`、`SESSION`、`SELF`、`ORGANIZATION`、`ROLE_SCOPED`、`TEACHER_CLASS_SECTION`、`PUBLIC_INVITE`、`CAPABILITY_CLASS_SECTION` |
| `resourceResolver` | registry 中的非空大写稳定 resolver ID；`resourceScope=NONE` 仅允许 `NONE` |
| `defaultDeny` | 固定 `true`；策略加载、主体、角色、组织、资源或状态任一步无法证明允许时拒绝 |

`x-default-deny-error` 是在机器授权之外的功能门：即使角色、组织和资源均通过，V1 仍必须稳定返回该错误且不产生副作用。它不能替代 `x-access-policy`。

### 11.2 一一映射 registry

以下区块由 OpenAPI 合同生成并由 `tools/backend-contracts/check-contract.mjs` 双向核对；不得手工维护两份不一致的权限清单。

生成命令：`npm --prefix tools/backend-contracts run permission-registry:write`；只读核对：`npm --prefix tools/backend-contracts run permission-registry:check`。默认契约检查同时执行只读核对。

V8.1 本地草稿的 113 个早期 camelCase 权限编号已规范为大写连字符形式。历史请求日志保持原编号，映射见 `docs/implementation/permission-policy-id-mapping-20260908.json`；不回写旧审计或日志。operationId、角色、组织范围、资源限制和幂等业务键保持原值。

<!-- ACCESS_POLICY_REGISTRY:START -->
<!-- Generated from openapi.yaml; do not edit rows by hand. -->
| Method | Path | operationId | policyId | Auth | Roles | Org scope | Resource scope | Resolver | Default deny |
|---|---|---|---|---|---|---|---|---|---|
| `GET` | `/health/live` | `getHealthLive` | `PUBLIC-HEALTH-LIVE` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `GET` | `/health/ready` | `getHealthReady` | `PUBLIC-HEALTH-READY` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `GET` | `/health/admin` | `getAdminHealth` | `ADMIN-HEALTH-READ` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `GET` | `/system-mode` | `getSystemMode` | `PUBLIC-SYSTEM-MODE-READ` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `GET` | `/organizations/current` | `getCurrentOrganization` | `ORGANIZATION-CURRENT-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `GET` | `/semesters/current` | `getCurrentSemester` | `SEMESTER-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `POST` | `/auth/password-login` | `passwordLogin` | `AUTH-PASSWORD-LOGIN` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `POST` | `/auth/refresh` | `refreshSession` | `AUTH-REFRESH` | `PUBLIC` | `-` | `NONE` | `SESSION` | `REFRESH_TOKEN` | `true` |
| `POST` | `/auth/logout` | `logoutSession` | `AUTH-LOGOUT` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SESSION` | `AUTHENTICATED_SESSION` | `true` |
| `GET` | `/me` | `getCurrentUser` | `USER-SELF-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/me/email-verification-challenges` | `requestCurrentUserEmailChallenge` | `USER-EMAIL-VERIFY-REQUEST` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/me/email-verification-challenges/{challengeId}/verify` | `verifyCurrentUserEmailChallenge` | `USER-EMAIL-VERIFY-COMPLETE` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/students` | `listStudents` | `STUDENT-LIST` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `STUDENT_LIST_SCOPE` | `true` |
| `GET` | `/students/{studentId}` | `getStudent` | `STUDENT-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `STUDENT_FROM_PATH` | `true` |
| `PATCH` | `/students/{studentId}` | `updateStudent` | `STUDENT-UPDATE` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `STUDENT_FROM_PATH` | `true` |
| `GET` | `/teachers/{teacherId}` | `getTeacher` | `TEACHER-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `TEACHER_FROM_PATH` | `true` |
| `GET` | `/teachers/{teacherId}/class-sections` | `listTeacherClassSections` | `TEACHER-CLASS-SECTION-LIST` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `TEACHER_FROM_PATH` | `true` |
| `GET` | `/courses` | `listCourses` | `COURSE-LIST` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `POST` | `/courses` | `createCourse` | `COURSE-CREATE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `GET` | `/courses/{courseId}` | `getCourse` | `COURSE-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `COURSE_FROM_PATH` | `true` |
| `PATCH` | `/courses/{courseId}` | `updateCourse` | `COURSE-UPDATE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `COURSE_FROM_PATH` | `true` |
| `GET` | `/class-sections` | `listClassSections` | `CLASS-SECTION-LIST` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `CLASS_SECTION_LIST_SCOPE` | `true` |
| `POST` | `/class-sections` | `createClassSection` | `CLASS-SECTION-CREATE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `CLASS_SECTION_FROM_REQUEST` | `true` |
| `GET` | `/class-sections/{classSectionId}` | `getClassSection` | `CLASS-SECTION-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `CLASS_SECTION_FROM_PATH` | `true` |
| `PATCH` | `/class-sections/{classSectionId}` | `updateClassSection` | `CLASS-SECTION-UPDATE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `CLASS_SECTION_FROM_PATH` | `true` |
| `POST` | `/class-sections/{classSectionId}/close` | `closeClassSection` | `CLASS-SECTION-CLOSE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `CLASS_SECTION_FROM_PATH` | `true` |
| `GET` | `/enrollments` | `listEnrollments` | `ENROLLMENT-LIST` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `ENROLLMENT_LIST_SCOPE` | `true` |
| `POST` | `/class-sections/{classSectionId}/enrollments` | `manuallyEnrollStudent` | `ENROLLMENT-MANUAL-ADD` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `CLASS_SECTION_FROM_PATH` | `true` |
| `GET` | `/enrollments/{enrollmentId}` | `getEnrollment` | `ENROLLMENT-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `ENROLLMENT_FROM_PATH` | `true` |
| `POST` | `/enrollments/{enrollmentId}/withdraw` | `withdrawEnrollment` | `ENROLLMENT-WITHDRAW` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `ENROLLMENT_FROM_PATH` | `true` |
| `POST` | `/enrollments/{enrollmentId}/remove` | `removeEnrollment` | `ENROLLMENT-REMOVE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ENROLLMENT_FROM_PATH` | `true` |
| `POST` | `/enrollments/{enrollmentId}/restore` | `restoreEnrollment` | `ENROLLMENT-RESTORE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ENROLLMENT_FROM_PATH` | `true` |
| `POST` | `/class-sections/{classSectionId}/course-invites` | `createCourseInvite` | `COURSE-INVITE-CREATE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `CLASS_SECTION_FROM_PATH` | `true` |
| `GET` | `/course-invites/{inviteToken}/preview` | `previewCourseInvite` | `PUBLIC-COURSE-INVITE-PREVIEW` | `PUBLIC` | `-` | `NONE` | `PUBLIC_INVITE` | `COURSE_INVITE_FROM_PATH` | `true` |
| `POST` | `/course-invites/{inviteToken}/join-capabilities` | `issueJoinCapability` | `PUBLIC-JOIN-CAPABILITY-ISSUE` | `PUBLIC` | `-` | `NONE` | `PUBLIC_INVITE` | `COURSE_INVITE_FROM_PATH` | `true` |
| `POST` | `/course-invites/{inviteToken}/join` | `joinClassSectionWithInvite` | `ENROLLMENT-JOIN` | `JOIN_CAPABILITY` | `-` | `CAPABILITY_ORGANIZATION` | `CAPABILITY_CLASS_SECTION` | `JOIN_CAPABILITY` | `true` |
| `GET` | `/class-sections/{classSectionId}/roster-imports` | `listRosterImports` | `ROSTER-IMPORT-LIST` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `ROSTER_CLASS_SECTION_READ_SCOPE` | `true` |
| `POST` | `/class-sections/{classSectionId}/roster-imports` | `createRosterImport` | `ROSTER-IMPORT-CREATE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `CLASS_SECTION_FROM_PATH` | `true` |
| `GET` | `/class-sections/{classSectionId}/roster-imports/current` | `getCurrentRosterImport` | `ROSTER-IMPORT-CURRENT-READ` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `ROSTER_CLASS_SECTION_READ_SCOPE` | `true` |
| `GET` | `/roster-imports/{rosterImportId}` | `getRosterImport` | `ROSTER-IMPORT-READ` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `ROSTER_IMPORT_READ_SCOPE` | `true` |
| `POST` | `/roster-imports/{rosterImportId}/rollback` | `rollbackRosterImport` | `ROSTER-IMPORT-ROLLBACK` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_IMPORT_FROM_PATH` | `true` |
| `GET` | `/roster-imports/{rosterImportId}/entries` | `listRosterEntries` | `ROSTER-ENTRY-LIST` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `ROSTER_IMPORT_READ_SCOPE` | `true` |
| `POST` | `/roster-imports/{rosterImportId}/align` | `alignRosterImport` | `ROSTER-IMPORT-ALIGN` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_IMPORT_FROM_PATH` | `true` |
| `GET` | `/roster-alignment-results` | `listRosterAlignmentResults` | `ROSTER-ALIGNMENT-LIST` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `ROSTER_ALIGNMENT_LIST_SCOPE` | `true` |
| `GET` | `/roster-alignment-results/{alignmentResultId}` | `getRosterAlignmentResult` | `ROSTER-ALIGNMENT-READ` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `ROSTER_ALIGNMENT_READ_SCOPE` | `true` |
| `POST` | `/roster-alignment-results/{alignmentResultId}/confirm` | `confirmRosterAlignmentResult` | `ROSTER-ALIGNMENT-CONFIRM` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_ALIGNMENT_FROM_PATH` | `true` |
| `POST` | `/roster-alignment-results/{alignmentResultId}/resolve` | `resolveRosterAlignmentResult` | `ROSTER-ALIGNMENT-RESOLVE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_ALIGNMENT_FROM_PATH` | `true` |
| `POST` | `/roster-alignment-results/{alignmentResultId}/ignore` | `ignoreRosterAlignmentResult` | `ROSTER-ALIGNMENT-IGNORE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_ALIGNMENT_FROM_PATH` | `true` |
| `POST` | `/roster-alignment-results/{alignmentResultId}/reopen` | `reopenRosterAlignmentResult` | `ROSTER-ALIGNMENT-REOPEN` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `ROSTER_ALIGNMENT_FROM_PATH` | `true` |
| `POST` | `/exercise-sessions` | `startExerciseSession` | `EXERCISE-SESSION-START` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `ENROLLMENT_FROM_REQUEST` | `true` |
| `GET` | `/exercise-sessions/active` | `getActiveExerciseSession` | `EXERCISE-SESSION-ACTIVE-READ` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_STUDENT` | `true` |
| `GET` | `/exercise-sessions/{sessionId}` | `getExerciseSession` | `EXERCISE-SESSION-READ` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_PATH` | `true` |
| `POST` | `/exercise-sessions/{sessionId}/pause` | `pauseExerciseSession` | `EXERCISE-SESSION-PAUSE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_PATH` | `true` |
| `POST` | `/exercise-sessions/{sessionId}/resume` | `resumeExerciseSession` | `EXERCISE-SESSION-RESUME` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_PATH` | `true` |
| `POST` | `/exercise-sessions/{sessionId}/finish` | `finishExerciseSession` | `EXERCISE-SESSION-FINISH` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_PATH` | `true` |
| `POST` | `/exercise-sessions/{sessionId}/cancel` | `cancelExerciseSession` | `EXERCISE-SESSION-CANCEL` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_PATH` | `true` |
| `POST` | `/exercise-sessions/{sessionId}/reconcile` | `reconcileExerciseSession` | `EXERCISE-SESSION-RECONCILE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_PATH` | `true` |
| `GET` | `/exercise-records` | `listExerciseRecords` | `EXERCISE-RECORD-LIST` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `EXERCISE_RECORD_LIST_SCOPE` | `true` |
| `POST` | `/exercise-records` | `createExerciseRecordDraft` | `EXERCISE-RECORD-CREATE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_REQUEST` | `true` |
| `GET` | `/exercise-records/{recordId}` | `getExerciseRecord` | `EXERCISE-RECORD-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `PATCH` | `/exercise-records/{recordId}` | `updateExerciseRecordDraft` | `EXERCISE-RECORD-UPDATE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `GET` | `/exercise-records/{recordId}/evidence-context` | `getExerciseRecordEvidenceContext` | `EXERCISE-RECORD-EVIDENCE-CONTEXT-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `POST` | `/exercise-records/{recordId}/submit` | `submitExerciseRecord` | `EXERCISE-RECORD-SUBMIT` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `POST` | `/exercise-records/{recordId}/discard` | `discardExerciseRecord` | `EXERCISE-RECORD-DISCARD` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `POST` | `/exercise-records/{recordId}/withdraw` | `withdrawExerciseRecord` | `EXERCISE-RECORD-WITHDRAW` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `POST` | `/media-uploads` | `initiateMediaUpload` | `MEDIA-UPLOAD-INITIATE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `MEDIA_TARGET_FROM_REQUEST` | `true` |
| `POST` | `/media-uploads/{uploadSessionId}/confirm` | `confirmMediaUpload` | `MEDIA-UPLOAD-CONFIRM` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `MEDIA_UPLOAD_FROM_PATH` | `true` |
| `GET` | `/media/{mediaId}` | `getMediaEvidence` | `MEDIA-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `MEDIA_FROM_PATH` | `true` |
| `POST` | `/media/{mediaId}/bind` | `bindMediaEvidence` | `MEDIA-BIND` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `MEDIA_FROM_PATH` | `true` |
| `POST` | `/media/{mediaId}/access-url` | `createMediaAccessUrl` | `MEDIA-ACCESS-URL` | `ACCESS_TOKEN` | `STUDENT,TEACHER` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `MEDIA_FROM_PATH` | `true` |
| `GET` | `/exercise-records/{recordId}/reviews` | `listExerciseRecordReviews` | `EXERCISE-REVIEW-LIST` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `POST` | `/exercise-records/{recordId}/reviews` | `reviewExerciseRecord` | `EXERCISE-REVIEW-CREATE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `POST` | `/exercise-records/{recordId}/reviews/reopen` | `reopenExerciseRecordReview` | `EXERCISE-REVIEW-REOPEN` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `POST` | `/exercise-reviews/batch` | `batchReviewExerciseRecords` | `EXERCISE-REVIEW-BATCH` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `BATCH_EXERCISE_RECORDS_FROM_BODY` | `true` |
| `GET` | `/class-sections/{classSectionId}/score-rules` | `listScoreRules` | `SCORE-RULE-LIST` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `CLASS_SECTION_FROM_PATH` | `true` |
| `POST` | `/class-sections/{classSectionId}/score-rules` | `createScoreRule` | `SCORE-RULE-CREATE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `GET` | `/score-rules/{scoreRuleId}` | `getScoreRule` | `SCORE-RULE-READ` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `SCORE_RULE_FROM_PATH` | `true` |
| `POST` | `/score-rules/{scoreRuleId}/submit-approval` | `submitScoreRuleForApproval` | `SCORE-RULE-SUBMIT-APPROVAL` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `SCORE_RULE_FROM_PATH` | `true` |
| `POST` | `/score-rules/{scoreRuleId}/approve` | `approveScoreRule` | `SCORE-RULE-APPROVE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `SCORE_RULE_FROM_PATH` | `true` |
| `POST` | `/score-rules/{scoreRuleId}/reject` | `rejectScoreRule` | `SCORE-RULE-REJECT` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `SCORE_RULE_FROM_PATH` | `true` |
| `GET` | `/student-scores` | `listStudentScores` | `STUDENT-SCORE-LIST` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `STUDENT_SCORE_LIST_SCOPE` | `true` |
| `GET` | `/student-scores/{studentScoreId}` | `getStudentScore` | `STUDENT-SCORE-READ` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `STUDENT_SCORE_FROM_PATH` | `true` |
| `POST` | `/student-scores/{studentScoreId}/recalculate` | `recalculateStudentScore` | `STUDENT-SCORE-RECALCULATE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `STUDENT_SCORE_FROM_PATH` | `true` |
| `POST` | `/student-scores/{studentScoreId}/publish` | `publishStudentScore` | `STUDENT-SCORE-PUBLISH` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `STUDENT_SCORE_FROM_PATH` | `true` |
| `POST` | `/student-scores/{studentScoreId}/open-correction` | `openStudentScoreCorrection` | `STUDENT-SCORE-OPEN-CORRECTION` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `STUDENT_SCORE_FROM_PATH` | `true` |
| `GET` | `/student-scores/{studentScoreId}/adjustments` | `listScoreAdjustments` | `SCORE-ADJUSTMENT-LIST` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `STUDENT_SCORE_FROM_PATH` | `true` |
| `POST` | `/student-scores/{studentScoreId}/adjustments` | `createScoreAdjustment` | `SCORE-ADJUSTMENT-CREATE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `STUDENT_SCORE_FROM_PATH` | `true` |
| `POST` | `/score-adjustments/{scoreAdjustmentId}/approve` | `approveScoreAdjustment` | `SCORE-ADJUSTMENT-APPROVE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `SCORE_ADJUSTMENT_FROM_PATH` | `true` |
| `POST` | `/score-adjustments/{scoreAdjustmentId}/reject` | `rejectScoreAdjustment` | `SCORE-ADJUSTMENT-REJECT` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `SCORE_ADJUSTMENT_FROM_PATH` | `true` |
| `GET` | `/exports` | `listExports` | `EXPORT-LIST` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `EXPORT_LIST_SCOPE` | `true` |
| `POST` | `/exports` | `createExport` | `EXPORT-CREATE` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `EXPORT_SCOPE_FROM_BODY` | `true` |
| `GET` | `/exports/{exportId}` | `getExport` | `EXPORT-READ` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `EXPORT_FROM_PATH` | `true` |
| `POST` | `/exports/{exportId}/download-url` | `createExportDownloadUrl` | `EXPORT-DOWNLOAD-URL` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `EXPORT_FROM_PATH` | `true` |
| `GET` | `/audit-logs` | `listAuditLogs` | `AUDIT-LOG-LIST` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `GET` | `/audit-logs/{auditLogId}` | `getAuditLog` | `AUDIT-LOG-READ` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `AUDIT_LOG_FROM_PATH` | `true` |
| `POST` | `/auth/student-sign-in-codes` | `requestStudentSignInCode` | `AUTH-STUDENT-CODE-REQUEST` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `POST` | `/auth/student-sign-in-codes/verify` | `verifyStudentSignInCode` | `AUTH-STUDENT-CODE-VERIFY` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `POST` | `/auth/account-recovery-requests` | `requestAccountRecovery` | `AUTH-ACCOUNT-RECOVERY-REQUEST` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `POST` | `/auth/account-recovery-requests/complete` | `completeAccountRecovery` | `AUTH-ACCOUNT-RECOVERY-COMPLETE` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `GET` | `/notifications` | `listNotifications` | `NOTIFICATION-LIST` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/notifications/{notificationId}/read` | `markNotificationRead` | `NOTIFICATION-MARK-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/push-devices` | `registerPushDevice` | `PUSH-DEVICE-REGISTER` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `DELETE` | `/push-devices/{deviceId}` | `unregisterPushDevice` | `PUSH-DEVICE-UNREGISTER` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/me/preferences` | `getCurrentUserPreferences` | `USER-PREFERENCES-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `PATCH` | `/me/preferences` | `updateCurrentUserPreferences` | `USER-PREFERENCES-UPDATE` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/help-articles` | `listHelpArticles` | `PUBLIC-HELP-ARTICLE-LIST` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `GET` | `/help-articles/{articleId}` | `getHelpArticle` | `PUBLIC-HELP-ARTICLE-READ` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `GET` | `/feedback` | `listFeedback` | `FEEDBACK-LIST` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `NONE` | `true` |
| `POST` | `/feedback` | `createFeedback` | `FEEDBACK-CREATE` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/feedback/{feedbackId}` | `getFeedback` | `FEEDBACK-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `NONE` | `true` |
| `GET` | `/exemption-application-details` | `listStructuredExemptionApplications` | `EXEMPTION-APPLICATION-STRUCTURED-LIST` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `NONE` | `true` |
| `GET` | `/exemption-applications` | `listExemptionApplications` | `EXEMPTION-APPLICATION-LIST` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `NONE` | `true` |
| `POST` | `/exemption-applications` | `createExemptionApplication` | `EXEMPTION-APPLICATION-CREATE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_STUDENT` | `true` |
| `GET` | `/exemption-applications/{applicationId}` | `getExemptionApplication` | `EXEMPTION-APPLICATION-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `NONE` | `true` |
| `PATCH` | `/exemption-applications/{applicationId}` | `updateExemptionApplication` | `EXEMPTION-APPLICATION-UPDATE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_STUDENT` | `true` |
| `POST` | `/exemption-applications/{applicationId}/submit` | `submitExemptionApplication` | `EXEMPTION-APPLICATION-SUBMIT` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_STUDENT` | `true` |
| `POST` | `/exemption-applications/{applicationId}/review` | `reviewExemptionApplication` | `EXEMPTION-APPLICATION-REVIEW` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `TEACHER_CLASS_SECTION` | `NONE` | `true` |
| `GET` | `/app-release-policy` | `getAppReleasePolicy` | `PUBLIC-APP-RELEASE-POLICY-READ` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `GET` | `/sport-catalog` | `getSportCatalog` | `SPORT-CATALOG-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `GET` | `/activity-conversion-rules` | `getActivityConversionRules` | `ACTIVITY-CONVERSION-RULE-READ` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `POST` | `/exercise-sessions/{sessionId}/location-track` | `startExerciseLocationTrack` | `LOCATION-TRACK-START` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_PATH` | `true` |
| `POST` | `/exercise-sessions/{sessionId}/location-samples` | `appendExerciseLocationSamples` | `LOCATION-SAMPLE-APPEND` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_PATH` | `true` |
| `POST` | `/exercise-sessions/{sessionId}/location-track/finalize` | `finalizeExerciseLocationTrack` | `LOCATION-TRACK-FINALIZE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `EXERCISE_SESSION_FROM_PATH` | `true` |
| `GET` | `/exercise-records/{recordId}/location-summary` | `getExerciseRecordLocationSummary` | `LOCATION-SUMMARY-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ROLE_SCOPED` | `EXERCISE_RECORD_FROM_PATH` | `true` |
| `GET` | `/location-privacy-policy` | `getLocationPrivacyPolicy` | `LOCATION-PRIVACY-POLICY-READ` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `PATCH` | `/location-privacy-policy` | `updateLocationPrivacyPolicy` | `LOCATION-PRIVACY-POLICY-UPDATE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `GET` | `/class-sections/{classSectionId}/v81-rules` | `getV81CourseRules` | `GET-V81-COURSE-RULES` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/class-sections/{classSectionId}/v81-rules` | `saveV81CourseRules` | `SAVE-V81-COURSE-RULES` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/review-services/manual-mode` | `setV81ManualMode` | `SET-V81-MANUAL-MODE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/exercise-records/{recordId}/v81-reviews` | `reviewV81Record` | `REVIEW-V81-RECORD` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/exercise-records/{recordId}/workflow` | `getV81RecordWorkflow` | `GET-V81-RECORD-WORKFLOW` | `ACCESS_TOKEN` | `STUDENT,TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/exercise-records/{recordId}/supplements` | `submitV81Supplement` | `SUBMIT-V81-SUPPLEMENT` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/exercise-records/{recordId}/corrections` | `correctV81Record` | `CORRECT-V81-RECORD` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/system-mode/announcement` | `getV81MaintenanceAnnouncement` | `GET-V81-MAINTENANCE-ANNOUNCEMENT` | `PUBLIC` | `-` | `NONE` | `NONE` | `NONE` | `true` |
| `GET` | `/system-mode/history` | `getV81SystemModeHistory` | `GET-V81-SYSTEM-MODE-HISTORY` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/system-mode/changes` | `changeV81SystemMode` | `CHANGE-V81-SYSTEM-MODE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/exercise-records/{recordId}/supplement-clock` | `getV81SupplementClock` | `GET-V81-SUPPLEMENT-CLOCK` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/auth/account-security` | `getV81AccountSecurity` | `GET-V81-ACCOUNT-SECURITY` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/auth/own-password` | `changeOwnV81Password` | `CHANGE-OWN-V81-PASSWORD` | `ACCESS_TOKEN` | `TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/subadmins` | `listV81Subadmins` | `LIST-V81-SUBADMINS` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/subadmins` | `createV81VerifiedSubadmin` | `CREATE-V81-VERIFIED-SUBADMIN` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/subadmins/{id}/status` | `setV81SubadminStatus` | `SET-V81-SUBADMIN-STATUS` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/student-progress` | `listV81StudentProgress` | `LIST-V81-STUDENT-PROGRESS` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/teacher-progress` | `listV81TeacherProgress` | `LIST-V81-TEACHER-PROGRESS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{id}/progress-target` | `getV81ProgressTarget` | `GET-V81-PROGRESS-TARGET` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/activity-certification-applications` | `listV81Certifications` | `LIST-V81-CERTIFICATIONS` | `ACCESS_TOKEN` | `STUDENT,TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/activity-certification-applications/{id}/recognition-allocation-revisions` | `listV81RecognitionRevisions` | `LIST-V81-RECOGNITION-REVISIONS` | `ACCESS_TOKEN` | `STUDENT,TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/activity-certification-applications/{id}/recognition-allocation-revisions` | `adjustV81Recognition` | `ADJUST-V81-RECOGNITION` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/activity-certification-applications/{id}/revoke` | `revokeV81Certification` | `REVOKE-V81-CERTIFICATION` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/review-services/manual-mode/{classSectionId}` | `getV81ManualMode` | `GET-V81-MANUAL-MODE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/exercise-records/{recordId}/swim-intake` | `acceptV81SwimIntake` | `ACCEPT-V81-SWIM-INTAKE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/exercise-records/{recordId}/swim-intake` | `getV81SwimIntake` | `GET-V81-SWIM-INTAKE` | `ACCESS_TOKEN` | `STUDENT,TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/student/proof-todos` | `listV81ProofTodos` | `LIST-V81-PROOF-TODOS` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/enrollments/{enrollmentId}/final-grades` | `listV81FinalGrades` | `LIST-V81-FINAL-GRADES` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/enrollments/{enrollmentId}/final-grades` | `appendV81FinalGrade` | `APPEND-V81-FINAL-GRADE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/settlement-check` | `getV81SettlementCheck` | `GET-V81-SETTLEMENT-CHECK` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/feedback/{feedbackId}` | `getV81FeedbackDetail` | `GET-V81-FEEDBACK-DETAIL` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/feedback/{feedbackId}/handling` | `handleV81Feedback` | `HANDLE-V81-FEEDBACK` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/feedback` | `listV81Feedback` | `LIST-V81-FEEDBACK` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/student/feedback/{feedbackId}/history` | `getV81StudentFeedbackHistory` | `GET-V81-STUDENT-FEEDBACK-HISTORY` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/help-articles` | `createV81HelpArticle` | `CREATE-V81-HELP-ARTICLE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/help-articles` | `listV81HelpArticles` | `LIST-V81-HELP-ARTICLES` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/help-articles/{articleId}` | `saveV81HelpArticle` | `SAVE-V81-HELP-ARTICLE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/help-articles/{articleId}` | `getV81HelpArticle` | `GET-V81-HELP-ARTICLE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/student/help-articles` | `listV81StudentHelpArticles` | `LIST-V81-STUDENT-HELP-ARTICLES` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/student/help-articles/{articleId}` | `getV81StudentHelpArticle` | `GET-V81-STUDENT-HELP-ARTICLE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/endurance-tables` | `listV81EnduranceTables` | `LIST-V81-ENDURANCE-TABLES` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/endurance-tables/rules` | `createV81EnduranceRule` | `CREATE-V81-ENDURANCE-RULE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/endurance-tables/rules/{ruleId}` | `updateV81EnduranceRule` | `UPDATE-V81-ENDURANCE-RULE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/endurance-tables/rules/{ruleId}/delete` | `deleteV81EnduranceRule` | `DELETE-V81-ENDURANCE-RULE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/enrollments/{enrollmentId}/physical-results` | `listV81PhysicalResults` | `LIST-V81-PHYSICAL-RESULTS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/enrollments/{enrollmentId}/physical-results` | `appendV81PhysicalResult` | `APPEND-V81-PHYSICAL-RESULT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/student/enrollments/{enrollmentId}/physical-result` | `getV81StudentPhysicalResult` | `GET-V81-STUDENT-PHYSICAL-RESULT` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/class-sections/{classSectionId}/physical-imports` | `createV81PhysicalImport` | `CREATE-V81-PHYSICAL-IMPORT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/physical-imports` | `listV81PhysicalImports` | `LIST-V81-PHYSICAL-IMPORTS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/physical-imports/{importId}` | `getV81PhysicalImport` | `GET-V81-PHYSICAL-IMPORT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/physical-imports/{importId}/revisions` | `reviseV81PhysicalImport` | `REVISE-V81-PHYSICAL-IMPORT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/physical-imports/{importId}/revisions` | `listV81PhysicalImportRevisions` | `LIST-V81-PHYSICAL-IMPORT-REVISIONS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/physical-imports/{importId}/confirm` | `confirmV81PhysicalImport` | `CONFIRM-V81-PHYSICAL-IMPORT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/physical-imports/{importId}/source` | `getV81PhysicalImportSource` | `GET-V81-PHYSICAL-IMPORT-SOURCE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/class-sections/{classSectionId}/physical-imports/xlsx` | `createV81PhysicalXlsxImport` | `CREATE-V81-PHYSICAL-XLSX-IMPORT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/teacher-imports/preview` | `previewV81TeacherImport` | `PREVIEW-V81-TEACHER-IMPORT` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/teacher-imports/confirm` | `confirmV81TeacherImport` | `CONFIRM-V81-TEACHER-IMPORT` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/teacher-accounts` | `listV81TeacherAccounts` | `LIST-V81-TEACHER-ACCOUNTS` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/semesters` | `createV81Semester` | `CREATE-V81-SEMESTER` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/semesters` | `listV81Semesters` | `LIST-V81-SEMESTERS` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/semesters/{id}` | `updateV81Semester` | `UPDATE-V81-SEMESTER` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/roster-imports/{rosterImportId}/registration-preview` | `previewV81RosterRegistration` | `PREVIEW-V81-ROSTER-REGISTRATION` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/roster-imports/{rosterImportId}/confirmation` | `getV81RosterConfirmation` | `GET-V81-ROSTER-CONFIRMATION` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/roster-imports/{rosterImportId}/confirmation` | `confirmV81Roster` | `CONFIRM-V81-ROSTER` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/composite-roster` | `previewV81CompositeRoster` | `PREVIEW-V81-COMPOSITE-ROSTER` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/composite-roster/export` | `exportV81CompositeRosterPreview` | `EXPORT-V81-COMPOSITE-ROSTER-PREVIEW` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/roster-imports/{rosterImportId}/source` | `getV81RosterSource` | `GET-V81-ROSTER-SOURCE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/enrollments/{enrollmentId}/roster-status` | `getV81OwnRosterStatus` | `GET-V81-OWN-ROSTER-STATUS` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/class-sections/{classSectionId}/roster-summary` | `getV81AdminRosterSummary` | `GET-V81-ADMIN-ROSTER-SUMMARY` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/course-directory` | `getV81AdminCourseDirectory` | `GET-V81-ADMIN-COURSE-DIRECTORY` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/class-sections/{classSectionId}/physical-summary` | `getV81AdminPhysicalSummary` | `GET-V81-ADMIN-PHYSICAL-SUMMARY` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/class-sections/{classSectionId}/ocr-roster-batches` | `createV81OcrRosterBatch` | `CREATE-V81-OCR-ROSTER-BATCH` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/class-sections/{classSectionId}/ocr-physical-batches` | `createV81OcrPhysicalBatch` | `CREATE-V81-OCR-PHYSICAL-BATCH` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/ocr-batches` | `listV81OcrBatches` | `LIST-V81-OCR-BATCHES` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/ocr-batches/{batchId}` | `getV81OcrBatch` | `GET-V81-OCR-BATCH` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/ocr-batches/{batchId}/pages/{pageId}/source` | `getV81OcrPageSource` | `GET-V81-OCR-PAGE-SOURCE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/ocr-batches/{batchId}/pages/{pageId}/recognition` | `getV81OcrPageRecognition` | `GET-V81-OCR-PAGE-RECOGNITION` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/ocr-batches/{batchId}/pages/{pageId}/recognition` | `createV81OcrJob` | `CREATE-V81-OCR-JOB` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/ocr-jobs/{jobId}` | `getV81OcrJob` | `GET-V81-OCR-JOB` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/ocr-batches/{batchId}/draft` | `getV81OcrDraft` | `GET-V81-OCR-DRAFT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/ocr-batches/{batchId}/draft` | `createV81OcrDraft` | `CREATE-V81-OCR-DRAFT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/ocr-batches/{batchId}/draft/revisions` | `reviseV81OcrDraft` | `REVISE-V81-OCR-DRAFT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/ocr-batches/{batchId}/physical-confirmations` | `getV81OcrPhysicalConfirmation` | `GET-V81-OCR-PHYSICAL-CONFIRMATION` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/ocr-batches/{batchId}/physical-confirmations` | `confirmV81OcrPhysicalRows` | `CONFIRM-V81-OCR-PHYSICAL-ROWS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/ocr-batches/{batchId}/roster-confirmation` | `getV81OcrRosterConfirmation` | `GET-V81-OCR-ROSTER-CONFIRMATION` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/ocr-batches/{batchId}/roster-confirmation` | `confirmV81OcrRoster` | `CONFIRM-V81-OCR-ROSTER` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/roster-basis` | `getV81RosterBasis` | `GET-V81-ROSTER-BASIS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/class-sections/{classSectionId}/roster-basis` | `selectV81RosterBasis` | `SELECT-V81-ROSTER-BASIS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/roster-basis/snapshots` | `listV81ConfirmedRosterSnapshots` | `LIST-V81-CONFIRMED-ROSTER-SNAPSHOTS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/makeup-windows` | `listV81MakeupWindows` | `LIST-V81-MAKEUP-WINDOWS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/class-sections/{classSectionId}/makeup-windows` | `createV81MakeupWindow` | `CREATE-V81-MAKEUP-WINDOW` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/makeup-windows/{windowId}/revocation` | `revokeV81MakeupWindow` | `REVOKE-V81-MAKEUP-WINDOW` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/enrollments/{enrollmentId}/makeup-windows` | `listV81OwnMakeupWindows` | `LIST-V81-OWN-MAKEUP-WINDOWS` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/semesters/{id}/switch-check` | `getV81SemesterSwitchCheck` | `GET-V81-SEMESTER-SWITCH-CHECK` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/rule-templates` | `listV81RuleTemplates` | `LIST-V81-RULE-TEMPLATES` | `ACCESS_TOKEN` | `ADMIN,TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/rule-templates` | `publishV81RuleTemplate` | `PUBLISH-V81-RULE-TEMPLATE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/rule-templates/{id}` | `getV81RuleTemplate` | `GET-V81-RULE-TEMPLATE` | `ACCESS_TOKEN` | `ADMIN,TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/audit-events` | `listV81AuditEvents` | `LIST-V81-AUDIT-EVENTS` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/audit-events/{source}/{eventId}` | `getV81AuditEvent` | `GET-V81-AUDIT-EVENT` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/runtime-archives` | `createV81RuntimeArchive` | `CREATE-V81-RUNTIME-ARCHIVE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/runtime-archives/{id}` | `getV81RuntimeArchive` | `GET-V81-RUNTIME-ARCHIVE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/runtime-archives/{id}/cancellation` | `cancelV81RuntimeArchive` | `CANCEL-V81-RUNTIME-ARCHIVE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/runtime-archives/{id}/download-url` | `createV81RuntimeArchiveDownload` | `CREATE-V81-RUNTIME-ARCHIVE-DOWNLOAD` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/runtime-archives/{id}/content` | `downloadV81RuntimeArchive` | `DOWNLOAD-V81-RUNTIME-ARCHIVE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/subadmins/{id}/permissions` | `setV81SubadminPermissions` | `SET-V81-SUBADMIN-PERMISSIONS` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/me/account-deletion-challenges` | `requestCurrentUserAccountDeletionChallenge` | `REQUEST-CURRENT-USER-ACCOUNT-DELETION-CHALLENGE` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/review-services/ocr` | `getV81OcrService` | `GET-V81-OCR-SERVICE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/admin/review-services/ocr/revisions` | `listV81OcrServiceRevisions` | `LIST-V81-OCR-SERVICE-REVISIONS` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/review-services/ocr/revisions` | `saveV81OcrService` | `SAVE-V81-OCR-SERVICE` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/subadmin-identity-challenges` | `requestV81SubadminIdentity` | `REQUEST-V81-SUBADMIN-IDENTITY` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/subadmin-identity-challenges/{id}/verify` | `verifyV81SubadminIdentity` | `VERIFY-V81-SUBADMIN-IDENTITY` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/subadmins/{id}/profile` | `updateV81VerifiedSubadmin` | `UPDATE-V81-VERIFIED-SUBADMIN` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/teachers/{id}/delete` | `deleteV81TeacherAccount` | `DELETE-V81-TEACHER-ACCOUNT` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/subadmins/{id}/delete` | `deleteV81Subadmin` | `DELETE-V81-SUBADMIN` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/teacher/courses` | `createV81TeacherCourse` | `CREATE-V81-TEACHER-COURSE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/class-sections/{classSectionId}/course-invites/revocations` | `revokeV81CourseInvite` | `REVOKE-V81-COURSE-INVITE` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/class-sections/{classSectionId}/settlement-reports` | `confirmV81Settlement` | `V81-SETTLEMENT-CONFIRM` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/settlement-reports` | `listV81SettlementReports` | `V81-SETTLEMENT-REPORT-LIST` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/settlement-reports/{version}` | `getV81SettlementReport` | `V81-SETTLEMENT-REPORT-READ` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/settlement-reports/{version}/export` | `exportV81SettlementReport` | `V81-SETTLEMENT-REPORT-EXPORT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/class-sections/{classSectionId}/settlement-preview` | `previewV81Settlement` | `V81-SETTLEMENT-PREVIEW` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/student/enrollments/{enrollmentId}/settlement-result` | `getV81StudentSettlementResult` | `V81-STUDENT-SETTLEMENT-READ` | `ACCESS_TOKEN` | `STUDENT` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/admin/semesters/{id}/switch` | `switchV81Semester` | `V81-SEMESTER-SWITCH` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `ORGANIZATION` | `PRINCIPAL_ORGANIZATION` | `true` |
| `GET` | `/admin/class-sections/{classSectionId}/settlement-summary` | `getV81AdminSettlementSummary` | `V81-ADMIN-SETTLEMENT-SUMMARY` | `ACCESS_TOKEN` | `ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/enrollments/{enrollmentId}/final-grades/corrections` | `correctV81FinalGrade` | `V81-FINAL-GRADE-CORRECT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/enrollments/{enrollmentId}/physical-results/corrections` | `correctV81PhysicalResult` | `V81-PHYSICAL-RESULT-CORRECT` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `POST` | `/audit-logs/client-errors` | `reportClientError` | `CLIENT-ERROR-REPORT` | `ACCESS_TOKEN` | `STUDENT,TEACHER,ADMIN` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
| `GET` | `/teacher/semesters` | `listV81TeacherSemesters` | `LIST-V81-TEACHER-SEMESTERS` | `ACCESS_TOKEN` | `TEACHER` | `PRINCIPAL_ORGANIZATION` | `SELF` | `PRINCIPAL_USER` | `true` |
<!-- ACCESS_POLICY_REGISTRY:END -->
