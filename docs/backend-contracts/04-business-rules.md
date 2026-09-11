# 体育打卡统一核心业务规则

> 阶段：4
>
> 状态：契约基线；未决项以 `decision-log.md` 的 `PROPOSED` 记录为准
>
> 裁决原则：所有最终状态、有效时长和成绩均由后端产生；客户端只负责采集、提示和非权威预估。

## Stage 21 客户端能力与 GPS 规则

1. Stage 21 当前共 31 个客户端支持 operation；其中 24 个进入本地集成路径，7 个继续真实 default deny。`IMPLEMENTED_VERIFIED` 只说明本地代码/数据库路径已闭合，不表示 Staging、iOS 二进制或生产验收已完成。
2. 本地实现范围包含通知、推送设备、本人偏好、帮助、反馈、App 版本政策、邮箱 OTP/找回、本人邮箱绑定/换绑和免测申请。mutation 必须复用 requestId、认证/范围、幂等、事务、历史事件、AuditLog 与 Outbox。
3. 通知读取严格限制为本人；当前没有业务通知生产者。设备注册只保存带用途绑定的加密 token，显式注销清除密文；当前没有 APNs/FCM provider、投递 worker、自动会话撤销 hook 或生产密钥轮换证据。
4. 帮助只返回 `PUBLISHED` 且 `publishedAt <= serverNow` 的安全内容；反馈非管理员只读本人、管理员只读本组织；当前没有帮助发布、反馈处理/回复 operation。
5. App 版本政策只读取当前生效且未过期的持久化政策；无政策稳定返回 `SYSTEM_MODE_UNSUPPORTED`。版本字符串保持 opaque，读取路径不得自行发明 iOS/Android 版本比较、签名、灰度或发布规则。
6. 邮箱验证码/找回 4、本人邮箱绑定/换绑 2 与免测 6 个 operation 已按 ADR-098/101 进入本地真实实现；运动目录/折算 2 与 GPS 6 个 operation 继续 stable default deny。SMTP 适配器已实现，但 Staging/Production 仍必须显式配置邮件服务，不能把本地 Mailpit 视为生产投递证据。
7. 未来 GPS 写入只能使用学生本人既有 ExerciseSession；`clientObservedAt` 和坐标是设备观测，不能改变服务端权威时长、`businessDate`、Record 或 Score。
8. GPS 原始经纬度只允许进入用途绑定的加密存储，不得进入公共 projection、日志、AuditLog、Outbox、通知或成绩事实；轨迹摘要必须按 ExerciseRecord 校验学生本人、责任教师或本组织管理员范围，并且只返回同一粗化投影。
9. 只有本组织 ADMIN 具备未来位置政策 mutation 的角色资格；当前 6 个位置 HTTP route 均 default deny。管理员不能据此代行教师审核。
10. 在同意/撤回、采样、精度、保留、删除、密钥托管/轮换、审计、异常检测和 Production Gate 全部批准前，`collectionEnabled` 不得成为有效生产事实；GPS 本地基础不能被描述为生产开放。
11. 免测申请按 ADR-104 使用结构化明细：更新后的客户端发送时，`PHYSICAL_TEST` 只接受 `RUN_800M/RUN_1000M` 且无组织名称；`EXERCISE_CHECK_IN` 只接受 `SCHOOL_TEAM/STUDENT_CLUB` 且必须有 1..128 字组织名称；`SPECIAL_CIRCUMSTANCE` 使用同名 subtype。三项同时省略仅作为既有 Contract 1.5 客户端兼容路径并投影为 legacy null，不能部分省略。前两类提交审核前至少有一份 AVAILABLE 私有材料，客户端不得把 subtype 或组织名拼入 `reason` 代替结构化字段。

## 1. 适用范围与冲突优先级

本文适用于 Android、未来 iOS、未来 Web 学生端、Web 教师端、Web 管理端和后端。发生冲突时，按以下顺序裁决：

1. 已确认的业务决策；
2. 本统一业务规则；
3. `openapi.yaml`；
4. 后端实现；
5. 客户端实现；
6. Mock 数据和展示文案。

低优先级内容不得反向定义高优先级规则。未确认事项不能以默认值、Mock 或客户端常量伪装成已确认规则。

## 2. 通用规则语义

- 时间点：API 使用带时区 RFC 3339；数据库保存 UTC；业务日期由服务端按教学班所属组织时区计算，当前 BNBU 默认 `Asia/Shanghai`。
- 时长：事实字段均为非负整数秒。`actualDurationSeconds` 是服务端接受的实际运动时长；`creditedDurationSeconds` 是按边界折算后的计入时长。
- 身份：请求中的 `userId`、`studentId`、`organizationId` 不构成授权依据，后端从认证主体和资源关系解析。
- 幂等：创建、提交、审核、重算等操作必须接受并持久化幂等键；相同主体、接口和键重复调用返回同一业务结果，不重复产生副作用。
- 并发：所有状态变更校验 `expectedVersion`；版本不匹配返回 `CONFLICT_VERSION_MISMATCH`，不得后写覆盖先写。
- 失败：业务校验必须在事务副作用之前完成；批量操作逐项授权、逐项返回结果。
- 审计：“是”表示必须写 `AuditLog`；Session 事件、ReviewRecord、ScoreAdjustment 等领域历史仍需单独保存，不能由 AuditLog 代替。

规则卡片拆成两张表。表 A 覆盖名称、目的、触发、输入和前置条件；表 B 覆盖后端校验与处理、输出、边界、错误码、成绩、审计、接口和状态转换。

