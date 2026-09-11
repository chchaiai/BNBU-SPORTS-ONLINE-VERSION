# 体育打卡后端统一契约：数据字典

> 阶段：2（契约设计，不是数据库实施）
>
> 基线：`00-current-state-audit.md`、`conflict-matrix.md`、`decision-log.md`、`01-domain-model.md`（已完成交叉复核；字段命名冲突以本文阶段 2 字典为准，并在交付说明中列出需反向同步到阶段 1 的映射）
>
> 适用客户端：Android 学生端、未来 iOS 学生端、未来 Web 学生端、Web 教师端、Web 管理端、统一后端
> 限制：当前工作区没有权威后端、数据库 schema 或 migration；本文冻结逻辑字段、API 映射与迁移语义，不选择数据库引擎，不生成或执行 migration。

## Stage 21 客户端能力合同与本地持久化边界

`0011_client_capabilities` 已以 forward-only Migration 建立 Stage 21 所需的结构。数据库结构存在不等于 HTTP 能力已开放：只有下表标为“本地集成”的 12 个 operation 可在本地 PostgreSQL 路径执行；另外 18 个 operation 仍在真实路由稳定 default deny。GPS 已有持久化和应用层基础，但 6 个位置 HTTP operation 继续关闭，且没有批准任何生产采样、精度、保留或删除参数。

| 合同对象 | 关键字段 | 当前权威边界 |
|---|---|---|
| `Notification` / `PushDevice` | recipient、type、readAt；platform、appVersion、locale、status | 本地集成列表/已读及设备注册/注销；推送 token 加密保存且不投影。没有通知业务生产者、APNs/FCM 发送适配器或生产投递证据 |
| `UserPreferences` | locale、pushEnabled、emailEnabled、version | 本地集成本人读取和按 `expectedVersion` 修改；不扩大到他人 |
| `HelpArticle` | category、locale、title、bodyMarkdown、publishedAt、version | 本地只读已发布且到达发布时间的安全内容；没有管理端发布/编辑 operation |
| `Feedback` | category、content、status、publicReply、version | 本地集成创建/列表/详情；非管理员只读本人，管理员只读本组织；处理/回复 mutation 未开放 |
| `ExemptionApplication` | studentId、enrollmentId、classSectionId、applicationType、applicationSubtype、organizationName、reason、mediaIds、status、publicComment、version | 已实现本人草稿/更新/提交、责任教师审核和 ADMIN 组织内只读；subtype 无损区分 800/1000 米、校队/社团，组织名称独立保存；附件必须为同 Enrollment 的私有 EXEMPTION_APPLICATION 媒体 |
| `AppReleasePolicy` | platform、minimumSupportedVersion、latestVersion、minimumSupportedBuildNumber、latestBuildNumber、enforcement、effectiveAt、policyVersion | iOS 只按数字 build 比较；营销版本仅展示。无有效政策返回稳定 503；发布/灰度管理流程仍未开放 |
| `SportCatalogItem` / `ActivityConversionRule` | sportType；activityType、unit、ruleVersion、status | `SportCatalogItem` 已有表结构，`ActivityConversionRule` 仍只有 transport 结构；2 个 HTTP operation 均 default deny，不得形成第二套 ScoreRule |
| `StudentSignInChallenge` / `AccountRecoveryChallenge` / `AuthRateLimitFact` | organizationCode 解析后的 organizationId、challenge digest、channel、expiry、attempt、consumption、durable rate facts | 4 个公开 operation 已本地实现；STUDENT 仅 OTP，找回仅 TEACHER/ADMIN；无真实 provider 时非 test 环境 fail closed |
| `LocationSample` / `LocationSampleSecret` | sampleId、observedAt、粗粒度字段；加密原始坐标和 key version | 持久化/加密基础已存在；原始坐标不进入公共 projection，HTTP 采集仍关闭 |
| `LocationTrack` | sessionId、status、acceptedSampleCount、policyVersion、version | 持久化和应用层轨迹基础已存在；6 个位置 HTTP operation 仍 default deny |
| `LocationSummary` | recordId、availability、COARSE、coarseRoutePolyline、coarseDistanceMeters、时间范围、policyVersion | 只定义未来粗化投影；当前 HTTP 不返回摘要 |
| `LocationPrivacyPolicy` / `LocationConsent` | organizationId、policyVersion、collectionEnabled、同意版本、采样/精度/保留/粗化参数、version | 结构存在但生产参数未批准；政策读写和采集均关闭 |

## 1. 使用口径

1. 本文是全项目唯一字段命名基线。后续状态机、业务规则、权限矩阵和 OpenAPI 只能引用本文字段，不得另造同义字段。
2. 表中的“数据库类型”是与引擎无关的逻辑类型。阶段 10 只有在 ADR-025（权威后端/数据库基线）解决后，才能映射为 MySQL、PostgreSQL 或其他数据库的物理类型。
3. `id` 表示资源自身的内部不透明标识；跨对象引用必须使用语义化外键，如 `studentId`、`classSectionId`。`studentNumber` 永远只表示学校学号，禁止用作主键、外键或认证主体 ID。
4. “必填=是、可为空=是”表示创建/持久化时必须出现该字段，但允许显式 `null`；“必填=否”表示请求可省略。响应是否出现由阶段 6 的 projection 决定。
5. `—` 表示没有单位、没有默认值或不进入公共 API，不表示未知。
6. 标记为“派生”的字段不作为第二份事实落库；标记为“快照”的字段只用于保证历史可重现。
7. 本文不把推荐方案伪装成已批准规则。总门槛按 ADR-061 固定为 72000 秒；ADR-062、ADR-018、ADR-021、ADR-023、ADR-028、ADR-029、ADR-030、ADR-032、ADR-040 未解决时，相关字段保持可空或只定义结构，不冻结其他业务值。

## 2. 全局命名规范

| 项目 | 冻结规则 | 正例 | 禁止或迁移示例 |
|---|---|---|---|
| API JSON | `camelCase` | `studentNumber`, `actualDurationSeconds` | `student_number`, `duration`, `studentNo` |
| 数据库列 | `snake_case` | `student_number`, `actual_duration_seconds` | `studentNumber`, `status1`, `data` |
| 枚举 wire value | `UPPER_SNAKE_CASE`，稳定英文值 | `QR_CODE`, `PENDING_UPLOAD` | `qr`, `待审核`, `已通过` |
| 主键 | 资源内统一 `id`；值为不透明 string | `id: "rec_01J..."` | 自增数字暴露给客户端、学号充当 ID |
| 外键 | `<目标对象语义>Id` / `<target>_id` | `enrollmentId` / `enrollment_id` | 泛化 `relationId`, `courseId` 指教学班 |
| 学校标识 | 只用 `studentNumber` / `student_number` | `2024010836` | `studentId`, `number`, `account`, `studentNo` |
| 布尔值 | `is`、`has`、`can` 前缀 | `isCurrent`, `hasReachedTarget` | `current`, `published` |
| 时间点 | `xxxAt` / `xxx_at` | `submittedAt`, `uploaded_at` | `submitTime`, 无时区字符串 |
| 业务日期 | `xxxDate` / `xxx_date` | `businessDate` | 从 `submittedAt` 或设备时区临时推断 |
| 时长事实 | 非负整数秒，字段以 `DurationSeconds` 结尾 | `pausedDurationSeconds` | `duration`, `hours`, `durationMinutes` |
| 数量 | 非负整数，字段以 `Count` 结尾 | `validRowCount` | `students`, `proof` 表示数量 |
| 版本 | 非负整数 `version`；更新请求使用 `expectedVersion` | `version: 4` | 用格式化 `updatedAt` 代替并发控制 |
| 文本 | 使用业务名，禁止泛化容器 | `reviewReason`, `description` | `data`, `info`, `note1`, `type2` |
| 空值 | 不用空字符串代替缺失；清空可空字段时发送 `null` | `majorName: null` | `majorName: ""` |
| 金额/分数 | 十进制定点数，不用 binary float 保存最终分数 | `decimal(6,2)` | `Double` 直接作为最终成绩事实 |
| 集合 | API 使用数组；关系数据独立成表 | `mediaIds: []`（请求） | DB 逗号字符串、文件名数组充当凭证实体 |

### 2.1 内部 ID 规则

- 所有核心实体 ID 的 API 类型为 `string`，最大 64 个 ASCII 字符；客户端只比较和传递，不解析前缀、时间或排序语义。
- 数据库逻辑类型为 `varchar(64)`；实际生成算法和物理类型需新增 ADR 后冻结。本文示例使用可读前缀仅为辨识对象，不构成格式合同。
- `User.id`、`StudentProfile.id`、`Enrollment.id` 和 `studentNumber` 是四个不同值。导入名单时先以组织范围内标准化后的 `studentNumber` 匹配，再保存显式外键；禁止靠姓名关联。
- API 请求不得让学生自行指定 `studentId`。后端从认证主体解析本人；教师/管理员动作由路径资源及权限范围确定。

### 2.2 时间、日期和单位

- 数据库时间点统一按 UTC 保存；API 返回 RFC 3339/ISO 8601 带偏移时间，例如 `2026-08-02T09:30:00+08:00`。
- `businessDate` 是 `YYYY-MM-DD` 日期，不是时间点。服务端按 `ClassSection.organizationId` 对应组织时区和 `ExerciseSession.startedAt` 计算并冻结；BNBU 当前默认 `Asia/Shanghai`。
- 事实时长全部为 `int64` 秒：`actualDurationSeconds`、`pausedDurationSeconds`、`creditedDurationSeconds`。小时、分钟和 `1h/2h` 只在展示层派生。
- 按 ADR-009，客户端旧字段换算为秒后必须做整值和范围校验；转换不能静默改变边界或覆盖原始来源。

### 2.3 隐私级别

| 级别 | 定义 | 典型字段 | 最低处理要求 |
|---|---|---|---|
| `PUBLIC` | 明确可公开的组织/课程展示信息 | 组织展示名、课程名 | 仍需完整性校验 |
| `INTERNAL` | 校内业务字段，不应公开索引 | 内部 ID、状态、规则版本 | 认证后按资源范围返回 |
| `SENSITIVE` | 可识别个人、学习关系或成绩 | 学号、姓名、入班关系、成绩 | 最小化返回、访问审计、普通日志脱敏 |
| `HIGHLY_SENSITIVE` | 认证秘密、媒体、内部审核内容或安全上下文 | password hash、联系方式、媒体键、内部备注、IP | 默认不出公共 API；加密/私有存储；强审计 |

隐私级别是最低保护线。具体角色能否读取由阶段 5 权限矩阵裁决；不能因为字段存在于字典中就默认对所有客户端可见。

## 3. 通用字段

### 3.1 通用字段字典

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 所有可持久化实体 | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | 组织内/全局唯一；opaque；不可复用 | `rec_01JABC123` | 服务端 ID 生成器 | INTERNAL | 资源自身主键；外部引用使用语义化 `xxxId` |
| 需要创建追踪的实体 | `createdAt` | `created_at` | date-time / timestamp | 微秒精度 | 响应是 | 否 | 服务端当前时间 | UTC 时间点 | RFC 3339；不可由普通客户端覆盖 | `2026-08-02T01:30:00Z` | 服务端时钟 | INTERNAL | append-only 实体也保留 |
| 需要创建追踪的实体 | `createdBy` | `created_by` | string / varchar | 64 | 响应是 | 是 | `null` | — | 引用 `User.id`；系统动作允许空 | `usr_01JABC123` | 认证主体/系统任务 | INTERNAL | 学生提交时由 token 推导 |
| 可修改实体 | `updatedAt` | `updated_at` | date-time / timestamp | 微秒精度 | 响应是 | 否 | 服务端当前时间 | UTC 时间点 | 每次成功变更更新；不可作为唯一并发令牌 | `2026-08-02T02:00:00Z` | 服务端时钟 | INTERNAL | append-only 实体不使用 |
| 可修改实体 | `updatedBy` | `updated_by` | string / varchar | 64 | 响应是 | 是 | `null` | — | 引用 `User.id`；系统任务允许空 | `usr_01JDEF456` | 认证主体/系统任务 | INTERNAL | append-only 实体不使用 |
| 允许软删除的实体 | `deletedAt` | `deleted_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 只能由删除动作写入；恢复时按策略清空 | `null` | 服务端删除流程 | SENSITIVE | 事实/历史实体通常禁止普通删除 |
| 允许软删除的实体 | `deletedBy` | `deleted_by` | string / varchar | 64 | 否 | 是 | `null` | — | 与 `deletedAt` 同时为空或同时有值 | `null` | 认证主体/系统任务 | SENSITIVE | 引用 `User.id` |
| 可并发修改实体 | `version` | `version` | integer / bigint | 64-bit | 响应是 | 否 | `1` | 修订号 | `>=1`；每次成功更新 `+1` | `4` | 服务端 | INTERNAL | 请求用 `expectedVersion` 做乐观锁 |

### 3.2 通用字段适用条件

| 对象类别 | `created*` | `updated*` | `deleted*` | `version` | 说明 |
|---|---|---|---|---|---|
| 配置/主数据：Organization、User、各 Profile、Semester、Course、ClassSection、ScoreRule | 是 | 是 | 条件适用 | 是 | 被业务引用后优先停用或归档，不物理删除 |
| 关系：Enrollment | 是 | 是 | 条件适用 | 是 | 生命周期变化主要由明确状态表达；`deleted*` 仅纠正误建数据 |
| 导入/对齐：OfficialRosterImport、OfficialRosterEntry、RosterAlignmentResult | 是 | Result 可更新，其余否 | 否 | Result 是，其余否 | 导入版本和原始条目作为可追溯事实保留 |
| 运动事实：ExerciseSession、ExerciseRecord | 是 | 是 | 否 | 是 | 取消、过期、作废通过状态/审核表达，不删除原事实 |
| 媒体：MediaEvidence | 是 | 是 | 生命周期清理可用 | 是 | `deletedAt` 表示对象存储删除完成，不代表记录关系消失 |
| 历史：ReviewRecord、ScoreContribution、ScoreAdjustment、AuditLog | 是 | 否 | 否 | 否 | append-only；更正或重算只能追加新记录/新修订 |
| 计算结果：StudentScore | 是 | 是 | 否 | 是 | 可重算但保留规则版本与来源修订 |

## 4. 核心对象字段字典

以下对象名和职责以阶段 1 的核心实体边界为准。公共字段仍按第 3 节适用；每张表只额外列出本对象业务字段，且保持相同 14 列格式。

### 4.1 Organization（组织）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Organization | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `org_bnbu` | 服务端 | INTERNAL | 当前单一 BNBU 也必须保留组织边界 |
| Organization | `organizationCode` | `organization_code` | string / varchar | 32 | 是 | 否 | — | — | `^[A-Z0-9_-]{2,32}$`；唯一 | `BNBU` | 管理员配置 | INTERNAL | 稳定业务代码，不用展示名做关联 |
| Organization | `legalName` | `legal_name` | string / varchar | 300 | 是 | 否 | — | — | trim 后 1–300 字符 | `北京师范大学-香港浸会大学联合国际学院` | 管理员配置/权威组织资料 | PUBLIC | 法定/正式全称；展示简称变化不改此字段 |
| Organization | `displayName` | `display_name` | string / varchar | 200 | 是 | 否 | — | — | trim 后 1–200 字符 | `北京师范大学-香港浸会大学联合国际学院` | 管理员配置 | PUBLIC | 可本地化时后续拆翻译资源 |
| Organization | `timezone` | `timezone` | string / varchar | 64 | 是 | 否 | `Asia/Shanghai`（当前 BNBU） | IANA 时区 | 必须为 IANA TZDB 标识 | `Asia/Shanghai` | 组织配置 | INTERNAL | 用于 `businessDate`，不是客户端设备时区 |
| Organization | `defaultLocale` | `default_locale` | string / varchar | 35 | 是 | 否 | —（部署配置） | BCP 47 locale | 必须为受支持的 BCP 47 语言标签 | `zh-CN` | 组织配置 | INTERNAL | 只决定默认文案/格式，不改变时区或存储值；本阶段不替业务选择默认语言 |
| Organization | `status` | `status` | enum / varchar | 32 | 是 | 否 | `ACTIVE` | — | 仅阶段 3 冻结的 OrganizationStatus | `ACTIVE` | 管理员/系统 | INTERNAL | 未知值 fail closed |

### 4.2 User（登录账户）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| User | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `usr_01JABC123` | 服务端 | INTERNAL | 认证主体 ID，不是学号/工号 |
| User | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 注册/管理员 | INTERNAL | 所有资源范围校验的第一层 |
| User | `role` | `role` | enum / varchar | 16 | 是 | 否 | — | — | `STUDENT/TEACHER/ADMIN` | `STUDENT` | 注册/管理员 | INTERNAL | 只允许 ADR-001 三角色 |
| User | `status` | `status` | enum / varchar | 32 | 是 | 否 | — | — | 阶段 3 冻结；未知值 fail closed | `ACTIVE` | 后端账户流程 | SENSITIVE | 不与 Profile/Enrollment 状态复用 |
| User | `primaryEmail` | `primary_email` | string / varchar | 254 | 创建否 | 是 | `null` | — | 小写规范化；验证后组织范围/全局唯一策略待 ADR-028 | `student@example.edu` | 本人验证/管理员恢复 | HIGHLY_SENSITIVE | 学生直接入班时允许空；响应只返回 masked projection |
| User | `retiredPrimaryPhone` | `primary_phone` | string / varchar | 32 | 否 | 是 | 历史值 | — | ADR-101 后不可读写，仅保留历史列与唯一索引 | 不提供 | 无应用写入者 | HIGHLY_SENSITIVE | Prisma `@ignore`；待未来破坏性迁移审批后物理删除 |
| User | `emailVerifiedAt` | `email_verified_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 仅验证服务在成功验证当前 primaryEmail 后写入；邮箱改变时清空 | `2026-08-02T01:20:00Z` | 联系方式验证服务 | HIGHLY_SENSITIVE | null 表示当前邮箱未验证，不等于账户不可用 |
| User | `retiredPhoneVerifiedAt` | `phone_verified_at` | date-time / timestamp | 微秒精度 | 否 | 是 | 历史值 | UTC 时间点 | ADR-101 后不可读写 | 不提供 | 无应用写入者 | HIGHLY_SENSITIVE | Prisma `@ignore`；不进入任何公共投影 |
| User | `passwordHash` | `password_hash` | string / varchar | 255 | 否 | 是 | `null` | — | 只保存获批算法输出；禁止明文 | `$argon2id$...` | 认证服务 | HIGHLY_SENSITIVE | **不进入任何公共 API**；学生无密码时为空 |
| User | `tokenVersion` | `token_version` | integer / bigint | 64-bit | 是 | 否 | `0` | 修订号 | `>=0`；禁用/强制退出按认证策略递增 | `3` | 认证服务 | HIGHLY_SENSITIVE | 内部认证字段；公共 API 不返回 |
| User | `lastAuthenticatedAt` | `last_authenticated_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 成功建立会话后由服务端写入 | `2026-08-02T01:30:00Z` | 认证服务 | HIGHLY_SENSITIVE | 不用于业务并发控制 |

### 4.3 StudentProfile（学生档案）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| StudentProfile | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `stu_01JABC123` | 服务端 | INTERNAL | 其他对象的 `studentId` 引用此值 |
| StudentProfile | `userId` | `user_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `User.id`；一对一唯一 | `usr_01JABC123` | 账户创建 | INTERNAL | 与 Enrollment 分离 |
| StudentProfile | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id`；与 User 一致 | `org_bnbu` | 账户创建 | INTERNAL | 用于学号唯一范围 |
| StudentProfile | `studentNumber` | `student_number` | string / varchar | 32 | 是 | 否 | — | — | trim/大写规范化；组织内唯一；不得等于/替代 `id` | `2024010836` | 官方名单/学生填写后核验 | SENSITIVE | 学校学号；允许前导零 |
| StudentProfile | `fullName` | `full_name` | string / varchar | 100 | 是 | 否 | — | — | trim；1–100 字符；禁止作为关联键 | `林若晴` | 官方名单/学生确认 | SENSITIVE | 展示名称 |
| StudentProfile | `gender` | `gender` | enum / varchar | 32 | 是 | 否 | — | — | 全局 Gender 保留 `MALE/FEMALE/OTHER`；扫码加入只接受 `MALE/FEMALE` | `FEMALE` | 官方名单/学生确认 | SENSITIVE | 历史与名单数据可继续使用 `OTHER`；i18n 在客户端完成 |
| StudentProfile | `gradeYear` | `grade_year` | integer / smallint | 4 位 | 是 | 否 | — | 公历年 | `1000..9999`；只做稳定的四位年份校验，不受当前时间影响 | `2024` | 官方名单/学生确认 | SENSITIVE | ADR-050：四位入学/年级 cohort 年份；`freshman` 等相对年级只按 Semester 派生 |
| StudentProfile | `collegeName` | `college_name` | string / varchar | 200 | 否 | 是 | `null` | — | trim；最大 200 | `工商与管理学院` | 官方名单/管理员 | SENSITIVE | 未有学院主数据实体前保存名称快照 |
| StudentProfile | `majorName` | `major_name` | string / varchar | 200 | 否 | 是 | `null` | — | trim；最大 200 | `工商管理` | 官方名单/管理员 | SENSITIVE | 不用泛化 `major` |
| StudentProfile | `administrativeClassName` | `administrative_class_name` | string / varchar | 200 | 否 | 是 | `null` | — | trim；最大 200 | `2024级工商管理1班` | 官方名单/管理员 | SENSITIVE | 行政班，不是体育教学班 |
| StudentProfile | `status` | `status` | enum / varchar | 32 | 是 | 否 | `ACTIVE` | — | 独立 StudentProfileStatus；未知值 fail closed | `ACTIVE` | 后端/管理员 | SENSITIVE | 不承载联系方式绑定或入班状态 |

### 4.4 TeacherProfile（教师档案）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TeacherProfile | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `tch_01JABC123` | 服务端 | INTERNAL | `teacherId` 引用此值 |
| TeacherProfile | `userId` | `user_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `User.id`；一对一唯一 | `usr_01JTCH123` | 管理员 | INTERNAL | 登录账户与教师身份分离 |
| TeacherProfile | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 管理员 | INTERNAL | 不能跨组织授课，除非未来显式建授权关系 |
| TeacherProfile | `employeeNumber` | `employee_number` | string / varchar | 32 | 是 | 否 | — | — | 组织内唯一；保留前导零 | `T00042` | 管理员/人事同步 | SENSITIVE | 不能使用 `account` 代替 |
| TeacherProfile | `fullName` | `full_name` | string / varchar | 100 | 是 | 否 | — | — | trim；1–100 字符 | `陈宇航` | 管理员/人事同步 | SENSITIVE | 不作为资源归属判断依据 |
| TeacherProfile | `collegeName` | `college_name` | string / varchar | 200 | 否 | 是 | `null` | — | trim；最大 200 | `体育部` | 管理员/人事同步 | SENSITIVE | 名称快照 |
| TeacherProfile | `departmentName` | `department_name` | string / varchar | 200 | 否 | 是 | `null` | — | trim；最大 200 | `体育教学部` | 管理员/人事同步 | SENSITIVE | 部门名称快照；不作为授权依据 |
| TeacherProfile | `title` | `title` | string / varchar | 100 | 否 | 是 | `null` | — | trim；最大 100 | `讲师` | 管理员/人事同步 | SENSITIVE | 职称展示字段；不推导角色或权限 |
| TeacherProfile | `status` | `status` | enum / varchar | 32 | 是 | 否 | `ACTIVE` | — | 独立 TeacherProfileStatus | `ACTIVE` | 管理员 | SENSITIVE | 教学班归属另由 ClassSection 定义 |

