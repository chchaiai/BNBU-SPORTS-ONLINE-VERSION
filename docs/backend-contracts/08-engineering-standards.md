# 体育打卡后端工程与数据安全规范

> 状态：阶段 8 统一工程契约。本文定义所有后端模块必须共同遵守的工程、安全和运行边界；ADR-025/075/076 已允许在根仓库 `backend/` 建立 Greenfield Foundation，但不代表业务模块或 production 已就绪。
> 范围：统一认证、时间、幂等、媒体、migration、删除、审计、并发、环境、日志监控、数据安全与备份恢复；采用已接受的技术基线，不替未通过 Gate 的产品规则或生产运营参数作决定。
> 规范用语：**必须/禁止**是上线门槛；**应当**是默认要求，偏离需 ADR；**待确认**表示不得以示例值、客户端默认值或环境变量默认值冒充产品规则。

## 1. 基线与总原则

### 1.1 适用基线

| 基线 | 本文采用的约束 |
|---|---|
| ADR-002 / ADR-015 | 新 API 统一 `/api/v1`；成功和错误 envelope、`requestId` 统一 |
| ADR-003 / ADR-004 | DB snake_case、API camelCase、枚举 UPPER_SNAKE_CASE；内部 ID 与学号永久分离 |
| ADR-008 / ADR-009 / ADR-037 / ADR-041 / ADR-063 / ADR-064 / ADR-065 | Session/Record 分离；服务端裁决时间；UTC/RFC3339/整数秒；`businessDate` 使用组织时区；单活动 Session、每日唯一和可提交时长边界统一 |
| ADR-010 | MediaEvidence 独立；申请上传、直传、确认、绑定、处理分离；不暴露 `storageKey` |
| ADR-058 / ADR-066 | Record 提交前媒体必须全部 `AVAILABLE`；正常打卡为 App 内拍摄、1..6 张图片和 0..1 个视频，合计至少 1 项 |
| ADR-011 / ADR-016 / ADR-052 | Review、ScoreAdjustment、ScoreContribution 和 AuditLog 均保留历史，领域历史不由普通 API 覆盖 |
| ADR-012 / ADR-013 / ADR-014 | 后端为最终裁决者；RBAC 后仍校验组织、本人、教学班、对象状态 |
| ADR-025 / ADR-075 / ADR-076 / ADR-086 / ADR-087 / ADR-088 | Greenfield 使用 Node 24/NestJS/Prisma/PostgreSQL 18 模块化单体、PostgreSQL 幂等与 Outbox、S3 Port/本地 MinIO、UUIDv7 与受 CHECK 约束枚举；Foundation 与业务/生产门禁分开 |
| ADR-022 / ADR-023 / ADR-032 / ADR-045 / ADR-070 / ADR-072 | Token 具体时长和生产密钥、媒体/名单保留、幂等 lease/retention、备份与运营参数仍待确认，不在代码中写隐式生产默认 |
| ADR-035 / ADR-039 | 归档/关闭默认拒绝写；未知安全相关状态 fail closed |
| ADR-049 | 字段隐私分级统一为 `PUBLIC/INTERNAL/SENSITIVE/HIGHLY_SENSITIVE` |

### 1.2 跨模块强制原则

1. 认证、授权、状态守卫、幂等、审计、错误 envelope 和结构化日志必须由共享基础设施实现；业务模块不得各自发明一套中间件或保存语义。
2. 所有关键写入遵循同一顺序：解析请求 → 认证 → 组织/资源授权 → 系统与对象状态守卫 → 幂等预留 → 乐观锁/唯一约束 → 业务事务 → 领域历史 + AuditLog/outbox → 返回角色投影。
3. 外部服务调用不得夹在不可恢复的数据库事务中。数据库事实和 outbox 同事务提交，通知、媒体处理等通过幂等消费者执行。
4. 所有安全检查 fail closed；生产环境不得因配置缺失、未知枚举、依赖异常或 Mock fallback 而默认放行。
5. 生产密钥、Token、验证码、对象存储凭据、数据库地址及真实敏感数据禁止写入源码、Git、普通日志、测试 fixture 或构建产物。
6. 未决参数必须显式标记为启动阻塞配置；production 不得使用示例值或隐式默认值启动。

## 2. 认证规范

### 2.1 认证对象边界

- `User.id` 是唯一认证主体；`StudentProfile.id`、`TeacherProfile.id`、`AdminProfile.id` 和 `studentNumber/employeeNumber` 都不能替代 `sub`。
- 基础角色只允许 `STUDENT/TEACHER/ADMIN`（ADR-001）。角色认证成功后，权限中间件仍必须查询组织、本人/教学班归属及资源状态。
- Access Token、Refresh Token、设备会话、密码凭据、验证码等属于认证子域，不得塞进业务 Profile；Foundation 只在 `users`、`auth_sessions`、`refresh_tokens` 建立已冻结的最小持久化边界。
- ADR-028/101 允许学生 password hash 和 email 为空；手机号仅作不可读写历史事实。教师和管理员密码流程不能反向强迫学生设置密码，password-login 只接受已验证邮箱并服务 TEACHER/ADMIN。

### 2.2 Access Token

Access Token 必须：

- 有有限有效期；具体时长由 ADR-022 决定，本文不提供默认分钟/小时/天数。
- 由受维护的 JOSE 实现使用非对称签名并验证 `iss`、`aud`、`iat`、`exp`、可选 `nbf`；只接受配置的算法 allowlist。生产 key 托管、轮换和 TTL 数值仍受 ADR-072/022 阻塞。
- 至少包含或可解析：`sub=User.id`、`organizationId`、`role`、`sessionId`、`jti`、`tokenVersion`。不得包含姓名、学号、工号、电话、邮箱、成绩或媒体路径。
- 每次请求都先验证 Token，再验证 User/设备会话未禁用、未撤销且版本一致。仅验证签名不足以满足“禁用立即失效”。
- 只用于授权 header 或后续批准的安全 Web 传输机制；禁止出现在 URL/query、普通日志、分析埋点和错误详情。

缓存 User/session 状态只能作为性能优化，不能弱化撤销语义；最大缓存传播窗口属于 ADR-022 待决参数。高风险写入必须在事务提交前再次确认账号和授权仍有效，避免认证检查后的竞态。

### 2.3 Refresh Token 与设备会话

- Refresh Token 必须为不可预测秘密；服务端只保存不可逆摘要或等效受保护验证材料，不保存可被普通查询取回的明文。
- 每个设备会话拥有独立 Token family。刷新必须原子轮换：旧 Refresh Token 单次使用后失效，新 Token 只返回一次。
- 检测到已轮换 Refresh Token 重用时，必须 fail closed、记录安全事件并按 ADR-022 确认的范围撤销当前 family 或全部会话。
- 刷新前重新检查 User.status、tokenVersion、设备会话状态、组织状态；禁用用户不得刷新。
- Refresh Token 的绝对有效期、空闲有效期、轮换宽限、多设备上限和设备淘汰策略均为 ADR-022 待确认项，不得由不同客户端自行设定。

### 2.4 登录、刷新、退出、禁用与密码变化