## 3. 认证规则（AUTH）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| AUTH-001 | 建立认证主体 | 让后端获得不可伪造的用户、角色和组织范围 | 登录或验证码验证 | 凭证/验证码、设备摘要、requestId | User 存在；认证方式适用于该角色 |
| AUTH-002 | 刷新与撤销会话 | 在不扩大权限的前提下延续或终止登录 | 刷新、退出、禁用账户、凭证变更 | refresh token/device session、requestId | 会话属于本人且未撤销 |
| AUTH-003 | 写操作系统守卫 | 在只读或维护状态统一拒绝业务写 | 任一 mutation | 已认证主体、systemMode | 请求不是明确允许的健康检查/恢复操作 |
| AUTH-004 | 邮箱验证码登录与找回 | 用邮箱作为唯一外部认证联系方式 | 学生登录；教师/管理员找回 | organizationCode、email、channel=EMAIL、验证码 | 邮箱已验证；角色与流程匹配 |
| AUTH-005 | 本人邮箱首次绑定与换绑 | 激活新学生或安全更换登录邮箱 | 待绑定学生验证；已激活用户换绑 | 新邮箱、当前/新邮箱验证码、expectedVersion | 本人会话有效；目标邮箱未占用 |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| AUTH-001 | 校验凭证、速率、账户状态；由服务端装载 role/organization claims；未知安全枚举 fail closed | 返回访问会话及最小本人投影；学生验证码完成后必须真正安装可用会话；Token 期限与多设备策略仍见 ADR-022 | `AUTH_CREDENTIAL_INVALID`、`AUTH_VERIFICATION_CODE_INVALID`、`AUTH_ACCOUNT_DISABLED`、`AUTH_RATE_LIMITED` | 否 | 是（成功/失败摘要） | Authentication、Current User | User `ACTIVE -> LOCKED/DISABLED` 仅由相应管理流程触发 |
| AUTH-004 | 验证码/找回先用 `organizationCode` 确定组织，仅按已验证邮箱创建单次 challenge；`channel` 闭集固定为 `EMAIL`，`PHONE` 稳定拒绝且不创建挑战 | STUDENT 仅邮箱 OTP；密码找回仅 TEACHER/ADMIN。找回完成后增加 tokenVersion 并撤销旧会话/刷新令牌 | `AUTH_VERIFICATION_CODE_INVALID`、`AUTH_RATE_LIMITED`、`SYSTEM_SERVICE_UNAVAILABLE` | 否 | 是（不含账号、验证码、密码、邮箱明文） | Authentication | `PENDING_DELIVERY -> ACTIVE -> CONSUMED/LOCKED/EXPIRED/DELIVERY_FAILED` |
| AUTH-005 | 新学生为 `PENDING_CONTACT_BINDING`；首次绑定验证新邮箱，换绑同时验证当前邮箱与新邮箱，成功后撤销其他设备会话 | 待绑定状态只允许 `/me`、邮箱验证、refresh、logout；成功验证后进入 `ACTIVE` | `AUTH_VERIFICATION_CODE_INVALID`、`CONFLICT_VERSION_MISMATCH`、`USER_STATUS_NOT_ACTIVE` | 是 | 是（仅安全状态与 challengeId） | Authentication | `PENDING_CONTACT_BINDING -> ACTIVE` |
| AUTH-002 | 校验 token family、设备会话和账户版本；刷新时轮换；退出/禁用时撤销 | 重放旧 refresh token 必须拒绝；具体 Access/Refresh 时长待定，但“可撤销”不可省略 | `AUTH_TOKEN_INVALID`、`AUTH_TOKEN_EXPIRED`、`AUTH_SESSION_REVOKED` | 否 | 是 | Authentication | 无核心领域对象转换；更新认证会话撤销事实 |
| AUTH-003 | 从服务端配置读取模式；`READ_ONLY` 拒绝业务写，`MAINTENANCE` 仅允许白名单运维/认证能力 | 前端即使漏隐藏按钮，后端仍拒绝；未知模式按最严格状态处理 | `SYSTEM_READ_ONLY`、`SYSTEM_MAINTENANCE`、`SYSTEM_MODE_UNSUPPORTED` | 间接 | 是（拒绝可采样） | 所有 mutation | 无业务对象转换 |

## 4. 课程规则（COURSE）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| COURSE-001 | 教学班可写状态 | 阻止对关闭/归档教学班继续写业务数据 | 创建入班、session、record、名单或成绩操作 | classSectionId、当前时间 | Course、Semester、ClassSection 同组织且存在 |
| COURSE-002 | 入班凭证签发与校验 | 让二维码只指向一个可加入教学班且可撤销 | 教师生成/轮换二维码；学生解析 | classSectionId 或 invite token | 教师负责该班；教学班可加入 |
| COURSE-003 | 打卡时间窗 | 统一判断能否开始、何时仍可提交 | session 开始或 record 提交 | window policy、server time、businessDate | Enrollment ACTIVE；教学班开放 |
| COURSE-004 | 组织课程目录治理 | 让跨学期 Course 只有一个组织级事实 | ADMIN 创建、修改、启用或停用 Course | courseCode、courseName、description、status、expectedVersion | principal 为同组织 ADMIN；SystemMode 可写 |
| COURSE-005 | 单责任教师教学班管理 | 为后续 Enrollment/Session 提供稳定 classSectionId | TEACHER 创建、修改或关闭 ClassSection | Course/Semester、班号、时间窗、expectedVersion | Course ACTIVE；Semester 非 ARCHIVED；principal 有 ACTIVE TeacherProfile |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| COURSE-001 | 校验组织、学期、教学班状态；归档/关闭默认拒绝 mutation | 只读查询和历史导出可按权限继续；归档后修正流程未确认，不开放普通写入口 | `COURSE_CLASS_SECTION_NOT_WRITABLE`、`COURSE_SEMESTER_ARCHIVED` | 间接 | 是（拒绝高风险写） | Courses、Class Sections | ClassSection `ACTIVE -> CLOSED`；Semester 归档后相关对象只读 |
| COURSE-002 | token 使用服务端签名/随机 nonce；校验目标班、有效期、撤销状态和使用策略；不信任二维码内显示字段 | 返回最小教学班预览；轮换后旧 token 立即无效；二维码不是 Enrollment | `COURSE_INVITE_INVALID`、`COURSE_INVITE_EXPIRED`、`COURSE_INVITE_REVOKED` | 否 | 是 | QR Course Joining | 无核心领域对象转换；教学班关闭后 token 必然失效 |
| COURSE-003 | 开始时必须在允许日期、每日时段且非排除日；按服务端时区判断；已在窗内开始的 session 可在越过每日结束时刻后结束/提交，但不得跨学期截止 | 网络恢复不改变原 `startedAt`；学期截止后草稿不能转正式记录 | `SESSION_OUTSIDE_TIME_WINDOW`、`COURSE_DEADLINE_PASSED` | 间接 | 是（拒绝） | Exercise Sessions、Exercise Records | 无独立状态；影响 Session 创建和 Record 提交 |
| COURSE-004 | organizationId/actor 从 principal 取得；courseCode trim 后大写并按组织唯一；CourseStatus 只接受 ACTIVE/INACTIVE；写入与幂等、AuditLog、Outbox 同事务 | ADMIN 仅管理本组织；TEACHER/STUDENT 写入拒绝且无副作用；INACTIVE 不删除/关闭已有 ClassSection，只阻止新开班 | `COURSE_NOT_FOUND`、`CONFLICT_RESOURCE_ALREADY_EXISTS`、`CONFLICT_VERSION_MISMATCH`、`PERMISSION_RESOURCE_SCOPE_DENIED` | 否 | 是 | Courses | Course `ACTIVE <-> INACTIVE`，历史引用保持 |
| COURSE-005 | teacherId/organizationId 从 principal 解析；数据库与应用共同验证 Course/Semester/Teacher 同组织；update 仅白名单；关闭保留历史并强制 `isEnrollmentOpen=false` | TEACHER 只读写本人班；ADMIN 只有本组织治理读取；STUDENT 读取依赖 ACTIVE Enrollment；CLOSED/ARCHIVED 拒绝普通写 | `COURSE_CLASS_SECTION_NOT_FOUND`、`COURSE_CLASS_SECTION_NOT_WRITABLE`、`COURSE_SEMESTER_ARCHIVED`、`PERMISSION_COURSE_SCOPE_DENIED` | 间接 | 是 | Class Sections、Teacher Class Sections | 当前学期开班为 ACTIVE、未来学期开班为 UPCOMING；`ACTIVE/UPCOMING -> CLOSED` |