### 4.5 AdminProfile（管理员档案）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AdminProfile | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `adm_01JABC123` | 服务端 | INTERNAL | 管理员 Profile ID |
| AdminProfile | `userId` | `user_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `User.id`；一对一唯一 | `usr_01JADM123` | 管理员引导/系统 | INTERNAL | 账户与档案分离 |
| AdminProfile | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 系统 | INTERNAL | ADMIN 也必须受组织范围约束 |
| AdminProfile | `employeeNumber` | `employee_number` | string / varchar | 32 | 是 | 否 | — | — | 组织内唯一；保留前导零 | `A00007` | 管理员/人事同步 | SENSITIVE | 不使用登录 account 作为档案字段 |
| AdminProfile | `fullName` | `full_name` | string / varchar | 100 | 是 | 否 | — | — | trim；1–100 字符 | `陈若宁` | 管理员/人事同步 | SENSITIVE | 审计展示需同时保留 actor ID |
| AdminProfile | `departmentName` | `department_name` | string / varchar | 200 | 否 | 是 | `null` | — | trim；最大 200 | `教务处` | 管理员/人事同步 | SENSITIVE | 名称快照 |
| AdminProfile | `status` | `status` | enum / varchar | 32 | 是 | 否 | `ACTIVE` | — | 独立 AdminProfileStatus | `ACTIVE` | 系统/授权管理员 | SENSITIVE | 不表示权限集合 |

### 4.6 Semester（学期）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Semester | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `sem_2025_2026_2` | 服务端 | INTERNAL | `semesterId` 引用此值 |
| Semester | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 管理员 | INTERNAL | 学期不能跨组织共享 |
| Semester | `academicYear` | `academic_year` | string / varchar | 9 | 是 | 否 | — | — | `^\d{4}-\d{4}$` 且后一年=前一年+1 | `2025-2026` | 管理员/教务同步 | INTERNAL | 稳定代码，不包含展示空格 |
| Semester | `termCode` | `term_code` | enum / varchar | 16 | 是 | 否 | — | — | `FIRST/SECOND/SUMMER`；阶段 3 最终冻结 | `SECOND` | 管理员/教务同步 | INTERNAL | 旧 `term` 迁移为稳定枚举 |
| Semester | `displayName` | `display_name` | string / varchar | 100 | 是 | 否 | — | — | trim；1–100 字符 | `2025-2026 学年第二学期` | 管理员 | PUBLIC | 仅展示，不用于关联 |
| Semester | `startDate` | `start_date` | date / date | 日精度 | 是 | 否 | — | 组织本地日期 | `YYYY-MM-DD` | `2026-02-23` | 管理员/教务同步 | INTERNAL | 不得使用时间点替代 |
| Semester | `endDate` | `end_date` | date / date | 日精度 | 是 | 否 | — | 组织本地日期 | `endDate >= startDate` | `2026-07-31` | 管理员/教务同步 | INTERNAL | 边界包含性由业务规则定义 |
| Semester | `status` | `status` | enum / varchar | 16 | 是 | 否 | `UPCOMING` | — | `UPCOMING/CURRENT/ARCHIVED`；同组织仅一个 CURRENT | `CURRENT` | 管理员/系统 | INTERNAL | 切换与归档仍受 ADR-027 约束 |
| Semester | `isCurrent` | —（派生） | boolean | — | 响应是 | 否 | 由 `status` 派生 | — | `status == CURRENT` | `true` | 后端 projection | INTERNAL | 禁止作为第二列落库 |

### 4.7 Course（课程定义）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Course | `id` | `id` | opaque string / uuid | UUID | 是 | 否 | 应用层 UUIDv7 | — | API 不解析；数据库主键 | `018f...` | 服务端 | INTERNAL | `courseId` 引用课程定义，不再指教学班 |
| Course | `organizationId` | `organization_id` | opaque string / uuid | UUID | 是 | 否 | principal | — | 引用 `Organization.id` | `018f...` | 服务端认证主体 | INTERNAL | 不接受客户端自报组织范围 |
| Course | `courseCode` | `course_code` | string / varchar | 32 | 是 | 否 | — | — | 组织内唯一；trim/大写规范化 | `PE101` | 管理员/教务同步 | INTERNAL | 跨学期稳定的课程代码 |
| Course | `courseName` | `course_name` | string / varchar | 200 | 是 | 否 | — | — | trim；1–200 字符 | `大学体育（一）` | 管理员/教务同步 | PUBLIC | 不含 Section；跨聚合 DTO 禁止再退化为泛化 `name` |
| Course | `description` | `description` | string / text | 2000 | 否 | 是 | `null` | — | 最大 2000 字符 | `大学体育基础课程` | 管理员/教务同步 | PUBLIC | 禁止使用泛化 `info` |
| Course | `status` | `status` | enum / varchar | 16 | 是 | 否 | `ACTIVE` | — | `CourseStatus=ACTIVE/INACTIVE`；未知值 fail closed | `ACTIVE` | 管理员 | INTERNAL | INACTIVE 阻止新开班，不关闭已有 ClassSection |
| Course | `createdBy` | `created_by` | opaque string / uuid | UUID | 是 | 否 | principal User.id | — | 与 Course 同组织 | `018f...` | 服务端 | INTERNAL | 创建 actor，不接受请求体 |
| Course | `updatedBy` | `updated_by` | opaque string / uuid | UUID | 是 | 否 | principal User.id | — | 与 Course 同组织 | `018f...` | 服务端 | INTERNAL | 最近一次修改 actor |
| Course | `createdAt` | `created_at` | date-time / timestamptz | 微秒 | 是 | 否 | 服务端时间 | UTC | RFC 3339 输出 | `2026-08-03T12:00:00Z` | 服务端 | INTERNAL | — |
| Course | `updatedAt` | `updated_at` | date-time / timestamptz | 微秒 | 是 | 否 | 服务端时间 | UTC | RFC 3339 输出 | `2026-08-03T12:00:00Z` | 服务端 | INTERNAL | — |
| Course | `deletedAt` | `deleted_at` | date-time / timestamptz | 微秒 | 否 | 是 | `null` | UTC | 与 deletedBy 同时空或同时有值 | `null` | 受控生命周期 | INTERNAL | 普通 API 不开放删除；被引用后只能停用 |
| Course | `deletedBy` | `deleted_by` | opaque string / uuid | UUID | 否 | 是 | `null` | — | 与 deletedAt 同时空或同时有值且同组织 | `null` | 受控生命周期 | INTERNAL | 不进入普通 Course projection |
| Course | `version` | `version` | integer / integer | int32 | 是 | 否 | `1` | — | `>=1`；mutation 校验 expectedVersion | `1` | 服务端 | INTERNAL | 乐观锁 |

### 4.8 ClassSection（教学班）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ClassSection | `id` | `id` | opaque string / uuid | UUID | 是 | 否 | 应用层 UUIDv7 | — | API 不解析；数据库主键 | `018f...` | 服务端 | INTERNAL | `classSectionId` 引用此值；旧 `courseId` 常实际映射到此值 |
| ClassSection | `organizationId` | `organization_id` | opaque string / uuid | UUID | 是 | 否 | principal | — | 引用 `Organization.id` | `018f...` | 服务端认证主体 | INTERNAL | 必须与 Course/Semester/Teacher 同组织 |
| ClassSection | `courseId` | `course_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Course.id` | `crs_pe101` | 管理员/教务同步 | INTERNAL | 课程定义外键 |
| ClassSection | `semesterId` | `semester_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Semester.id` | `sem_2025_2026_2` | 管理员/教务同步 | INTERNAL | 学期开课实例 |
| ClassSection | `teacherId` | `teacher_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `TeacherProfile.id`；教师需 ACTIVE | `tch_01JABC123` | 管理员/教务同步 | SENSITIVE | 当前模型冻结一个责任教师；扩展多人需新关系对象/ADR |
| ClassSection | `classCode` | `class_code` | string / varchar | 64 | 是 | 否 | — | — | `(semesterId, courseId, classCode)` 组合唯一 | `01` | 管理员/教务同步 | INTERNAL | 不同课程允许同为 01 班；旧 `section`、`teachingClassCode` 统一到此字段 |
| ClassSection | `displayName` | `display_name` | string / varchar | 200 | 是 | 否 | — | — | trim；1–200 字符 | `大学体育（一）01班` | 管理员 | PUBLIC | 可由 Course.courseName + classCode 生成后允许定制 |
| ClassSection | `status` | `status` | enum / varchar | 16 | 是 | 否 | `UPCOMING` | — | 阶段 3 冻结；归档/关闭后默认拒绝写 | `ACTIVE` | 管理员/系统 | INTERNAL | 不与 Course/Semester status 混用 |
| ClassSection | `isEnrollmentOpen` | `is_enrollment_open` | boolean / boolean | — | 是 | 否 | `false` | — | 仅 ACTIVE/UPCOMING 的允许组合可设 true | `true` | 教师/后端规则 | INTERNAL | UI 不得单独裁决；邀请有效也必须再次校验 |
| ClassSection | `checkInWindowMode` | `check_in_window_mode` | enum / varchar | 32 | 是 | 否 | `UNAVAILABLE` | — | 阶段 3/4 冻结；未知值 fail closed | `AVAILABLE` | 责任教师 | INTERNAL | 当前无独立策略实体，先作为教学班配置字段 |
| ClassSection | `checkInStartDate` | `check_in_start_date` | date / date | 日精度 | 否 | 是 | `null` | 组织本地日期 | 不早于 Semester.startDate | `2026-02-23` | 责任教师 | INTERNAL | 空值解释由 windowMode 决定 |
| ClassSection | `checkInEndDate` | `check_in_end_date` | date / date | 日精度 | 否 | 是 | `null` | 组织本地日期 | 不晚于 Semester.endDate；不早于 start | `2026-07-31` | 责任教师 | INTERNAL | 与 deadline 含义分离 |
| ClassSection | `dailyStartTime` | `daily_start_time` | local-time / time | 秒精度 | 否 | 是 | `null` | 组织本地时间 | `HH:mm:ss` | `06:00:00` | 责任教师 | INTERNAL | 结合组织时区与 businessDate 使用 |
| ClassSection | `dailyEndTime` | `daily_end_time` | local-time / time | 秒精度 | 否 | 是 | `null` | 组织本地时间 | `HH:mm:ss`；跨午夜语义阶段 4 明确 | `22:00:00` | 责任教师 | INTERNAL | 禁止保存成 UTC 时间点 |
| ClassSection | `submissionDeadlineAt` | `submission_deadline_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | RFC 3339；应落在学期策略允许范围 | `2026-07-31T15:59:59Z` | 责任教师 | INTERNAL | 统一旧 `deadline/semesterDeadline`；精确到时间点 |
| ClassSection | `excludedDates` | `class_section_excluded_dates.excluded_date` | array<date> / relation rows | 日期集合 | 是 | 否 | `[]` | 组织本地日期 | API 去重升序；关系表唯一 `(class_section_id, excluded_date)`；必须位于 checkIn/semester 范围 | `["2026-05-01"]` | 责任教师 | INTERNAL | 整体值对象语义；禁止 JSON/逗号字符串；替换与 version/audit/outbox 同事务 |
| ClassSection | `createdBy` | `created_by` | opaque string / uuid | UUID | 是 | 否 | principal User.id | — | 同组织 | `018f...` | 服务端 | INTERNAL | 创建者必须是责任教师对应 User |
| ClassSection | `updatedBy` | `updated_by` | opaque string / uuid | UUID | 是 | 否 | principal User.id | — | 同组织 | `018f...` | 服务端 | INTERNAL | 最近修改 actor |
| ClassSection | `createdAt` | `created_at` | date-time / timestamptz | 微秒 | 是 | 否 | 服务端时间 | UTC | RFC 3339 输出 | `2026-08-03T12:00:00Z` | 服务端 | INTERNAL | — |
| ClassSection | `updatedAt` | `updated_at` | date-time / timestamptz | 微秒 | 是 | 否 | 服务端时间 | UTC | RFC 3339 输出 | `2026-08-03T12:00:00Z` | 服务端 | INTERNAL | — |
| ClassSection | `version` | `version` | integer / integer | int32 | 是 | 否 | `1` | — | `>=1`；mutation 校验 expectedVersion | `1` | 服务端 | INTERNAL | 乐观锁 |
| ClassSection | `closedAt` | `closed_at` | date-time / timestamptz | 微秒 | 否 | 是 | `null` | UTC | CLOSED 时必填 | `null` | 服务端 | INTERNAL | 关闭后不可恢复为 ACTIVE，除非未来新 ADR |
| ClassSection | `closedBy` | `closed_by` | opaque string / uuid | UUID | 否 | 是 | `null` | — | CLOSED 时必填且同组织 | `null` | 责任教师 | INTERNAL | 不接受请求体 actor |
| ClassSection | `closeReason` | `close_reason` | string / varchar | 1000 | 否 | 是 | `null` | — | CLOSED 时 trim 后 1–1000 | `Synthetic close reason` | 责任教师 | SENSITIVE | 不写普通日志或 Outbox 正文 |

### 4.9 Enrollment（入班关系）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Enrollment | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `enr_01JABC123` | 服务端 | INTERNAL | `enrollmentId` 必须贯穿 record/score |
| Enrollment | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 服务端 | INTERNAL | 由 ClassSection 派生并校验一致 |
| Enrollment | `semesterId` | `semester_id` | string / varchar | 64 | 是 | 否 | 从 ClassSection 冻结 | — | 引用 `Semester.id`；必须等于 ClassSection.semesterId | `sem_2025_2026_2` | 服务端 | INTERNAL | 支持同一学生/学期 ACTIVE Enrollment 约束；客户端不得自行指定 |
| Enrollment | `studentId` | `student_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `StudentProfile.id` | `stu_01JABC123` | 入班流程 | SENSITIVE | 不接受 `studentNumber` 代替 |
| Enrollment | `classSectionId` | `class_section_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ClassSection.id` | `cls_01JABC123` | 入班流程 | SENSITIVE | 旧 `courseId` 需先判定语义再迁移 |
| Enrollment | `source` | `source` | enum / varchar | 32 | 是 | 否 | — | — | `OFFICIAL_IMPORT/QR_CODE/MANUAL/SYSTEM_SYNC` | `QR_CODE` | 入班流程 | SENSITIVE | 禁止中文值或 `qr/manual_import` |
| Enrollment | `sourceReferenceId` | `source_reference_id` | string / varchar | 64 | 否 | 是 | `null` | — | 对应邀请/导入任务等来源；存在时必须同组织 | `inv_01JABC123` | 入班流程 | SENSITIVE | 多态来源仅作追溯，不能替代正式外键校验 |
| Enrollment | `status` | `status` | enum / varchar | 32 | 是 | 否 | `ACTIVE`（直接入班成功） | — | 阶段 3 EnrollmentStatus；正常扫码不经过 PENDING_APPROVAL | `ACTIVE` | 后端状态机 | SENSITIVE | 名单对齐状态不得写入此字段 |
| Enrollment | `joinedAt` | `joined_at` | date-time / timestamp | 微秒精度 | 是 | 否 | 服务端当前时间 | UTC 时间点 | 成功创建关系时冻结 | `2026-08-02T01:30:00Z` | 服务端 | SENSITIVE | 不能使用客户端时间 |
| Enrollment | `endedAt` | `ended_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 非 ACTIVE 时按状态机要求写入 | `null` | 服务端状态机 | SENSITIVE | 移出/退出历史保留 |
| Enrollment | `endReason` | `end_reason` | string / varchar | 500 | 否 | 是 | `null` | — | removed/withdrawn 时按阶段 3/4 要求必填 | `教师移出：转班` | 发起角色 | HIGHLY_SENSITIVE | 学生 projection 可仅返回允许公开的原因 |

### 4.10 OfficialRosterImport（官方名单导入）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OfficialRosterImport | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `rimp_01JABC123` | 服务端 | INTERNAL | 一次不可变导入任务/版本 |
| OfficialRosterImport | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 服务端 | INTERNAL | 资源范围 |
| OfficialRosterImport | `classSectionId` | `class_section_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ClassSection.id` | `cls_01JABC123` | 教师/管理员导入 | SENSITIVE | 旧 Web `courseId` 实际迁移到此字段 |
| OfficialRosterImport | `versionNumber` | `version_number` | integer / integer | 32-bit | 是 | 否 | 服务端递增 | 版本序号 | 同教学班 `>=1` 且唯一 | `3` | 服务端 | INTERNAL | 与 optimistic-lock `version` 不同 |
| OfficialRosterImport | `source` | `source` | enum / varchar | 32 | 是 | 否 | — | — | `FILE/OFFICIAL_API` | `FILE` | 导入请求 | INTERNAL | `SYSTEM_SYNC` 是 Enrollment 来源，不复用到这里 |
| OfficialRosterImport | `fileName` | `file_name` | string / varchar | 255 | 条件必填 | 是 | `null` | — | V1 FILE 只接受净化后的单扩展名 `.csv` basename | `PE101-01-roster.csv` | 上传文件 | HIGHLY_SENSITIVE | 不作为存储路径；XLSX/XLS/ODS/ZIP 等拒绝 |
| OfficialRosterImport | `sourceFileStorageKey` | `source_file_storage_key` | string / varchar | 512 | 条件必填 | 是 | `null` | — | FILE 来源内部必填；对象必须 private | `rosters/2026/...` | Roster source storage adapter | HIGHLY_SENSITIVE | **不进入公共 API**；Stage 13 不提供源文件下载或 signed URL |
| OfficialRosterImport | `fileChecksumSha256` | `file_checksum_sha256` | string / char | 64 | 条件必填 | 是 | `null` | hex | `^[a-f0-9]{64}$` | `9f86d081...` | 文件服务 | HIGHLY_SENSITIVE | 去重和审计，不证明内容可信 |
| OfficialRosterImport | `fieldMappingSnapshot` | `field_mapping_snapshot` | object / json | ≤4 KiB | 是 | 否 | — | — | additionalProperties=false；只含 canonical field 到 CSV header 的白名单 mapping | `{"studentNumber":"学号","fullName":"姓名"}` | 导入请求/解析器 | HIGHLY_SENSITIVE | 冻结本版本如何解释源列，确保复核可重现 |
| OfficialRosterImport | `status` | `status` | enum / varchar | 32 | 是 | 否 | `RECEIVED` | — | 独立 RosterImportStatus；阶段 3/7 冻结 | `VALIDATED` | 导入状态机 | INTERNAL | 不与对齐结果状态混用 |
| OfficialRosterImport | `totalRowCount` | `total_row_count` | integer / integer | 32-bit | 是 | 否 | `0` | 行 | `>=0` | `42` | 解析器 | INTERNAL | 不含表头 |
| OfficialRosterImport | `validRowCount` | `valid_row_count` | integer / integer | 32-bit | 是 | 否 | `0` | 行 | `0..totalRowCount` | `40` | 校验器 | INTERNAL | 仅结构校验通过行数 |
| OfficialRosterImport | `invalidRowCount` | `invalid_row_count` | integer / integer | 32-bit | 是 | 否 | `0` | 行 | `>=0`；与 duplicated 分开 | `1` | 校验器 | INTERNAL | 不代表名单对齐异常数 |
| OfficialRosterImport | `duplicatedRowCount` | `duplicated_row_count` | integer / integer | 32-bit | 是 | 否 | `0` | 行 | `total = valid + invalid + duplicated` | `1` | 校验器 | INTERNAL | 重复行保留但不参与 Alignment |
| OfficialRosterImport | `importedAt` | `imported_at` | date-time / timestamp | 微秒精度 | 是 | 否 | 服务端当前时间 | UTC 时间点 | 成功接收后写入 | `2026-08-02T01:30:00Z` | 服务端 | INTERNAL | 旧 `importedAt` 保留语义 |
| OfficialRosterImport | `importedBy` | `imported_by` | string / varchar | 64 | 是 | 否 | 认证主体 | — | 引用 `User.id` | `usr_01JTCH123` | 认证主体 | SENSITIVE | 旧 importedBy 姓名改为 ID；姓名从 Profile 投影 |
| OfficialRosterImport | `isCurrent` | `is_current` | boolean / boolean | — | 是 | 否 | `false` | — | 同教学班最多一个 true；切换必须事务化 | `true` | 服务端 | INTERNAL | 历史版本不删除 |
| OfficialRosterImport | `failureCode` | `failure_code` | string / varchar | 64 | 否 | 是 | `null` | — | 只允许稳定 UPPER_SNAKE_CASE 安全码；FAILED 时必填 | `ROSTER_SCHEMA_INVALID` | 导入服务 | INTERNAL | 不保存 parser stack |
| OfficialRosterImport | `failureDetailsSafe` | `failure_details_safe` | object / json | ≤4 KiB | 否 | 是 | `null` | — | 白名单统计/字段错误，不含 PII、SQL、路径或 storage credential | `{"category":"HEADER"}` | 导入服务 | INTERNAL | 公共 projection 只返回安全摘要 |
| OfficialRosterImport | `supersededAt` | `superseded_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | current 被原子切换走时记录 | `2026-08-04T12:00:00Z` | 服务端 | INTERNAL | 不增加 `SUPERSEDED` 状态 |
| OfficialRosterImport | `version` | `version` | integer / integer | 32-bit | 是 | 否 | `1` | optimistic version | `>=1`；只随 current pointer 切换递增 | `2` | 服务端 | INTERNAL | 既有导入内容和 Entry 永不更新 |