| 场景 | 统一必做行为 | 尚未确认、不得编造的部分 |
|---|---|---|
| 登录成功 | 建立可撤销设备会话；发放 Access/Refresh；审计成功；认证秘密不进日志 | Token 时长、并发设备上限、Web Token 传输方式 |
| Token 刷新 | 原子校验并轮换 Refresh；新 Access 绑定同一有效 session；防并发重放 | 轮换宽限及复用后的撤销范围 |
| 当前设备退出 | 撤销当前设备会话/Refresh family；后续刷新失败；清除客户端安全存储 | 当前 Access 的最大残余可用窗口及是否实时 denylist |
| 全部设备退出 | 撤销 User 的全部 session，并使旧 Token 版本失效；完整审计 | 是否向普通用户开放及二次认证要求 |
| 用户被禁用 | 禁止新登录/刷新；撤销全部 session；后续请求 fail closed；写 AuditLog | 撤销传播 SLO |
| 密码修改/重置 | 必须支持使旧会话失效、变更 tokenVersion、审计和安全通知 | 保留当前设备还是撤销全部设备，受 ADR-022 阻塞 |
| 联系方式恢复 | 使用受控恢复流程，验证码单次使用且只存摘要；成功后处理旧会话 | 恢复证据、人工审批、多设备影响，受 ADR-028/053 阻塞 |

在 ADR-022 未确认“密码变化后的会话范围”前，production 不得让各模块自行选择不同策略；实现必须先具备全量撤销能力，再按批准决策开放。

### 2.5 客户端安全存储与 Web 防护

- Android/iOS 使用操作系统受保护凭据存储；不得把 Refresh Token 放入普通偏好文件、日志或云同步备份。
- Web 禁止把长期 Refresh Token 放入可被普通 JavaScript 读取的持久化存储。若最终采用 HttpOnly Cookie，必须同时配置 Secure、合适 SameSite、严格 CORS/Origin 检查和 CSRF 防护；若采用其他方式，需独立安全 ADR。
- 客户端退出时清理本地凭据和敏感缓存，但不得通过清客户端数据代替服务端撤销。
- 截图、崩溃报告、网络调试器和分析 SDK 必须对认证字段做统一 redaction。

### 2.6 密码、验证码和滥用防护

- 密码只保存 Argon2id hash（库生成独立盐）；参数通过显式配置并在启动时校验，未来参数升级使用登录后 rehash。禁止自研加密、可逆“加密密码”或明文回传。
- 邮箱验证码只保存摘要、用途、过期时间、尝试计数和使用状态；验证成功后立即失效，不得跨用途复用。`PHONE` 请求在 DTO 校验层拒绝，不得创建 challenge 或投递消息。
- 登录、发送验证码、刷新、恢复、邀请码解析必须有组织/账号/IP/设备等多维滥用控制；具体阈值待运营与安全决策，不在客户端硬编码为权威规则。
- 认证失败响应不得泄露账号是否存在、联系方式全文或内部锁定细节；安全团队可在受控日志中查看原因码。

## 3. 时间规范（含时长）

### 3.1 存储与传输

| 类型 | 数据库存储 | API 表示 | 规则 |
|---|---|---|---|
| 时间点 | 统一 UTC 的有序时间点 | 带时区的 ISO 8601；具体采用 RFC 3339，必须含 `Z` 或明确 offset | 禁止无时区字符串；服务端生成 created/updated/submitted/reviewed 等事实时间 |
| 业务日期 | `date` 语义，不转成 UTC 午夜 | `YYYY-MM-DD` | `businessDate` 按 Organization.timezone + Session.startedAt 计算并冻结（ADR-037） |
| 本地时刻 | 明确 local-time 语义 | `HH:mm:ss` | 仅与组织时区和业务日期组合；不能冒充 UTC 时间点 |
| 时长 | 非负 64 位整数秒 | JSON integer，字段名以 `DurationSeconds` 结尾 | 禁止 `hours`、`minutes`、浮点秒或模糊 `duration` 成为事实 |

### 3.2 可信级别

1. 服务端持久化时间、数据库事务顺序和服务端重算区间是最终事实。
2. 对象存储 `uploadedAt` 只有在后端确认对象后写入；客户端“上传完成时间”不作为事实。
3. 客户端 wall clock、时区、格式化日期和本地累计只作为 UX/诊断观测，不可直接生成 `businessDate`、`creditedDurationSeconds` 或审计时间。
4. 客户端单调时钟可帮助离线恢复和段落排序，但服务端必须按 ADR-021 的时钟偏差、心跳和异常策略复核；未确认阈值前不得自动信任缺失区间。
5. 事实时长必须分开：`actualDurationSeconds` 排除暂停，`pausedDurationSeconds` 是暂停总秒数，`creditedDurationSeconds` 是规则折算快照。三者禁止互相回填。
6. ADR-009 边界由后端执行；客户端只显示预估。任何换算都必须先转整数秒并做边界校验。

### 3.3 实现要求

- 进程、数据库连接、队列消费者和定时任务统一使用 UTC；只在业务规则明确需要时加载 Organization.timezone。
- 所有解析库启用严格模式；不接受隐式本地时区、无效日期自动修正、两位年份或语言相关日期。
- 测试必须冻结/注入时钟，覆盖跨午夜、夏令时适用组织、闰日、客户端错误时区、服务端重试和时钟回拨。
- 日志 `timestamp` 使用 UTC RFC3339；展示层自行本地化，后端不返回中文格式化时间作为事实字段。

## 4. 统一幂等规范

### 4.1 唯一机制

所有 HTTP 客户端写命令统一使用 `Idempotency-Key` header。业务模块不得自行创建另一套缓存或仅靠按钮禁用。键遵循既有 API 合同：1..128 个可打印 ASCII 字符。已有 `ExerciseRecord.clientRequestId` 是记录级客户端操作关联/兼容字段，不是 `requestId`，也不建立第二套幂等存储：

- 新客户端必须发送 `Idempotency-Key`。
- 如果 endpoint 同时接受 body `clientRequestId`，服务端按字段字典保存其 64 字符、同学生/动作唯一语义，并把它关联到统一幂等记录；它与 header 的长度、格式和字面值不要求相同。
- 旧客户端只发送 `clientRequestId` 时，由兼容网关在已认证主体、规范化动作和该值的基础上生成稳定 `Idempotency-Key`，同时记录迁移遥测；业务服务仍只接收统一幂等机制，不允许绕过。
- 后端幂等 scope 由 `organizationId + authenticatedPrincipal + HTTP method + canonical route + key` 组成；认证/会话类内部命令另把目标 device session 或安全主体摘要纳入 scope。不同主体、方法或路由不得互相命中。
- 内部任务/消费者也必须走同一语义，使用稳定 job/event key，而不是“最多执行一次”的进程内布尔值。

### 4.2 强制覆盖的操作

| 操作 | 幂等结果 | 永久业务约束兜底 |
|---|---|---|
| 扫码/邀请码入班 | 重放首次成功的 Student/Enrollment 稳定资源结果；不重复建账号、关系、通知 | `(classSectionId, studentId)`、同学期一条 ACTIVE Enrollment |
| 创建 Record 草稿 | 返回同一 `recordId` | `sessionId` 唯一，一 Session 至多一 Record |
| 提交 Record | 返回首次提交后的同一 Record/Review v1 | 每日唯一、状态机和 `sessionId` 唯一 |
| 确认媒体上传 | 返回同一 MediaEvidence 状态；不重复绑定/处理 | `storageKey` 唯一、状态守卫、owner/session/record 一致 |
| 单条审核 | 返回同一 ReviewRecord；不追加第二版本 | `(recordId, reviewVersion)`、`expectedVersion` |
| 批量审核 | 同一批 key 重放首次完整逐项结果；成功项不重复写。用户明确重试失败项时，以新批 key 发起新命令，各 item key 仍按原结果或新动作语义处理 | 每项 idempotencyKey、version/Review 唯一约束 |
| 成绩重算 | 相同输入返回同一 revision 或已存在结果 | `sourceFingerprint`、`calculationRevision`、Contribution 唯一 |
| 成绩发布 | 返回同一 published Score；不重复通知 | Score version、状态机、publishedAt |