## 5. 入班规则（ENROLL）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| ENROLL-001 | 扫码直接入班 | 完成必要身份校验后直接建立课程关系，不恢复教师审批 | 学生确认二维码预览并提交资料 | invite token、姓名、studentNumber、`MALE/FEMALE`、四位 gradeYear、idempotencyKey | 学生已认证或完成允许的验证流程；教学班可加入 |
| ENROLL-002 | 防重与幂等 | 保证同一学生对同一教学班只有一条可追溯关系 | 新增、恢复或重复加入 | studentId、classSectionId、source | 相关对象同组织 |
| ENROLL-003 | 退出、移除与恢复 | 保留历史同时控制后续业务权限 | 学生退出、教师移除/恢复 | enrollmentId、reason、expectedVersion | 操作者有资源权限；Enrollment 存在 |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| ENROLL-001 | 验证 invite 与教学班；规范化但不混淆内部 ID/学号；扫码性别只接受 `MALE/FEMALE`；gradeYear 只按静态四位年份 `1000..9999` 校验，不使用当前时间上限；校验学期冲突；事务内创建 `ACTIVE` Enrollment 并记录 `QR/INVITE` 来源 | 不进入 `PENDING_APPROVAL`；全局 Gender 的 `OTHER` 仅保留给历史资料、官方名单及其他既有投影；名单不一致另建 alignment exception；重试返回原 Enrollment | `USER_PROFILE_INVALID`、`ENROLLMENT_ALREADY_ACTIVE`、`ENROLLMENT_SEMESTER_CONFLICT` | 间接 | 是 | QR Course Joining、Enrollments | 新建 `ACTIVE` |
| ENROLL-002 | 数据库唯一约束 + 幂等记录共同防重；已有 ACTIVE 直接返回；已有终态不得静默新建第二条 | 同一 idempotencyKey 不重复；学号相同不代表内部身份相同，身份冲突进入人工处理 | `ENROLLMENT_ALREADY_ACTIVE`、`USER_IDENTITY_CONFLICT`、`CONFLICT_IDEMPOTENCY_KEY_REUSED` | 间接 | 是 | Enrollments | 不产生重复转换 |
| ENROLL-003 | 校验本人或 `classSection.teacherId`、当前状态和未决退出条件；状态化而非物理删除；恢复前重新做冲突校验 | 学生自助退出/重入受 ADR-054 阻塞；历史 record 保持只读；教师恢复保留同一 enrollmentId | `ENROLLMENT_TRANSITION_NOT_ALLOWED`、`PERMISSION_RESOURCE_SCOPE_DENIED` | 间接 | 是 | Enrollments actions | `ACTIVE -> WITHDRAWN/REMOVED`；`WITHDRAWN/REMOVED -> ACTIVE` |