### 4.11 OfficialRosterEntry（官方名单条目）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OfficialRosterEntry | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `rent_01JABC123` | 服务端 | INTERNAL | 不是 StudentProfile 或 Enrollment |
| OfficialRosterEntry | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 导入任务 | INTERNAL | 由教学班推导 |
| OfficialRosterEntry | `rosterImportId` | `roster_import_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `OfficialRosterImport.id` | `rimp_01JABC123` | 导入任务 | INTERNAL | 导入版本内不可变 |
| OfficialRosterEntry | `classSectionId` | `class_section_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ClassSection.id`；与 Import 一致 | `cls_01JABC123` | 导入任务 | SENSITIVE | 不用旧 `courseId` |
| OfficialRosterEntry | `normalizedStudentNumber` | `normalized_student_number` | string / varchar | 32 | 否 | 是 | `null` | — | trim 并保持前导零；无效行允许 null；同一导入内不唯一 | `002024010836` | 导入解析器 | SENSITIVE | 只是名单快照学号，不自动创建 Profile/Enrollment |
| OfficialRosterEntry | `rawStudentNumberSafe` | `raw_student_number_safe` | string / varchar | 64 | 否 | 是 | `null` | — | 只保存安全文本；公式样式值转义并把该行标 INVALID | `002024010836` | 官方名单 | HIGHLY_SENSITIVE | 不进入日志；不作为数据库主键 |
| OfficialRosterEntry | `fullName` | `full_name` | string / varchar | 100 | 是 | 否 | — | — | trim；1–100 字符 | `林若晴` | 官方名单 | SENSITIVE | 不靠姓名自动关联 |
| OfficialRosterEntry | `gender` | `gender` | enum / varchar | 32 | 否 | 是 | `null` | — | 能映射统一 Gender，否则导入行报错/待处理 | `FEMALE` | 官方名单 | SENSITIVE | 不保存中文 wire value |
| OfficialRosterEntry | `gradeYear` | `grade_year` | integer / smallint | 4 位 | 否 | 是 | `null` | 公历年 | 合法四位年份 | `2024` | 官方名单 | SENSITIVE | 旧 grade 文本必须先解析；原值保留在 source snapshot |
| OfficialRosterEntry | `collegeName` | `college_name` | string / varchar | 200 | 否 | 是 | `null` | — | trim；最大 200 | `工商与管理学院` | 官方名单 | SENSITIVE | 名称快照 |
| OfficialRosterEntry | `majorName` | `major_name` | string / varchar | 200 | 否 | 是 | `null` | — | trim；最大 200 | `工商管理` | 官方名单 | SENSITIVE | 统一旧 `major` |
| OfficialRosterEntry | `administrativeClassName` | `administrative_class_name` | string / varchar | 200 | 否 | 是 | `null` | — | trim；最大 200 | `2024级工商管理1班` | 官方名单 | SENSITIVE | 统一旧 `administrativeClass` |
| OfficialRosterEntry | `sourceRowNumber` | `source_row_number` | integer / integer | 32-bit | 是 | 否 | — | 行 | `>=1` | `18` | 解析器 | INTERNAL | 便于给出可修复错误 |
| OfficialRosterEntry | `rowValidationStatus` | `row_validation_status` | enum / varchar | 32 | 是 | 否 | — | — | 独立 RosterRowValidationStatus；至少区分 VALID/INVALID/DUPLICATED，阶段 3 冻结 | `DUPLICATED` | 导入校验器 | SENSITIVE | 只表示源行结构/重复校验，不等于对齐结果 |
| OfficialRosterEntry | `rowErrorCodes` | `row_error_codes` | array<string> / relation | 元素 ≤64；数量上限待实现阶段 | 是 | 否 | `[]` | — | 稳定 UPPER_SNAKE_CASE 码；空数组仅用于 VALID 行 | `["DUPLICATE_STUDENT_NUMBER"]` | 导入校验器 | SENSITIVE | 逻辑数组；物理实现不得使用逗号字符串，待阶段 10 决定子表/JSON |
| OfficialRosterEntry | `rawRowSnapshotSafe` | `raw_row_snapshot_safe` | object / json | ≤4 KiB | 是 | 否 | `{}` | — | 只保存 canonical 白名单列；不保存公式执行结果、任意 workbook/宏/二进制 | `{"studentNumber":"002024010836"}` | 解析器 | HIGHLY_SENSITIVE | 内部复核；公共 API 永不返回 |

### 4.12A RosterAlignmentRun（名单对齐运行）

| API 字段 | 数据库字段 | 类型 | 约束与来源 | 隐私级别 |
|---|---|---|---|---|
| `id` | `id` | opaque string / uuid | UUIDv7；主键 | INTERNAL |
| `organizationId` | `organization_id` | opaque string / uuid | 引用 Organization；由 Import/ClassSection 推导 | INTERNAL |
| `classSectionId` | `class_section_id` | opaque string / uuid | 引用 ClassSection | SENSITIVE |
| `rosterImportId` | `roster_import_id` | opaque string / uuid | 引用 VALIDATED Import | INTERNAL |
| `comparisonRevision` | `comparison_revision` | integer | 同 ClassSection 单调递增且唯一，`>=1` | INTERNAL |
| `algorithmVersion` | `algorithm_version` | string | V1 固定 `ROSTER_ALIGNMENT_V1` | INTERNAL |
| `platformSnapshotFingerprint` | `platform_snapshot_fingerprint` | sha256 | canonical 最小快照的 SHA-256 | HIGHLY_SENSITIVE |
| `platformSnapshotAt` | `platform_snapshot_at` | date-time / timestamptz | 服务端冻结时间 | INTERNAL |
| `status` | `status` | `RosterAlignmentRunStatus` | `RUNNING/COMPLETED/FAILED` | INTERNAL |
| `startedBy` | `started_by` | opaque string / uuid | 同组织责任 Teacher User | SENSITIVE |
| `startedAt` / `completedAt` | `started_at` / `completed_at` | date-time / timestamptz | 服务端时间；RUNNING 时 completedAt=null | INTERNAL |
| `failureCode` / `failureDetailsSafe` | `failure_code` / `failure_details_safe` | string / json | FAILED 安全诊断；禁止 PII/SQL/stack | INTERNAL |
| `resultCount` | `result_count` | integer | `>=0`；COMPLETED 时等于持久结果数 | INTERNAL |

### 4.12B RosterAlignmentPlatformEntry（冻结平台快照）

| API 字段 | 数据库字段 | 类型 | 约束与来源 | 隐私级别 |
|---|---|---|---|---|
| — | `id` | uuid | UUIDv7；内部主键 | INTERNAL |
| — | `alignment_run_id` | uuid | 引用 Run；与 enrollment_id 唯一 | INTERNAL |
| — | `organization_id` | uuid | 与 Run/Enrollment 同组织 | INTERNAL |
| — | `enrollment_id` / `student_id` | uuid | 同学期 ACTIVE Enrollment 与 StudentProfile | SENSITIVE |
| — | `class_section_id` / `semester_id` | uuid | 后端从关系链冻结 | SENSITIVE |
| — | `normalized_student_number` | varchar(32) | 保留前导零；只用于确定性匹配 | HIGHLY_SENSITIVE |
| — | `full_name_snapshot` / `gender_snapshot` / `grade_year_snapshot` | varchar / smallint | 对齐所需最小身份核验字段 | HIGHLY_SENSITIVE |
| — | `enrollment_status_snapshot` | EnrollmentStatus | Stage 13 只冻结 ACTIVE | SENSITIVE |
| — | `created_at` | timestamptz | 服务端时间；创建后不可变 | INTERNAL |

### 4.12C RosterAlignmentResult（名单对齐结果）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RosterAlignmentResult | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `raln_01JABC123` | 服务端 | INTERNAL | 每个导入版本的对齐事实 |
| RosterAlignmentResult | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 对齐任务 | INTERNAL | 范围必须一致 |
| RosterAlignmentResult | `rosterImportId` | `roster_import_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `OfficialRosterImport.id` | `rimp_01JABC123` | 对齐任务 | INTERNAL | 固定到具体名单版本 |
| RosterAlignmentResult | `classSectionId` | `class_section_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ClassSection.id` | `cls_01JABC123` | 对齐任务 | SENSITIVE | 当前对齐范围 |
| RosterAlignmentResult | `alignmentRunId` | `alignment_run_id` | string / uuid | 64 | 是 | 否 | — | — | 引用不可变 RosterAlignmentRun | `run_01JABC123` | 对齐任务 | INTERNAL | 结果所属运行 |
| RosterAlignmentResult | `subjectKey` | `subject_key` | string / varchar | 128 | 是 | 否 | 服务端生成 | — | 同 Run 唯一；由稳定 entry/enrollment ID 组合生成 | `ENTRY:...` | 对齐算法 | INTERNAL | 防同一事实双重分类 |
| RosterAlignmentResult | `officialRosterEntryId` | `official_roster_entry_id` | string / varchar | 64 | 是 | 是 | `null` | — | 引用 `OfficialRosterEntry.id`；平台多出成员时允许 null | `rent_01JABC123` | 对齐任务 | SENSITIVE | 不嵌入整份名单条目作为事实 |
| RosterAlignmentResult | `enrollmentId` | `enrollment_id` | string / varchar | 64 | 是 | 是 | `null` | — | 引用 `Enrollment.id`；名单缺平台成员时允许 null | `enr_01JABC123` | 对齐任务 | SENSITIVE | 不等于 OfficialRosterEntry |
| RosterAlignmentResult | `comparisonRevision` | `comparison_revision` | integer / bigint | 64-bit | 是 | 否 | 服务端递增 | 修订号 | 同一 Import 对齐重算时单调递增；`>=1` | `2` | 对齐任务 | INTERNAL | 把同一次计算结果固定成可复核集合 |
| RosterAlignmentResult | `status` | `status` | enum / varchar | 32 | 是 | 否 | — | — | 阶段 3 RosterAlignmentStatus | `MATCHED` | 后端对齐算法 | SENSITIVE | 与 Enrollment.status、resolutionStatus 分离 |
| RosterAlignmentResult | `differences` | `differences` | array<object> / json | 建议 ≤16 KiB | 是 | 否 | `[]` | — | 元素只含 `field/officialValue/platformValue`；field 来自白名单 | `[{"field":"FULL_NAME"}]` | 后端对齐算法 | HIGHLY_SENSITIVE | 阶段 6 可拆为专用 schema；不允许任意 data/info |
| RosterAlignmentResult | `reasonCode` | `reason_code` | enum / varchar | 64 | 否 | 是 | `null` | — | 稳定英文错误/判断码 | `STUDENT_NUMBER_CONFLICT` | 后端对齐算法 | INTERNAL | 展示文案由 i18n 映射 |
| RosterAlignmentResult | `resolutionStatus` | `resolution_status` | enum / varchar | 32 | 是 | 否 | `PENDING` | — | 独立 ResolutionStatus；阶段 3 冻结 | `PENDING` | 后端/教师处置 | SENSITIVE | 不覆盖原始 alignment status |
| RosterAlignmentResult | `currentResolutionVersion` | `current_resolution_version` | integer / integer | 32-bit | 是 | 否 | `0` | 处置修订 | `>=0`；每个追加 Event +1 | `2` | 处置服务 | INTERNAL | 与聚合 optimistic `version` 分离 |
| RosterAlignmentResult | `resolutionNote` | `resolution_note` | string / varchar | 1000 | 否 | 是 | `null` | — | trim；最大 1000 | `已向教务核对学号` | 有权教师 | HIGHLY_SENSITIVE | 旧 teacherNote 迁移到此字段 |
| RosterAlignmentResult | `resolvedAt` | `resolved_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | resolution 进入终态时写入 | `2026-08-02T03:00:00Z` | 服务端 | SENSITIVE | 重新打开时保留历史需 AuditLog/专门历史 |
| RosterAlignmentResult | `resolvedBy` | `resolved_by` | string / varchar | 64 | 否 | 是 | `null` | — | 引用 `User.id`；与 resolvedAt 同空/同有 | `usr_01JTCH123` | 认证主体 | SENSITIVE | 姓名为 projection，不落在此列 |
| RosterAlignmentResult | `lastReconciledAt` | `last_reconciled_at` | date-time / timestamp | 微秒精度 | 是 | 否 | 服务端当前时间 | UTC 时间点 | 每次重新计算结果时更新 | `2026-08-02T02:30:00Z` | 后端对齐任务 | INTERNAL | 与 `updatedAt` 语义分离 |
| RosterAlignmentResult | `supersededAt` | `superseded_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 新 comparisonRevision 成功提交时为旧修订写入 | `2026-08-02T04:00:00Z` | 对齐任务 | INTERNAL | 历史修订仍保留，不物理删除 |