Session START/PAUSE/RESUME/FINISH、名单对齐、导入处置、Enrollment 移除/恢复等已在状态机中要求幂等的写命令，同样使用此机制。

### 4.3 请求规范化与哈希

幂等服务必须计算请求摘要，至少覆盖：HTTP method、规范化 route template、path 资源 ID、组织和认证主体 scope、按字段名稳定排序的 JSON body、文件/批次引用及有业务意义的 header。数组顺序是否有意义由 endpoint schema 明确，不能擅自排序。

以下内容不参与业务请求摘要：`requestId`、trace header、User-Agent、连接信息等传输噪声。所有摘要使用受维护的密码学哈希；具体算法随 ADR-072，但不能使用可碰撞的非安全散列。

### 4.4 幂等记录和状态

共享幂等存储使用 PostgreSQL `idempotency_records`，至少保存下列逻辑信息；lease/retention 数值仍待 ADR-070：

| 字段类别 | 必要内容 |
|---|---|
| Scope | organization、actor/session、canonical operation、key 的安全摘要 |
| 请求 | requestHash、API/schema version |
| 执行状态 | `IN_PROGRESS/COMPLETED/RETRYABLE_FAILURE` 等内部状态、lease/owner |
| 结果 | HTTP status、稳定响应 envelope 或资源引用、可安全重放的 headers |
| 关联 | requestId、resourceType/resourceId、AuditLog/outbox reference |
| 生命周期 | createdAt、completedAt、expiresAt |

唯一约束是 `(scopeHash, idempotencyKeyHash)`；`scopeHash` 覆盖上文规定的 organization、principal、method 和 canonical route。原始 key 不写普通日志；如需持久化必须受保护。响应快照如含 SENSITIVE 字段必须加密并按最小字段保存。

### 4.5 首次执行与重复请求语义

| 情况 | 服务器行为 |
|---|---|
| 新 key | 认证授权和结构校验通过后原子预留；只有预留 owner 能执行业务副作用 |
| 同 scope + 同 key + 同 hash，已完成 | 不再执行业务逻辑、通知或 outbox；返回第一次的相同稳定 status/body/resource version，并标识 idempotent replay |
| 同 scope + 同 key + 不同 hash | 返回 409 `CONFLICT_IDEMPOTENCY_KEY_REUSED`；不得泄露第一次 body |
| 同 key 仍执行中 | 不启动第二次执行；返回 409 `CONFLICT_REQUEST_IN_PROGRESS` 和受控 `retryAfterSeconds`，只允许同键等待后查询/重放 |
| 执行产生确定性业务拒绝 | 保存并重放同一拒绝结果，避免状态变化后把同一客户端操作解释成新命令 |
| 可证明事务已回滚的瞬时失败 | 标为可重试；同 key 在 lease 安全接管后重新执行 |
| 结果未知或外部副作用可能已发生 | 禁止用新 key 猜测重试；以同 key 查询/恢复，先对账业务资源和 outbox |

每次重放仍必须重新认证、确认当前调用方可见该资源，并应用当前账号禁用/组织隔离；不能在鉴权前直接返回历史响应。

### 4.6 Token、上传凭证等临时秘密的例外

普通幂等响应快照禁止保存明文 Access/Refresh Token、Cookie、验证码、对象存储上传凭证和 signed URL。包含持久业务变更与临时凭证的操作必须：

1. 幂等保存稳定资源/设备会话引用，而非普通可查询明文秘密；
2. 由认证/媒体组件在重新通过安全证明后处理凭据恢复或重新签发；
3. 不因重放新建第二个 Enrollment、设备会话或 MediaEvidence；
4. Join Capability 长期只保存不可逆摘要；Stage 12 的 Join 在一笔事务内消费 capability，建立或严格复用 Student User/Profile、Enrollment 与 AuthSession，并通过专用加密 result escrow 精确重放。该结论不代表 ExerciseSession、Roster 或客户端联调已经完成。

### 4.7 保存周期

`IDEMPOTENCY_RETENTION`、执行 lease、客户端离线重试窗口及完成响应保留周期目前没有批准数值。production 配置必须满足：

- 覆盖所有受支持客户端的最长合法重试/离线恢复窗口；
- 不短于网关、客户端和后台 job 可能重试同一操作的窗口；
- 到期后仍由领域唯一约束和状态机防止重复事实；
- 敏感响应到期可验证地清除，同时保留必要 AuditLog。

具体数值、是否按操作分层和共享存储/lease 技术必须经 ADR-070 批准后落地；禁止使用进程内默认 TTL 或不同模块各自设置。

## 5. 文件上传规范（私有媒体与文件安全）

### 5.1 技术无关架构

- 业务只依赖 S3-compatible Port，local 使用私有 MinIO；production 供应商、region、凭据和扫描器仍待 ADR-023/Production Gate，不得在领域代码绑定厂商 SDK。
- 每个环境使用物理隔离或可证明的强隔离 namespace、独立凭据和策略。production bucket/container 不与 non-production 共用写凭据。
- 所有原始媒体和缩略图默认 private，禁止 public-read ACL、永久公开 URL、猜测式对象键和客户端自选 `storageKey`。
- 对象键由服务端生成，只在内部保存；公共 API 返回 `mediaId` 和经授权的临时访问能力（ADR-010）。
- 传输必须加密；静态加密、密钥托管和轮换方式随供应商/安全 ADR 冻结。

### 5.2 标准上传流程

1. **申请**：认证学生请求创建 MediaEvidence。后端校验 organization、`ownerStudentId`、Session/Record 归属、状态、captureSource、媒体计数和用途，分配稳定 `mediaId` 并创建 `PENDING_UPLOAD`；客户端可选的 `declaredContentSha256` 只是不可信声明。
2. **签发上传能力**：服务端返回仅能写指定对象、受限方法、受限内容条件且短期有效的上传凭证。TTL 待 ADR-023，不得返回长期存储密钥。
3. **直传**：客户端直接上传到私有对象存储；业务 API 不接收任意路径，也不把大文件塞入 JSON/base64。
4. **确认**：客户端为确认命令生成幂等 key，并在该命令重试时复用同一 key；不得复用“申请上传”命令的 key。后端通过存储端元数据读取对象，不相信客户端声明已完成。
5. **服务端验证**：沿用申请阶段的同一 `mediaId`，核对对象存在、大小、checksum、声明 MIME 与实际 magic bytes/容器、图片可解码、视频元数据/时长、对象归属和上传状态；通过后写 `verifiedContentSha256` 并进入 `UPLOADED`，不得创建第二个媒体身份。
6. **绑定**：授权后把本人媒体绑定到本人 Session/Record 草稿，原子写 `recordId/boundAt` 并进入 `BOUND`；同一媒体最多绑定一个打卡 Record，未决解绑/重绑遵循 ADR-060 的禁止性默认。
7. **安全处理**：从 `BOUND` 进入 `PROCESSING`，执行恶意内容扫描、解码安全限制、元数据处理和缩略图生成。任何步骤失败转 `FAILED`，不得用于提交。
8. **可用**：全部校验通过才转 `AVAILABLE`。
9. **提交冻结**：Record 提交时再次检查 owner、Session/Record、用途、数量、状态和绑定唯一性，并在同一业务事务中冻结关联；绑定、处理任务和提交重试都必须幂等。

### 5.3 大小、类型和内容校验