## 6. 官方名单规则（ROSTER）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| ROSTER-001 | 名单版本导入 | 将原始导入、解析结果和当前版本分离并可回滚 | 教师上传 V1 UTF-8 CSV | classSectionId、source=FILE、CSV、严格 field mapping、idempotencyKey | 教师负责该班；扩展名/MIME/UTF-8/大小策略通过 |
| ROSTER-002 | 名单对齐 | 比较官方名单与平台 Enrollment，不改变直接入班模式 | 导入校验成功或手动重新对齐 | rosterImportId、算法版本 | 名单版本完整；教学班可访问 |
| ROSTER-003 | 异常处置 | 对冲突、缺失、重复提供显式人工结论 | 教师确认、修复、重开或回滚；忽略须 ADR-057 批准后才开放 | alignmentResultId、resolution、reason、expectedVersion | 结果属于本人教学班 |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| ROSTER-001 | 只接受 `.csv` + `text/csv` + 严格 UTF-8（允许单 BOM）；校验大小、标题、白名单 mapping、行列和公式样式值；源文件 private；新导入生成不可变版本 | `total=valid+invalid+duplicated`；坏行/重复行保留，只有 VALID 参与对齐且至少一行 VALID 才发布 current；rollback 原子切换指针、不改 versionNumber/不删除历史；不新增 `SUPERSEDED` 状态 | `ROSTER_FILE_INVALID`、`ROSTER_SCHEMA_INVALID`、`ROSTER_IMPORT_DUPLICATE`、`ROSTER_IMPORT_SOURCE_UNSUPPORTED` | 否 | 是 | Official Roster Imports | Import `RECEIVED -> VALIDATING -> VALIDATED/FAILED`；current 是独立投影 |
| ROSTER-002 | 按 `organizationId + normalizedStudentNumber` 对齐；后端冻结同学期 ACTIVE Enrollment 最小快照；Entry 永不写平台匹配；算法结果与人工 resolution 分离 | 输出 `MATCHED/MISSING_IN_PLATFORM/EXTRA_IN_PLATFORM/WRONG_COURSE/IDENTITY_CONFLICT/DUPLICATED`；模糊结果不得自动合并身份 | `ROSTER_IMPORT_NOT_READY`、`ROSTER_ALIGNMENT_IN_PROGRESS`、`ROSTER_ALIGNMENT_SNAPSHOT_STALE` | 否 | 是 | Roster Alignment | 新建 immutable Run/comparisonRevision；旧 Run/Result 保留 |
| ROSTER-003 | 每次动作校验版本并追加 resolution history；身份修复走独立高风险流程；ADR-057 接受前拒绝所有 ignore 命令 | 批量操作逐条结果；名单异常不把 Enrollment 退回审批态；既有 IGNORED 数据只允许重开 | `ROSTER_RESOLUTION_INVALID`、`ROSTER_IGNORE_NOT_ALLOWED`、`CONFLICT_VERSION_MISMATCH` | 否 | 是 | Roster Alignment actions | 当前只允许 `PENDING -> CONFIRMED/RESOLVED`、`CONFIRMED -> RESOLVED` 与重开；不得新建 IGNORED |

## 7. 运动计时规则（SESSION）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| SESSION-001 | 开始运动 | 建立后端可核验的唯一活动会话，并阻止已达标学生继续产生非必要打卡 | 学生点击开始 | enrollmentId、exerciseType、clientObservedAt、idempotencyKey | Enrollment ACTIVE；课程可写；时间窗允许；无其他活动 session；当前有效计入时长未达到 72000 秒 |
| SESSION-002 | 暂停与继续 | 只累计运行区间，排除暂停时间 | 学生点击暂停/继续 | sessionId、clientObservedAt、expectedVersion | session 属本人；状态允许 |
| SESSION-003 | 手动结束与 2h 封顶 | 固化可提交结果并停止继续累计 | 学生结束或 accepted duration 达 7200 秒 | sessionId、clientObservedAt、expectedVersion | session 属本人且 IN_PROGRESS/PAUSED |
| SESSION-004 | 恢复、断网与多设备 | 防止客户端时钟、异常退出或双设备重复增加时长 | App 重启、网络恢复、heartbeat、第二设备开始 | sessionId、deviceSessionId、client events | 已有会话可识别；认证有效 |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| SESSION-001 | 后端写 `startedAt`，客户端时间只作风险信号；事务唯一约束保证每学生最多一个 IN_PROGRESS/PAUSED session；复用 SCORE 的最新 VALID Review 汇总核验 72000 秒门槛；不接受请求体指定 studentId | 已有活动 session 优先恢复；无活动 session 且已达标时不创建新 session，客户端提示无需继续打卡；同一 Enrollment 的 businessDate 从服务端 startedAt 计算 | `SESSION_ALREADY_ACTIVE`、`SESSION_ALREADY_COMPLETED`（已完成本 Enrollment 的合格打卡要求）、`SESSION_OUTSIDE_TIME_WINDOW`、`ENROLLMENT_NOT_ACTIVE` | 间接 | 是 | Exercise Sessions start | 未达标时新建 `IN_PROGRESS`；已达标时不转换 |
| SESSION-002 | 以服务端接受事件时间切分区间；暂停区间为 0；重复同一动作幂等；达到上限后拒绝 resume | `actualDurationSeconds` 不超过 7200；客户端计时与服务端冲突时以后端为准并返回权威快照 | `SESSION_TRANSITION_NOT_ALLOWED`、`SESSION_DURATION_CAP_REACHED`、`CONFLICT_VERSION_MISMATCH` | 间接 | 保留领域事件；异常审计 | Exercise Sessions pause/resume | `IN_PROGRESS <-> PAUSED` |
| SESSION-003 | 汇总服务端接受的 IN_PROGRESS 区间并 cap 7200；到 7200 自动转 COMPLETED；手动结束同样固化；完成不等于 record 已提交 | 精确 7200 秒停止；并发结束幂等；小于 3600 可完成 session 但不能形成成功打卡记录 | `SESSION_ALREADY_COMPLETED`、`SESSION_TRANSITION_NOT_ALLOWED` | 间接 | 是 | Exercise Sessions complete | `IN_PROGRESS/PAUSED -> COMPLETED` |
| SESSION-004 | 客户端先读取后端 active session 并用本地草稿补界面；未被后端确认的离线区间不自动计入；第二设备开始返回冲突；心跳容差/离线补证阈值待 ADR-021 确认 | 系统杀进程不结束后端 session；恢复返回权威状态。无法证明的时间保持 excluded 并标风险，不让客户端自行补时 | `SESSION_ALREADY_ACTIVE`、`SESSION_RECONCILIATION_REQUIRED`、`SESSION_EVENT_OUT_OF_ORDER` | 间接 | 是（冲突/调和） | Exercise Sessions current/reconcile | 可恢复原状态；不得创建平行活动会话 |