### 4.12D RosterResolutionEvent（追加式处置历史）

| API 字段 | 数据库字段 | 类型 | 约束与来源 | 隐私级别 |
|---|---|---|---|---|
| — | `id` | uuid | UUIDv7；主键 | INTERNAL |
| — | `organization_id` / `alignment_result_id` | uuid | 同组织真实 Result | INTERNAL |
| — | `resolution_version` | integer | `(alignment_result_id, resolution_version)` 唯一；`>=1` | INTERNAL |
| — | `action` | `RosterResolutionAction` | `CONFIRM/RESOLVE/REOPEN` | INTERNAL |
| — | `from_status` / `to_status` | `RosterResolutionStatus` | 状态机合法边；不得写新 IGNORED | SENSITIVE |
| — | `reason` | varchar(1000) | trim 后必填 | HIGHLY_SENSITIVE |
| — | `evidence_type` / `evidence_reference_id` | enum / uuid | RESOLVE 必填；只允许已登记同组织真实资源 | HIGHLY_SENSITIVE |
| — | `actor_user_id` / `actor_role_snapshot` | uuid / UserRole | 责任 Teacher | SENSITIVE |
| — | `request_id` / `idempotency_key_reference` | varchar | 不保存原始幂等 key | INTERNAL |
| — | `created_at` | timestamptz | 服务端时间；数据库禁止 UPDATE/DELETE | INTERNAL |

### 4.13 ExerciseSession（运动计时过程）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ExerciseSession | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `ses_01JABC123` | 服务端 | INTERNAL | `sessionId` 引用此值 |
| ExerciseSession | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 服务端 | INTERNAL | 由 enrollment/class section 校验 |
| ExerciseSession | `semesterId` | `semester_id` | string / varchar | 64 | 是 | 否 | 从 Enrollment 冻结 | — | 引用 `Semester.id`；必须与 Enrollment/ClassSection 一致 | `sem_2025_2026_2` | 服务端 | INTERNAL | 支持每日/学期规则查询；客户端不得覆盖 |
| ExerciseSession | `studentId` | `student_id` | string / varchar | 64 | 是 | 否 | 认证主体推导 | — | 引用 `StudentProfile.id`；请求不得冒用 | `stu_01JABC123` | 认证服务 | SENSITIVE | 防双设备规则按此维度裁决 |
| ExerciseSession | `enrollmentId` | `enrollment_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 ACTIVE `Enrollment.id` | `enr_01JABC123` | 后端入班查询 | SENSITIVE | 不接受客户端只传 courseId |
| ExerciseSession | `classSectionId` | `class_section_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ClassSection.id`；与 Enrollment 一致 | `cls_01JABC123` | 后端入班查询 | SENSITIVE | 快速权限/策略查询外键 |
| ExerciseSession | `status` | `status` | enum / varchar | 32 | 是 | 否 | `IN_PROGRESS` | — | 阶段 3 ExerciseSessionStatus；未知值 fail closed | `PAUSED` | 后端状态机 | SENSITIVE | 客户端本地状态只是镜像 |
| ExerciseSession | `startedAt` | `started_at` | date-time / timestamp | 微秒精度 | 是 | 否 | 服务端接受开始动作时间 | UTC 时间点 | 服务端时钟为权威；客户端观测只作校验 | `2026-08-02T00:00:00Z` | 服务端 | SENSITIVE | businessDate 的唯一权威来源 |
| ExerciseSession | `endedAt` | `ended_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 终态时必填；`>= startedAt` | `2026-08-02T02:00:00Z` | 服务端状态机 | SENSITIVE | 达 7200 秒停止累计但 Record 仍待 submit |
| ExerciseSession | `actualDurationSeconds` | `actual_duration_seconds` | integer / bigint | 64-bit | 是 | 否 | `0` | 秒 | `>=0`；服务端按有效活动区间重算；事实值 | `5400` | 服务端计时 | SENSITIVE | 不含暂停时间；禁止 `duration` |
| ExerciseSession | `pausedDurationSeconds` | `paused_duration_seconds` | integer / bigint | 64-bit | 是 | 否 | `0` | 秒 | `>=0`；不得大于 elapsed duration | `600` | 服务端计时 | SENSITIVE | 独立于 actual duration |
| ExerciseSession | `clientObservedDurationSeconds` | `client_observed_duration_seconds` | integer / bigint | 64-bit | 否 | 是 | `null` | 秒 | `>=0`；只作诊断/风控，不作为最终事实 | `5398` | 客户端 | HIGHLY_SENSITIVE | 普通学生响应可不返回 |
| ExerciseSession | `businessDate` | `business_date` | date / date | 日精度 | 是 | 否 | 服务端计算 | 组织本地日期 | 按 organization timezone + startedAt；创建后不可变 | `2026-08-02` | 服务端 | SENSITIVE | 不按 submittedAt/设备时区计算 |
| ExerciseSession | `deviceSessionId` | `device_session_id` | string / varchar | 64 | 是 | 否 | 当前认证会话 | — | 引用认证设备会话；必须属于本人 | `dvs_01JABC123` | 认证服务 | HIGHLY_SENSITIVE | 用于并发/异常调查；不出普通业务 projection |
| ExerciseSession | `lastHeartbeatAt` | `last_heartbeat_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 单调不早于 startedAt | `2026-08-02T01:00:00Z` | 服务端收到 heartbeat | HIGHLY_SENSITIVE | 具体 heartbeat 策略受 ADR-021 约束 |
| ExerciseSession | `endReason` | `end_reason` | enum / varchar | 32 | 否 | 是 | `null` | — | 终态时按状态机枚举 | `DURATION_LIMIT_REACHED` | 后端状态机 | INTERNAL | 不用自由文本表达状态 |

### 4.14 ExerciseRecord（打卡记录）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ExerciseRecord | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；全链路保持同一值 | `rec_01JABC123` | 服务端 | INTERNAL | 业务语境称 `recordId`；路径/外键使用 `recordId` |
| ExerciseRecord | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 服务端 | INTERNAL | 从 session/enrollment 校验 |
| ExerciseRecord | `semesterId` | `semester_id` | string / varchar | 64 | 是 | 否 | 从 Session/Enrollment 冻结 | — | 引用 `Semester.id`；必须与 ClassSection 一致 | `sem_2025_2026_2` | 服务端 | INTERNAL | 关系快照；每日唯一键只使用 enrollmentId + businessDate |
| ExerciseRecord | `studentId` | `student_id` | string / varchar | 64 | 是 | 否 | 认证主体推导 | — | 引用 `StudentProfile.id` | `stu_01JABC123` | 服务端 | SENSITIVE | 学生请求不得指定其他人 |
| ExerciseRecord | `enrollmentId` | `enrollment_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Enrollment.id`；提交时必须 ACTIVE | `enr_01JABC123` | 服务端 | SENSITIVE | 正式业务关系，不得丢失 |
| ExerciseRecord | `classSectionId` | `class_section_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ClassSection.id` | `cls_01JABC123` | 服务端 | SENSITIVE | 教师数据范围的主要资源键 |
| ExerciseRecord | `courseId` | `course_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Course.id`；必须由 ClassSection 推导一致 | `crs_pe101` | 服务端 | INTERNAL | 快照式外键，不能用教学班 ID 填充 |
| ExerciseRecord | `teacherId` | `teacher_id` | string / varchar | 64 | 是 | 否 | — | — | 引用提交时责任 `TeacherProfile.id` | `tch_01JABC123` | 服务端 | SENSITIVE | 责任归属快照；权限仍按当前授权/教学班检查 |
| ExerciseRecord | `sessionId` | `session_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ExerciseSession.id`；一 session 最多一个正式 record | `ses_01JABC123` | 提交流程 | SENSITIVE | Session 与 Record 分离但可追溯 |
| ExerciseRecord | `businessDate` | `business_date` | date / date | 日精度 | 是 | 否 | 从 Session 复制 | 组织本地日期 | 必须等于 session.businessDate；提交后不可变 | `2026-08-02` | 服务端 | SENSITIVE | 与 enrollmentId 组成唯一键 `(enrollmentId,businessDate)`；V1 无释放槽位写路径 |
| ExerciseRecord | `creditType` | `credit_type` | enum / varchar | 32 | 是 | 否 | — | — | 稳定英文枚举；不得发送中文 label | `COURSE_RELATED` | 学生选择+服务端校验 | INTERNAL | 系统抵扣不伪装成学生运动 Record，迁移见第 7 节 |
| ExerciseRecord | `sportType` | `sport_type` | enum / varchar | 64 | 是 | 否 | — | — | 标准项目用稳定枚举；未知值 fail closed | `RUNNING` | 学生 | INTERNAL | 具体枚举阶段 7 冻结 |
| ExerciseRecord | `sportName` | `sport_name` | string / varchar | 100 | 条件必填 | 是 | `null` | — | `sportType=OTHER` 时必填；trim；1–100 | `飞盘` | 学生 | SENSITIVE | 标准项目名称由 i18n 派生，不重复存储 |
| ExerciseRecord | `description` | `description` | string / varchar | 200 | 条件必填 | 是 | `null` | — | `GENERAL` 时 trim 后 1–200；`COURSE_RELATED` 可为 null，非空仍为 1–200；服务端与数据库共同校验 | `晨跑 5 公里` | 学生 | SENSITIVE | ADR-103；不用 `note` 代替 |
| ExerciseRecord | `actualDurationSeconds` | `actual_duration_seconds` | integer / bigint | 64-bit | 是 | 否 | 从 Session 冻结 | 秒 | 必须等于服务端确认的 session actual duration | `5400` | 服务端 | SENSITIVE | 不信任客户端 hours |
| ExerciseRecord | `pausedDurationSeconds` | `paused_duration_seconds` | integer / bigint | 64-bit | 是 | 否 | 从 Session 冻结 | 秒 | 必须等于服务端确认的 session paused duration | `600` | 服务端 | SENSITIVE | 事实快照 |
| ExerciseRecord | `creditedDurationSeconds` | `credited_duration_seconds` | integer / bigint | 64-bit | 是 | 否 | 服务端计算 | 秒 | ADR-009：仅 `0/3600/7200`；保存提交时规则结果 | `3600` | 服务端规则引擎 | SENSITIVE | 审核改动写 ReviewRecord，不覆盖原值 |
| ExerciseRecord | `status` | `status` | enum / varchar | 32 | 是 | 否 | `DRAFT` | — | 阶段 3 ExerciseRecordStatus | `SUBMITTED` | 后端状态机 | SENSITIVE | 与 ReviewResult 分离 |
| ExerciseRecord | `submittedAt` | `submitted_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 成功 submit 动作时服务端写入；之后不可变 | `2026-08-02T02:05:00Z` | 服务端 | SENSITIVE | 不能用于推导 businessDate |
| ExerciseRecord | `cancelledAt` | `cancelled_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 进入 CANCELLED 时由服务端写入；其他状态必须为 null | `null` | 服务端状态机 | SENSITIVE | 取消不删除事实；具体允许取消窗口待状态机阶段冻结 |
| ExerciseRecord | `clientRequestId` | `client_request_id` | string / varchar | 64 | 是 | 否 | — | — | 同 student/action 唯一；字符白名单 | `android-3f4c...` | 客户端 | INTERNAL | 与 HTTP Idempotency-Key 共同防重复；保存期阶段 8 冻结 |
| ExerciseRecord | `currentReview` | —（派生） | object | — | 响应是 | 否 | — | — | 只由最高 reviewVersion 的 ReviewRecord 投影；精确包含 result、reasonCode、publicComment | `{"result":"INVALID","reasonCode":"INVALID_MEDIA","publicComment":"请重新确认凭证"}` | 后端 projection | SENSITIVE | 不落库；学生端不得复用完整 ReviewRecord |
| ExerciseRecord | `currentReview.result` | —（派生） | enum | 16 | 响应是 | 否 | `VALID` | — | `ReviewResult` | `INVALID` | 后端 projection | SENSITIVE | 新提交默认 VALID；旧 PENDING 与显式重开仍兼容；不覆盖 Review 历史 |
| ExerciseRecord | `currentReview.reasonCode` | —（派生） | enum | 64 | 响应是 | 是 | `null` | — | `ReviewReasonCode`；INVALID 必有，VALID/PENDING 可空 | `INVALID_MEDIA` | 后端 projection | SENSITIVE | 客户端业务分支只依赖 code，不匹配 reason 文本 |
| ExerciseRecord | `currentReview.publicComment` | —（派生） | string | 1000 | 响应是 | 是 | `null` | — | 最大 1000 | `请确保凭证清晰可见` | 后端 projection | SENSITIVE | 学生可见；不得包含 internalNote |

### 4.15 MediaEvidence（媒体凭证）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| MediaEvidence | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `med_01JABC123` | 服务端 | INTERNAL | 对外业务语境使用 `mediaId` |
| MediaEvidence | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 服务端 | INTERNAL | 对象存储隔离范围 |
| MediaEvidence | `ownerStudentId` | `owner_student_id` | string / varchar | 64 | 是 | 否 | 认证主体推导 | — | 引用 `StudentProfile.id` | `stu_01JABC123` | 认证服务 | HIGHLY_SENSITIVE | 教师只按教学班/记录授权读取 |
| MediaEvidence | `sessionId` | `session_id` | string / varchar | 64 | 条件必填 | 是 | `null` | — | EXERCISE_RECORD 必须引用本人 `ExerciseSession.id`；免测用途必须为 null | `ses_01JABC123` | 上传申请 | HIGHLY_SENSITIVE | 与 enrollmentId 二选一 |
| MediaEvidence | `enrollmentId` | `enrollment_id` | string / varchar | 64 | 条件必填 | 是 | `null` | — | EXEMPTION_APPLICATION 必须引用本人 ACTIVE Enrollment；运动用途必须为 null | `enr_01JABC123` | 上传申请 | HIGHLY_SENSITIVE | 与 sessionId 二选一 |
| MediaEvidence | `recordId` | `record_id` | string / varchar | 64 | 是 | 是 | `null` | — | 绑定后引用 `ExerciseRecord.id`；同组织/本人 | `rec_01JABC123` | 绑定动作 | HIGHLY_SENSITIVE | 上传与 Record 提交分离 |
| MediaEvidence | `businessPurpose` | `business_purpose` | enum / varchar | 32 | 是 | 否 | `EXERCISE_RECORD` | — | `EXERCISE_RECORD/EXEMPTION_APPLICATION`；用途决定且只决定一种目标外键 | `EXEMPTION_APPLICATION` | 上传申请 | HIGHLY_SENSITIVE | 不得跨用途重绑 |
| MediaEvidence | `mediaType` | `media_type` | enum / varchar | 16 | 是 | 否 | — | — | `IMAGE/VIDEO`；与 MIME/文件签名一致 | `IMAGE` | 上传申请+文件校验 | HIGHLY_SENSITIVE | 不保存中文值 |
| MediaEvidence | `mimeType` | `mime_type` | string / varchar | 127 | 是 | 否 | — | — | 图片按白名单；打卡视频记录设备/压缩产物声明并以服务端内容检测为准 | `image/jpeg` | 文件校验服务 | HIGHLY_SENSITIVE | 不信任文件扩展名；视频格式不是业务限制 |
| MediaEvidence | `fileSizeBytes` | `file_size_bytes` | integer / bigint | 64-bit | 是 | 否 | — | 字节 | `>0`；图片符合用途上限；打卡视频不设业务大小上限 | `2457600` | 对象存储确认 | HIGHLY_SENSITIVE | 统一旧 `size/byteCount`；仍用于传输完整性 |
| MediaEvidence | `storageKey` | `storage_key` | string / varchar | 512 | 是 | 否 | 服务端生成 | — | 全局唯一；路径净化；私有对象 | `evidence/2026/...` | 存储服务 | HIGHLY_SENSITIVE | **仅内部 service DTO；学生/教师公共 API 不返回** |
| MediaEvidence | `thumbnailStorageKey` | `thumbnail_storage_key` | string / varchar | 512 | 否 | 是 | `null` | — | 私有派生对象；仅视频/需要缩略图时存在 | `thumbnails/2026/...` | 媒体处理任务 | HIGHLY_SENSITIVE | 公共 API 只返回短期授权访问链接 |
| MediaEvidence | `captureSource` | `capture_source` | enum / varchar | 32 | 是 | 否 | — | — | EXERCISE_RECORD 只允许 `IN_APP_CAMERA`；EXEMPTION_APPLICATION 允许 `IN_APP_CAMERA/FILE_PICKER` | `FILE_PICKER` | 客户端声明+服务端能力校验 | HIGHLY_SENSITIVE | 不把声明本身当真实性证明 |
| MediaEvidence | `uploadStatus` | `upload_status` | enum / varchar | 32 | 是 | 否 | `PENDING_UPLOAD` | — | 阶段 3 MediaUploadStatus | `AVAILABLE` | 上传/处理状态机 | HIGHLY_SENSITIVE | 与绑定关系和删除状态分离时由状态机定义组合 |
| MediaEvidence | `uploadedAt` | `uploaded_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 对象存储确认成功后服务端写 | `2026-08-02T02:01:00Z` | 服务端确认 | HIGHLY_SENSITIVE | 客户端直传完成时间不直接采信 |
| MediaEvidence | `boundAt` | `bound_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 与 recordId 首次绑定时写入 | `2026-08-02T02:05:00Z` | Record 提交流程 | HIGHLY_SENSITIVE | 防止一个 media 跨学生/记录复用 |
| MediaEvidence | `declaredContentSha256` | `declared_content_sha256` | string / char | 64 | 否 | 是 | `null` | hex | 客户端可选声明；`^[a-f0-9]{64}$`；始终视为不可信 | `9f86d081...` | 客户端 | HIGHLY_SENSITIVE | 不得单独作为完整性、去重或审核事实 |
| MediaEvidence | `verifiedContentSha256` | `verified_content_sha256` | string / char | 64 | 否 | 是 | `null` | hex | 仅在服务端/对象存储内容验证成功后写入；`^[a-f0-9]{64}$` | `9f86d081...` | 文件校验服务 | HIGHLY_SENSITIVE | 唯一可作为内容完整性事实的 hash；不对学生暴露 |
| MediaEvidence | `durationSeconds` | `duration_seconds` | integer / bigint | 64-bit | 条件必填 | 是 | `null` | 秒 | VIDEO 必填且 `>0`；EXERCISE_RECORD VIDEO 真实累计录制时长 `<=15`；IMAGE 为 null | `15` | 媒体探测 | HIGHLY_SENSITIVE | 暂停时间不计入；服务端探测值最终裁决 |

### 4.16 ReviewRecord（审核记录）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ReviewRecord | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `rev_01JABC123` | 服务端 | INTERNAL | append-only 审核历史 ID |
| ReviewRecord | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 服务端 | INTERNAL | 从 Record/ClassSection 校验 |
| ReviewRecord | `recordId` | `record_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ExerciseRecord.id` | `rec_01JABC123` | 审核动作 | SENSITIVE | 同一 record 可有多条历史 |
| ReviewRecord | `teacherId` | `teacher_id` | string / varchar | 64 | 条件必填 | 是 | `null` | — | SYSTEM 创建的首条 VALID 或历史首条 PENDING 允许 null；教师产生后续 VALID/INVALID 时必填并引用负责该班的 `TeacherProfile.id` | `tch_01JABC123` | 认证/授权服务或系统提交事务 | SENSITIVE | 与 ClassSection/ExerciseRecord 的 `teacherId` 同义；管理员默认不得代行教师审核 |
| ReviewRecord | `reviewVersion` | `review_version` | integer / integer | 32-bit | 是 | 否 | 服务端递增 | 版本序号 | 同 record 从 1 连续递增且唯一 | `2` | 服务端 | INTERNAL | 稳定确定最新审核，不依赖时间并列；与 optimistic-lock `version` 分离 |
| ReviewRecord | `previousReviewId` | `previous_review_id` | string / varchar | 64 | 否 | 是 | `null` | — | 引用同一 record 的上一条 ReviewRecord；首版为 null | `rev_01JOLD123` | 服务端 | INTERNAL | 修改结果通过追加，不覆盖旧行 |
| ReviewRecord | `result` | `result` | enum / varchar | 16 | 是 | 否 | `PENDING` | — | `PENDING/VALID/INVALID`；阶段 3 冻结 | `VALID` | 教师/状态机 | SENSITIVE | 与 ExerciseRecord.status 分离 |
| ReviewRecord | `creditedDurationOverrideSeconds` | `credited_duration_override_seconds` | integer / bigint | 64-bit | 否 | 是 | `null` | 秒 | **ADR 待决**；未批准前必须为 null 且公共 API 不开放写；未来若批准仅接受非负整数秒和明确离散值 | `null` | 迁移暂存/获批后教师请求 | SENSITIVE | 当前 VALID/INVALID 只裁决是否计入，实际秒数来自 Record；不得把旧 1h/2h 调整伪装成已批准规则 |
| ReviewRecord | `reasonCode` | `reason_code` | enum / varchar | 64 | 条件必填 | 是 | `null` | — | INVALID 必填 `ReviewReasonCode`；VALID/PENDING 可空 | `INSUFFICIENT_EVIDENCE` | 教师 | SENSITIVE | 展示文案由 i18n 映射；客户端不匹配 reason 文本 |
| ReviewRecord | `reason` | `reason` | string / varchar | 500 | 条件必填 | 是 | `null` | — | 最大 500；`reasonCode=OTHER` 时必须 trim 后非空；重开时必填 | `视频无法证明运动过程` | 教师 | HIGHLY_SENSITIVE | 不替代 reasonCode |
| ReviewRecord | `publicComment` | `public_comment` | string / varchar | 1000 | 否 | 是 | `null` | — | 最大 1000；允许返回学生 | `请确保下次完整记录运动过程` | 教师 | SENSITIVE | 统一旧 teacherPublicFeedback/reviewComment 的学生可见部分 |
| ReviewRecord | `internalNote` | `internal_note` | string / varchar | 2000 | 否 | 是 | `null` | — | 最大 2000；仅授权教师 projection | `疑似重复场景，已人工核对` | 教师 | HIGHLY_SENSITIVE | ADR-038：学生 API 永不返回 |
| ReviewRecord | `reviewedAt` | `reviewed_at` | date-time / timestamp | 微秒精度 | 是 | 否 | 服务端当前时间 | UTC 时间点 | 审核动作提交时写入 | `2026-08-03T03:00:00Z` | 服务端 | SENSITIVE | 不接受客户端覆盖 |

### 4.17 ScoreRule（成绩规则）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ScoreRule | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `srule_01JABC123` | 服务端 | INTERNAL | 规则版本实体，不覆盖历史 |
| ScoreRule | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 服务端 | INTERNAL | 组织范围 |
| ScoreRule | `classSectionId` | `class_section_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ClassSection.id`；与 Course/Semester/Organization 一致 | `cls_01JABC123` | 规则管理 | INTERNAL | 阶段 1 冻结为教学班规则；不得把 null 偷换成未建模的组织模板 |
| ScoreRule | `ruleCode` | `rule_code` | string / varchar | 64 | 是 | 否 | — | — | 同组织唯一稳定代码 | `PE_CHECKIN_2026_V1` | 规则管理 | INTERNAL | 不用显示名称做关联 |
| ScoreRule | `ruleVersion` | `rule_version` | integer / integer | 32-bit | 是 | 否 | 服务端递增 | 版本序号 | 同 ruleCode `>=1` 且唯一 | `1` | 服务端 | INTERNAL | 与 optimistic-lock `version` 分离 |
| ScoreRule | `displayName` | `display_name` | string / varchar | 200 | 是 | 否 | — | — | trim；1–200 | `2026 体育打卡规则` | 规则管理 | PUBLIC | 仅展示 |
| ScoreRule | `totalRequiredSeconds` | `total_required_seconds` | integer / bigint | 64-bit | 是 | 否 | `72000` | 秒 | 必须为 `72000`（20h，ADR-061）；未来改变需新业务决策和规则版本 | `72000` | 已确认业务决策 | INTERNAL | 客户端不得硬编码为最终裁决，但可展示服务端返回值 |
| ScoreRule | `courseRequiredSeconds` | `course_required_seconds` | integer / bigint | 64-bit | 否 | 是 | `null` | 秒 | 非空时 `>=0`；与 general 的合计/最低关系受 ADR-062 | `null` | 待确认业务决策 | INTERNAL | 统一旧 courseRequired/courseTarget；未决前不激活分类值 |
| ScoreRule | `generalRequiredSeconds` | `general_required_seconds` | integer / bigint | 64-bit | 否 | 是 | `null` | 秒 | 非空时 `>=0`；与 course 的合计/最低关系受 ADR-062 | `null` | 待确认业务决策 | INTERNAL | 统一旧 generalRequired/otherTarget；未决前不激活分类值 |
| ScoreRule | `calculationDefinition` | `calculation_definition` | object / json | 建议 ≤32 KiB | 是 | 是 | `null`（ADR-018 前） | — | 必须匹配经批准的版本化 JSON Schema | `null` | 业务决策/规则管理 | INTERNAL | 未确认公式不得自行填充 |
| ScoreRule | `roundingMode` | `rounding_mode` | enum / varchar | 32 | 是 | 是 | `null`（ADR-018 前） | — | 阶段 4/7 冻结 | `HALF_UP` | 业务决策 | INTERNAL | 最终成绩禁止各客户端自行舍入 |
| ScoreRule | `status` | `status` | enum / varchar | 16 | 是 | 否 | `DRAFT` | — | 阶段 3 ScoreRuleStatus | `ACTIVE` | 规则状态机 | INTERNAL | 发布后内容不可原地改，必须新版本 |
| ScoreRule | `effectiveFrom` | `effective_from` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | ACTIVE 时按规则必填 | `2026-02-23T00:00:00+08:00` | 规则管理 | INTERNAL | 历史重算策略待 ADR-018 |
| ScoreRule | `effectiveTo` | `effective_to` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | `> effectiveFrom` | `2026-08-01T00:00:00+08:00` | 规则管理 | INTERNAL | 空表示尚未结束，不表示永久承诺 |
| ScoreRule | `publishedAt` | `published_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 进入已发布/生效状态时由服务端写入；草稿必须为 null | `2026-02-20T04:00:00Z` | 规则发布动作 | INTERNAL | 发布后内容不可原地修改，只能新建 ruleVersion |