- 正常 `EXERCISE_RECORD` 用途按 ADR-066 只接受 `IN_APP_CAMERA`：1..6 张 IMAGE、0..1 个 VIDEO，合计至少 1 项；其他业务用途的数量和 capture source 仍由 ADR-030 决定。
- 图片单文件大小、总请求大小、像素/解码资源上限和扫描参数仍按批准配置治理。ADR-099 已固定打卡视频最多 15 秒且不设业务文件大小、分辨率或码率限制；Contract 1.5 的 MP4/MOV/3GP/WebM 白名单是可验证传输容器边界，服务端仍必须按原始字节核对真实容器、视频轨、音轨和时长，不能信任文件名或声明 MIME。
- allowlist 必须按业务用途配置并由服务端强制；仅检查扩展名或客户端 Content-Type 不合格。
- 文件名只作净化后的展示 metadata，不参与对象键、权限或类型判断；控制字符、路径分隔和双扩展名不得影响存储路径。
- checksum 必须由服务端/存储确认；相同 hash 只用于完整性和风险分析，不能自动跨学生复用对象。
- 对压缩炸弹、超大维度、畸形容器、解析器超时、恶意 payload 和扫描器不可用 fail closed。
- 扫描器/处理器版本和判定结果必须可追踪；扫描服务不可用时对象保持不可用。`BOUND` 只表示关联里程碑，禁止先标记 `AVAILABLE` 或允许正式 Record 提交后再补扫。

### 5.4 缩略图与元数据

- 原始对象和派生缩略图使用不同内部 key，并都继承同一 organization/owner/Record 授权。
- 缩略图必须由受控解码器重新编码，移除不需要的 EXIF/容器 metadata，不复用客户端上传的“缩略图”作为可信派生物。
- ADR-029 未批准位置收集前，不得把 EXIF GPS 提取为业务位置字段或日志标签；展示派生物不得暴露位置 metadata。
- 是否规范化/保留原始证据中的位置 metadata 需隐私/证据保留决策；确认前原始对象仅在严格授权下保存和访问。
- 缩略图失败不得让 MediaEvidence 错误进入 `AVAILABLE`；状态机应能区分重试处理与最终失败。

### 5.5 访问控制和临时 URL

- 访问前按当前 User、organization、本人/教学班、Record 状态和字段投影重新授权；知道 mediaId/storageKey 不是授权。
- signed URL 必须短期、最小权限、只读并绑定单对象；具体 TTL 待 ADR-023。URL 不得写普通日志、AuditLog metadata、通知正文或分析事件。
- 学生只访问本人媒体；教师只访问本人负责教学班 Record；管理员不因角色默认获得日常浏览原始媒体能力。
- 下载响应设置适当的私有缓存和内容处置策略；不得让公共 CDN 永久缓存。具体代理/CDN 架构待技术选型。
- 每次高敏原始媒体访问应产生安全审计或受控访问事件，且不记录文件正文。

### 5.6 孤立文件、失败对象和删除

| 对象状态 | 清理前提 | 统一动作 |
|---|---|---|
| 未确认上传 | 超过批准的 upload TTL，且存储无成功确认 | 幂等标记失败/过期；若对象存在则进入隔离清理 |
| 已上传未绑定 | 超过批准 orphan TTL、无活跃草稿/Session、无 legal hold | 先标记候选，二次核对引用，再删原件和派生物 |
| FAILED | 扫描/解码失败且重试策略结束 | 隔离；按安全策略删除，不允许访问或绑定 |
| 已绑定 | 关联 Record/Review/申诉/保留期仍有效 | 禁止普通清理，即使客户端删除本地文件 |
| DELETED | 已获批准且对象存储原件/缩略图删除确认 | 保留 MediaEvidence tombstone、审计和不可逆删除结果 |

清理任务必须支持 dry-run、分批、幂等、引用二次核验、失败重试和审计。媒体保留期、upload/signed URL/orphan TTL、扫描方案及删除等待期均受 ADR-023/032/040 阻塞，本文不填数值。

## 6. 数据库迁移规范

### 6.1 基本要求

1. 所有 schema、索引、约束和生产数据修正必须通过版本化 migration；禁止手工连接 production 执行 DDL/DML。
2. Migration 与使用它的应用代码统一存放在根仓库 `backend/`，具有不可变 ID、checksum、作者/原因、兼容版本和执行记录。
3. 同一环境只能有一个 migration runner 持有迁移锁；应用实例不得并发“自动猜测建表”。
4. migration 必须可重复验证、不可重复副作用、失败可诊断；数据 backfill 必须有 checkpoint、批次边界和重入能力。
5. production 执行前必须在 staging 的 production-like schema/数据规模上验证锁、耗时、容量、回滚和应用兼容性。
6. 事务 DDL、索引、约束验证和锁语义以 PostgreSQL 18 为唯一基线；Prisma 无法表达的关键约束必须写入受版本控制的 SQL migration 并集成测试。

### 6.2 Expand–Migrate–Contract

```mermaid
flowchart LR
    A["Preflight: backup, compatibility, capacity"] --> B["Expand: additive nullable schema and indexes"]
    B --> C["Deploy compatibility code: old read plus dual write"]
    C --> D["Backfill: bounded idempotent batches"]
    D --> E["Verify: counts, constraints, parity, audit"]
    E --> F["Cut over reads and stop legacy writes"]
    F --> G["Observe through approved rollback window"]
    G --> H["Contract: remove old field in later migration"]
```

| 阶段 | 必须满足的门槛 |
|---|---|
| Preflight | PostgreSQL 18/Prisma 基线明确；ADR-074 的兼容范围和 contract gate 已批准；变更单和 owner；备份可用且最近恢复验证不过期；容量/锁评估；兼容和回退方案 |
| Expand | 先加新表/新列/新索引/新约束能力；旧版本应用仍能运行；新增必填列先允许空或有真实可证明的安全值，禁止虚构默认数据 |
| Compatibility | 应用能读取旧/新结构；双写由共享 repository/service 实现，禁止业务模块各写一份；每次双写可对账 |
| Backfill | 按内部 ID 稳定排序分批；记录 high-water mark；可暂停/重入；异常行隔离并报告，不静默猜测 ID/枚举/时区 |
| Verify | 行数、null、唯一/FK、分类汇总、采样详情、源/目标 hash、性能和权限全部通过；验证脚本版本化 |
| Cutover | 先切读，再停止旧写；feature/config 切换可回退且不绕过安全；监控旧字段访问和错误 |
| Observe | 覆盖已批准客户端兼容/回退窗口；无旧客户端/任务/报表依赖证据；备份仍可恢复 |
| Contract | 另一个明确 migration 删除旧列/索引/表；高风险操作单独审批；删除前再次 dry-run 和依赖扫描 |

旧字段统一经历“新增 → 双写 → backfill → 校验 → 切读 → 停旧写 → 观察 → 删除”。不得把 add/drop 和只支持新 schema 的应用放在同一不可回退发布步骤。

### 6.3 破坏性和数据修复 migration

- DROP、缩窄类型、重命名、NOT NULL、重建大索引、批量删除和不可逆数据转换一律视为破坏性。
- 破坏性 migration 必须有影响行数、锁风险、预计额外空间、客户端依赖、数据导出/备份、恢复步骤和 stop condition；具体阈值不在本文编造。
- 身份 ID、学号、Course/ClassSection、RosterEntry/Enrollment、Session/Record、Review 历史的迁移不得靠姓名、字符串强转或客户端默认值自动猜测。
- 无法映射的旧数据进入隔离/异常表并保留源引用；业务方确认后通过新的版本化 migration 修复。
- “down migration”不能被假定总是安全。若回滚会丢新数据，优先 roll-forward；恢复备份属于受控灾难恢复，不是日常 schema 回退。
- Emergency 也禁止交互式手工改 production 数据；使用经过审批、可审计、可 dry-run、可重入的 migration 或运维 job。

### 6.4 发布顺序与运行保护