## 8. 打卡记录规则（RECORD）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| RECORD-001 | 从完成会话建立草稿 | 把可编辑提交内容与计时事实分离 | session 完成或学生进入提交页 | sessionId、类别、项目、说明 | Session COMPLETED 且属本人 |
| RECORD-002 | 统一时长折算 | 在所有端得到同一 0/1h/2h 结果 | 读取预览、提交或重算 | actualDurationSeconds | 时长已由后端固化 |
| RECORD-003 | 提交打卡 | 生成不可静默改写的正式记录并进入审核 | 学生确认提交 | recordId、mediaIds、业务字段、expectedVersion、idempotencyKey | 草稿属本人；Enrollment ACTIVE；媒体满足规则；时间窗/每日约束满足 |
| RECORD-004 | 撤回打卡 | 在受控窗口纠正误提交且保留历史 | 学生请求撤回 | recordId、reason、expectedVersion | record 属本人；未进入不可撤回状态 |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| RECORD-001 | 一个 session 最多关联一个 record；student/enrollment/class/organization 从 session 注入；草稿可更新白名单，不可改计时事实 | App 本地草稿不是服务端记录真相；小于 3600 秒的 session 只保留本地媒体草稿策略，正式 record 不提交 | `SESSION_NOT_COMPLETED`、`EXERCISE_RECORD_ALREADY_EXISTS_FOR_SESSION` | 否 | 否 | Exercise Records draft | 新建 `DRAFT` |
| RECORD-002 | 采用整数秒：`0..3599 -> 0`，`3600..7199 -> 3600`，`>=7200 -> 7200`；暂停不计入 actual | 3600 精确计 3600；7200 精确计 7200；负数/溢出拒绝；小时只由客户端展示换算 | `EXERCISE_RECORD_DURATION_NOT_CREDITABLE`、`VALIDATION_DURATION_INVALID` | 是 | 重算时是 | Exercise Records preview/recalculate | 不改变流程状态 |
| RECORD-003 | 重新核验 session、全部现场媒体、字段、businessDate 唯一性和 expectedVersion；请求 mediaIds 必须精确等于同 session 全部 AVAILABLE 现场媒体且不得存在处理中媒体；原子写 recordId 关联、冻结提交快照并创建系统 VALID Review | 每个开始日期最多一条成功提交；1h 提交后当天不能补第二条；跨午夜按 startedAt 所在组织日期；重试不重复 | `EXERCISE_RECORD_MEDIA_INCOMPLETE`、`MEDIA_NOT_AVAILABLE`、`EXERCISE_RECORD_DAILY_LIMIT_REACHED`、`EXERCISE_RECORD_DURATION_NOT_CREDITABLE`、`COURSE_DEADLINE_PASSED` | 立即按服务端折算时长计入并重算 | 是 | `POST .../exercise-records/{id}/submit` | Record `DRAFT -> REVIEWED`；同事务创建 ReviewResult `VALID` |
| RECORD-004 | V1 不执行状态转换；接口如保留必须在任何写入前稳定拒绝 | 已提交撤回明确关闭；不得写取消时间、解绑媒体、删除 Review、改变贡献或释放 `(enrollmentId,businessDate)` 槽位 | `EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED` | 否 | 是（拒绝事件） | `POST .../exercise-records/{id}/withdraw` | 无；未来开放需新 ADR 和 migration |
| RECORD-005 | 创建或更新草稿时按最终 `creditType` 校验说明：`GENERAL` 必须为 trim 后 1..200 字，`COURSE_RELATED` 可省略/null，非空仍为 1..200 字 | 切换到 `GENERAL` 时若当前说明为空必须拒绝；课程运动空白输入规范化为 null；客户端可提示但不拥有最终裁决权 | `VALIDATION_FAILED` | 否 | 否 | Exercise Records create/update | DRAFT 内内容变更，不改变状态 |

## 9. 媒体规则（MEDIA）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| MEDIA-001 | 现场采集与数量限制 | 保证正常打卡凭证来自 App 内拍摄且数量一致 | 运动中、暂停或提交前拍摄 | businessPurpose、captureSource、mediaType、本地摘要 | Session IN_PROGRESS/PAUSED/COMPLETED 且属本人 |
| MEDIA-002 | 独立上传与确认 | 将对象存储传输和 record 提交解耦 | 申请上传、直传完成、服务端确认 | MIME、size、checksum、uploadId | 用户可为本人 session 创建媒体 |
| MEDIA-003 | 绑定、访问与孤立清理 | 防止越权读、重复绑定和无主文件堆积 | record 提交、凭证查看、清理任务 | mediaIds、recordId、purpose | 媒体已确认；资源关系可验证 |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| MEDIA-001 | `EXERCISE_RECORD` 只接受 `IN_APP_CAMERA`；最多 6 个 IMAGE、1 个 VIDEO，提交至少 1 项且当前保留素材全部计入；视频累计实际录制 `1..15` 秒，暂停不计时，可暂停/继续/提前结束并在 15 秒自动结束；录像包含声音 | 视频接受 MP4/MOV/3GP/WebM 原始容器；分辨率、码率和文件大小不构成业务限制；照片是跨端必备兜底，视频只在客户端能生成受支持容器时开放；上传凭证不要求定位权限或 GPS | `MEDIA_PURPOSE_MISMATCH`、`MEDIA_CAPTURE_SOURCE_NOT_ALLOWED`、`MEDIA_COUNT_LIMIT_EXCEEDED`、`MEDIA_VIDEO_DURATION_EXCEEDED` | 间接 | 安全异常是 | Media Uploads | 不单独改变 record 状态 |
| MEDIA-002 | 申请时生成稳定 `mediaId` 并创建 PENDING_UPLOAD；确认沿用同一 mediaId，服务端流式校验对象/size/MIME/hash、真实容器、视频轨、音轨和真实时长；识别到 GPS/EXIF/容器位置标签立即拒绝；API 不返回 storageKey | `fileSizeBytes/mimeType` 是不可信声明；图片仅 JPEG/PNG，视频为 MP4/MOV/3GP/WebM；客户端不得改 MIME 冒充容器；服务端另设传输安全上限防止资源耗尽；不提取或保存媒体位置为业务事实 | `MEDIA_UPLOAD_SESSION_EXPIRED`、`MEDIA_OBJECT_NOT_FOUND`、`MEDIA_INTEGRITY_MISMATCH`、`MEDIA_SIZE_EXCEEDED`、`MEDIA_VIDEO_DURATION_EXCEEDED`、`MEDIA_AUDIO_TRACK_REQUIRED`、`MEDIA_LOCATION_METADATA_NOT_ALLOWED` | 否 | 是（不记 token/签名 URL/位置） | Media Uploads initiate/confirm | `PENDING_UPLOAD -> UPLOADED`；校验失败或会话过期到 `FAILED` |
| MEDIA-003 | 校验 media 属本人、同 session/用途；先绑定并完成必需扫描/处理，只有 AVAILABLE 才可随 Record 提交；提交事务写入 recordId；父 Record 授权后才生成短期读链接 | 同一 media 不得跨 record；PROCESSING/FAILED 拒绝提交（ADR-058）；孤立 PENDING_UPLOAD/UPLOADED 按待定 TTL 清理；正式保留期待 ADR-023/032 | `MEDIA_BIND_TARGET_INVALID`、`MEDIA_ALREADY_BOUND`、`MEDIA_NOT_AVAILABLE`、`MEDIA_ACCESS_DENIED` | 间接 | 是 | Media Uploads、Exercise Records | `UPLOADED -> BOUND -> PROCESSING/AVAILABLE`；提交时 AVAILABLE 保持状态并绑定 recordId；孤立对象最终 `DELETED` |