### 4.18 StudentScore（学生成绩）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| StudentScore | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `score_01JABC123` | 服务端 | INTERNAL | 每 Enrollment/规则版本的计算结果 |
| StudentScore | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 服务端 | INTERNAL | 范围校验 |
| StudentScore | `enrollmentId` | `enrollment_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Enrollment.id`；同规则版本唯一 | `enr_01JABC123` | Enrollment | SENSITIVE | 成绩不直接挂在 User 或姓名上 |
| StudentScore | `scoreRuleId` | `score_rule_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ScoreRule.id` | `srule_01JABC123` | 计算任务 | SENSITIVE | 可追溯规则实体 |
| StudentScore | `calculationRevision` | `calculation_revision` | integer / bigint | 64-bit | 是 | 否 | `0` | 修订号 | 每次重算递增；`>=0` | `12` | 计算任务 | INTERNAL | 关联计算来源批次/审计 |
| StudentScore | `validCourseDurationSeconds` | `valid_course_duration_seconds` | integer / bigint | 64-bit | 是 | 否 | `0` | 秒 | `>=0`；由当前修订的 COURSE_RELATED 贡献聚合 | `28800` | 后端聚合 | SENSITIVE | 统一旧 courseHours/rawCourse |
| StudentScore | `validGeneralDurationSeconds` | `valid_general_duration_seconds` | integer / bigint | 64-bit | 是 | 否 | `0` | 秒 | `>=0`；由当前修订的 GENERAL 贡献聚合 | `28800` | 后端聚合 | SENSITIVE | 统一旧 otherHours/generalHours/rawGeneral |
| StudentScore | `totalValidDurationSeconds` | `total_valid_duration_seconds` | integer / bigint | 64-bit | 是 | 否 | `0` | 秒 | 由分类值及规则封顶统一计算；不得由客户端上传 | `57600` | 后端聚合 | SENSITIVE | 客户端只展示，不自行成为事实 |
| StudentScore | `baseScore` | `base_score` | decimal / decimal | 6,2 | 是 | 是 | `null` | 分 | 公式未配置时 null；由 ScoreRule 计算且符合其范围/精度 | `84.00` | 后端规则引擎 | SENSITIVE | 调整前计算分；不用 0 表示未计算 |
| StudentScore | `adjustmentTotal` | `adjustment_total` | decimal / decimal | 6,2 | 是 | 否 | `0.00` | 分 | 等于当前有效 ScoreAdjustment 的 delta 合计 | `2.00` | 后端聚合 | SENSITIVE | 不接受客户端直接覆盖 |
| StudentScore | `finalScore` | `final_score` | decimal / decimal | 6,2 | 是 | 是 | `null` | 分 | baseScore 非空时由规则和有效调整计算；符合 ScoreRule 范围/精度 | `86.00` | 后端规则引擎 | SENSITIVE | 对外最终分；与 null（未计算）严格区分 |
| StudentScore | `status` | `status` | enum / varchar | 32 | 是 | 否 | `NOT_CALCULATED` | — | 阶段 3 ScoreStatus | `CALCULATED` | 成绩状态机 | SENSITIVE | 调整/发布/锁定不压进 boolean |
| StudentScore | `calculatedAt` | `calculated_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | 成功计算后写入 | `2026-08-03T04:00:00Z` | 计算任务 | SENSITIVE | 非客户端时间 |
| StudentScore | `publishedAt` | `published_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | PUBLISHED/LOCKED 按状态机要求存在 | `2026-08-10T04:00:00Z` | 成绩发布动作 | SENSITIVE | 统一旧 `published: boolean`；是否已发布从状态派生 |
| StudentScore | `lockedAt` | `locked_at` | date-time / timestamp | 微秒精度 | 否 | 是 | `null` | UTC 时间点 | LOCKED 状态必填；只由获批锁定动作写入 | `2026-08-15T04:00:00Z` | 成绩锁定动作 | SENSITIVE | 解锁/归档职责受 ADR-026 |
| StudentScore | `sourceFingerprint` | `source_fingerprint` | string / char | 64 | 是 | 否 | — | hex | `^[a-f0-9]{64}$`；覆盖 record/review/rule/adjustment 有序输入 | `9f86d081...` | 计算任务 | INTERNAL | 支持幂等重算、差异检测和审计 |