- 应用启动时验证 schema compatibility range，不匹配则 fail fast；不得自动在请求线程执行 migration。
- Migration runner 使用独立最小权限身份；普通应用账号不拥有 schema change 或全库删除权限。
- 执行期间记录 migrationId、checksum、应用版本、actor、request/change reference、开始/结束、结果和错误码，不记录敏感行内容。
- 迁移失败触发停止继续发布；不得跳过失败版本或手工标记成功。
- 大 backfill 需限速、可暂停、监控 PostgreSQL replication/锁/容量；production 阈值和责任人仍由 ADR-071/073 冻结。

## 7. 软删除规范（含禁止删除与恢复）

### 7.1 统一对象策略

| 对象类别 | 普通软删除 | 普通物理删除 | 恢复语义 |
|---|---|---|---|
| User、Student/Teacher/AdminProfile | 有限：优先 status 禁用；经获批注销流程可写 deletedAt | 禁止，直到 ADR-032 retention/匿名化获批 | 仅未清理且唯一键无冲突时，经授权恢复并审计 |
| Course | 仅未被任何 ClassSection/历史引用的误建定义可软删；通常停用 | 禁止级联删除 | 可恢复未清理定义，需重新校验 courseCode |
| Organization、Semester、ClassSection | 禁止；使用 INACTIVE/ARCHIVED/CLOSED | 禁止 | 通过受控状态转换，不清 deletedAt |
| Enrollment | 禁止；使用 WITHDRAWN/REMOVED | 禁止 | 仅状态机 REJOIN/RESTORE，历史不删除 |
| RosterImport、RosterEntry、AlignmentResult | 禁止；版本取代/处置保留 | 禁止 | 新导入/新对齐修正，不改旧事实 |
| ExerciseSession、ExerciseRecord | 禁止；使用 CANCELLED/EXPIRED/审核结果 | 禁止 | 终态不恢复；错误通过新流程和审计修正 |
| ReviewRecord、ScoreAdjustment、ScoreContribution | 禁止，append-only | 禁止 | 用后续 Review/反向 Adjustment/新计算 revision 更正 |
| ScoreRule、StudentScore | 禁止；规则版本取代、成绩状态锁定 | 禁止 | 新规则版本/受控重算，不覆盖来源历史 |
| AuditLog | 禁止 | 普通业务 API 永久禁止 | 不允许恢复概念；更正写新日志 |
| MediaEvidence | 可进入 DELETED/tombstone；须通过 retention、引用和 legal hold 校验 | 仅后台清理可删除对象存储二进制；数据库 tombstone 保留 | 二进制删除前可取消候选；确认物理删除后不承诺恢复 |
| 官方名单源文件 | 元数据/Entry 不删；二进制按独立名单 retention | 受 ADR-045 阻塞 | 取决于备份和已批准策略，不使用媒体 TTL |

### 7.2 删除流程

1. 重新认证并校验专用权限、organization、资源状态、expectedVersion 和明确原因。
2. 查询全部直接/间接引用、审计/申诉/legal hold、保留期及备份策略。
3. 生成 dry-run 清单和不可恢复影响；高风险操作执行二次确认/审批（审批模型待确认）。
4. 在数据库中先写状态/tombstone和 outbox，不直接在请求事务中静默级联对象存储。
5. 后台 worker 幂等删除二进制/派生物，核验结果，更新删除完成状态并写 AuditLog。
6. 删除失败保持可重试状态并告警；禁止数据库显示已完全删除但对象仍公开。

管理员“全量清理”仍受 ADR-024/032 阻塞，不进入普通 Web API。任何未来实现都必须是受审批的离线 runbook，并满足备份、legal hold、双人控制是否启用等待决策。

## 8. 审计规范

### 8.1 AuditLog 与其他日志的边界

| 类型 | 用途 | 可否修改/删除 | 是否承载业务最终状态 |
|---|---|---|---|
| AuditLog | 谁以什么权限对什么资源执行什么命令及结果 | append-only；普通 API 不可改删 | 否；只记录操作证据 |
| ReviewRecord / ScoreAdjustment / Contribution | 审核、人工调分、计算来源的领域事实 | append-only | 是，各自领域的事实 |
| 应用结构化日志 | 运行诊断、性能和错误排查 | 按日志 retention 管理 | 否 |
| 安全事件日志 | 登录失败、Token reuse、越权、恶意文件等检测 | 受限访问和独立 retention | 否，但可触发安全响应 |

### 8.2 必须审计的事件

- 官方名单：上传/导入、版本切换、对齐、确认/忽略/重开、导出和源文件删除。
- Enrollment/入班关系：直接加入、手工加入、退出、移除学生、恢复学生、修改入班关系、冲突拒绝和来源变化。
- Record/Review：提交/撤回、认领并审核打卡、VALID/INVALID、修改审核结果、批量审核和内部备注访问。
- Score：修改成绩规则（创建/发布/取代）、重算、人工调整成绩、发布成绩、锁定和归档修正。
- 权限和认证：用户禁用/恢复、修改教师权限或教学责任、强制退出、密码/联系方式恢复、Refresh reuse、安全策略改变。
- 媒体：上传确认、扫描失败、绑定、原件访问、删除和孤立清理。
- 数据与运维：migration、重要配置/系统模式、批量导出、删除重要数据、备份、恢复演练和 production break-glass。

### 8.3 审计字段和写入保证

AuditLog 至少保存：`id`、`organizationId`、`actorUserId`（系统可空）、`actorRoleSnapshot`、`permissionId/action`、`targetType/targetId`、`requestId`、幂等 key 的不可逆摘要或安全引用、`outcome`、`reasonCode`、经 allowlist 的变更摘要、可信来源摘要和 `occurredAt`。

- 不保存 Token、验证码、密码/哈希、完整联系方式、完整学号、媒体内容/存储键/signed URL、原始名单行、Review internalNote 正文或完整请求/响应。
- 变更前后 diff 必须字段 allowlist、脱敏并限制大小；对象引用使用内部 ID，不用姓名。
- 关键业务状态、领域历史、AuditLog 写入请求应在同一事务，或将 AuditLog/outbox 意图同事务持久化。无法保证审计的关键写入必须 fail closed。
- AuditLog 写入失败不得被 catch 后仅打印普通日志继续成功。
- 审计读取、导出和任何运维保留操作本身也要审计。
- 防篡改存储、hash chain/WORM、审计保留期和独立归档技术待 ADR-073。

## 9. 并发控制

### 9.1 统一工具

1. **乐观锁**：所有可变聚合使用整数 `version`；写命令提交 `expectedVersion`，不匹配返回统一版本冲突，不静默 last-write-wins。
2. **唯一约束**：负责事实唯一性，例如一 Session 一 Record、同日一次学生提交、同学期一条 ACTIVE Enrollment；应用预检查不能替代数据库约束。
3. **短事务/必要行锁**：需要原子检查并创建时锁定最小资源，不在事务中等待对象存储、邮件或视频处理。
4. **幂等 key**：解决网络重试和重复点击；不替代状态机、权限、version 或唯一约束。
5. **Outbox + 幂等消费者**：事务后通知、重算、媒体处理可至少一次投递，但业务副作用按 eventId 去重。
6. **可重算派生结果**：StudentScore 以 sourceFingerprint 和 calculationRevision 防止过期计算覆盖新事实。

### 9.2 必须处理的并发场景