## 10. 审核规则（REVIEW）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| REVIEW-001 | 首次有效性审核 | 由任课教师明确判定记录是否贡献有效时长 | 教师查看并提交结论 | recordId、result、reason/evidence、expectedVersion、idempotencyKey | 教师负责该 ClassSection；Record SUBMITTED；媒体可授权查看 |
| REVIEW-002 | 修改审核结果 | 在不覆盖历史的前提下纠正已审核结论 | 教师变更 VALID/INVALID | recordId、newResult、changeReason、expectedVersion | 原审核存在；成绩状态允许或已走批准流程 |
| REVIEW-003 | 批量审核与重算 | 提升处理效率但不弱化逐条权限、并发和审计 | 教师批量提交审核 | item 列表及各自 expectedVersion/idempotencyKey | 每项属于教师本人教学班 |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| REVIEW-001 | 解析 Record -> Enrollment -> ClassSection 并校验单一 `classSection.teacherId`；无 claim；教师发现异常时 result=INVALID，必须提供 ReviewReasonCode，OTHER 还要求非空 reason；reason≤500、publicComment≤1000、internalNote≤2000；override 必须 null；以 expectedVersion + expectedReviewVersion + 唯一 `(recordId,reviewVersion)` 在事务内追加 | 新提交由系统直接 VALID；旧 PENDING 仍可由教师裁决 VALID/INVALID；学生端只返回 currentReview 的 result/reasonCode/publicComment，不返回 internalNote、reason 正文或完整历史；管理员不得代审 | `PERMISSION_COURSE_SCOPE_DENIED`、`REVIEW_RESULT_REQUIRED`、`REVIEW_INVALID_REASON_REQUIRED`、`REVIEW_CREDIT_OVERRIDE_NOT_APPROVED`、`CONFLICT_VERSION_MISMATCH` | 是；VALID 沿用 Record 折算值，INVALID 为 0 | 是 | `POST .../exercise-records/{id}/reviews` | 新流程 `VALID -> INVALID` 且 Record 保持 REVIEWED；兼容流程 `PENDING -> VALID/INVALID` |
| REVIEW-002 | 显式重开仍可用 expectedVersion/expectedReviewVersion 在事务中追加带必填原因的 PENDING ReviewRecord，让 Record 回到 SUBMITTED 并暂时移除旧贡献；异常否决无需先重开，直接追加 INVALID | 所有变化都追加新 ReviewRecord，绝不覆盖旧审核；已发布/归档成绩的修改流程仍待 ADR-026，未批准时拒绝 | `VALIDATION_FIELD_REQUIRED`、`SCORE_LOCKED`、`SCORE_CORRECTION_WINDOW_REQUIRED`、`CONFLICT_VERSION_MISMATCH` | 是；每步必须重算 | 是 | Exercise Reviews reopen/review | 默认 `VALID -> INVALID`；显式重开 `VALID/INVALID -> PENDING -> VALID/INVALID` |
| REVIEW-003 | 每条独立做归属、状态、版本和业务检查；允许部分成功并返回逐项结果；成功项各自产生历史与重算事件 | 不允许用“同一批第一条有权”推定全批；重复项按各自幂等键返回原结果 | `REVIEW_BATCH_ITEM_FAILED`、各单项错误码 | 是 | 是 | Exercise Reviews batch | 每项独立转换 |