### 4.19 ScoreContribution（成绩贡献快照）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ScoreContribution | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `scon_01JABC123` | 计算任务 | INTERNAL | append-only；某次成绩修订的一条可解释来源 |
| ScoreContribution | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id`；必须与所有关联对象一致 | `org_bnbu` | 计算任务 | INTERNAL | 组织范围 |
| ScoreContribution | `studentScoreId` | `student_score_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `StudentScore.id` | `score_01JABC123` | 计算任务 | SENSITIVE | 不按姓名或学号定位成绩 |
| ScoreContribution | `calculationRevision` | `calculation_revision` | integer / bigint | 64-bit | 是 | 否 | — | 修订号 | `>=0`；必须等于生成本快照时 StudentScore.calculationRevision | `12` | 计算任务 | INTERNAL | 同一 StudentScore 可保留多次修订的贡献历史 |
| ScoreContribution | `recordId` | `record_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ExerciseRecord.id`；记录需属于同一 Enrollment | `rec_01JABC123` | 计算任务 | SENSITIVE | 非运动来源的抵扣不得伪造 record；应进入获批调整/专用来源对象 |
| ScoreContribution | `reviewId` | `review_id` | string / varchar | 64 | 是 | 否 | — | — | 引用该 record 在本修订采用的最新 `ReviewRecord.id`；结果必须 VALID | `rev_01JABC123` | 计算任务 | SENSITIVE | 冻结“当时采用哪次审核”，后续改审产生新修订 |
| ScoreContribution | `scoreRuleId` | `score_rule_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `ScoreRule.id`；必须与 StudentScore.scoreRuleId 一致 | `srule_01JABC123` | 计算任务 | INTERNAL | 规则发布后不可原地改 |
| ScoreContribution | `creditType` | `credit_type` | enum / varchar | 32 | 是 | 否 | — | — | 与关联 ExerciseRecord.creditType 一致 | `COURSE_RELATED` | 计算任务 | INTERNAL | 用于分类聚合，不信任客户端重复提交 |
| ScoreContribution | `creditedDurationSeconds` | `credited_duration_seconds` | integer / bigint | 64-bit | 是 | 否 | `0` | 秒 | 非负整数；由最新 VALID Review 的 override 或 Record 快照按规则确定 | `3600` | 计算任务 | SENSITIVE | 事实时长统一整数秒；不保存小时/分钟 |
| ScoreContribution | `createdAt` | `created_at` | date-time / timestamp | 微秒精度 | 响应是 | 否 | 服务端当前时间 | UTC 时间点 | RFC 3339；不可由调用方覆盖 | `2026-08-03T04:00:00Z` | 计算任务 | INTERNAL | append-only 创建时间 |

逻辑唯一约束：`(student_score_id, calculation_revision, record_id)` 唯一；同一成绩修订不得重复计入同一 Record。任何来源、审核或规则变化都必须产生新的 `calculationRevision` 与一组新贡献，禁止覆盖旧贡献。

### 4.20 ScoreAdjustment（人工成绩调整）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ScoreAdjustment | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `sadj_01JABC123` | 服务端 | INTERNAL | append-only 调整事实 |
| ScoreAdjustment | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 服务端 | INTERNAL | 范围校验 |
| ScoreAdjustment | `studentScoreId` | `student_score_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `StudentScore.id` | `score_01JABC123` | 调整动作 | SENSITIVE | 不按学生姓名定位成绩 |
| ScoreAdjustment | `studentId` | `student_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `StudentProfile.id`；与 Score 一致 | `stu_01JABC123` | StudentScore 快照 | SENSITIVE | 便于审计/权限查询，必须校验一致 |
| ScoreAdjustment | `enrollmentId` | `enrollment_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Enrollment.id`；与 Score 一致 | `enr_01JABC123` | StudentScore 快照 | SENSITIVE | 不跨教学班迁移调整 |
| ScoreAdjustment | `previousScore` | `previous_score` | decimal / decimal | 6,2 | 是 | 是 | `null` | 分 | 必须等于调整前 StudentScore 值 | `84.00` | 服务端快照 | SENSITIVE | null 表示原先未计算 |
| ScoreAdjustment | `adjustedScore` | `adjusted_score` | decimal / decimal | 6,2 | 是 | 否 | — | 分 | 符合 ScoreRule 允许范围/精度 | `86.00` | 有权教师请求+后端校验 | SENSITIVE | 不用 delta 作为唯一事实 |
| ScoreAdjustment | `reasonCode` | `reason_code` | enum / varchar | 64 | 是 | 否 | — | — | 稳定英文码 | `DATA_CORRECTION` | 发起角色 | SENSITIVE | 阶段 7 冻结 |
| ScoreAdjustment | `reason` | `reason` | string / varchar | 1000 | 是 | 否 | — | — | trim；1–1000 | `补录经核验的校队成绩` | 发起角色 | HIGHLY_SENSITIVE | 不得为空或只写“调整” |
| ScoreAdjustment | `adjustedBy` | `adjusted_by` | string / varchar | 64 | 是 | 否 | 认证主体 | — | 引用 `User.id`；必须通过资源权限校验 | `usr_01JTCH123` | 认证服务 | SENSITIVE | 归档成绩职责受 ADR-026 约束 |
| ScoreAdjustment | `adjustedAt` | `adjusted_at` | date-time / timestamp | 微秒精度 | 是 | 否 | 服务端当前时间 | UTC 时间点 | 不接受客户端覆盖 | `2026-08-03T05:00:00Z` | 服务端 | SENSITIVE | 与 createdAt 可同值，但语义明确 |
| ScoreAdjustment | `requestId` | `request_id` | string / varchar | 128 | 是 | 否 | 当前请求 | — | 与请求上下文一致 | `req_01JABC123` | HTTP 中间件 | INTERNAL | 关联 AuditLog |

### 4.21 AuditLog（操作日志）

| 领域对象 | API 字段 | 数据库字段 | 类型 | 长度/精度 | 必填 | 可为空 | 默认值 | 单位 | 校验规则 | 示例 | 数据来源 | 隐私级别 | 备注 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AuditLog | `id` | `id` | string / varchar | 64 | 是 | 否 | 服务端生成 | — | opaque；唯一 | `aud_01JABC123` | 服务端 | INTERNAL | append-only；普通业务 API 不可修改 |
| AuditLog | `organizationId` | `organization_id` | string / varchar | 64 | 是 | 否 | — | — | 引用 `Organization.id` | `org_bnbu` | 请求上下文/资源 | INTERNAL | 系统级动作也需显式组织或平台范围策略 |
| AuditLog | `actorUserId` | `actor_user_id` | string / varchar | 64 | 是 | 是 | `null`（系统任务） | — | 非空时引用 `User.id` | `usr_01JTCH123` | 认证上下文 | HIGHLY_SENSITIVE | 不用 actorName 作为身份事实 |
| AuditLog | `actorRoleSnapshot` | `actor_role_snapshot` | enum / varchar | 16 | 是 | 是 | `null`（系统任务） | — | 写入动作发生时角色快照 | `TEACHER` | 认证上下文 | SENSITIVE | 后续角色变化不改历史 |
| AuditLog | `permissionId` | `permission_id` | string / varchar | 128 | 是 | 否 | — | — | 必须等于执行该 operation 的 `x-access-policy.policyId` 或已登记后台权限 | `REVIEW-CREATE` | 权限守卫 | INTERNAL | 审计必须可追到具体策略；未知策略 fail closed |
| AuditLog | `actionType` | `action_type` | enum / varchar | 64 | 是 | 否 | — | — | `AuditActionType`；稳定 UPPER_SNAKE_CASE | `REVIEW_RESULT_CHANGED` | 业务服务 | INTERNAL | 禁止任意中文 action 字符串 |
| AuditLog | `targetType` | `target_type` | enum / varchar | 64 | 是 | 否 | — | — | 统一领域对象类型白名单 | `EXERCISE_RECORD` | 业务服务 | INTERNAL | 不是数据库表名；与 targetId 共同定位逻辑目标 |
| AuditLog | `targetId` | `target_id` | string / varchar | 64 | 是 | 是 | `null` | — | 有目标资源时必须为 opaque ID | `rec_01JABC123` | 业务服务 | SENSITIVE | 删除后仍保留引用文本值 |
| AuditLog | `requestId` | `request_id` | string / varchar | 128 | 是 | 否 | — | — | 与响应 requestId 一致 | `req_01JABC123` | HTTP 中间件 | INTERNAL | 后台任务使用 job execution ID |
| AuditLog | `idempotencyKeyReference` | `idempotency_key_reference` | string / varchar | 128 | 是 | 是 | `null` | — | 内部安全引用或不可逆摘要；不得保存/回显原始 Idempotency-Key | `idemref_01JABC123` | 幂等服务 | INTERNAL | 读取日志不能用于重放命令 |
| AuditLog | `outcome` | `outcome` | enum / varchar | 32 | 是 | 否 | — | — | 稳定 AuditOutcome；至少区分 SUCCEEDED/REJECTED/FAILED，阶段 3/7 冻结 | `SUCCEEDED` | 业务服务/异常边界 | INTERNAL | 审计拒绝/失败，不把 HTTP status 当唯一事实 |
| AuditLog | `reasonCode` | `reason_code` | enum / varchar | 64 | 否 | 是 | `null` | — | REJECTED/FAILED 按动作 schema 条件必填；稳定英文码 | `FORBIDDEN_CLASS_SCOPE` | 业务服务 | INTERNAL | 文案由 i18n 映射；不得保存异常堆栈 |
| AuditLog | `safeMetadata` | `safe_metadata` | object / jsonb | 建议 ≤32 KiB | 是 | 否 | `{}` | — | 按 actionType 的白名单 schema；不得含 token、验证码、密码、完整学号/联系方式、storageKey、签名 URL、媒体正文或 internalNote 正文 | `{"previousStatus":"SUBMITTED"}` | 审计映射器 | HIGHLY_SENSITIVE | 不使用泛化 JSON 绕过正式字段建模 |
| AuditLog | `sourceIpHash` | `source_ip_hash` | string / char | 64 | 是 | 是 | `null` | hex | 经独立环境 pepper 的不可逆摘要；不存原始 IP | `9f86d081...` | 可信代理边界 | HIGHLY_SENSITIVE | 仅用于安全关联，不用于授权 |
| AuditLog | `deviceFingerprintHash` | `device_fingerprint_hash` | string / char | 64 | 是 | 是 | `null` | hex | 经规范化和环境 pepper 的不可逆摘要；不存原始指纹 | `2c26b46b...` | 认证/设备上下文 | HIGHLY_SENSITIVE | 不得作为单一身份事实 |
| AuditLog | `occurredAt` | `occurred_at` | date-time / timestamptz | 微秒精度 | 是 | 否 | 服务端当前时间 | UTC 时间点 | 不接受调用方覆盖 | `2026-08-03T05:00:00Z` | 服务端 | SENSITIVE | 统一旧 `createdAt` 的审计语义 |

## 5. 重点字段与跨对象不变量

### 5.1 身份字段

| 字段 | 唯一含义 | 写入者 | 禁止用法 |
|---|---|---|---|
| `User.id` | 登录/认证主体 | 认证服务 | 作为学号展示；直接代表 Enrollment |
| `StudentProfile.id` | 学生档案内部 ID | 用户/学生模块 | 填入 `studentNumber`；让学生手工指定 |
| `studentNumber` | 组织范围内学校学号 | 官方名单、经后端核验的学生资料流程 | 作主键/外键/token subject；用姓名替代 |
| `Enrollment.id` | 学生与具体教学班的关系 | 直接入班/名单/手工入班服务 | 与 OfficialRosterEntry 合并；从 student+course 在客户端拼接 |
| `TeacherProfile.id` | 教师档案内部 ID | 用户/教师模块 | 仅凭教师姓名判断审核权限 |

强制约束：

- `StudentProfile(organization_id, student_number)` 唯一。
- `StudentProfile.user_id` 唯一；`TeacherProfile.user_id` 唯一；`AdminProfile.user_id` 唯一。
- 角色与 Profile 的一致性由后端校验；客户端不得仅根据 account 正则猜角色。
- 旧 `id/studentId/number/account` 在没有来源对象和数据样本时不得批量猜测。迁移必须生成歧义报告并人工解决。

### 5.2 课程、教学班和入班字段

| 字段 | 唯一含义 | 关键约束 |
|---|---|---|
| `courseId` | `Course.id`，跨学期课程定义 | 不再指具体 Section |
| `classSectionId` | `ClassSection.id`，某课程在某学期的具体教学班 | 教师资源范围、名单、入班、打卡的主要边界 |
| `semesterId` | `Semester.id` | 不能用格式化 semester 字符串做外键 |
| `teacherId` | 责任教师 Profile ID | ClassSection、ExerciseRecord、ReviewRecord 统一引用 `TeacherProfile.id`；不是姓名、User.id 或工号 |
| `enrollmentId` | `Enrollment.id` | 正式 Record/Score 必填，不能在客户端丢失 |
| `Enrollment.source` | 入班事实来源 | 仅 `OFFICIAL_IMPORT/QR_CODE/MANUAL/SYSTEM_SYNC` |
| `Enrollment.status` | 入班生命周期 | 名单对齐结果、审核结果不得写入 |

数据库最终实施时至少需要以下逻辑唯一约束；物理索引语法留到阶段 10：

- `Course(organization_id, course_code)` 唯一。
- `ClassSection(semester_id, course_id, class_code)` 唯一；不同课程允许相同 `classCode`。
- `ClassSectionExcludedDate(class_section_id, excluded_date)` 唯一；同时以复合外键保证与 ClassSection 同组织。
- `Enrollment(student_id, class_section_id)` 唯一。
- `OfficialRosterEntry(roster_import_id, source_row_number)` 唯一；不得对 `(roster_import_id, student_number)` 建唯一约束，否则无法保留并报告重复原始行。
- 同一学生/学期最多一个 ACTIVE Enrollment 的并发实现方式需结合目标数据库选择；不能只靠客户端检查。

### 5.3 时长字段

| 字段 | 定义 | 是否事实 | 允许值/来源 |
|---|---|---|---|
| `actualDurationSeconds` | 排除暂停后的实际有效运动时长 | 是 | 服务端根据 Session 区间重算，非负整数秒 |
| `pausedDurationSeconds` | 会话内暂停区间合计 | 是 | 服务端重算，非负整数秒 |
| `creditedDurationSeconds` | Record 提交时按当时规则折算的学时快照 | 是 | ADR-009 当前为 0/3600/7200 |
| `creditedDurationOverrideSeconds` | 候选的 Review 计入时长覆盖 | ADR 待决 | 未批准前固定 null、公共 API 不开放写；旧值仅进入迁移暂存/核对 |
| `totalValidDurationSeconds` | 对最新审核为 VALID 的贡献求和后的结果 | 派生/持久化计算结果 | 后端聚合，保留规则和来源指纹 |
| `durationMinutes/hours` | 旧字段或展示值 | 否 | 兼容读取后转换；新写入禁止 |

换算规则：

- 整数旧分钟：`seconds = minutes × 60`。
- 旧小时只允许精确换算：`seconds = hours × 3600`，结果必须为整数且在字段允许范围；否则进入迁移异常表，不得四舍五入后静默入库。
- 旧 `Double durationSeconds` 只有为有限、非负整数值时可直接迁移；含小数时保留原始值并进入人工/规则确认。
- `creditedDurationSeconds` 永远不能由格式化文本如 `"2h"`、`"课程相关时长抵扣 2 小时"` 直接解析后自动入账。

### 5.4 媒体字段

- `mediaId` 是客户端绑定凭证的唯一业务标识；公开 API 不接受 `storageKey`、长期 URL 或本地文件名代替。
- `storageKey`、`thumbnailStorageKey` 只存在于存储服务内部 DTO/数据库，学生/教师 API 通过短期授权访问 endpoint 获取内容。
- `mediaType`、`mimeType`、文件签名必须相互一致；扩展名仅用于提示。
- `fileSizeBytes` 使用字节整数；所有数量限制和请求总大小由后端执行。
- `captureSource` 与 `businessPurpose` 必须组合校验。ADR-030 未确认前，不把打卡、免测、反馈的来源规则合并。

### 5.5 审核与成绩字段

- `ExerciseRecord.status` 表示记录流程；`ReviewRecord.result` 表示审核结论；`StudentScore.status` 表示计算/调整/发布/锁定。三个字段禁止共用一个 `status`。
- Review 修改只追加新 `ReviewRecord`，通过 `reviewVersion`/前序记录确定顺序，不更新旧行。
- `StudentScore` 是可重算结果，不是原始事实；必须能通过 `ScoreContribution` 追溯到 ExerciseRecord、最新 ReviewRecord 与 ScoreRule。
- `ScoreContribution(studentScoreId, calculationRevision, recordId)` 唯一且 append-only；改审或改规则只能生成新修订，不覆盖旧贡献。
- `teacherInternalNote` 迁移为 `ReviewRecord.internalNote`，仅教师授权 projection 可读；学生 API 永不返回。
- 旧 `published: boolean` 只作为 ScoreStatus 的兼容 projection，不作为独立可写事实。

## 6. 兼容迁移阶段定义

本阶段不执行下列迁移，只冻结实施顺序和每个旧字段的去向。

| 阶段 | 名称 | 行为 | 删除旧字段 |
|---|---|---|---|
| `F0` | 盘点 | 读取真实 schema、样本、调用遥测；确认旧字段语义 | 否 |
| `F1` | 新增 | 增加新字段/新资源和兼容 adapter；旧客户端继续可用 | 否 |
| `F2` | 双读/受控双写 | 服务端以新模型为唯一事实，旧响应由 projection 生成；必要时短期双写并校验一致性 | 否 |
| `F3` | 回填与核对 | 批量转换、产生异常报告、逐对象计数/哈希核对和业务抽样 | 否 |
| `F4` | 客户端切换 | Android、iOS、Web 各版本改读新字段；记录旧字段访问遥测 | 否 |
| `F5` | 废弃 | OpenAPI 标 deprecated；停止旧写入；满足兼容窗口和调用归零 | 否 |
| `F6` | 移除 | 单独破坏性 migration/主版本移除，具备备份、回滚与审批 | 是 |
| `保留` | 历史/内部 | 字段不进入公共新 API，但作为合法内部事实或审计快照长期存在 | 否 |
| `待模型` | 阻塞 | 现有数据不属于本阶段核心对象；先新增获批领域对象/ADR | 否 |

## 7. 旧字段迁移映射

### 7.1 身份、账户和 Profile

| 旧字段 | 所在位置 | 旧含义 | 新字段 | 兼容策略 | 移除阶段 |
|---|---|---|---|---|---|
| `UserDto.id` | Android `StudentApiResponses.kt` | 登录响应中的字符串 ID，当前可能兼具 user/student 语义 | `User.id` + 显式 `StudentProfile.id` | F0 用真实响应/schema 判定；新登录响应分别返回 User/Profile，不复制同值 | F6 |
| `StudentProfile.id`、`studentId` | Android model/DTO；Web teacher types | 学生内部 ID；Web 为 number | `StudentProfile.id`，跨对象引用名 `studentId` | 全部转 opaque string；number 先通过映射表换新 ID，禁止 stringify 后当正式映射 | F6 |
| `studentNumber`、`student_number` | Android DTO/domain；Web roster | 学校学号 | `StudentProfile.studentNumber` / `OfficialRosterEntry.studentNumber` | 保留值和前导零；按对象范围落位 | 保留（标准名） |
| `number` | Web `teacher-workspace.tsx` Student | 学号 | `StudentProfile.studentNumber` | F1 旧响应保留 `number` alias；新写只收 studentNumber | F6 |
| `account`（学生） | Android password login；Web AdminUser | 登录名，常被当作学号 | `StudentProfile.studentNumber` 仅在证据确认时；认证主体用 `User.id` | F0 分角色/数据样本判定，歧义行人工核对 | F6 |
| `RecoveryRequestBody.studentId` | Android `RecoveryRequestScreen.kt` | UI 标签实际为学号 | 请求 `studentNumber`；服务端匹配后内部保存 `StudentProfile.id` | F1 同时接受旧名但按学号校验，响应警告 deprecated | F5/F6 |
| `name`、`studentName` | Android/Web 多处 | 学生/教师/管理员姓名 | 对应 Profile.`fullName` | 按对象上下文映射；禁止仅凭姓名关联 | F5/F6 |
| `college` | Android StudentProfile；Web AdminUser | 学院名称 | `collegeName` | 兼容 projection 输出旧名；新写使用标准名 | F6 |
| `major` | Web roster | 专业名称 | `majorName` | trim；无法标准化时保留名单快照原值 | F6 |
| `className`、`administrativeClass` | Android profile；Web roster | 行政班名称 | `administrativeClassName` | 不映射到 ClassSection；新旧双读 | F6 |
| `grade` | CourseJoin/roster | 年级自由文本 | `gradeYear` | ADR-050：只接受可验证四位 cohort 年或批准映射；原文本保留 source snapshot | F6 |
| `gradeLevel` | Android/AdminUser | freshman/sophomore 等当前年级组 | 由 `gradeYear + Semester` 派生 | F1 可继续响应；停止作为长期事实写入 | F5/F6 |
| `admissionYear` | Android/AdminUser | 入学年份 | `StudentProfile.gradeYear` | ADR-050：数值范围与来源核验后回填；若与已有 gradeYear 冲突则隔离核对，不静默覆盖 | F5 |
| `gender` 中文值 `男/女/其他`、小写 `male/female` | Android/Web | 性别 | `StudentProfile.gender` 等统一 Gender enum | adapter 映射到 UPPER_SNAKE_CASE；未知值不默认 | F5/F6 |
| `accountStatus`、`account_status` | Android | 联系方式绑定/账户可用状态 | `User.status` 或后续独立 ContactBinding 状态 | 阶段 3 前不自动压入 ACTIVE；旧值映射表 fail closed | F5/F6 |
| `email` 明文 | Android/Web | 登录/联系信息 | `User.primaryEmail` | 小写规范化、验证状态和唯一性核对；普通响应仅 masked；手机号不再进入认证适配 | F5/F6 |
| `tokenVersion` | Web AdminUser | 会话撤销版本 | `User.tokenVersion` | 后端认证实现存在时迁移；Mock 值不能作为生产数据 | 保留（内部标准名） |
| `assignedCourseCount` | Web AdminUser | UI 汇总 | 派生字段，不落 User/Profile | 从 ClassSection 责任关系聚合 | F5 |

### 7.2 课程、学期和入班

| 旧字段 | 所在位置 | 旧含义 | 新字段 | 兼容策略 | 移除阶段 |
|---|---|---|---|---|---|
| `Course.id`、Web `Course.id:number` | Android/Web | Course 与具体教学班混合 ID | `ClassSection.id`；另建 `Course.id` | F0 按 code/section/semester 拆分；旧 ID 映射表长期保留 | F6 |
| Record/roster `courseId` | Android/Web | 多数实际指具体教学班 | `classSectionId`；`courseId` 由 ClassSection 明确派生 | 逐接口判定；禁止机械同名拷贝 | F6 |
| `code`、`courseCode` | Android/Web | 课程代码 | `Course.courseCode` | 规范化大写；组织内去重 | F5/F6 |
| `section`、`teachingClassCode` | Android/Web roster | 班号/教学班代码 | `ClassSection.classCode` | 与 Course code/semester 组合核对后回填 | F5/F6 |
| `name`、`courseName` | Android/Web | 课程名，有时夹带 Section | `Course.courseName`；`ClassSection.displayName` | 拆分失败行进入人工核对；新 API 只输出 courseName | F6 |
| `semester` | Android/Web | 格式化学期文本 | `Semester.displayName` + `semesterId` | 不再作关联键；根据 academicYear/term/date 映射 | F5/F6 |
| `academicYear` | Android/Web | 学年文本 | `Semester.academicYear` | 规范化为 `YYYY-YYYY` | F5 |
| `term` | Android/Web | 中文或英文 term | `Semester.termCode` | 映射到 UPPER_SNAKE_CASE；未知值阻塞 | F5/F6 |
| `status=ACTIVE/ENDED`、`active/open/enabled/closed` | Android/Web Course | Course/Semester/ClassSection 混合状态 | 各对象独立 `status` | 必须依据旧对象上下文映射，未知值 fail closed | F6 |
| `isCurrent` | Android Course | 当前学期标记 | `Semester.status == CURRENT` 派生 | 停止存储；兼容响应可派生 | F5 |
| `teacherId`、`teacherName` | Android course/summary | 责任教师 ID/显示名 | `ClassSection.teacherId`；姓名由 TeacherProfile projection | F0 核对旧 ID 是 User 还是 Profile；不保存姓名外键 | F5/F6 |
| `enrollmentStatus` | Android Course | 入班关系状态 | `Enrollment.status` | `enrolled -> ACTIVE` 仅经数据核对；未知值阻塞 | F5/F6 |
| `CourseJoinMembershipResponse.id` | Android | 直接入班 membership ID | `Enrollment.id` | 接入新响应后必须持久化，不再丢弃 | 保留（语义改名） |
| membership `courseId` | Android join | 实际教学班 ID | `Enrollment.classSectionId` | adapter 改名并验证响应教学班一致 | F6 |
| membership `studentId` | Android join | 学生内部 ID | `Enrollment.studentId` | 与响应 StudentProfile.id 一致性校验 | 保留（标准名） |
| `joinMethod=qr/manual_import/IMPORT` | Android/Web roster | 入班来源 | `Enrollment.source` | `qr -> QR_CODE`; `manual_import` 需按真实来源拆 `MANUAL/OFFICIAL_IMPORT` | F5/F6 |
| `joinedAt` | Android/Web | 加入时间 | `Enrollment.joinedAt` | 解析为带时区时间；无时区旧值按已知组织时区并标记迁移来源 | 保留（标准名） |
| `removed/exited/disabled/completed/withdrawn` | Android/Web | 混合 inactive membership 值 | `Enrollment.status` + `statusReason/endedAt` | 阶段 3 给出逐值映射；`completed` 不得自动等同 removed | F6 |
| `courseTarget`、`otherTarget` | Web Course | 两类目标小时 | ScoreRule 的课程/其他目标秒字段 | ×3600 严格转换；ADR-062 未决前仅迁移暂存/核对，不激活分类规则 | F5/F6 |
| `total/courseRequired/generalRequired/dailyLimit` | Android SportHourRule DTO | 学时规则，单位小时 | ScoreRule 对应 `*DurationSeconds`；每日限制进入业务规则 | 严格 ×3600；`dailyLimit` 不混入成绩字段 | F5/F6 |
| `deadline`、`semesterDeadline` | Android/Web | 显示截止或提交截止 | `ClassSection.submissionDeadlineAt` | 无时区值先按组织时区解释并标来源；与 endDate 分离 | F5/F6 |
| `dateRangeStart/dateRangeEnd` | Android/Web CheckinWindow | 允许开始运动的本地日期范围 | `ClassSection.checkInStartDate/checkInEndDate` | 日期原样校验；不转换为 UTC 午夜 | F5 |
| `dailyStartTime/dailyEndTime` | Android/Web CheckinWindow | 每日本地开放时段 | 同名标准字段 | 规范为 `HH:mm:ss`；绑定 Organization.timezone | 保留（规范化） |
| `excludedDates` | Android/Web CheckinWindow | 排除日期数组 | `ClassSection.excludedDates` | 规范为去重升序 `YYYY-MM-DD` 数组并校验范围；不使用逗号字符串 | 保留（规范化） |

### 7.3 官方名单与对齐

| 旧字段 | 所在位置 | 旧含义 | 新字段 | 兼容策略 | 移除阶段 |
|---|---|---|---|---|---|
| `OfficialRosterVersion.id` | Web roster types | 名单版本 ID | `OfficialRosterImport.id` | 旧 version 资源 adapter 指向 Import | F5/F6 |
| `versionNumber` | Web roster | 名单业务版本 | `OfficialRosterImport.versionNumber` | 保留；不要与 optimistic `version` 合并 | 保留（标准名） |
| `fileName` | Web roster | 导入文件名 | `OfficialRosterImport.fileName` | 净化 basename；不作 storage key | 保留（标准名） |
| `importedBy` 姓名 | Web roster | 导入人显示名 | `OfficialRosterImport.importedBy`（User.id） | 通过账号/审计映射；姓名仅 projection；无法匹配则异常 | F6 |
| `totalRows/validRows/invalidRows` | Web roster | 行数 | `totalRowCount/validRowCount/invalidRowCount` | F1 alias；数值约束核对 | F5 |
| `OfficialRosterStudent.id` | Web roster | 名单行 ID | `OfficialRosterEntry.id` | 转 opaque string；与 StudentProfile 分离 | F6 |
| roster `courseId` | Web roster | 教学班 | `OfficialRosterEntry.classSectionId` | 经旧课程映射表转换 | F6 |
| `sourceRow` | Web roster | 源文件行号 | `sourceRowNumber` | 保留 1-based 语义 | F5 |
| `courseName/courseCode/teachingClassCode`（名单行） | Web roster | 名单冗余课程列 | Import/ClassSection 关联；原值保留 `sourceRowSnapshot` | 不作为新的多份关系事实 | F5 |
| `PlatformCourseMember.id` | Web roster | 平台 membership ID | `Enrollment.id` | number/string 映射到 opaque ID | F6 |
| `officialStudent`、`platformMember` 嵌套对象 | Web RosterResult | 对齐结果快照 | `officialRosterEntryId`、`enrollmentId`；确定身份匹配写 `OfficialRosterEntry.matchedStudentId` | 新 API 可 include projection，但数据库只存外键/必要快照；候选匹配不提前写 matchedStudentId | F5/F6 |
| `NOT_JOINED` | Web roster enum | 官方有、平台无 | `MISSING_IN_PLATFORM` | adapter 映射；历史值保留审计 | F5 |
| `NOT_IN_OFFICIAL_ROSTER` | Web roster enum | 平台有、官方无 | `EXTRA_IN_PLATFORM` | adapter 映射 | F5 |
| `INFO_MISMATCH`、`POSSIBLE_MATCH` | Web roster enum | 身份信息冲突/可能匹配 | `IDENTITY_CONFLICT` | 保留 differences/reasonCode，禁止自动合并 | F5 |
| `DUPLICATE` | Web roster enum | 重复条目/成员 | `DUPLICATED` | 先区分官方重复或平台重复并记录 reasonCode | F5 |
| `status`（RosterResult） | Web roster | 对齐判定 | `RosterAlignmentResult.status` | 使用阶段 3 统一枚举 | F5/F6 |
| `resolutionStatus` | Web roster | 人工处置状态 | 同名独立字段 | 不再用 `RESOLVED` 覆盖 alignment status | 保留（标准名） |
| `teacherNote` | Web roster | 教师处置备注 | `resolutionNote` | F1 alias；最大长度/权限校验 | F5 |
| `operationLogs` | Web roster | 浏览器内操作历史 | `AuditLog` 或后续专用处置历史 | 导入现有 Mock 不进入生产；真实数据逐条映射 actor/time/action | F5 |

### 7.4 运动会话、打卡、媒体与审核

| 旧字段 | 所在位置 | 旧含义 | 新字段 | 兼容策略 | 移除阶段 |
|---|---|---|---|---|---|
| 本地 `sessionId` | Android ExerciseSessionState/Snapshot | 当前设备运动会话 ID | `ExerciseSession.id`（服务端）+ 本地缓存引用 | 新流程由服务端签发；旧离线 ID 仅在兼容提交中作为 client reference | F6 |
| `Idle/Active/Paused/Finished/Submitted` | Android session state | 本地 UI/持久化状态 | 统一 ExerciseSessionStatus 映射 | 阶段 3 逐状态映射；`Finished`/封顶 Paused 不直接等于已提交 Record | F5/F6 |
| `startedAtEpochMillis`、`activeSegmentStartedAtEpochMillis` | Android session | 设备毫秒时间 | `startedAt` + 服务端事件/状态 | 仅作客户端观测；毫秒转 RFC3339 后与服务端时钟核对 | F5/F6 |
| `accumulatedActiveMillis`、`activeDurationMillis` | Android session | 本地有效运动毫秒 | `actualDurationSeconds` | 仅整除/按获批误差规则转换；最终由服务端重算 | F5/F6 |
| `CheckInRecord.id`、`SportRecordResponse.id`、Web `recordId:number` | Android/Web | 打卡记录 ID | `ExerciseRecord.id`（业务引用名 `recordId`） | 全部换 opaque string；维护旧→新映射表 | F6 |
| record `studentId` | Web CheckinRecord | 学生内部 ID | `ExerciseRecord.studentId` | number 经学生映射表转换；禁止当 studentNumber | 保留（类型改为 opaque string） |
| record `courseId` | Android/Web CheckinRecord | 多数为具体教学班 | `classSectionId` + 由其确定的 `courseId` | F0 根据旧课程表拆分；两者一致性校验 | F6 |
| `startAt`、`startTime` | Web/Android record | 运动开始时间 | `ExerciseSession.startedAt`；Record 通过 `sessionId` 关联 | 解析时区；无 session 的旧记录生成 migration session 并标来源 | F5/F6 |
| `endAt`、`endTime` | Web/Android record | 运动结束时间 | `ExerciseSession.endedAt` | 同上；必须不早于 startedAt | F5/F6 |
| `durationMinutes` | Web CheckinRecord | 实际运动分钟 | `actualDurationSeconds` | 严格 ×60；与 start/end 差异进入核对报告 | F5 |
| `actualDurationSeconds` | Android request/response | 实际运动秒 | 同名标准字段 | 类型改为非负 integer；服务端重算为准 | 保留（标准名） |
| `hours` | Android Submit/Record | 客户端提交/记录计入小时 | `ExerciseRecord.creditedDurationSeconds` | 旧读 ×3600；新写忽略客户端权威性并由服务端计算 | F5/F6 |
| `originalHours` | Web CheckinRecord | 调整前计入小时 | `ExerciseRecord.creditedDurationSeconds` | ×3600 后保存提交时快照 | F5 |
| `approvedHours` | Web CheckinRecord | 教师调整后有效小时 | 候选 `ReviewRecord.creditedDurationOverrideSeconds` | 严格 ×3600 后先保留迁移暂存并核对；ADR 批准前不得写入正式字段或开放新 API；若未来批准，每次变化追加 ReviewRecord | 待 ADR/F6 |
| `creditedMinutes` | Web audit | 当前用于累计的分钟 | 从最新 Review + Record 派生的有效秒 | 不作为第二事实落库；兼容响应除以 60 | F5 |
| `creditType` 中文 `课程相关/其他运动/系统抵扣` | Android/Web | 打卡类别/系统抵扣混合 | Record `creditType=COURSE_RELATED/GENERAL`；系统抵扣进入获批 ScoreAdjustment 或待建专用来源对象 | adapter 映射中文；`系统抵扣` 不再伪造成学生 Record/ScoreContribution | F5/F6 |
| `sport`、`sportType` | Web/Android | 运动项目代码或自由文本 | `sportType` + `sportName` | 标准项目映射 enum；其他项目名称放 sportName | F5/F6 |
| `taskTitle` | Android CheckInRecord | UI 标题 | 派生展示字段 | 不落 ExerciseRecord；由 sport/credit type/i18n 生成 | F5 |
| `note`、`description` | Android/Web | 运动说明 | `ExerciseRecord.description` | F1 接受 note alias；新写只用 description | F5/F6 |
| `submittedAt` | Android/Web | 提交时间 | `ExerciseRecord.submittedAt` | 解析为带时区时间；无法确定时区则标迁移来源 | 保留（标准名） |
| record `status=有效/已调整/系统抵扣` | Web | 展示标签、来源与有效性混合 | `ExerciseRecord.status` + `ReviewRecord.result` + contribution type | 逐值拆分；不得一对一复制到单 status | F6 |
| `auditStatus=pending/valid/invalid` | Web checkin-audit | 审核结果 | `ReviewRecord.result=PENDING/VALID/INVALID` | 为旧现状生成首条 ReviewRecord，保留迁移 actor/source | F5 |
| `invalidReason` | Web CheckinRecord | 无效原因 | Review `reasonCode/reason` | 已知固定文案映射 code；其他保留 reason | F5 |
| `auditRemark`、`reviewComment` | Web CheckinRecord | 教师审核备注，公开性不清 | Review `publicComment` 或 `internalNote` | F0 按页面可见性/真实 API 判断；不确定时按 internal 保护 | F6 |
| `teacherPublicFeedback` | Android record | 学生可见反馈 | `ReviewRecord.publicComment` | 迁入对应审核历史；学生 projection 可返回 | F5 |
| `teacherInternalNote`、`internalNote` | Android/Web | 教师内部备注 | `ReviewRecord.internalNote` | 新学生 API 永不返回；旧字段保持 nullable 直到客户端切换 | F5/F6 |
| `risk`、`confidence` | Web CheckinRecord | 演示风控标签/置信度 | 待批准的 advisory assessment 对象；不得写 ReviewResult | 当前 Mock 不导入生产；若真实数据存在先保留审计快照 | 待模型 |
| `locationExpired` | Web CheckinRecord | 位置已过保留期展示 | ADR-029 后的位置证据/保留字段 | GPS 决策前不加入新 API，不从 boolean 反推坐标事实 | 待模型 |
| `proof`、`proofFiles`、文件名数组 | Android/Web record/exemption | 凭证集合或路径 | `MediaEvidence.id` 关系 | 逐文件创建 MediaEvidence，验证归属/内容；Record 只绑定 mediaId | F6 |
| `ProofAttachment.id` | Android | 本地 URI/cosKey 混合 ID | 本地 draft ID 或正式 `MediaEvidence.id` | 上传确认前后使用不同类型，禁止复用字符串语义 | F6 |
| `cosKey` | Android Proof DTO | 对象存储 key | `MediaEvidence.storageKey` | 仅后端内部迁移；公共 API 停止返回 | F5/F6 |
| `url` | Android Proof response | 可能是长期或签名 URL | 按需短期 `accessUrl` 响应字段（不落库） | 不迁入事实列；原 URL 仅用于受控一次性抓取/核验 | F5 |
| `mediaType=image/video` | Android | 媒体类型小写 | `IMAGE/VIDEO` | adapter 大写映射；未知值报错 | F5 |
| `mimeType` | Android | 声明 MIME | `MediaEvidence.mimeType` | 重新做文件签名检测，声明值不直接采信 | 保留（标准名） |
| `size`、`byteCount` | Android | 文件字节数 | `fileSizeBytes` | 只接受非负 integer；由对象存储确认覆盖声明值 | F5 |
| media `durationSeconds:Double` | Android | 视频秒数 | `MediaEvidence.durationSeconds:integer` | 非负整值可迁；小数进入核对，不静默舍入 | F5/F6 |
| `fileName`（proof） | Android/Web | 本地/展示文件名 | 非事实展示字段；必要时受控 `originalFileName` | 不作为存储键/媒体 ID；日志净化 | F5 |

### 7.5 成绩、规则、调整和审计

| 旧字段 | 所在位置 | 旧含义 | 新字段 | 兼容策略 | 移除阶段 |
|---|---|---|---|---|---|
| `StudentProgress.course/general` | Android | 分类累计小时，可能含抵扣/封顶 | StudentScore `validCourseDurationSeconds/validGeneralDurationSeconds` | 旧读 ×3600；仅作迁移核对，最终从贡献链重算 | F5/F6 |
| `rawCourse/rawGeneral` | Android | 未封顶分类小时 | 从 ScoreContribution 聚合的诊断 projection | 不作为 StudentScore 第二事实；迁移时用于对账 | F5 |
| `courseHours/generalHours/totalCompleted/remaining` | Android summary/grades | 聚合小时与派生剩余值 | StudentScore 秒字段 + ScoreRule 秒字段派生 | 禁止直接导入为最终事实；重算后差异报告 | F5/F6 |
| `checkin/checkinScore/exam/attendance/physical/overallTotal/total` | Android Grade DTO | 旧平铺成绩项 | StudentScore + ScoreContribution（按贡献类型） | 仅对已批准的成绩组成迁移；公式未确认项保留源快照 | F6 |
| `visibleBlocks/subItems` | Android Grade DTO | 任意 UI 成绩块 | ScoreRule calculation/display projection + ScoreContribution | 不把 UI block 直接当数据库实体；阶段 6 定义只读 projection | F5/F6 |
| `enduranceRunTimeSeconds` | Android/Web Grade | 耐力跑用时秒 | 待建专用测评对象的整数秒字段 | 保持 integer seconds；不可塞入 ExerciseRecord 或冒充 creditedDurationSeconds | 待模型/01 对齐 |
| `enduranceRunStatus`、`NotRecorded/Recorded/Exempt/Absent` | Android/Web | 耐力项目结果 | 待建专用测评对象的状态字段 | 阶段 3/7 冻结；未知值不得按 duration 猜测 | 待模型/01 对齐 |
| `physicalScore`、`enduranceRunScore` | Android/Web | 耐力项目分数 | 待建专用测评对象作为 StudentScore 计算输入 | 根据 ScoreRule 版本重算；不信任客户端算法；不得写入不存在的 ScoreContribution 分数字段 | 待模型/01 对齐 |
| `published:boolean` | Web Grade | 成绩是否发布 | `StudentScore.status` + `publishedAt` | true→PUBLISHED 需有时间/审计；false 不自动等于 CALCULATED | F5 |
| `totalScore/totalDisplay/isPassed/courseGradeStatus` | Android GradeRow | 最终成绩/展示状态 | `finalScore`、StudentScore.status；display/isPassed 派生 | null 与 0 分严格区分；停止存储 display 文本 | F5/F6 |
| `EnduranceRule.minSeconds/maxSeconds/score/tier` | Web admin | 耐力换算区间 | 版本化 ScoreRule.calculationDefinition + 待建测评对象 | 当前 Mock 规则不得直接进入生产；业务批准后按 schema 导入 | F5/F6 |
| `GradeCorrectionRequest.*` | Web admin | 归档成绩修正申请/状态 | ScoreAdjustment + 待批准的 correction workflow | ADR-026 未决前不压入 ScoreAdjustment；保留原申请数据 | 待模型 |
| `courseWaiverHours/otherWaiverHours/courseOffset/otherOffset` | Web teacher | 校队/社团抵扣小时 | 待建认证/免测来源对象 + 获批 ScoreAdjustment | ×3600 后需核验来源申请和批准事实；无来源不得自动入账；不得伪造 record 型 ScoreContribution | 待模型/F6 |
| `organizationCredit.offset` 文本 | Android Membership | “课程相关时长抵扣 2 小时”等展示字符串 | 待建认证来源对象的结构化类型/秒 + 获批 ScoreAdjustment | 禁止解析自由文本自动入账；须关联原认证记录 | 待模型/F6 |
| `AuditLog.id` | Web admin | Mock 审计日志 ID | `AuditLog.id` | 真实数据转 opaque string；Mock 不导生产 | 保留（标准名） |
| `actorId` | Web AuditLog | actor ID，可空 | `actorUserId` | 核对是否为 User ID；否则经映射转换 | F5 |
| `actorName` | Web AuditLog | actor 显示名 | 查询时的受控 Profile projection | 不作身份关联；V1 AuditLog 不保存 actorName 快照 | F5 |
| `action` | Web AuditLog | 自由文本操作 | `AuditLog.actionType` | 建立 `AuditActionType` 映射；未知动作进入隔离报告，不写任意字符串 | F5 |
| `resourceType/resourceId/requestId` | Web AuditLog | 目标类型/ID/请求链 | `targetType/targetId/requestId` | F1 接受旧名 alias；targetType 枚举化；number ID 经映射表转换 | F5/F6 |
| `createdAt`（AuditLog） | Web admin | 操作发生时间 | `occurredAt` | 解析为 RFC3339；新日志只写 occurredAt | F5 |
| `metadata` | Web AuditLog | 任意对象 | typed `safeMetadata` | 按 actionType 白名单清洗；剔除秘密、internalNote、storageKey、媒体正文和 PII | 保留（受约束） |

### 7.6 不得强塞进核心 21 对象的现有字段

以下字段确实存在，但其业务对象不在阶段 2 当前核心字典内。为满足“旧字段不丢失”，先冻结保留/建模方向；在相应领域对象获批前不得删除、迁入错误对象或实施数据库变更。

| 旧字段 | 所在位置 | 旧含义 | 新字段 | 兼容策略 | 移除阶段 |
|---|---|---|---|---|---|
| `CourseInvite.code/expiresAt/status` | Android/Web invite | 入班凭证与生命周期 | 待新增 CourseInvite 对象 | 保留旧只读/调用；阶段 1/6 补对象与字段后再迁移 | 待模型 |
| 旧 `ContactStatusResponse` 与 send/verify code DTO | Android | 已退役联系方式绑定流程 | `EmailVerificationChallenge` 与 `/me/email-verification-challenges` | Android 迁移到正式邮箱 challenge；旧手机号 DTO 删除 | ADR-101 已落地 |
| `LoginResponse.token`、CourseJoin session/token | Android | 登录会话凭证 | 待 DeviceSession/Token 对象或认证服务合同 | token 永不落业务表/普通日志；阶段 8 冻结 | 待模型 |
| `RecoveryRequest*` | Android/Web admin | 联系方式失效后的账户恢复申请 | 待 AccountRecoveryRequest 对象 | 保留申请/审核历史；不得转成 AuditLog 代替领域状态 | 待模型 |
| `Exemption.*`、`ExemptionStatus/Type` | Android/Web teacher | 免测、校队/社团认证混合 | `ExemptionApplication.applicationType/applicationSubtype/organizationName` | 800/1000 米及校队/社团映射为结构化 subtype；proofFiles 迁 MediaEvidence；旧记录 subtype 为 null，不猜测回填 | ADR-104 已落地；认证抵扣结果仍由后续成绩域决策处理 |
| `StudentNotice/NotificationResponse`、AdminNotification | Android/Web admin | App 内业务消息/公告 | `Notification` | Stage 21 本地支持本人列表/已读；尚无业务通知生产者或推送投递 | 本地集成，生产未验收 |
| `PushDeviceRegistrationRequest` | Android | FCM 设备地址 | 待 PushDevice 对象 | token 为 HIGHLY_SENSITIVE；与 User/DeviceSession 关联 | 待模型 |
| `FeedbackTicket/SupportTicket/replies` | Android/Web admin | 服务反馈/工单 | `Feedback`（仅当前创建/查询投影） | Stage 21 未实现线程、附件、回复 mutation 或处理 SLA；不得把当前单条反馈扩张为完整工单系统 | 部分本地集成 |
| `HelpArticle.*` | Web admin | 双语帮助内容 | 待 HelpArticle 对象 | 保持语言字段/发布历史；不并入 Course | 待模型 |
| `SystemModeRecord/MaintenanceAnnouncement` | Android/Web admin | 全局系统模式与维护公告 | 待 SystemPolicy/MaintenanceAnnouncement 对象 | 未接真实后端前保持 Mock 标签；未知模式 fail closed | 待模型 |
| `PurgeAllBusinessDataInput/Result` | Web admin | 高危全量清理演示 | 不进入普通领域/API | 按 ADR-024/032 保留为待批准离线运维流程 | 不实现 |

## 8. API projection 与数据库字段边界

| 字段/类别 | 学生 API | 教师 API | 管理 API | 服务内部 | 原因 |
|---|---|---|---|---|---|
| 内部 `id`/关系 ID | 只返回本人业务导航必需值 | 只返回授权教学班范围必需值 | 只返回组织范围必需值 | 可用 | opaque ID 不是秘密，但仍需最小化 |
| `studentNumber/fullName` | 本人可读 | 本教学班可读 | 组织范围按权限可读 | 可用 | SENSITIVE；禁止普通日志全文输出 |
| primaryEmail | 仅本人 masked；首次绑定验证新邮箱，换绑同时验证当前和新邮箱 | 默认不可读 | 恢复流程按权限 masked/受控读取 | 认证服务可用 | HIGHLY_SENSITIVE；手机号不进入公共投影 |
| `passwordHash`、验证码 hash、refresh token | 永不返回 | 永不返回 | 永不返回 | 仅认证服务 | 认证秘密 |
| `storageKey/thumbnailStorageKey` | 永不返回 | 永不返回 | 默认不返回 | 存储/媒体任务 | 防止绕过授权访问对象 |
| 媒体访问 URL | 短期、按单对象授权生成 | 短期、按教学班/记录授权生成 | 仅必要调查范围 | 可生成 | URL 不落库，不长期缓存 |
| `ReviewRecord.publicComment` | 本人可读 | 本教学班可读写 | 默认只读/治理范围 | 可用 | 学生可见反馈 |
| `ReviewRecord.internalNote` | **永不返回** | 本教学班授权教师可读 | 默认不得日常读取；调查需单独权限 | 可用 | ADR-038、最小披露 |
| ScoreRule formula | 可返回可解释摘要 | 本教学班可读 | 治理范围可读 | 完整定义 | 防止客户端自行成为最终计算者 |
| AuditLog `safeMetadata` 与安全摘要 | 不返回 | 默认不返回 | 审计权限且按组织范围读取脱敏 projection | 审计服务 | 不存在 raw before/after、IP、设备指纹或 Idempotency-Key 字段 |

阶段 6 可以为同一领域对象定义不同 projection，但 projection 的字段必须来自本文或明确标记为“派生、非持久化”。不得因为数据库存在一列就自动暴露同名 API 字段。

## 9. 待确认决策与建议 ADR

### 9.1 已在 decision-log 中、仍影响字段值的事项

| 决策 | 影响字段 | 当前字典处理 | 是否阻塞 migration |
|---|---|---|---|
| ADR-061 总门槛 20h | `totalRequiredSeconds` | 固定 72000 秒且必填 | 否（合同已定，物理 migration 仍受 ADR-025） |
| ADR-062 双分类目标 | `courseRequiredSeconds/generalRequiredSeconds` | 保持 null，不开放配置写入 | 是 |
| ADR-018 计分公式/精度/未达标 | `calculationDefinition/roundingMode/baseScore/finalScore` | 结构已定义，不填公式默认 | 是 |
| ADR-021 服务端计时/双设备 | Session heartbeat/device 相关字段与唯一约束 | 保留最小诊断字段，参数未写死 | 是 |
| ADR-023 媒体保留/TTL/扫描 | MediaEvidence 生命周期字段 | 定义状态和时间，不填保留默认值 | 是 |
| ADR-025/086/087 Greenfield 物理基线 | 所有物理类型/索引/枚举 | PostgreSQL uuid + 应用层 UUIDv7；枚举统一为 varchar/text + 命名 CHECK | 否（Foundation 已获准） |
| ADR-067 Course 目录治理 | `Course.status/createdBy/updatedBy`、`ClassSection.teacherId` | 已接受；CourseStatus=`ACTIVE/INACTIVE`，ADMIN 管目录，TEACHER 身份由 principal 派生 | 否（阶段 11 实施） |
| ADR-028 / ADR-101 学生无密码与邮箱可空 | User credential/contact 字段 | Student password/email 允许 null；已验证邮箱唯一；历史手机号字段不可读写 | 否（V1 已接受） |
| ADR-029 GPS | 位置字段 | 核心对象不新增坐标；旧 locationExpired 保留待模型 | 是（位置功能） |
| ADR-030 capture source 白名单 | `businessPurpose/captureSource` | 定义字段，不替业务决定白名单 | 是（不同用途） |
| ADR-032 数据保留 | `deletedAt`、媒体/名单/成绩保留 | 不写固定 TTL，不允许普通物理清理 | 是（清理） |
| ADR-040 不足 1h 草稿 | 本地草稿而非正式 MediaEvidence | 正式字典不把未上传本地草稿伪装成服务端媒体 | 否（后端核心表） |

### 9.2 阶段 2 新增并已写入 decision-log 的 ADR

主任务已将阶段 2 的新增决策登记为 ADR-047 至 ADR-053；`ACCEPTED` 可作为本字典规则，`PROPOSED` 仍按未决项处理：

| ADR | 主题 | 状态 | 本字典处理 |
|---|---|---|---|
| ADR-047 | VALID 审核能否覆盖服务端折算时长 | PROPOSED | `creditedDurationOverrideSeconds` 固定 null、公共 API 不开放写；旧 approvedHours 仅迁移暂存/核对 |
| ADR-048 | 内部 ID 生成算法与数据库物理类型 | SUPERSEDED | 执行 ADR-086：应用层 UUIDv7、PostgreSQL uuid；API 仍是 opaque string |
| ADR-049 | 四级隐私分类 | ACCEPTED | 使用 `PUBLIC/INTERNAL/SENSITIVE/HIGHLY_SENSITIVE`；后续权限矩阵与 projection 逐字段执行 |
| ADR-050 | `gradeYear` 为四位 cohort 年份 | ACCEPTED | `grade/admissionYear` 经来源核验迁入 gradeYear；相对 gradeLevel 由 Semester 派生，冲突隔离核对 |
| ADR-051 | `ClassSection.excludedDates` 时间窗值对象 | ACCEPTED | API 为去重升序 date 数组；阶段 11 物理化为 `class_section_excluded_dates` 关系表，整体受 ClassSection version/审计保护 |
| ADR-052 | `ScoreContribution` 不可变来源事实 | ACCEPTED | 每次成功修订保存完整贡献集合；同修订/Record 唯一，旧修订不覆盖 |
| ADR-053 | 相邻 Auth、Invite、Export 等对象的持久化模型 | SUPERSEDED | AuthSession/RefreshToken 进入 Foundation；Join 只冻结摘要/TTL/原子消费设计；V1 不建 ExportJob |

## 10. 阶段 2 完成检查

| 检查项 | 结果 | 说明 |
|---|---|---|
| DB/API/enum 命名唯一 | 通过（合同层） | snake_case / camelCase / UPPER_SNAKE_CASE 已冻结 |
| 内部 ID 与 studentNumber 分离 | 通过（合同层） | 主键/FK 均 opaque string；学号只在 StudentProfile/RosterEntry |
| 事实时长统一整数秒 | 通过（合同层） | actual/paused/credited 及旧 minutes/hours 转换规则明确 |
| 时间点与日期分离 | 通过（合同层） | timestamp UTC + RFC3339；businessDate 为组织本地 date |
| 至少 20 个核心对象 | 通过 | 20 个阶段 1 主对象 + 1 个阶段 2 支持对象 ScoreContribution，共 21 个 |
| 每个字段表 14 列 | 通过 | 已自动检查通用字段表及 21 张对象字段表，表头和每行均为 14 列 |
| 公共字段与使用条件 | 通过 | 第 3 节定义通用字段和对象类别适用性 |
| 重点字段 | 通过 | 身份、课程/教学班/入班、时长、媒体、审核/成绩均有不变量 |
| 旧字段映射 | 通过（当前仓可验证范围） | Android/Web/Mock 核心合同字段均有去向；未建模支持字段集中列出 |
| 正式 migration | 未执行 | Foundation 已获准；将在 `backend/` 的首条 Greenfield migration 中建立，不伪造历史 |
| decision-log | 已更新（由主任务） | ADR-047..053 已登记；本文按各自 ACCEPTED/PROPOSED 状态执行 |

“通过（合同层）”不表示当前客户端、远端后端或数据库已经符合；阶段 9 必须再次交叉检查，阶段 10 才允许在权威基线上实施。

## 15. Stage 18 Score 字段冻结（2026-08-04）

- 所有分数字段使用 PostgreSQL `numeric`/Prisma Decimal，持久化为两位小数；中间计算保留 Decimal 精度，仅最终一步使用 `HALF_UP`。
- 固定规则参数：`totalRequiredSeconds=72000`、`maximumScore=100.00`、`roundingScale=2`、`roundingMode=HALF_UP`、`categoryAllocationMode=TOTAL_ONLY`。
- 修订字段至少包含 `totalValidCreditedSeconds`、`scoringSeconds`、`excessSeconds`、`qualificationStatus`、`calculatedScore`、`adjustedScore`、`finalScore`、`sourceFingerprint`、`calculationRevision`。
- `sourceFingerprint` 为 64 位小写 SHA-256；客户端不得提交。`evidenceReference` 为内部 opaque reference，必须匹配 `^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$`，不得是 URL、storageKey、signed URL 或自由文本证据。
- 学生投影不含 working revision、Contribution、Adjustment、审批人、内部理由、证据引用或内部备注；未发布时只返回安全进度，已发布时只返回 published revision 安全摘要。

## 16. ADR-101 邮箱验证 Challenge 字段（2026-08-11）

| 对象 | 关键字段 | 数据库存储 | 规则 | 公共投影 |
|---|---|---|---|---|
| `User` | `status` | `users.status` | 新学生可为 `PENDING_CONTACT_BINDING`；邮箱首次验证成功原子转为 `ACTIVE` | 返回状态，不返回手机号字段 |
| `EmailVerificationChallenge` | `mode` | `email_verification_challenges.mode` | `FIRST_BIND` 或 `REBIND` | 申请响应只返回 mode、challengeId、expiresAt |
| `EmailVerificationChallenge` | `targetEmailNormalized` | `target_email_normalized` | 小写规范化；仅投递与唯一性检查使用 | 永不返回明文 |
| `EmailVerificationChallenge` | `currentEmailCodeDigest/newEmailCodeDigest` | SHA-256/HMAC 摘要列 | 首次绑定只需要新邮箱摘要；换绑两份摘要均必需 | 永不返回 |
| `EmailVerificationChallenge` | `status` | `PENDING_DELIVERY/ACTIVE/FAILED/CONSUMED/EXPIRED/LOCKED` | 只允许一次成功消费；错误尝试有上限 | 不提供内部状态详情 |
| `EmailVerificationChallenge` | `expectedUserVersion` | integer | 验证时必须仍匹配 User 版本，否则 `CONFLICT_VERSION_MISMATCH` | 请求事实，不进入 User 投影 |

历史 `primary_phone`、`phone_verified_at` 和旧 `PHONE` challenge 保持原值且不执行 DROP/清空；Prisma 使用 `@ignore` 阻止应用读写，未来物理删除需单独破坏性迁移审批。