| 场景 | 竞争风险 | 统一处理 |
|---|---|---|
| 两个教师同时审核同一 Record | 两条审核覆盖/版本跳跃 | 校验当前教学责任、record expectedVersion 和 latest reviewVersion；事务内追加唯一下一版本；一方成功，另一方版本冲突后重读，不 UPDATE 旧 Review |
| 学生重复创建/提交 | 多 Record、多通知、重复占用每日次数 | Idempotency-Key + `sessionId` 唯一 + 每日条件唯一 + 状态守卫；相同 key 重放，其他 key 返回既有资源或明确冲突 |
| 同一学生两设备同时运动 | 两个活动 Session、累计双算 | 按 student/enrollment 建“最多一个非终态 Session”强约束；START 原子竞争；第二设备拒绝并返回恢复已有会话的安全投影；heartbeat/接管阈值待 ADR-021 |
| Review 更新与成绩计算同时发生 | 旧审核结果覆盖新成绩 | Review 事务写历史 + recalc outbox；计算读取一致来源快照，生成 sourceFingerprint；CAS 写 StudentScore，若来源/version 改变则丢弃过期结果并以同 event key 重试 |
| 成绩发布与重算同时发生 | 发布过期 revision | 发布锁定 expectedVersion、最新 calculationRevision、完整性状态；过期重算不得覆盖 PUBLISHED/LOCKED，必须走状态机 |
| 名单导入与扫码入班同时发生 | Import 快照漏新成员或静默覆盖 Enrollment | 两者写各自事实；Enrollment 唯一约束独立生效；Import 固定 roster version 和 platform snapshot version；完成后对齐任务检测版本变化并安全重跑，不让名单直接改 Enrollment |
| 媒体处理与 Record 提交同时发生 | 提交引用未验证文件或错误冻结绑定 | confirm/bind/processing 幂等推进状态；submit 事务锁/校验 Media `AVAILABLE`、owner、同 Session/Record 和既有唯一绑定，再原子冻结关联；处理未完成则拒绝提交，不轮询后猜成功（ADR-058） |
| 用户禁用与敏感写同时发生 | 已认证请求在禁用后提交 | 敏感事务提交前重检 User/session/tokenVersion；禁用事务撤销会话并使并发写 version/授权失败 |
| migration 与旧应用写入 | 新旧 schema 双写不一致 | Expand-contract；发布兼容范围；migration 锁；旧字段删除前证明无旧 writer |

批量审核沿用既有 API 契约的“批请求可部分成功、逐项返回”语义：每项独立授权、校验 version、提交领域历史/审计/outbox；失败项不留半成品。同一批级幂等 key 重放第一次完整批次结果，禁止在重放中静默只重做失败项；用户明确重试失败项时必须发起新的批命令。

## 10. 环境配置

### 10.1 环境矩阵

| 环境 | 用途 | 数据 | 外部服务 | 安全边界 |
|---|---|---|---|---|
| `local` | 单开发者开发/调试 | 纯合成或本机 fixture，可随时重建 | 本地 fake/sandbox | 不连接 production；调试能力显著标识；本地 secret 不提交 |
| `development` | 团队共享集成 | 合成/匿名测试数据 | 独立 non-prod sandbox | 独立 DB/bucket/key；允许较详细日志但仍禁止秘密/真实 PII |
| `test` | 自动化测试和 CI | 每次测试隔离、确定性 fixture | fake/emulator；禁止真实通知 | 短生命周期、最小凭据、并行测试 namespace 隔离 |
| `staging` | 发布前 production-like 验证、migration/恢复演练 | 合成或批准的不可逆匿名数据 | 独立 staging 实例 | 配置形态贴近 production，但绝不共享 production DB/bucket/signing key |
| `production` | 真实业务 | 经批准的真实数据 | 生产依赖 | 最小权限、审批变更、强审计、禁止 Mock/debug fallback |

production 数据禁止直接复制到 local/development/test/staging。确需复现时必须经过批准、不可逆匿名化、字段最小化和审计；数据库 snapshot “只改姓名”不构成匿名化。

### 10.2 配置分类

统一配置 schema 至少覆盖：

- `APP_ENV`、服务名/版本、监听和可信代理边界；
- 数据库连接、pool、migration compatibility；
- Token issuer/audience/signing key reference、Access/Refresh 时长、session/revocation参数；
- 幂等 retention/lease、队列/outbox 参数；
- 对象存储 endpoint/region/bucket/credential reference、上传/访问 TTL、大小/MIME/扫描/清理参数；
- 邮件/Push sandbox 与生产凭据；
- 日志、trace、metrics、错误追踪、采样和告警路由；
- 加密/key reference、备份目标和恢复配置；
- 业务已批准的 system mode/feature rollout，但 feature flag 不能绕过权限和状态机。

### 10.3 配置与密钥规则

1. 配置必须经 schema 校验；staging/production 缺少、格式错误、使用占位符或出现未知安全枚举时启动失败。
2. `.env.example` 只含变量名和无效占位符；真实 `.env`、证书、key、service-account 文件不进入 Git、镜像 layer 或制品。
3. production secret 通过独立评审的 secret manager/workload identity 注入；具体产品仍待 Production Gate，不允许以“暂时方便”为由硬编码。
4. 每环境独立密钥和凭据；最小权限；支持轮换和撤销。轮换不得要求同时重启所有服务或让旧 Token 无限有效。
5. 配置输出、health endpoint 和错误页只显示是否配置/版本引用，不回显 secret、DSN、bucket key 或签名材料。
6. Mock 由显式模式和独立启动配置开启；真实模式依赖失败必须失败，禁止静默切到浏览器/内存 Mock（ADR-036）。
7. production 配置变更必须版本化、审批、审计、可回退；不能通过直接登录服务器编辑源码文件成为唯一记录。

## 11. 日志与监控（结构化日志和可观测性）

### 11.1 requestId 与 trace

- 网关接受符合格式的外部 requestId 或生成新值；不可信值需净化，内部所有服务、outbox、job、AuditLog 和错误 envelope 传播同一 requestId。
- 分布式 trace 使用 traceId/spanId；禁止把 Token、学号、联系方式、媒体 ID/URL 或自由文本放进 baggage/高基数标签。
- HTTP 日志使用 route template，不记录含真实 ID/query secret 的原始 URL。

### 11.2 普通应用日志 schema

结构化 JSON 日志至少包含：`timestamp`、`level`、`service`、`serviceVersion`、`environment`、`eventName`、`requestId`、可选 trace/span、HTTP method/route/status、`durationMs`、稳定 `errorCode`、结果和安全脱敏后的诊断字段。

| 级别 | 用途 | 约束 |
|---|---|---|
| DEBUG | local/dev 临时诊断 | production 默认关闭；仍不得记录秘密/PII/请求 body |
| INFO | 服务启动、请求摘要、job 生命周期、状态计数 | 低基数、无敏感正文 |
| WARN | 可恢复退化、重试、幂等冲突、未知兼容输入 | 必须有稳定 event/error code，不刷屏 |
| ERROR | 请求/任务失败、依赖异常、审计/outbox失败 | 异常栈先脱敏；不输出 SQL 参数/响应 body |
| FATAL | 安全配置缺失、schema 不兼容、关键依赖不可启动 | 进程 fail fast，不降级到不安全模式 |

审计日志不是普通应用日志；普通日志过期或采样不得影响 AuditLog 保留。AuditLog 也不能被用作全量 debug dump。

### 11.3 普通日志绝对禁止字段

- Authorization、Cookie、Access/Refresh Token、Token hash、验证码、密码、passwordHash、签名 key/secret、完整 DSN。
- `studentNumber`、`employeeNumber`、`fullName`、primaryEmail、历史手机号字段、原始 IP/User-Agent（除独立受控安全流）。
- 原始请求/响应 body、官方名单行/文件、导出内容、Review `internalNote`/自由文本理由、反馈/工单正文。
- 成绩明细/分数、Enrollment 明细列表、媒体二进制、`storageKey`、sourceFileStorageKey、signed/upload URL、checksum。
- SQL 全文及 bind 参数、异常中嵌入的 header/body、secret manager 响应。