## 11. 成绩规则（SCORE）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| SCORE-001 | 有效时长累计与 20h 门槛 | 只从有效记录得到权威累计值并识别可计算状态 | 审核改变、记录迁移/修正、查询或重算任务 | enrollmentId、VALID records、适用调整/抵扣 | 记录与 Enrollment/学期关系有效 |
| SCORE-002 | 版本化自动计分 | 达到门槛后按唯一规则版本产生分数，不让客户端硬编码 | 累计达到 72000 秒或显式重算 | scoreRuleVersionId、creditedDurationSeconds、其他已确认输入 | 存在适用且已发布 ScoreRule |
| SCORE-003 | 规则变更与历史重算 | 明确新规则是否影响既有成绩 | 管理员发布 ScoreRule 新版本 | effective scope/time、formula definition、migration policy | 公式、精度、封顶、未达标策略均已业务批准 |
| SCORE-004 | 人工调整与发布 | 可追溯地处理例外并区分计算值和最终值 | 教师调分、发布、获批后的归档修正 | before/after、reason、expectedVersion | 教师负责该班；状态允许；规则/批准完整 |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| SCORE-001 | 只汇总 current ReviewResult=`VALID` 的 `creditedDurationSeconds`；同一 record 只计一次；使用整数秒；门槛固定 20h=`72000` 秒（ADR-061） | `<72000` 返回未达计算门槛及权威进度并保持 NOT_CALCULATED；`>=72000` 才可按有效规则计算。课程/其他分类目标如何分配仍待 ADR-062，不改变总门槛 | `SCORE_SOURCE_DATA_INCONSISTENT` | 是 | 重算是 | Student Scores summary/recalculate | `<72000` 保持 `NOT_CALCULATED` |
| SCORE-002 | 服务端按已发布 ScoreRule 计算并保存 rule version/source snapshot；客户端只能显示返回结果/非权威预览 | 具体公式、封顶、舍入和未达标分数未确认（ADR-018），因此当前契约不得生成虚构数值，阶段 10 不实现计算器 | `SCORE_RULE_NOT_CONFIGURED`、`SCORE_FORMULA_UNCONFIRMED` | 是 | 是 | Student Scores recalculate | `NOT_CALCULATED -> CALCULATED` |
| SCORE-003 | 新版本不可覆盖已使用版本；发布时必须声明仅新数据、未发布成绩重算或全部受控重算；通过异步任务和幂等键执行 | 历史重算政策未确认时只允许保存草稿规则，不允许激活；客户端 Mock 公式没有迁移权威性 | `SCORE_RULE_ACTIVATION_BLOCKED`、`SCORE_RECALCULATION_POLICY_REQUIRED` | 是 | 是 | Score Rules、Student Scores | ScoreRule `DRAFT -> ACTIVE -> RETIRED`；Score 可重新 `CALCULATED` |
| SCORE-004 | adjustment 追加保存 before/after/delta/reason/actor；发布前校验完整性和版本；发布后按归档流程锁定；归档修正按 ADR-026 决定 | 调整不篡改 calculatedScore；最终值由 calculated + 有效 adjustments 得出；管理员默认不代教师调分 | `SCORE_ADJUSTMENT_INVALID`、`SCORE_NOT_PUBLISHABLE`、`SCORE_LOCKED` | 是 | 是 | Score Adjustments、Student Scores publish | `CALCULATED -> ADJUSTED -> PUBLISHED -> LOCKED`（无调整可由 CALCULATED 直接发布）；修正创建新工作版本 |

## 12. 审计规则（AUDIT）

| 编号 | 名称 | 业务目的 | 触发条件 | 输入数据 | 前置条件 |
|---|---|---|---|---|---|
| AUDIT-001 | 高风险操作留痕 | 证明谁在何时以何权限对何资源做了什么 | 认证、授权失败、名单、审核、成绩、权限、配置和导出等事件 | principal、permissionId、requestId、resource、result、reason、safe diff | requestId 已建立；主体/匿名来源可识别 |
| AUDIT-002 | 不可变、最小化与可查询 | 让日志可追溯且不成为敏感信息泄露源 | 写审计、ADMIN 查询/导出原始 AuditLog、TEACHER 查询领域历史投影、归档 | organization scope、resource scope、filters、cursor | 查询者通过对应原始审计或业务资源权限 |

| 编号 | 后端校验与处理 | 输出结果与边界情况 | 错误码 | 影响成绩 | 审计 | 相关接口 | 相关状态转换 |
|---|---|---|---|---|---|---|---|
| AUDIT-001 | 在业务事务或可靠 outbox 中追加精确字段：id、organizationId、actorUserId、actorRoleSnapshot、permissionId、actionType、targetType、targetId、requestId、idempotencyKeyReference、outcome、reasonCode、safeMetadata、sourceIpHash、deviceFingerprintHash、occurredAt；领域历史另存 | 不保存原始 Idempotency-Key、IP 或设备指纹，也不记录密码、验证码、token、完整联系方式/学号、storageKey、签名 URL、媒体正文或 internalNote 正文 | `AUDIT_WRITE_FAILED`（高风险写必须整体失败或进入可靠 outbox） | 间接 | 本规则本身是 | Audit Logs | AuditLog append-only，无更新/删除状态机 |
| AUDIT-002 | 原始 AuditLog 查询/导出只允许本组织 ADMIN，并强制分页、脱敏和用途记录；教师只能经业务资源 API 读取本人教学班的领域历史投影，不读取原始 AuditLog | retention/legal hold 未确认前不做物理清理；TEACHER 访问原始日志稳定拒绝；ADMIN 仍不得跨组织 | `PERMISSION_AUDIT_SCOPE_DENIED`、`AUDIT_RETENTION_POLICY_REQUIRED` | 否 | 查询/导出是 | Audit Logs | 仅归档存储层迁移，不改事实 |

## 13. 跨规则不变量

1. `User`、Profile、Enrollment 永不合并；`studentNumber` 永不充当内部主键。
2. `Course` 是课程定义，`ClassSection` 是某学期教学班；业务写入总能解析到一个 organization 和 classSection。
3. `ExerciseSession` 是计时事实，`ExerciseRecord` 是提交事实；完成 session 不等于提交 record。
4. Record 流程状态与 ReviewResult 分离；INVALID 不删除原记录，只有 current VALID 结果贡献累计时长。
5. `recordId`、`enrollmentId`、`mediaId` 为 opaque string，并在客户端、API、数据库和审计中保持同一链路值。
6. 成绩计算只读取后端已确认事实及版本化规则；Android、iOS、Web 和 Mock 均不得形成第二套最终算法。
7. 所有跨组织、跨学生、跨任课教师访问在资源读取/变更前拒绝；修改 URL 不扩大数据范围。

## 14. 待确认且阻塞实现的规则参数