普通日志可记录 requestId、route template、HTTP status、duration、稳定错误码、资源类型、计数和必要时内部 ID 的不可逆带密钥摘要。脱敏必须在共享 logger/sanitizer 层执行，不能依赖开发者手工删除。

### 11.4 指标与监控

| 类别 | 必须监控的信号 |
|---|---|
| API | 请求量、成功/错误率、延迟分布、超时、按稳定错误码计数；不以 user/student/media ID 作标签 |
| Authentication | 登录/刷新成功率、禁用用户拒绝、Refresh reuse、安全限流；不暴露账号 |
| Idempotency | 命中、key reuse、in-progress、lease 接管、结果未知和 store 失败 |
| Database | 连接池、查询延迟、锁等待/死锁、约束冲突、migration 状态、容量和备份新鲜度；具体指标随引擎冻结 |
| Session/Record | 活动 Session 数、异常过期、重复提交冲突、每日唯一冲突、outbox lag |
| Media | 上传申请/确认失败、校验/扫描/缩略图失败、处理时长、孤立候选/删除积压、对象存储异常 |
| Review/Score | 审核版本冲突、recalc queue lag、sourceFingerprint 冲突、过期计算丢弃、发布失败 |
| Audit | 审计/outbox 写失败、审计导出/访问异常；关键审计失败需高优先告警 |
| Backup/Restore | 最后成功备份、校验失败、复制/保留异常、最近恢复演练结果 |

SLO、慢请求阈值、告警阈值、采样率、日志/trace retention 和 on-call 路由由 ADR-073 批准；未批准前禁止每个模块写不同“慢请求”数值。

### 11.5 健康检查和错误追踪

- liveness 只判断进程是否需重启；readiness 验证必要依赖和 schema compatibility，不能泄露 DSN/凭据。
- 错误追踪 SDK 必须在上传前脱敏；关闭自动抓取 request body/header/cookie 和屏幕内容，除非字段级审核通过。
- 数据库异常记录操作名/错误类别/约束名的安全别名，不记录 SQL 参数。
- 文件异常记录 media 状态、阶段和内部安全摘要，不记录对象键、URL 或内容。

## 12. 数据安全

### 12.1 分层保护

| 隐私级别 | 示例 | 最低要求 |
|---|---|---|
| PUBLIC | 经批准的组织/课程展示字段 | 仍需完整性、输出编码和速率控制 |
| INTERNAL | 内部 ID、状态、规则版本、计数 | 认证、组织范围、禁止公共索引 |
| SENSITIVE | 学号、姓名、Enrollment、Review 结果、成绩 | 最小 projection、访问审计、导出控制、静态/传输保护 |
| HIGHLY_SENSITIVE | 联系方式、认证秘密、媒体、storageKey、名单原始行、internalNote、审计/安全操作日志、IP/UA | 默认不出普通 API/普通日志；专用权限、强审计、加密和严格 retention |

### 12.2 强制控制

- 所有外部和服务间通信使用经批准的加密传输和证书验证；禁止跳过 TLS 验证。具体证书/mesh 技术待选型。
- 数据库、对象存储、备份和敏感队列使用静态加密；密钥与数据分离、最小权限、可轮换。算法/服务待安全 ADR。
- 数据访问先做认证/RBAC，再做 `organizationId`、本人/教学班、对象状态和字段 projection；管理员不自动拥有媒体或教学写权限。
- 数据库访问使用参数化查询/安全 ORM API；禁止字符串拼 SQL。文件路径和对象键由服务端生成，防目录穿越。
- 输入执行 schema allowlist、长度/格式/枚举/内容限制；输出按场景编码，富文本需独立 sanitizer。
- 批量接口、导出和搜索需逐项资源授权、结果上限、速率控制、审计和防公式注入；导出文件私有、短期访问。
- CORS 使用明确 origin allowlist；若使用 Cookie 认证还必须 CSRF 防护。安全 header 和 Content Security Policy 随 Web 架构冻结。
- 依赖、容器和构建制品需锁版本、漏洞扫描、SBOM/来源验证及最小运行权限；具体工具待技术栈确认。
- production 数据访问采用最小权限 service identity，管理员/开发者无默认全库读取；break-glass 有时限、原因和审计。
- ADR-029 未批准前不新增位置 API、位置日志字段或从媒体 metadata 派生位置事实。

### 12.3 敏感数据最小化

- API 按角色返回字段投影；学生 API 永不返回 Review internalNote/storageKey（ADR-038）。
- 普通列表不返回完整学号/联系方式/媒体 URL/成绩来源明细，只有业务必要且有权限的专用接口才返回。
- 缓存 key/value、队列 payload、搜索索引和临时文件同样受隐私分级约束，不能因为“不是数据库”而放宽。
- 临时文件使用受限目录/权限并在成功、失败、超时路径清理；路径不进日志。
- Non-production fixture 必须合成且全局一致（ADR-036），不得使用真实学生姓名、学号或媒体。

## 13. 备份和恢复建议

### 13.1 备份范围

备份/可恢复性计划必须覆盖：

- 权威业务数据库、migration history、约束和必要序列/ID 状态；
- AuditLog、outbox/关键 job 状态和幂等记录中仍处保留期的必要数据；
- 对象存储原件、缩略图、官方名单源文件及其数据库 metadata 的一致引用；
- 规则版本、配置 schema、部署 manifest 和 key reference（绝不把明文 secret 打包进普通备份）；
- 恢复所需的版本化应用制品和 runbook。

### 13.2 备份最低要求

1. 自动化、可监控、加密、带完整性校验，并存放在与主系统不同的故障/权限边界；具体供应商待 ADR-071/Production Gate。
2. 备份身份与生产应用身份分离；删除生产数据的凭据不能同时静默删除全部备份。
3. 破坏性 migration、重大规则/权限变更和获批清理前必须有可用恢复点，并验证恢复路径符合变更风险。
4. 备份失败、过期、checksum 异常和复制中断必须告警；“job 成功”不等于数据可恢复。
5. 备份中敏感字段保持原隐私级别；访问、下载、恢复和销毁均审计。
6. 备份 retention 到期删除也需受控、可证明且不违反 legal hold/校方保留承诺。

备份频率、point-in-time 能力、保留层级、跨区域/跨账号策略、RPO、RTO 和恢复演练周期均待 ADR-071 批准，本文不写示例数字。

### 13.3 恢复流程

1. 宣布事件、冻结非必要写入，记录事件和恢复负责人；不得直接覆盖唯一生产副本。
2. 选择满足已批准 RPO 的恢复点，验证 backup checksum、加密 key 可用和应用/schema compatibility。
3. 先恢复到隔离环境，运行 migration compatibility、表/行/约束、AuditLog/Contribution 链、对象引用和权限完整性检查。
4. 恢复/对账对象存储，检查数据库 MediaEvidence/名单源文件与原件/缩略图是否缺失、孤立或版本不一致。
5. 执行认证、直接入班、Session→Record→Review→Score、媒体访问和审计写入的最小 smoke；使用合成测试身份，不暴露真实数据。
6. 经双重确认后受控切流；监控错误、延迟、队列和安全事件；保留旧环境直到回退窗口结束。
7. 记录实际数据损失窗口、恢复耗时、手工步骤和差异；修订 runbook、告警和 ADR。

### 13.4 恢复演练

- Staging 定期执行完整恢复演练，且使用与 production 相同的自动化步骤和受控 key 流程；频率待 ADR-071。
- 每次重大数据库/对象存储/加密变更后重新验证恢复，不沿用过期证明。
- 演练报告至少包含 backup ID/时间、schema/app 版本、恢复环境、检查项、失败/人工步骤和是否达到已批准目标。
- 从未做过恢复验证的备份不能被标记为“可恢复”。

## 14. 待确认决策与上线阻塞

### 14.1 已登记 ADR

| ADR | 待确认内容 | 未确认时的工程边界 |
|---|---|---|
| ADR-021 | 服务端可信计时、heartbeat、时钟偏差、双设备接管 | 不编造阈值；未知区间不计事实时长；只允许一个非终态 Session |
| ADR-022 | Access/Refresh 时长、撤销传播、多设备、密码变化后的会话 | 所有参数无默认；production 必须显式阻塞配置；先具备可撤销 session 能力 |
| ADR-023 | 存储/扫描、文件大小、MIME、上传/访问/orphan TTL、媒体 retention | 只冻结私有和校验流程；不采用 Android 示例大小或供应商默认 |
| ADR-024 / ADR-032 | 全量清理、教学/成绩/媒体 retention | 普通 API 不物理删除核心事实，不实现全量 purge |
| ADR-025 / ADR-075 / ADR-086 / ADR-087 | 后端路径、PostgreSQL 18、S3 Port/MinIO、UUIDv7 与枚举物理策略 | Foundation 可建立空库 migration；仍不得声称生产备份、媒体或业务模块已就绪 |
| ADR-028 / ADR-080 / ADR-088 / ADR-093 / ADR-094 | 学生无密码/联系方式可空、Join Capability、Foundation Auth、专用 escrow、Enrollment 生命周期 | Stage 12 已实现无密码学生 QR Join 与 AuthSession/RefreshToken；V1 仍不实现学生密码登录，学生 withdraw/rejoin 按 ADR-054 default deny |
| ADR-029 / ADR-030 / ADR-040 | GPS、各用途 captureSource、媒体草稿 | 不新增位置事实；capture/草稿只按已批准最小能力处理 |
| ADR-045 | 官方名单文件/原始行 retention | 不沿用打卡媒体 TTL；源文件始终私有 |
| ADR-047 | 教师是否可覆盖折算时长 | override 未批准前为空，不能通过 Review API 写 |
| ADR-058 / ADR-060 / ADR-066 | 提交媒体可用性、绑定后重绑/删除、正常打卡媒体数量和来源 | 提交只接受全部 `AVAILABLE`；已绑定媒体禁止重绑；正常打卡执行已批准的 1..6 图 + 0..1 视频与 App 内拍摄规则 |
| ADR-063 / ADR-064 / ADR-065 | 服务端时间/双设备最低裁决、每日唯一、不足一小时提交 | 服务端事实优先；每学生最多一个活动 Session；服务端执行每日唯一和提交边界 |

### 14.2 本阶段登记的新增 ADR

以下事项已写入 `decision-log.md`，当前均为 `PROPOSED`；登记不等于批准，相关 production 能力仍保持阻塞。

| ADR | 决策范围 | 未批准时的保守边界 |
|---|---|---|
| ADR-070 | 统一幂等共享存储、完成/失败状态、lease、按操作 retention、敏感响应保护和临时凭证重放 | 不使用进程内缓存或隐式 TTL，不声称写命令具备生产级故障恢复 |
| ADR-071 | 数据库/对象存储 RPO、RTO、备份频率/层级、隔离位置、演练周期和负责人 | 不声称已有备份满足恢复目标，不以未经恢复验证的 job 作为上线证据 |
| ADR-072 | production issuer/audience、签名 key 托管轮换、Web 传输和撤销传播 SLO | Foundation 按 ADR-088 使用 Argon2id + 非对称 JOSE；不写 production key/时长默认，不声称生产认证就绪 |
| ADR-073 | AuditLog 防篡改、审计/安全/应用日志 retention、访问审批、SLO/阈值/告警和 on-call | 不清理原始 AuditLog，不编造慢请求或告警阈值 |
| ADR-074 | 支持版本窗口、旧字段访问证据、contract 观察期、production migration 审批和 stop/rollback owner | 不执行破坏性 contract migration，不把旧 writer 未知视为已归零 |

### 14.3 Production 启动阻塞清单

以下任一缺失时不得以默认值启动 production：

- production 数据库身份、对象存储供应商/隔离、secret 注入和 deployment 运行基线；
- ADR-022/072 的 Token 签名 key、issuer/audience、已批准 Access/Refresh/session 参数和撤销存储；
- ADR-070 的幂等共享存储、retention/lease 和结果恢复语义；
- 私有 media storage、大小/MIME/扫描/TTL/retention 及清理 job；
- production secret 注入、最小权限 identity、AuditLog/outbox 和 redaction 验证；
- ADR-074 的 migration history/compatibility/contract gate；
- ADR-071 的可用备份、获批 RPO/RTO 及实际恢复验证；
- ADR-073 的监控、关键告警、事件响应和获批 SLO/on-call 路由。

## 15. 完成性检查表

- [x] Access/Refresh、刷新、退出、禁用、密码变化、多设备及未决 Token 参数已分开说明。
- [x] UTC、RFC3339、组织业务日期、服务端可信时间和整数秒已统一。
- [x] 所有指定操作使用同一 Idempotency-Key 机制，明确 scope、request hash、保存状态、重放、冲突、进行中和未知结果语义；具体 retention 未编造。
- [x] 媒体默认 private，覆盖上传凭证、服务端 MIME/内容校验、恶意文件、缩略图、临时访问、孤立清理和删除；正常打卡数量/来源与 ADR-066 一致。
- [x] Migration 使用可追踪 expand–migrate–contract，禁止手工修改 production。
- [x] 软删除、禁止删除、恢复、对象存储联动和核心事实保留已逐类说明。
- [x] 名单、Enrollment、Review、Score、权限、删除等关键动作均进入 append-only AuditLog，且与领域历史分离。
- [x] 两教师审核、重复提交、双设备运动、Review/Score、Import/Join 和 Media/Submit 并发均有统一控制。
- [x] local/development/test/staging/production 数据、依赖、密钥和 Mock 边界已区分。
- [x] requestId、结构化日志、级别、错误/慢请求/DB/上传监控和审计边界已统一；敏感字段禁止进入普通日志。
- [x] 数据分级、最小授权、密钥、传输/静态保护、Non-production 数据规则已覆盖。
- [x] 备份范围、加密/隔离、恢复流程、演练和待决 RPO/RTO 已覆盖。
- [x] 未选择数据库、对象存储、扫描、secret manager 或备份供应商，未填写未获批准的 Token/媒体/TTL/retention 数值。

## 14. Stage 18 Score 工程冻结（2026-08-04）

- 规则激活、重算、发布和 Adjustment 审批必须在 PostgreSQL transaction 内共同写领域历史、AuditLog 与 Outbox；通知失败不回滚已提交事实。
- 重算使用持久化 attempt/outbox、唯一 source fingerprint 与有界重试；相同 Enrollment、Rule 版本和输入必须幂等复用修订。
- ScoreRule approval、ScoreAdjustment approval、Contribution、Revision 与 Publication history append-only；数据库 trigger 防普通 UPDATE/DELETE。
- 日志不得包含学生完整身份、Adjustment evidenceReference、内部理由、Contribution 明细、Token、Secret 或数据库连接串。
- Stage 18 数据库只能新增 `0009_score`；0001–0008 checksum 不得变化。Docker 以 PostgreSQL 18.4 空卷首次/重复部署、drift 0、非 root、重启持久性和 teardown 作为运行 Gate。