| 事项 | 当前安全行为 | 阻塞范围 | 决策记录 |
|---|---|---|---|
| 20h 内课程/其他运动分类目标如何分配 | 固定总计算门槛 72000 秒；不猜分类配额 | 分类进度、达标提示和相关配置写 API | ADR-061、ADR-062 |
| 具体成绩公式、精度、封顶、未达标得分 | 不产生正式分数 | ScoreRule 激活、计算与发布 | ADR-018 |
| 学生提交后撤回 | V1 明确关闭；稳定拒绝且不释放每日槽位 | RECORD-004 未来扩展 | ADR-020 / V1 default deny |
| 学生退出/重入 Enrollment | 暂不开放学生 WITHDRAW/REJOIN；教师按权限移出/恢复 | ENROLL-003 学生动作 | ADR-054 |
| 心跳容差、离线调和与异常 session 超时 | 未确认区间不自动计时，第二设备拒绝并发 | Session 生产级反作弊/恢复 | ADR-021 |
| Token 生命周期与多设备策略 | 必须可撤销，但不固定时长 | Authentication 实现与客户端刷新 | ADR-022 |
| 上传/孤立媒体 TTL、图片大小、扫描、正式保留期 | 私有、短链、未绑定不可提交；打卡视频不设业务大小上限；不物理清理已绑定证据 | 媒体清理与容量规划 | ADR-023、ADR-032、ADR-099 |
| 审核能否覆盖折算时长 | override 固定 null；VALID 沿用 Record，INVALID 为 0 | Review 写入、旧 approvedHours 迁移 | ADR-047 |
| 历史“提交即有效”迁移 | 不自动重算/发布；冲突项保持 PENDING | Review migration、历史成绩 | ADR-056 |
| 名单异常是否允许忽略 | 暂不开放 IGNORED，只允许确认/修复 | Roster resolution | ADR-057 |
| 已发布成绩出现新输入 | 保留旧发布版，新工作版不向学生暴露 | Score 修订/通知 | ADR-059 |
| AVAILABLE 媒体重绑/删除 | 已绑定不重绑，正式证据不由学生删除 | Media 生命周期 | ADR-060 |
| 归档后成绩修正职责 | 默认拒绝普通写 | 已发布/归档成绩修正 | ADR-026 |
| GPS 是否收集 | OpenAPI 已登记 6 个位置 operation，且已有持久化/应用层基础；HTTP 与生产采集仍 default deny | 明示同意/撤回、采样、精度、密钥、保留、删除、地图与位置审核 | ADR-029 / ADR-097 |
| 不足 1h 本地媒体草稿保留期限 | 不形成正式 record；客户端保留行为尚未冻结 | Android/iOS 本地草稿一致性 | ADR-040 |
| QR Join/Export 持久化对象 | Stage 12 已按 ADR-080/093/094 实现 CourseInvite、JoinCapability、原子 Join 与 Enrollment；学生 withdraw/rejoin 仍受 ADR-054 默认拒绝。ExportType 只冻结枚举，V1 不建 ExportJob | Export 实现；学生退出/重入决策 | ADR-054、ADR-084、ADR-085 |

### 14.1 V1 默认关闭目录

以下能力一律在产生业务副作用前拒绝：学生主动退出 Enrollment、学生自行重入、已提交 ExerciseRecord 撤回、RosterAlignmentResult IGNORE、Review `creditedDurationOverrideSeconds`、ScoreRule 激活、正式成绩公式计算、成绩发布、归档成绩修正、管理员查看原始媒体、GPS/位置轨迹、全量物理清理、非 EXERCISE_RECORD 媒体、多教师、管理员代教师审核及 ExportJob 执行。保留在 OpenAPI 的 operation/字段必须声明已登记的 `x-default-deny-error` 或 `x-field-deny-error`；前端隐藏、Mock、空任务、假下载链接或半成品写入均不构成关闭实现。

这些未决参数不否定已冻结的对象边界、权限、不变量和错误语义，但会在阶段 9 被作为相应模块的实施阻塞项。

## 15. 前后端责任边界

| 规则域 | 客户端负责 | 后端负责（唯一最终裁决） |
|---|---|---|
| AUTH/COURSE | 收集凭证、显示系统/时间窗状态 | 验证身份、账户、组织、系统模式、教学班和时间窗 |
| ENROLL/ROSTER | 扫码与资料录入、展示差异/处置表单 | 防重事务、直接 ACTIVE、名单解析/对齐、处置历史和范围授权 |
| SESSION | 本地交互计时、重启后恢复 UI、上传观测事件 | 服务端事件时钟、暂停区间、单活动会话、7200 秒封顶和调和结果 |
| RECORD/MEDIA | 现场拍摄；视频提供有声录制、暂停/继续、15 秒自动结束和上传前压缩；显示数量/进度、提交 mediaId | 内容签名/数量/来源、视频真实时长、AVAILABLE、运动时长边界、每日唯一和原子提交 |
| REVIEW | 教师输入 VALID/INVALID、原因和公开/内部意见 | 教学班归属、append-only 版本、override 守卫、Record 状态和重算事件 |
| SCORE | 展示服务端进度/已发布成绩，可做明确标注的非权威预览 | VALID 来源汇总、72000 秒门槛、ScoreRule 版本、调整、发布和来源快照 |
| AUDIT | 携带 requestId/幂等键并显示可公开结果 | 不可变审计、脱敏、可靠写入、范围查询和保留守卫 |

任何客户端校验都只是提前反馈；绕过客户端、旧客户端漏校验或 Mock 显示成功，均不得改变后端拒绝结果。

## 14. Stage 18 Score 规则冻结（2026-08-04）

- 仅当前 VALID Review 对应 Record 的服务端 `creditedDurationSeconds` 参与计算；ADR-047 已以“永久不允许 Review 覆盖贡献秒数”闭合。
- `scoringSeconds=min(totalValidCreditedSeconds,72000)`；`excessSeconds=max(totalValidCreditedSeconds-72000,0)`；`rawScore=scoringSeconds*100/72000`。
- `totalValidCreditedSeconds>=72000` 时 `QUALIFIED` 且 `finalScore=100.00`。未达标时为 `NOT_QUALIFIED`，仍按比例计分；最终 HALF_UP 两位若得到 100.00，则固定为 99.99。
- V1 只按总秒数计分；course/general 只作展示分类，不是独立门槛、权重或配额。
- Review、ACTIVE 规则或已批准 Adjustment 的输入变化自动触发可幂等重算；责任教师可手动重算。重复相同输入不得创建重复 revision。
- Adjustment 只允许 `FINAL_SCORE_DELTA`、`FINAL_SCORE_REPLACEMENT`、`CALCULATION_CORRECTION`。结果越界 0.00–100.00 时拒绝，不做隐式 clamp。
- 历史“提交即有效”只允许迁移可核验事实；Stage 18 不执行历史迁移。Export 仍未实现，未来只能绑定 PUBLISHED/LOCKED revision。
