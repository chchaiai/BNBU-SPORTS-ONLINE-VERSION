# 体育打卡统一契约交叉一致性审查

> 审查日期：2026-08-02
> 工作分支：`backend/unified-contracts`
> 客户端代码快照：Android `e4cd2e5a623261cd19cddbd59d5cda7627bf7e98`；Web `a602280b4aa46d3e944671d341a7bf12bacb17cb`
> 审查范围：`docs/backend-contracts/00–08`、`decision-log.md`、`conflict-matrix.md`、`openapi.yaml`、Android 子模块、Web 子模块，以及工作区内可见的后端与数据库文件。

## 0. 最终门控结论

**可以开始后端实现：否。**

阶段 10 不执行。当前目标合同已经统一了大部分核心对象、字段、状态、规则、权限语义、枚举、错误码和传输边界，但还没有满足“只有所有条件同时通过才可实现”的门控：

1. 工作区没有权威后端源码、数据库 schema、migration history、对象存储配置或部署基线，ADR-025 仍为 `PROPOSED`。
2. 内部合同仍有确定性漂移：Review 领取没有持久事实；每日唯一键在 `(enrollmentId,businessDate)` 与 `(studentId,semesterId,businessDate)` 之间冲突；ReviewRecord 的可空性/长度在字典与 OpenAPI 不同；AuditLog 缺少 `permissionId` 与安全幂等引用；媒体 ID/hash 时点、学生可见审核投影、原因码目录及 OpenAPI 独有的 `ExportType` 也没有闭合。
3. 扫码入班的已接受业务语义要求原子返回身份、ACTIVE Enrollment 和登录会话，但 OpenAPI 的 join 继承 Bearer 认证且只返回 Enrollment；预登录 Android 无法按该合同完成首次会话。
4. 权限总原则清楚，但权限矩阵本身没有逐项覆盖 Profile 目录/治理、媒体读取/访问能力和通用 Export 生命周期等 operation；81 个 OpenAPI operation 中又只有 2 个 AuditLog 读取操作带 `x-allowed-roles`。除 3 个公开操作和这 2 个已绑定操作外，剩余 76 个受保护操作不能由合同自动生成或验证角色/资源 scope。
5. 计时、认证、媒体、评分、保留、迁移、备份和审计运行参数仍有高风险 `PROPOSED` ADR。OpenAPI 对其中 16 处已有机器默认拒绝标记，其他能力只有文档级关闭/阻塞说明或仍缺 gate；任何一种都不等于已批准实现方案。
6. Android 仍使用旧接口和旧 DTO；教师/管理 Web 仍以组件内状态、浏览器 Mock 和本地计算为主；iOS 与 Web 学生端源码缺失。兼容窗口、遥测和切换门槛尚无可执行基线。

“否”不代表前八阶段无效。它表示可以继续做决策、提供权威源码/数据库、修复合同缺口和制定迁移计划，但不得创建数据库迁移或业务模块来猜测未决答案。

## 1. 审查方法与证据口径

### 1.1 判定口径

- **通过**：当前目标文档和机器合同一致，且没有发现阻塞该项实现的内部矛盾。
- **部分通过**：业务语义已经确定，但缺少机器绑定、持久字段、运行参数或实际实现证据。
- **未通过**：存在会产生不同数据含义、越权、不可追溯或无法迁移的真实冲突。
- **无法验证**：所需源码、数据库或环境不在当前工作区；不把说明文档、远端地址或 Mock 当实现证据。
- “推荐方案”只是供业务/技术决策者选择；在 ADR 变为 `ACCEPTED` 前，继续采用各阶段文档已经声明的默认拒绝或不实现边界。

### 1.2 当前证据快照

| 证据 | 当前事实 | 审查含义 |
|---|---|---|
| 根工作区 | 只有统一合同、三份业务流程文档和两个客户端 Git 子模块 | 没有可供阶段 10 延续的权威服务端技术栈 |
| Android | Kotlin/Compose 客户端；手写 endpoint、DTO、repository；同时有真实 API 分支和 Mock | 可审查迁移差异，不能证明远端服务符合新合同 |
| Web | React/TypeScript 教师与管理员界面；教师主要为组件内状态，管理员为 localStorage Mock，名单对齐为 sessionStorage Mock adapter | UI 能力不等于服务端写入、授权或持久化能力 |
| iOS | 无源码 | 无法生成文件级迁移清单或验证数据含义 |
| Web 学生端 | 无源码 | 无法生成文件级迁移清单或验证数据含义 |
| 后端 | 无服务端源码、服务端依赖清单或业务路由实现 | 语言、框架、ORM、认证实现和分层均未知 |
| 数据库 | 无 SQL、schema、migration、seed 或生产 dump；Web D1 schema 为空 | 引擎、版本、主外键、索引、历史数据和迁移路径均未知 |

### 1.3 自动与人工核对结果

| 检查 | 结果 |
|---|---|
| OpenAPI 解析与本地 `$ref` | 68 paths、81 operations、197 schemas、1184 references；0 个未解析本地引用 |
| operationId 与路径参数 | 81 个 operationId 唯一；路径参数均有必填定义；每个操作均有成功和错误响应 |
| 枚举 | 07 已登记的 28 个类型、127 个值与 OpenAPI 同名 schema 逐类型、逐顺序一致；但 OpenAPI 另有未登记的 `ExportType` 4 值。4 处 inline enum 中 2 处是 ReviewResult 合法写子集、2 处是独立 transport constraint，不是新增业务类型 |
| 错误码 | 文档 142 个标准错误码与 `ErrorCode` schema 内容、顺序一致；阶段 3–6 旧错误码无残留；但非打卡 media purpose 与原因码未冻结写入尚无精确 operation gate |
| 默认拒绝绑定 | 16 个 `x-default-deny-error` / `x-field-deny-error` 均为登记错误码，operation 均包含相应 HTTP 状态 |
| OpenAPI linter | Redocly OAS 3.1 校验有效；6 条非阻塞 warning：缺少未获确认的 license，以及 5 个保留但暂未引用的基线 schema |
| 文档结构 | 00–08、decision log、冲突矩阵的 Markdown 表格、代码围栏和尾随空白检查通过 |
| 客户端回归基线 | Android 单元测试、Web typecheck、Web production build 与 25 项测试此前通过；子模块 commit 未变化，因此只证明现有客户端/Mock 自洽 |

## 2. 交叉一致性矩阵

| 检查编号 | 检查项 | 涉及文档/代码 | 检查结果 | 冲突 | 修复方案 | 是否阻塞后端开发 |
|---|---|---|---|---|---|---|
| AUD-01 | 领域对象与字段字典 | `01-domain-model.md`、`02-data-dictionary.md` | 通过：20 个核心对象与 1 个必要支持对象的身份、关系、事实和历史边界已统一 | 无核心对象同义重复 | 实现时从字典生成/校验 persistence model，不从客户端旧类型反推表结构 | 否 |
| AUD-02 | 核心命名唯一性 | 01、02、06、OpenAPI | 通过：内部 `id`、`studentNumber`、`courseId`、`classSectionId`、`enrollmentId`、`sessionId`、`recordId` 已分离 | 客户端仍混用，但目标合同无双名 | 兼容 adapter 显式映射，禁止 `studentNumber` 回填内部 ID | 否；客户端迁移前不能删除旧映射 |
| AUD-03 | 字段字典与 OpenAPI | 02、06、OpenAPI | 部分通过：核心请求/响应字段、长度、可空性和单位已校正 | Review 领取事实缺失，见 AUD-07 | 先决定领取事实属于 ExerciseRecord 字段还是独立 ReviewClaim，再同步 01/02/03/06/OAS | 是：阻塞 claim-review |
| AUD-03A | ReviewRecord 字段精确对齐 | 02 ReviewRecord、OpenAPI ReviewRecord | 未通过：字典允许系统首条 PENDING 的 `teacherId=null`，`reason` 最大 500、`internalNote` 最大 2000；OpenAPI 要求 teacherId 非空，后两者均最大 1000 | 同一持久对象有不同可空性和长度 | 按 append-only 初始 PENDING 语义和字段字典修正 OpenAPI，再运行 codegen/contract test | 是：阻塞 Review schema |
| AUD-03B | 扫码入班认证与成功响应 | ADR-006、06、OpenAPI join、Android pre-login flow | 未通过：已接受规则要求原子返回身份、Enrollment 和登录会话；OpenAPI join 继承 Bearer 且只返回 Enrollment | 未登录学生既拿不到 Bearer，也拿不到成功后的 AuthSession | 冻结 invite/验证挑战安全模型和专用 join envelope；不得把已有登录悄悄改成前置条件 | 是：阻塞 QR Join/Auth |
| AUD-03C | 每日唯一键范围 | ADR-064、01、04 | 未通过：ADR-064/规则为 `(enrollmentId,businessDate)`；领域模型为 `(studentId,semesterId,businessDate)` | 学生同日换班/恢复关系及取消槽位语义会得到不同结果 | 以 `ACCEPTED` ADR-064 为裁决修正 01；ADR-020 仅继续决定 CANCELLED 是否释放槽位 | 是：阻塞 Record 唯一索引 |
| AUD-03D | MediaEvidence 身份与 hash 时点 | 02、06、08、OpenAPI media initiate/confirm | 未通过：申请上传响应已给 `mediaId`，确认语义又像在此时生成正式 mediaId；字典要求服务端确认的 `contentSha256` 非空，OpenAPI MediaEvidence 却允许空且没有区分客户端声明值与服务端验证值 | 可能创建两个媒体身份，或把未验证 hash 当可信事实 | 明确申请阶段预留稳定 mediaId/PENDING_UPLOAD，确认沿用同一 ID；分开 declared 与 verified hash，只有验证值进入正式证据 | 是：阻塞 Media persistence |
| AUD-03E | 审核与调分原因码目录 | 02、07、OpenAPI Review/Adjustment request | 未通过：字典要求受控枚举，07 仅列候选示例，OpenAPI regex 接受任意大写 token，相关 operation 又没有“目录未冻结”的机器 gate | 客户端和服务端可写入彼此未知、无法稳定统计的原因码 | 冻结最小 `ReviewReasonCode`/`ScoreAdjustmentReasonCode` 目录并生成 schema；此前必须补精确 fail-closed gate，不能假设当前已默认拒绝 | 是：阻塞相应 mutation |
| AUD-04 | 枚举与 OpenAPI | `07-enums-and-errors.md`、OpenAPI | 未通过：07 的 28 类、127 值与同名 OAS schema 精确一致，但 OAS 另发布未登记的 `ExportType` 4 值；4 处 inline enum 经核对为 ReviewResult 合法写子集或局部 transport 常量，无值冲突 | “OpenAPI 引用统一枚举”和“未登记候选不得进入 OAS”没有覆盖 ExportType | 通过 DEC-18 单独决定 ExportType 分类目录；若保留则登记到 07、用户可见 i18n 与兼容规则。ADR-053 可继续独立阻塞 ExportJob 持久化/生命周期 | 是：阻塞 Export/生成业务枚举；不阻塞已登记核心 enum |
| AUD-05 | 错误码与规则/API | 03、04、05、06、07、OpenAPI | 部分通过：142 个已登记码、envelope、details 白名单、批量子错误与 HTTP 状态一致；但非打卡 purpose 关闭和原因码未冻结写入没有精确 operation gate | 已发布 EXEMPTION/FEEDBACK 不能误用 `VALIDATION_ENUM_UNSUPPORTED`；已有 Review/Score 错误也没有绑定成“目录未冻结”gate | 收窄 v1 media request；为未冻结原因目录选择精确已有语义或登记新码，并把 gate 绑定到 operation/响应 | 是：阻塞相应 mutation；不阻塞核心已登记错误 |
| AUD-06 | 状态机与 API 动作 | 03、06、OpenAPI | 部分通过：对外核心转换有 operation，系统转换明确由事务/outbox/worker 触发，16 处未决能力有机器 deny marker；但不是所有未决动作都已机器关闭 | claim 副作用无数据模型；join transport 无法完成已接受转换；原因码与非打卡媒体缺精确 gate | 修复 AUD-03B/03E/07/16B 后，再把 operation、状态转换和 deny policy 双向生成测试 | 是：相关动作 |
| AUD-07 | Review 领取持久化 | 02、03、06、OpenAPI `claimExerciseRecordReview` | 未通过：状态机要求记录领取人/时间，请求只有 `expectedVersion`，目标对象无领取字段/实体 | 无法表达 claimant、claimedAt、释放/重领历史和多教师冲突 | 通过新决策选择“Record 上候选字段”“独立 ReviewClaim 历史对象”或“删除领取阶段直接审核” | 是 |
| AUD-08 | 业务规则与状态机 | 03、04 | 部分通过：服务端可信时间、1h/2h 离散抵扣、有效审核才贡献、历史不覆盖已统一 | 每日唯一键在 01 与 ADR-064/04 漂移；公式、分类配额等仍未决 | 先修正 AUD-03C；其余逐项接受 ADR 后再开放相关写/计算操作 | 是 |
| AUD-09 | 权限矩阵语义覆盖 | 05、06、OpenAPI | 未通过：角色、组织/本人/教学关系和默认拒绝总原则清楚，但 05 没有逐项列出 Student/Teacher Profile 目录与治理、Media 读取/bind/access-url、通用 Export lifecycle，以及部分 Session/Record/Review/Score 动作的 permissionId | operation 无法全部映射到唯一权限编号；仅靠相近行推断会扩大或漏掉资源 scope | 逐 operation 建 permissionId/角色/scope/action 对照；公开操作也显式标记 PUBLIC policy，不允许靠章节概括代替 | 是：阻塞完整授权策略 |
| AUD-10 | 权限与 OpenAPI 机器绑定 | 05、OpenAPI | 未通过：3 个操作显式公开；仅 2/81 operation 有 `x-allowed-roles`；其余 76 个受保护操作没有统一 permission/role/scope 扩展 | 代码生成和策略测试无法证明受保护操作的授权覆盖 | 给每个受保护 operation 增加 permission ID、角色、资源 scope 和默认拒绝 metadata，并由测试与 05 双向比对 | 是：阻塞授权中间件/策略生成 |
| AUD-10A | AuditLog 权限与幂等证据字段 | 01、02、05、08、OpenAPI AuditLog | 未通过：05/08 要求稳定 `permissionId`，08 还要求幂等键的不可逆摘要/安全引用；领域概览、字典和 OpenAPI 均遗漏 | 无法证明动作依据哪项权限，也无法安全关联重复 mutation | 加入必填 `permissionId`；另设非秘密安全字段（候选名 `idempotencyKeyReference`），其名称/摘要算法随共享幂等方案冻结，严禁原始 key | 是：阻塞可追责授权/幂等审计 |
| AUD-10B | 学生可见当前审核投影 | 01、02、05、06、OpenAPI ExerciseRecord/ReviewRecord | 未通过：领域与字典要求学生看到当前 result/publicComment；ExerciseRecord 只返回 `currentReviewResult`，完整 ReviewRecord 又含教师 internalNote | 没有既满足学生读回又保证 internalNote 不泄露的机器合同 | 在学生 Record projection 增只读 currentReview，必含 result/publicComment；不得向学生复用完整 ReviewRecord，其他时间字段是否公开另行决定 | 是：阻塞学生审核结果读回 |
| AUD-11 | 时间和时长 | 02、03、04、06、08、OpenAPI | 通过：时间点 RFC3339 带时区，存储 UTC，业务日按组织时区，时长为整数秒 | Android/Web 旧字段仍有毫秒、分钟、小时和 Double | adapter 只做显式换算并保留来源；客户端切换到 seconds 和服务端 businessDate | 否；阻塞客户端直接切换 |
| AUD-12 | OfficialRosterEntry 与 Enrollment | 01–06、OpenAPI | 通过：官方名单事实与真实入班关系分表、分状态、分 API | Web 名单 Mock 仍使用旧路径和旧异常枚举 | 以新 roster import/alignment API 替换 Mock adapter；不让导入直接改 Enrollment | 否；实施受存储/保留 ADR 阻塞 |
| AUD-13 | ExerciseSession、ExerciseRecord 与 ReviewResult | 01–07、OpenAPI | 通过：计时、提交事实、流程状态和审核结果分离 | Android 无服务端 Session；Web 把 `status/auditStatus/approvedHours` 混合 | 先迁移 Session/Record，再迁移 append-only Review；删除客户端权威累计 | 否；完整联调受客户端迁移阻塞 |
| AUD-14 | 成绩可追溯性 | 01–04、OpenAPI | 目标结构通过：StudentScore revision、ScoreContribution、sourceFingerprint、Review/Rule/Adjustment 来源均可追溯 | 具体公式、分类配额、激活审批和部分修正策略未批准 | 先批准 ADR-018/062/069 等；计算器以输入快照生成新 revision，不覆盖已发布版本 | 是：阻塞成绩计算/发布 |
| AUD-15 | 旧教师审核入班逻辑 | 03–06、Android、Web | 通过目标语义：扫码资料校验成功后直接入班，无教师审批状态；当前 Android/Web 引导文案也明确无需教师审批 | 旧 membership/名单 UI 仍可能造成概念误读，但未发现可执行后端审批状态 | 保持 Enrollment 与 roster 异常处置分离；验收时测试“无需教师批准且成员立即可见” | 否 |
| AUD-16 | 工程规范与 API | 06、08、OpenAPI | 部分通过：requestId、幂等、错误、安全、私有媒体、migration、并发和审计边界一致 | 共享幂等、密钥、备份、监控和迁移 gate 参数未批准 | ADR-070–074 接受后落入权威技术栈；此前不写隐式生产默认 | 是：阻塞生产基础设施 |
| AUD-16A | SystemMode 读写守卫合同 | 02 相邻字段、04、07、OpenAPI | 部分通过：枚举和写拒绝错误存在，但 schema 未被引用；没有状态读取/管理 transport 或持久化来源 | Android 依赖旧 health；管理员 UI 有 Mock 模式切换；真实后端来源未知 | 决定 SystemPolicy/MaintenanceAnnouncement scope；至少冻结只读状态 projection 和服务端配置/权限来源 | 是：阻塞生产写守卫的完整验收 |
| AUD-16B | 非打卡媒体用途 | 02、06、07、ADR-030、OpenAPI MediaBusinessPurpose | 未通过：OpenAPI 接受 EXERCISE_RECORD/EXEMPTION/FEEDBACK，却对所有用途强制 sessionId；字典允许后两者无 Session，对应对象尚未建模，且 initiate operation 没有“purpose 尚未开放”的错误码或默认拒绝绑定 | 现有请求无法合法表达相邻用途；`MEDIA_PURPOSE_MISMATCH` 只表示上传用途与绑定目标不一致，不能冒充功能关闭 | v1 请求先收窄为 EXERCISE_RECORD；若保留其他值须登记专用关闭错误和条件 schema，并等待 ADR-030/对应对象 | 是：阻塞非打卡媒体；不阻塞限定用途修复 |
| AUD-17 | Android 与新契约 | Android 子模块、00、01–08 | 未通过：旧 endpoint、旧 Record DTO、客户端时区每日判断、hours/Double、内部 note 暴露和本地 Session 均需迁移 | 同一数据在端与目标合同含义不同 | 先加新 API adapter/DTO 和严格解析；按功能旗标切读，再切写；旧路径有遥测后废弃 | 是：阻塞 Android 联调，不阻塞纯合同修复 |
| AUD-18 | iOS 与新契约 | 工作区、00 | 无法验证：无 iOS 源码 | 无法确认字段、状态、存储和旧接口 | 提供 iOS 仓库/commit，生成同一 OpenAPI client 与文件级迁移清单 | 是：阻塞全端验收 |
| AUD-19 | Web 学生端与新契约 | 工作区、00 | 无法验证：无 Web 学生端源码 | 无法确认是否存在另一套学生数据含义 | 提供仓库/commit；学生端不得复用教师/管理员权限或客户端计算 | 是：阻塞全端验收 |
| AUD-20 | 教师 Web 与新契约 | `teacher-workspace.tsx`、roster service | 未通过：组件内数组、数值 ID、分钟/小时、`approvedHours`、直接改 audit status/累计/成绩，名单为 session Mock | 客户端成为事实裁决者，且无 append-only Review/Score 来源 | 用 OpenAPI 查询/命令替代 setState 业务写；所有汇总由服务端返回 | 是：阻塞教师联调 |
| AUD-21 | 管理 Web 与新契约 | `admin-service.ts`、admin Mock files | 未通过：localStorage Mock、前端硬编码演示密码、物理清理入口和本地错误码不是安全后端 | 演示安全检查可能被误当真实授权/数据治理 | 保留 UI 原型但替换 service；危险动作只调用受控 API；默认关闭 purge 和未决操作 | 是：阻塞管理员联调 |
| AUD-21A | 现有门户能力与 OpenAPI 覆盖 | Web 教师/管理端、02 相邻对象、OpenAPI | 部分通过：打卡核心资源覆盖较广，但无 Semester 管理、完整 User 治理/恢复、耐力测评专用对象，免测/帮助/工单/公告等也只在相邻待模型列表 | 当前门户无法完整接入统一 API，且不得把 UI Mock 类型直接升级为 DB 表 | 先决定本轮后端范围；核心依赖的 Semester/User/SystemMode transport 必须在相应模块前补，非核心相邻能力单独建模 | 是：阻塞完整门户；不阻塞已独立裁决的只读合同修复 |
| AUD-22 | 当前后端与新契约 | 根工作区、子模块 | 无法验证：后端源码未提供 | 无法选择语言/框架/ORM或确认远端 `/api` 行为 | 完成 ADR-025，提供唯一仓库、commit、运行说明、接口/部署版本 | 是：阻塞全部阶段 10 |
| AUD-23 | 当前数据库与领域模型 | 根工作区、Web `db/schema.ts` | 无法验证：无 schema/migration，D1 schema 为空 | 主外键、唯一约束、历史数据和兼容性未知 | 提供引擎/版本、schema dump、migration history、数据量与敏感字段盘点 | 是：阻塞全部 migration |
| AUD-24 | OpenAPI 语法、引用与结构工具校验 | OpenAPI、07 | 通过：OAS 3.1 有效；本地引用、operationId、路径参数、响应、登记枚举/错误码和 deny marker 结构检查通过 | 6 条 warning 不改变 API 结构；语义缺口由 AUD-03–16 单独报告 | license 由实际权利人确认后补；保留 schema 在首次引用时消除 unused warning | 否 |
| AUD-25 | 高风险未决事项 | decision log、08、本报告第 6 节 | 部分通过：37 个 `PROPOSED` ADR 全部显式分组，没有悄悄实现默认值 | 多个事项仍会改变表结构、权限或计算结果 | 按本报告决策顺序批准；每项回写 decision log 和受影响合同 | 是 |
| AUD-26 | 客户端兼容与破坏性删除 | 00、02、06、08 | 部分通过：已定义 adapter/expand-migrate-contract 原则 | 没有真实版本分布、服务端遥测和旧 writer 归零证据 | ADR-074 冻结支持窗口、观察期和 stop/rollback owner 后才删除旧字段/路径 | 是：阻塞 contract migration |

## 3. 关键一致性结论

### 3.1 已统一且可作为后续修复基线的内容

1. `User.id`、Profile ID、`studentNumber`、`employeeNumber` 不再互相替代；所有 API 主外键是最多 64 字符的 opaque string。
2. `Course` 是课程目录，`ClassSection` 是学期内具体教学班，`Enrollment` 是学生真实入班关系。
3. `OfficialRosterEntry` 只是导入事实；名单匹配、确认、修复、忽略不会静默创建、删除或覆盖 Enrollment。
4. `ExerciseSession` 保存服务端可验证的时间事实；`ExerciseRecord` 保存提交快照；`ReviewRecord` 保存 append-only 审核历史。
5. `ExerciseRecordStatus`、`ReviewResult`、`ScoreStatus` 和媒体上传状态为不同维度；API 不再用一个 `status` 混合表示。
6. 所有时间点以 RFC3339 带时区返回，数据库以 UTC 保存；所有业务时长使用非负整数秒；`businessDate` 由组织时区和可信开始时间决定。
7. 服务端按可信 Session 裁决 `0/3600/7200` 抵扣秒数；只有最新有效 ReviewResult 为 VALID 的 Record 才进入成绩来源。每日唯一的目标范围仍需按下节修复文档漂移。
8. ScoreRule、StudentScore、ScoreContribution 和 ScoreAdjustment 允许从最终结果追溯到规则版本、审核记录和贡献来源；客户端不得提交最终总分。
9. 学生只能访问本人资源；教师还必须满足责任教学班 scope；管理员不默认代行教师审核，也不默认读取完整媒体正文。
10. 新 API 已统一 `/api/v1`、Bearer security、Idempotency-Key、requestId、成功/错误 envelope 和 142 个标准错误码；07 已登记的 28 类枚举在 OAS 中同值，额外 ExportType 缺口见 P1-12。

### 3.2 阻塞性内部合同缺口

#### P0-01：Review 领取事实无持久模型

- `03-state-machines.md` 明确 `SUBMITTED -> UNDER_REVIEW` 必须记录领取人和时间。
- `06-api-guidelines.md` 和 OpenAPI 提供 `claim-review` 命令，但请求只有 `expectedVersion`。
- `ExerciseRecord` 字典只有责任 `teacherId`，它不是实际 claimant；`ReviewRecord.teacherId/reviewedAt` 表示已写入的审核历史，也不能表达尚未作出结果的领取。
- 在 ADR-043 的多教师/交接场景下，缺少 claimant、claimedAt、释放/过期/重领语义会造成两个教师同时处理、错误 409 依据不明和无法审计。

必须先在第 6 节 DEC-01 中选择模型，再同步 01、02、03、05、06、07 与 OpenAPI。未决前 `claim-review` 不得实现。

#### P0-02：操作级授权合同不可机器验证

- 权限矩阵已经描述本人、教学班、组织和状态四层总原则，但没有给 Student/Teacher Profile 目录与治理、Media 读取/bind/access-url、通用 Export lifecycle，以及部分 Session/Record/Review/Score 动作逐项分配唯一 permissionId。
- OpenAPI 只有 `GET /audit-logs` 和 `GET /audit-logs/{auditLogId}` 声明 `x-allowed-roles: [ADMIN]`。
- 3 个操作显式声明公开；其余 76 个受 Bearer 保护的操作没有统一 permission/role/scope metadata，也没有描述从 path/body 解析 `organizationId`、student ownership、classSection teaching scope 的机器扩展。
- 只依赖全局 Bearer security 只能证明“需要登录”，不能证明“谁能操作哪个对象”。

实现授权中间件前应先补齐 05 的逐 operation 权限清单，再完成 DEC-02 的机器表达选择，并建立两者与 OpenAPI operation 的双向 contract test。

#### P0-03：每日唯一键的范围不一致

- `ACCEPTED` ADR-064 和 `04-business-rules.md` 要求 `unique(enrollmentId,businessDate)`。
- `01-domain-model.md` 的对象说明和唯一约束表却要求学生来源 `(studentId,semesterId,businessDate)` 条件唯一。
- 两者在同日转班、退出/恢复和历史 Enrollment 场景会产生不同结果；Android 当前又使用设备时区下“全部记录每天一次”的第三套规则。

ADR 的裁决优先级已经明确，因此不需要编造新业务规则：修正 01 与相关 contract test，使其采用 Enrollment scope；ADR-020 只继续决定 CANCELLED 是否释放当日槽位。

#### P0-04：ReviewRecord 字段字典与 OpenAPI 不一致

- 字段字典允许系统创建的首条 PENDING Review `teacherId=null`；OpenAPI 把 `teacherId` 定义为非空并列为 required。
- 字典 `reason` 最大 500、`internalNote` 最大 2000；OpenAPI 两者均为最大 1000。
- 该差异会让数据库、服务端校验和生成客户端对同一合法对象作出不同判断。

应以阶段 2 字典和 append-only 初始 PENDING 规则为准修正 OpenAPI，再重跑 OAS、codegen 和请求/响应 fixture 测试。

#### P0-05：AuditLog 缺少权限与幂等证据字段

- `05-permission-matrix.md` 与阶段 8 工程规范都要求每条关键审计记录保存稳定 `permissionId`。
- 阶段 8 还要求幂等键只以不可逆摘要或内部安全引用进入审计，不能保存原始凭证。
- 领域模型概览、字段字典和 OpenAPI AuditLog 均只有 `action`，没有 `permissionId` 或幂等安全引用。
- action 表示发生了什么，permissionId 表示通过或拒绝了哪项授权，幂等引用关联重复 mutation；三者不能互相替代。

应把 `permissionId` 加入正式字段与安全投影，并与 DEC-02 的 operation metadata 同源；幂等关联应另设非秘密字段，`idempotencyKeyReference` 只是候选名，正式名称/摘要算法须随 DEC-14/ADR-070 冻结，且只保存不可逆摘要或内部引用。

#### P0-06：预登录二维码入班无法按 OpenAPI 完成

- `ACCEPTED` ADR-006 要求资料和邀请校验后，原子创建或返回学生身份、ACTIVE Enrollment 和登录会话。
- Android 当前流程在登录前执行 join，成功后需要 token 才能安装真实 workspace。
- OpenAPI join 没有覆盖全局 Bearer security，因此调用前已经要求登录；成功响应又只有 Enrollment，不返回身份或 AuthSession。

不能把“已有登录”悄悄变成新前置条件。应在 ADR-053 的认证/Invite 生命周期内冻结 invite/验证挑战安全模型，并定义专用 join envelope；详见 DEC-15。

#### P1-07：SystemMode 和核心管理依赖的 transport 不完整

- SystemMode enum 和 503 错误存在，但没有被任何状态 projection 引用，也没有读取/管理 API 或持久化来源；Android 使用旧 health，管理员使用 Mock 状态。
- OpenAPI 没有 Semester 管理以及完整 User 创建、状态治理和恢复接口，ClassSection/管理门户无法完成端到端接入。
- 耐力测评、免测/认证、帮助、工单和公告在阶段 2 明确为相邻待模型能力，当前 UI 存在不代表本轮已建后端合同。

先在 DEC-16 决定“核心打卡最小面”与“现有门户全功能面”的范围；无论范围如何，任何被核心依赖的 Semester/User/SystemMode transport 必须先补合同再实现。

#### P1-08：MediaEvidence 的 ID 和 hash 生命周期不唯一

- 上传申请响应已经返回 `mediaId`，说明身份最迟在申请阶段被预留；确认接口摘要和工程规范又容易被理解为确认时才生成正式 mediaId。
- 字段字典把 `contentSha256` 定义为服务端确认后的非空事实；OpenAPI MediaEvidence 允许它为空，而申请请求中的 hash 只是客户端声明，不能当作服务端验证值。
- 如果申请和确认各生成一次身份，重试与孤立清理会失去稳定关联；如果不区分声明/验证 hash，恶意或损坏文件可能被错误信任。

这是可按现有私有媒体和幂等语义直接修正的合同漂移：申请时预留稳定 mediaId 并创建 PENDING_UPLOAD；确认沿用同一 ID，将声明 hash 与服务端验证 hash 分开，只有验证值可进入正式证据。

#### P1-09：非打卡媒体用途被过早开放

- OpenAPI `MediaBusinessPurpose` 包含 EXERCISE_RECORD、EXEMPTION、FEEDBACK，但统一申请 schema 对所有用途都要求 `sessionId`。
- 字段字典允许免测/反馈媒体没有 ExerciseSession；相应业务对象、所有权、权限和留存规则又尚未建模，ADR-030 仍未批准。
- 一个宽松 enum 加一个不适用的必填字段既不能表达真实数据，也可能让后端猜测归属；现有错误目录又没有“该 purpose 尚未开放”的专用码，`MEDIA_PURPOSE_MISMATCH` 不能替代功能关闭。

在 ADR-030 和对应对象合同获批前，v1 申请 schema 应只允许 EXERCISE_RECORD；若决定保留其余值，必须先登记专用关闭错误。未来应使用按 purpose 区分的条件 schema，而不是允许空洞组合。

#### P1-10：学生没有安全的当前审核结果投影

- 领域模型和字段字典要求学生查看当前 Review result 与 `publicComment`。
- OpenAPI ExerciseRecord 只有 `currentReviewResult`，没有 publicComment/reviewedAt；完整 ReviewRecord 又含 `internalNote`，其历史查询属于责任教师范围。
- 让学生复用完整 ReviewRecord 会泄露教师内部备注；只返回 result 又达不到既定业务可见性。

应在学生可读的 Record projection 增加只读 `currentReview`，已确认的最小字段只有 result 与 publicComment；reviewedAt 等附加字段是否公开须另行按 projection/隐私边界决定。完整 ReviewRecord 与 internalNote 保持教师/管理员受控范围。

#### P1-11：Review 与 ScoreAdjustment 原因码尚未冻结

- 字段字典要求 reasonCode 来自受控 enum；阶段 7 只给出候选示例，并明确不能任意新增。
- OpenAPI 当前用正则接受任意大写 token，因此语法校验通过也不能保证语义目录一致。
- 未知 code 会破坏报表、迁移、国际化和跨端严格解析。

应完成 DEC-17，冻结最小原因码目录并同步 02、07 与 OpenAPI。当前相关 operation 没有对应 deny marker，因此不能声称已默认拒绝；FIX-09-08 必须补精确 fail-closed 错误和机器 gate 后才能开放或安全关闭这些写入。

#### P1-12：OpenAPI 存在未登记的 ExportType

- 07 正式登记 28 类、127 个值，它们与 OpenAPI 同名 schema 精确一致；142 个 ErrorCode 也一致。
- OpenAPI 另外发布 `ExportType = ROSTER_ALIGNMENT/EXERCISE_RECORDS/STUDENT_SCORES/AUDIT_LOGS`，但 07 没有该类型、i18n key 或兼容规则。
- 两处 Review write subset 是正式 ReviewResult 的合法子集，uploadMethod 与 batch item status 是局部 transport 常量；它们没有引入新的业务值，不要求强制纳入 i18n 注册表，但应由 contract test 保持子集/局部约束。

`ExportType` 分类目录应通过 DEC-18 单独决定：保留时补入 07 并纳入精确比对，不保留时从正式闭集移除；无论选择哪项，ADR-053 仍可独立阻塞 ExportJob 持久化、制品和生命周期。不能因 transport 已写入 OAS 就把 4 个值当作已获业务批准。

### 3.3 外部实现与迁移缺口

#### Android

- endpoint 同时使用 `/sport/*`、`/student/*`、`/v1/*` 和 `/courses/{courseId}/join`，没有统一目标资源和版本前缀。
- `SubmitSportRecordRequest` 发送 `courseId`、`hours: Double`、`proofFiles/cosKey`，缺少正式 `sessionId`、`enrollmentId`、mediaId 绑定、`expectedVersion` 与 `clientRequestId`；请求层虽给非 GET 请求加 Idempotency-Key，却每次临时生成 UUID，人工或进程重试不能稳定复用/持久化同一 key。
- `SportRecordResponse` 仍含 `hours`、`proofFiles.url/cosKey` 和 `teacherInternalNote`；这与整数秒、私有媒体和学生不可见 internalNote 冲突。
- 本地 ExerciseSession、设备时区每日判断和 DTO 默认空串/0 会掩盖服务端字段缺失；未知安全状态必须从 fail-open 改为 fail-closed。
- 扫码确认所需 fullName、studentNumber、gender、gradeYear 和“无需教师审批”文案已经接近目标，但 endpoint、认证、返回对象和真实持久化仍需适配。

#### 教师 Web

- `teacher-workspace.tsx` 使用组件内 `initialCourses/Students/Records/Grades` 与 setState 完成审核、补录、累计和发布。
- 当前记录使用 numeric ID、`durationMinutes`、`approvedHours`、中文 credit/status 和 `auditStatus`；教师界面直接改变学生累计小时及已发布成绩。
- `teacherCourses = courses` 没有真实教学责任过滤；UI 角色边界不能替代服务端 scope。
- 名单模块虽然声明 `/api/v1/teacher/courses/...`，实际导出 `mockAdapter` 并写 sessionStorage；路径、枚举和处置模型均需迁移到统一 roster API。

#### 管理 Web

- `admin-service.ts` 从 Mock 初始化并写 localStorage；前端演示密码和清理确认仅是交互，不是认证或授权。
- 本地错误码、学期/账号/成绩规则/清理状态与统一合同并不等价；全量物理清理、Course 写入、ScoreRule 激活等未决动作必须继续关闭。
- 现有 UI 可保留为接入目标，但 service 层必须整体换成后端 API，并根据权限矩阵隐藏或拒绝越界动作。

#### 缺失端、后端与数据库

- iOS 和 Web 学生端无源码，不能验证其缓存、字段、状态、错误码或旧 endpoint。
- 根工作区没有后端；Android 指向远端地址只证明客户端依赖某个 API，不证明其版本、schema 或部署与本合同一致。
- Web Worker 是前端托管层，不是体育业务服务；空 D1 schema 也不是目标数据库实现。

### 3.4 非阻塞告警

1. OpenAPI `info.license` 未填写。权利人和 license 未获确认，不能为消除 warning 编造。
2. `SystemMode`、`ResponseMeta`、`Organization`、`Semester`、`ScoreContribution` 是保留的目标基线 schema，当前没有被 operation 直接引用。首次开放相应 endpoint/projection 时再引用；本阶段不为零 warning 删除合同基线。

## 4. 客户端与实现迁移矩阵

标记只使用：`已一致`、`需要适配`、`需要废弃`、`尚未实现`、`存在阻塞`。其中“需要废弃”表示旧机制不能继续作为业务或安全事实，不表示本阶段直接删除源码。

| 统一项 | Android | iOS | Web 学生端 | 教师端 | 管理端 | 后端 | 数据库 |
|---|---|---|---|---|---|---|---|
| `/api/v1`、envelope、requestId | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 需要适配 | 存在阻塞 | 尚未实现 |
| Access/Refresh、设备会话、撤销 | 需要适配 | 尚未实现 | 尚未实现 | 需要废弃 | 需要废弃 | 存在阻塞 | 存在阻塞 |
| 内部 ID 与 studentNumber/employeeNumber 分离 | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 需要适配 | 尚未实现 | 存在阻塞 |
| User 与三类 Profile | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 需要适配 | 存在阻塞 | 存在阻塞 |
| Course 与 ClassSection 分离 | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 需要适配 | 尚未实现 | 存在阻塞 |
| Enrollment、二维码/邀请码直接入班 | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| 扫码成功直接 ACTIVE、无教师审批 | 已一致 | 尚未实现 | 尚未实现 | 已一致 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| OfficialRosterImport/Entry 与 Alignment | 尚未实现 | 尚未实现 | 尚未实现 | 需要适配 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| 服务端 ExerciseSession 与可信时间 | 需要适配 | 尚未实现 | 尚未实现 | 尚未实现 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| ExerciseRecord 与整数秒/业务日 | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| 私有 MediaEvidence 生命周期 | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| 稳定 mediaId、声明/验证 hash 分离 | 需要适配 | 尚未实现 | 尚未实现 | 尚未实现 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| append-only ReviewResult/ReviewRecord | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| claim-review 领取事实 | 尚未实现 | 尚未实现 | 尚未实现 | 尚未实现 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| Idempotency-Key 稳定复用、clientRequestId、expectedVersion | 需要适配 | 尚未实现 | 尚未实现 | 尚未实现 | 尚未实现 | 存在阻塞 | 存在阻塞 |
| 学生安全 currentReview 投影 | 需要适配 | 尚未实现 | 尚未实现 | 尚未实现 | 尚未实现 | 存在阻塞 | 尚未实现 |
| Review/Adjustment 原因码目录 | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 需要适配 | 存在阻塞 | 尚未实现 |
| ScoreRule/StudentScore/Contribution/Adjustment | 需要适配 | 尚未实现 | 尚未实现 | 需要废弃 | 需要适配 | 存在阻塞 | 存在阻塞 |
| 客户端权威累计、公式与发布事实 | 需要废弃 | 尚未实现 | 尚未实现 | 需要废弃 | 需要废弃 | 尚未实现 | 尚未实现 |
| UTC/RFC3339、组织 businessDate、整数秒 | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 需要适配 | 尚未实现 | 存在阻塞 |
| 已登记 28 类枚举与 142 个错误码 | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 需要废弃 | 尚未实现 | 尚未实现 |
| ExportType 与 transport enum 登记 | 尚未实现 | 尚未实现 | 尚未实现 | 需要适配 | 需要适配 | 存在阻塞 | 尚未实现 |
| 角色、本人、教学班、组织 scope | 需要适配 | 尚未实现 | 尚未实现 | 需要废弃 | 需要废弃 | 存在阻塞 | 存在阻塞 |
| Semester/User/SystemMode 核心管理依赖 | 需要适配 | 尚未实现 | 尚未实现 | 需要适配 | 需要废弃 | 存在阻塞 | 存在阻塞 |
| AuditLog、Export 与私有制品 | 尚未实现 | 尚未实现 | 尚未实现 | 尚未实现 | 需要适配 | 存在阻塞 | 存在阻塞 |
| 兼容遥测、双读/双写、contract gate | 尚未实现 | 尚未实现 | 尚未实现 | 尚未实现 | 尚未实现 | 存在阻塞 | 存在阻塞 |

“扫码成功直接 ACTIVE、无教师审批”一行的 `已一致` 只表示 Android/教师 UI 的业务语义已经一致，不表示邀请签发、预登录认证、join API、原子持久化或会话安装已经实现；这些仍由上一行和 AUD-03B 标记为阻塞。

### 4.1 客户端迁移顺序

1. 先提供权威后端仓库/环境和 OpenAPI 生成或校验流程，不让各端各自解释 YAML。
2. 各端先接统一错误 envelope、requestId、认证和只读身份/课程 projection；旧 endpoint 保留兼容 adapter 与遥测。
3. Android 依次迁移 Enrollment、Session、Media、Record；在服务端事实读回一致前不切换写路径。
4. 教师端先迁移教学 scope 与只读列表，再迁移领取/审核、Roster、Score；删除本地直接改累计和发布事实的路径。
5. 管理端先迁移认证、组织/用户和只读审计；所有危险或未决动作保持隐藏/默认拒绝。
6. iOS 与 Web 学生端源码到位后执行同一合同测试；不得从 Android 旧 DTO 复制另一套兼容字段。
7. 只有服务端遥测证明所有受支持版本停止旧写、观察期通过并有 rollback owner，才执行破坏性 contract migration。

## 5. 旧合同兼容与废弃清单

| 来源 | 现有合同/行为 | 目标合同 | 迁移动作 | 删除门槛 |
|---|---|---|---|---|
| Android | `/sport/records` | `/api/v1/exercise-records` 与 submit 子资源 | adapter 映射读；新写先灰度；旧写记录版本/字段遥测 | ADR-074 观察期通过且旧 writer 为零 |
| Android | `hours: Double`、`durationSeconds: Double?` | integer seconds；Record 抵扣为 `0/3600/7200` | 拒绝非整数事实；展示层才换算小时 | 全部活跃客户端已切换 |
| Android | `proofFiles.url/cosKey` | `mediaId` + 私有上传/确认/绑定/访问 URL | 禁止客户端提交 storageKey；先完成媒体迁移 | ADR-023/060、对象对账和孤立清理验证通过 |
| Android | 学生 DTO `teacherInternalNote` | 学生 projection 永不包含 internalNote | 新 DTO 严格解析并移除字段 | 新服务端不再返回且兼容遥测归零 |
| Android | 设备本地 Session 和设备时区每日一次 | 服务端 Session、组织 businessDate | 本地只做离线 UI 快照；服务端恢复/裁决 | ADR-021 参数批准并完成双设备测试 |
| Android | 非 GET 每次请求临时生成新 Idempotency-Key，Record 无 clientRequestId/expectedVersion | 一次业务意图在重试中稳定复用 key，并以 clientRequestId/expectedVersion 防重放与并发覆盖 | 在 repository/use-case 层生成并持久到意图完成；网络层不得每次重建 | 进程重启、超时重试、双击和版本冲突 contract test 通过 |
| Web 教师 | numeric IDs、中文状态、`approvedHours/auditStatus` | opaque IDs、正式枚举、Review/Score 分离 | 创建 API view model；不直接复用组件类型 | 所有写动作转为服务端命令 |
| Web 教师 | setState 直接改审核、累计和成绩 | append-only Review、Score revision/outbox | 先只读对账，再逐命令切换 | 真实 recordId 全链路和并发测试通过 |
| Web Roster | `/api/v1/teacher/courses/...` + session Mock | 统一 classSection/roster-import/alignment API | 替换 adapter，迁移旧异常枚举 | 服务端导入/对齐读回与审计验收通过 |
| Web 管理 | localStorage Mock、演示密码、本地 purge | 服务端认证、权限、AuditLog；purge 默认关闭 | Mock 仅保留显著标识的本地演示模式 | 真实服务端能力上线后仍不自动开放 purge |
| Web 认证 | 任意非空凭证登录、账号正则猜角色、localStorage 管理员 session | 服务端 password/refresh/logout、受控角色 projection、可撤销设备会话 | 先替换 auth service 与安全存储；旧逻辑只可存在于显著标识的本地 Mock | 真实认证、禁用、撤销、越权与重放测试通过，生产构建不再引用旧逻辑 |
| Web 入班邀请 | 浏览器随机 token、固定 7 天 TTL、前端撤销、硬编码 `sports.example.com` | 服务端签发/撤销/过期/使用状态与受控 QR/URL；预登录安全挑战 | 教师端改为调用 invite API；客户端不生成 token、不裁决 TTL | DEC-15/ADR-053 获批，签发到原子 join 的幂等、安全与审计测试通过 |
| Web 课程/成绩 | Course 混合 ClassSection/ScoreRule；10h+10h 目标、`scoreEndurance()`、`published:boolean` 为本地事实 | 目录/教学班/版本化 ScoreRule/StudentScore 分离，公式和发布由服务端裁决 | 先迁移只读 projection，再按命令替换规则激活与发布；删除前端权威算法 | ADR-018/062/069 获批，服务端来源追溯与跨端对账通过 |
| Web 教学范围与时间 | `teacherCourses = courses`、名单固定课程 1–4、分钟/小时和无时区时间字符串 | 服务端 teaching scope、真实 classSectionId、integer seconds、RFC3339/组织 businessDate | 切换真实身份与课程 projection；view model 显式换算，禁止静态授权 | 越权负例、时区/跨日、真实 recordId 全链路和旧字段遥测归零 |

## 6. 待决策清单

以下建议均未获批准，不改变当前合同。每项必须由有权业务/技术负责人选择并把结果写回 `decision-log.md`；在此之前继续采用默认拒绝。

| 编号 | 决策问题 | 可选方案 | 推荐方案 | 推荐理由 | 影响范围 | 不决策的风险 | 是否阻塞开发 |
|---|---|---|---|---|---|---|---|
| DEC-01 | Review 领取事实如何建模 | A：ExerciseRecord 增候选 claimant/time 字段；B：独立 ReviewClaim 历史/lease；C：删除领取态，教师直接 Review | 多教师/交接确定前优先 B；若明确永久单教师且无释放语义可选 A | 独立事实更能表达并发、释放、过期、交接和审计，避免把责任 teacherId 当 claimant | 01/02/03/05/06/07/OAS、Review、DB | 无法可靠返回 already claimed、无法追责或安全重领 | 是：claim-review |
| DEC-02 | 每个 operation 的角色和资源 scope 如何机器化 | A：OpenAPI 扩展；B：单独 policy manifest；C：只保留 prose | A，并由 05 生成/校验扩展；复杂资源链引用共享 policy ID | 合同、代码生成、网关和测试可使用同一来源，减少漏授权 | 05、OpenAPI、网关、应用服务、测试 | 只检查登录而漏本人/教学班/组织 scope | 是：授权基础层 |
| DEC-03 | 权威后端、DB、ID 与 migration gate | 提供现有权威仓库继续建设；选择新栈重建；继续把远端黑盒当后端 | 优先提供并锁定现有成熟仓库、commit、DB 引擎/schema/migration history；证明确实不存在后再另立新栈 | 避免重写、双后端和不可逆数据猜测 | ADR-025/048/074，全部模块 | 无法建 migration、索引、部署或回滚 | 是：全部阶段 10 |
| DEC-04 | 认证、无密码学生、角色/Profile、员工唯一、Invite/Export 持久化与密码学 | 单角色/多角色；可撤销 session/无状态长 JWT；相邻对象独立表/塞入核心对象 | 可撤销 device session；学生凭证/联系方式可空；相邻对象独立生命周期；多角色和员工身份由业务确认后定型 | 满足直接入班、禁用/退出/密码变化和最小披露，避免 token/任务污染 User | ADR-022/028/042/046/053/072 | 认证表、唯一约束和所有客户端会话无法确定 | 是：Auth、User、Invite、Export |
| DEC-05 | 审核时点、学生撤回和多教师责任 | 实时/期末；允许/禁止撤回；单教师/TeachingAssignment | 统一 ReviewRecord 支持实时与批量；期末仅完整性检查；撤回和多人模式须单独批准 | 不创建两套审核事实，保留历史和教学 scope | ADR-019/020/043、Record、Review、权限 | 状态转换、claim、成绩失效和归属不确定 | 是：相关动作 |
| DEC-06 | 可信计时、GPS 和不足 1h 媒体草稿 | heartbeat/服务端事件方案；采集/不采集 GPS；保留/立即清草稿 | 一人一个活动 Session，服务端时间为事实；位置未经批准不上传；草稿按批准隐私窗口处理 | 最小化定位风险，并让双设备/离线恢复可审计 | ADR-021/029/040、Session、Android、Media | 作弊、跨日重复、隐私违规或证据意外丢失 | 是：Session production 参数 |
| DEC-07 | 媒体存储、TTL、capture source、解绑/删除和管理员原件访问 | 供应商/扫描器方案；按用途白名单；允许/禁止重绑；管理员默认/事件授权 | 私有存储、短期能力、服务端内容校验；正式证据不重绑；管理员仅审批事件访问 | 最小权限且与证据不可变性一致 | ADR-023/030/060/068、对象存储、客户端 | 泄露、恶意文件、孤立成本、证据替换 | 是：Media |
| DEC-08 | purge、教学/媒体/名单/AuditLog 留存、备份和观测责任 | 普通 API purge/离线治理；统一/分类 retention；单地/隔离备份 | 不提供普通全量 purge；按数据类别批准 retention；隔离备份并实际恢复演练；审计与普通日志分开 | 删除、合规、恢复和审计目的不同，不能共享一个 TTL | ADR-024/032/045/071/073、DB、对象存储、运维 | 不可恢复删除、超期保留或“有备份但不能恢复” | 是：删除、灾备和 production 运维 |
| DEC-09 | 20h 后成绩公式、分类配额与 ScoreRule 激活审批 | 单总门槛/分类门槛；公式方案；单人/双人激活 | 先批准版本化公式和分类分配，再决定高风险激活审批；批准前只保留 DRAFT/null | 任意默认都会直接改变学生分数 | ADR-018/062/069、ScoreRule/StudentScore/UI | 错分、批量回算和无法解释版本 | 是：成绩计算/发布 |
| DEC-10 | 归档修正、补录/抵扣/调分分类、审核时长覆盖、已发布输入变化 | 覆盖旧值/追加历史；统一 Adjustment/按业务事实分型；静默更新/新工作版本 | append-only 修正与 adjustment；VALID 默认沿用服务端抵扣，非空 override 继续拒绝；已发布快照不静默改 | 保持从最终分数到来源可追溯 | ADR-026/044/047/059、Review、Score、通知 | 历史被覆盖、教师越权和已发布成绩漂移 | 是：修正与特殊成绩能力 |
| DEC-11 | 学期切换、学生退出/重入和 Course 目录作者 | 自动/手动归档；允许/禁止自助退出；管理员/教师/学校同步 Course | 先确认职责；未决前 Course 写和学生退出关闭，ClassSection 仍由责任教师在已存在 Course 下管理 | 防止目录治理和教学责任混淆 | ADR-027/054/067、Semester、Course、Enrollment | 错误归档、孤儿关系和越权改目录 | 是：对应写动作 |
| DEC-12 | 历史“提交即有效”数据如何生成 Review 历史 | 全部 VALID；全部 PENDING；可验证迁移 + 冲突隔离 | 可验证记录生成带来源的迁移 Review，并抽检；冲突项保持 PENDING | 兼顾历史成绩稳定与真实性 | ADR-056、旧 Record、Review、Score migration | 历史成绩突降或错误记录被放大 | 是：历史迁移 |
| DEC-13 | 名单异常能否 IGNORED 及到期重开 | 永不允许；限定类型/角色/期限允许；任意教师允许 | 未批准前不允许；批准后按异常类型、原因、期限和审计白名单 | 忽略会掩盖真实 Enrollment/身份问题 | ADR-057、RosterAlignment | 名单差异被永久隐藏 | 是：ignore 动作 |
| DEC-14 | 共享幂等存储、lease、retention 和临时凭证重放 | 进程内缓存；数据库/缓存共享设施；各模块自行实现 | 统一共享设施和 SDK；技术随 ADR-025，参数统一批准；不使用进程内生产默认 | 多实例、任务和临时凭证需要相同的重复请求语义 | ADR-070、所有 mutation/outbox/media/auth | 重复提交、重复审核、重复发布或未知副作用 | 是：production 写基础层 |
| DEC-15 | 预登录 QR Join 使用何种安全挑战和响应 envelope | A：inviteToken 直接作为一次性 scoped credential；B：先校验资料/邀请并换短期 join capability，再原子 join；C：要求既有 Bearer 并先修订 ADR-006 | B；响应原子包含学生安全身份 projection、ACTIVE Enrollment 与 AuthSession，任何重试返回同一结果 | 降低长期 invite 泄露与重放风险，同时保持已接受的预登录直接入班结果 | ADR-006/053、Auth、Invite、Enrollment、Android、OAS | 首次登录死锁、token 重放或部分创建身份/关系/会话 | 是：QR Join/Auth |
| DEC-16 | 统一后端是只覆盖核心打卡，还是一次覆盖现有门户全部能力 | A：只做核心；B：全部门户同时做；C：核心加其必需 Semester/User/SystemMode，其他相邻能力分期 | C；先冻结明确边界，耐力测评、免测/认证、帮助、工单、公告另立对象和验收 | 核心依赖不能缺口启动，非核心 UI 原型也不能直接决定数据库 | 02、06、OAS、Android、教师/管理 Web、交付计划 | 范围蔓延、核心接口缺依赖，或把 Mock 类型误建成正式模型 | 是：实施范围/依赖 |
| DEC-17 | ReviewReasonCode 与 ScoreAdjustmentReasonCode 如何治理 | A：v1 固定版本化 enum；B：管理员可配置的版本化目录；C：任意字符串 | A；先冻结最小目录，未来若需配置化再以独立迁移和兼容规则升级 | codegen、统计、国际化和历史迁移需要稳定语义，不能只校验字符串形状 | 02、07、OAS、Review、Adjustment、客户端 | 未知原因码导致严格解析失败、统计分裂和迁移不可解释 | 是：INVALID/调分 mutation |
| DEC-18 | `ExportType` 当前 4 个 transport 分类是否正式冻结 | A：冻结现有四类；B：在范围确认前用开放/未决 transport 值；C：从本轮移除 Export API | 若四类均在批准范围内选 A，否则选 C；不建议用 B 长期绕过注册表 | 类型目录与 Job 持久化是两个决策；先明确接口分类，不会自动批准 ADR-053 的存储/制品生命周期 | 07、OAS、Export client/codegen/i18n；ADR-053 独立保留 | 生成客户端出现无文档闭集，或把 OAS 偶然值误当业务批准 | 是：Export contract；不单独阻塞核心打卡 |

### 6.1 可直接修复与需先决策的边界

下列队列只说明合同如何闭合，不授权实现后端。标为“直接修复”的项目已有 `ACCEPTED` 规则、隐私边界或同一文档中的明确语义可裁决；其余必须先完成对应 DEC/ADR。

| 修复编号 | 合同修复 | 性质 | 前置条件 | 完成证据 |
|---|---|---|---|---|
| FIX-09-01 | 把 01 的每日唯一键统一为 `(enrollmentId,businessDate)` | 直接修复 | `ACCEPTED` ADR-064 | 01/02/04/OAS/DB contract test 使用同一键；CANCELLED 释放仍由 ADR-020 控制 |
| FIX-09-02 | 对齐 ReviewRecord 的 teacherId 可空性和 reason/internalNote 长度 | 直接修复 | 阶段 2 字典与初始 PENDING 语义 | 02 与 OAS schema/fixture/codegen 一致 |
| FIX-09-03 | AuditLog 增 `permissionId` 与另一个非秘密幂等关联字段 | permissionId 直接修复；幂等字段形态待冻结 | DEC-02、DEC-14/ADR-070 | 01/02/05/08/OAS 同源；候选 `idempotencyKeyReference` 不当作已批准名称；测试证明不记录原始 key |
| FIX-09-04 | 申请时预留稳定 mediaId；确认沿用；声明/验证 hash 分离 | 直接修复 | 既有私有媒体、确认和幂等语义 | 02/06/08/OAS 的 initiate/confirm/cleanup fixture 一致 |
| FIX-09-05 | 明确分离学生 `currentReview` 与教师完整 ReviewRecord | 直接修复 | 既有 publicComment/internalNote 可见性规则 | 学生 schema 必含 result/publicComment 且永不含 internalNote；其他字段先过 projection/隐私决策 |
| FIX-09-06 | 先给全部 operation 补唯一 permission/public policy，再给 76 个未绑定受保护 operation 增 role/resource scope/default deny metadata | 决策后修复 | DEC-02 | 05 与 OAS 双向生成检查无漏项；公开操作也有显式 policy |
| FIX-09-07 | 修正 QR Join security override 与专用成功 envelope | 决策后修复 | DEC-15；保持 ADR-006 的结果语义 | 无既有登录也可安全完成；重试幂等；身份/Enrollment/Session 原子一致 |
| FIX-09-08 | 冻结 Review/Adjustment 原因码并替换宽松 regex | 决策后修复 | DEC-17 | 02/07/OAS/各端生成 enum 精确一致；开放前校验目录，未冻结期间有精确错误与 operation gate |
| FIX-09-09 | v1 将 media purpose 限定为 EXERCISE_RECORD；未来扩展采用用途条件 schema | 直接限定；扩展依赖决策 | ADR-030 未批准时维持关闭 | 请求 schema 不接受未开放 purpose；若保留值则先登记专用关闭错误；EXERCISE_RECORD 不受空洞字段组合影响 |
| FIX-09-10 | 冻结核心 Semester/User/SystemMode transport 与本轮范围 | 决策后修复 | DEC-16 | 依赖图、OAS operation、权限和验收清单有唯一范围 |
| FIX-09-11 | 处理 OAS 独有 ExportType，并验证 inline enum 边界 | ExportType 依赖目录决策；inline constraint 直接加测试 | DEC-18；ADR-053 只继续控制持久化/制品生命周期 | 07 与 OAS named business enum 全量 diff 为零；inline 被证明是合法子集或局部 transport constraint；用户可见值才要求 i18n |

### 6.2 `PROPOSED` ADR 覆盖核对

当前 decision log 有 37 个 `PROPOSED`、36 个 `ACCEPTED`、1 个 `SUPERSEDED`。所有 `PROPOSED` 已在上表集中覆盖：

| 决策组 | 覆盖 ADR |
|---|---|
| DEC-03 | ADR-025、ADR-048、ADR-074 |
| DEC-04 | ADR-022、ADR-028、ADR-042、ADR-046、ADR-053、ADR-072 |
| DEC-05 | ADR-019、ADR-020、ADR-043 |
| DEC-06 | ADR-021、ADR-029、ADR-040 |
| DEC-07 | ADR-023、ADR-030、ADR-060、ADR-068 |
| DEC-08 | ADR-024、ADR-032、ADR-045、ADR-071、ADR-073 |
| DEC-09 | ADR-018、ADR-062、ADR-069 |
| DEC-10 | ADR-026、ADR-044、ADR-047、ADR-059 |
| DEC-11 | ADR-027、ADR-054、ADR-067 |
| DEC-12 | ADR-056 |
| DEC-13 | ADR-057 |
| DEC-14 | ADR-070 |
| DEC-15 | ADR-053；保持 `ACCEPTED` ADR-006 的结果语义 |

DEC-01、DEC-02、DEC-16、DEC-17 与 DEC-18 是本轮交叉审查新发现且尚无 ADR 编号的决策缺口；DEC-15 细化 ADR-053 的 transport/security 选择，但不得改写 `ACCEPTED` ADR-006 的直接入班结果。批准或选择方案时必须先追加或更新 decision log，不能仅修改实现。

## 7. 后端实施顺序与依赖

以下只是解除门控后的建议顺序，不授权现在执行阶段 10。

| 阶段 | 实施内容 | 必须先满足 | 本阶段可验收输出 |
|---:|---|---|---|
| 1 | 合同闭合、权威基线与 contract gate | FIX-09-01–11；DEC-01/02/03/15/16/17/18；提供仓库、commit、DB、部署和环境证据 | 09 复审明确改为“是”；可复现启动；技术栈 ADR；现有 schema/migration/接口盘点；尚不写新业务 |
| 2 | 基础工程、配置、数据库连接与 migration 框架 | 阶段 1；ADR-070–074 的实现边界 | `/api/v1`、requestId、envelope、错误码、配置校验、migration lock、outbox；AuditLog 含 permissionId/幂等安全引用；共享 idempotency skeleton |
| 3 | 认证、User、Role/Profile | 阶段 2；DEC-04 | password/refresh/logout/禁用/撤销；三类 Profile；组织 scope；安全与审计测试 |
| 4 | Semester、Course、ClassSection、教学责任 | 阶段 3；DEC-05/11 中的责任与目录治理 | 只读 Course、受控 ClassSection、teacher scope；归档默认拒绝或获批实现 |
| 5 | Enrollment、二维码/邀请码入班 | 阶段 3–4；DEC-15、ADR-053/054 | 预登录安全挑战；身份/ACTIVE Enrollment/AuthSession 原子响应；重复幂等；无教师审批；移除/恢复历史 |
| 6 | OfficialRosterImport/Entry 与 Alignment | 阶段 2、4–5；DEC-07/08/13 的文件和处置边界 | 私有导入、版本快照、对齐、逐项处置、并发与审计；不直接改 Enrollment |
| 7 | ExerciseSession | 阶段 3、5；DEC-06 | 单活动 Session、服务端事件、暂停排除、跨日 businessDate、双设备与离线恢复测试 |
| 8 | MediaEvidence | 阶段 2、7；DEC-07；FIX-09-04/09 | 稳定 mediaId 的私有申请/直传/确认/绑定/处理/访问；声明/验证 hash、MIME/恶意文件/孤立清理与权限测试 |
| 9 | ExerciseRecord 提交 | 阶段 5、7–8；FIX-09-01；ADR-020 | DRAFT/submit/discard；Enrollment scope 每日唯一；0/3600/7200；原子 PENDING Review v1；recordId 全链路 |
| 10 | claim、Review 与审核历史 | 阶段 4、9；DEC-01/02/05/10/17；FIX-09-02/05/06/08 | claim 模型、append-only Review、学生安全投影、原因码、单条/批量、reopen、乐观锁、越权与并发测试 |
| 11 | ScoreRule、StudentScore、Export 与 Audit 查询 | 阶段 6、9–10；DEC-08/09/10/17/18、ADR-053 | 版本化规则/贡献/调整/发布及原因码；来源追溯；受控类型的私有异步导出；ADMIN 原始审计读取 |
| 12 | 多端兼容、迁移、联调与切换 | 阶段 1–11；DEC-12、ADR-074；全部客户端仓库到位 | adapter/遥测、历史 backfill、双读写对账、Android/iOS/Web 验收、rollback 演练和旧 writer 归零证明 |

任何阶段发现目标合同问题时，先更新 decision log 和 00–09 受影响文档并重新校验 OpenAPI，再改实现。不得用“实现方便”反向修改字段、状态或错误码。

## 8. “可以开始后端实现”门控逐项判定

| 门控条件 | 判定 | 证据/缺口 |
|---|---|---|
| 核心领域对象已统一 | 是 | 20 个核心对象与 1 个必要支持对象及其关系已冻结 |
| 核心字段已统一 | 否 | Review claim、ReviewRecord、AuditLog、Media hash/ID、学生 currentReview 和原因码合同仍有缺口 |
| 核心状态机无冲突 | 否 | claim 动作无数据模型；预登录 join transport 不能完成已接受原子结果；Media 申请/确认的身份时点不唯一 |
| 核心业务规则无阻塞问题 | 否 | 可信计时参数、评分公式/分类/激活、部分撤回/修正/媒体规则与原因码目录仍未决 |
| 权限边界明确 | 否 | prose 语义明确，但 76 个受保护 operation 缺机器角色/scope 绑定，多教师/claim 未决，AuditLog 证据字段不完整 |
| OpenAPI 可以通过校验 | 是 | Redocly 有效；本地结构/引用/路径/响应检查通过，只有 6 条非阻塞 warning |
| 枚举和错误码已统一 | 否 | 142 个错误码与已登记 28 类/127 值一致；4 个 inline constraint 无值冲突，但 OAS 独有 ExportType 4 值尚未纳入统一注册表 |
| 所有高风险未决策问题已显式列出 | 是 | 37 个 `PROPOSED` ADR 全覆盖，另列 DEC-01/02/15/16/17/18；建议未当作批准结论 |
| 客户端迁移路径明确 | 否 | Android/Web 有方向但尚无可执行服务端基线；iOS/Web 学生端源码缺失；版本/遥测 gate 未定 |

由于门控要求“同时满足”，任一“否”都必须阻止阶段 10。本次有六项为“否”。

## 9. 阶段 10 处置

- 未创建后端目录、业务模块、ORM model、数据库 migration、seed、对象存储或认证实现。
- 未修改 Android、Web UI 或客户端源码。
- 未连接、读取或修改任何业务数据库。
- 未 push，未创建 Pull Request。
- 下一步应先执行第 6.1 节 FIX-09-01–11 的合同闭合，其中 DEC-01/02/15/16/17/18 必须先由有权负责人选择并写入 decision log；同时提供 DEC-03 所需的权威后端与数据库基线。其余阻塞 ADR 按第 7 节依赖顺序批准。

## 10. 本阶段完成性检查

- [x] 已检查领域模型、字段字典、状态机、业务规则、权限、API、枚举/错误和工程规范。
- [x] 已检查同名字段、枚举、单位、时间格式、状态维度、名单/入班、Record/Review 与成绩来源。
- [x] 已对照当前 Android、教师 Web、管理 Web，并确认 iOS、Web 学生端、后端和数据库缺失。
- [x] 已生成规定列的一致性矩阵和客户端迁移矩阵。
- [x] 已把 37 个 `PROPOSED` ADR 和 DEC-01/02/15/16/17/18 六个交叉审查决策缺口集中列出，没有把建议写成已批准规则。
- [x] 已给出 12 阶段后端实施顺序和依赖。
- [x] 已明确标记“可以开始后端实现：否”，因此没有执行阶段 10。

## 11. Greenfield 门禁与确定性合同闭合附录（2026-08-02）

本附录追加于原阶段 9 审查之后，不改写上述当时证据、计数、DEC 建议或“完整后端不可开始”的形成过程。用户随后明确接受 Greenfield 与分层门禁（ADR-025/075/076），并直接裁决可确定的 V1 合同缺口（ADR-077–088）。因此，原结论现在解释为：**不能开始全部业务或生产实施；可以在严格 Foundation 范围内建立并验证基础设施。**

### 11.1 原确定性缺口的处置

| 原审查项 | 处置 | 当前权威结果 |
|---|---|---|
| AUD-07 / DEC-01 Review claim | 已关闭 | ADR-078 删除 claim operation、`CLAIM_REVIEW`、claim 字段和可写 `UNDER_REVIEW`；单教师直接审核，重开回 `SUBMITTED` |
| AUD-02 每日唯一键 | 已关闭 | 唯一使用 `(enrollmentId,businessDate)`；V1 CANCELLED 不释放槽位 |
| AUD-03A ReviewRecord | 已关闭 | 初始系统 PENDING 可 `teacherId=null`；教师 VALID/INVALID 非空；reason 500、internalNote 2000 |
| AUD-03B AuditLog | 已关闭 | 使用 ADR-086 的精确字段；`permissionId` 必填，原始幂等键/IP/设备指纹和敏感正文不落库 |
| AUD-03D Media 身份/hash | 已关闭 | initiate 分配稳定 mediaId/PENDING_UPLOAD；confirm 沿用；declared 与 verified hash 分离 |
| AUD-03E / DEC-17 原因码 | 已关闭 | ADR-082/083 冻结 ReviewReasonCode 与 ScoreAdjustmentReasonCode；调分执行仍受 Score Gate |
| AUD-04 / DEC-18 ExportType | 已关闭（类型） | ADR-084 登记四值及 i18n；V1 不建或执行 ExportJob |
| AUD-10B 学生审核投影 | 已关闭 | `currentReview` 精确为 `result/reasonCode/publicComment`，不含 reason 正文、internalNote 或完整历史 |
| DEC-15 预登录 Join | 已关闭（合同） | ADR-080 冻结 preview → profile → one-time capability → atomic Join；实现仍受 Enrollment Gate |
| 权限机器绑定 | 已关闭（合同） | 86 个 operation 均声明唯一完整 `x-access-policy`；第 5 阶段文档第 11 节为一一映射 registry |

“已关闭（合同）”只表示文档/OpenAPI 已形成可执行定义；它不是后端、数据库、客户端或 production 验收证据。合同闭合时运行 `tools/backend-contracts` 的 `npm run contract:check`：确定性检查通过，73 paths、86 operations、212 schemas、1249 个本地 `$ref` 均可解析；权限 86/86、registry diff 0、31 类/140 值 named enum diff 0、143 个 ErrorCode diff 0。Redocly 校验通过并保留 6 条非阻塞 warning（缺 license、3 个公开只读探针无 4xx、2 个 contract-only/未引用 component）；最终实施报告必须继续按真实结果复测并记录，不能把本次合同检查当作后端响应验证。

### 11.2 分层门禁当前含义

| Gate | 当前判定 | 说明 |
|---|---|---|
| Greenfield Foundation 实施授权 | 是 | 允许建立 `backend/` 骨架、12 张 Foundation 表、Auth/Policy/HTTP/Idempotency/Audit/Outbox/Health 与测试基础设施 |
| Greenfield Foundation 验收 | 待验证 | 只有空 PostgreSQL 18 migration、真实集成/E2E/安全测试、Docker 与客户端回归等最终标准全部通过后才能标“是” |
| Course / ClassSection | 否 | Course 写职责 ADR-067 未批准；不得建立假业务接口 |
| Enrollment / QR Join | 待后续模块 | transport 与持久化设计已闭合，但本轮不建 CourseInvite/JoinCapability/Enrollment 表或完整用例 |
| Session / Media / Record | 待后续模块 | 确定性合同已修复，可信计时参数、production 媒体规则等仍受相应 ADR/Gate 阻塞 |
| Review | 待后续模块 | V1 状态/原因/并发合同已闭合，本轮不实现业务审核 Controller |
| Score | 否 | 公式、分类、激活/发布/修正仍关闭 |
| Export | 否 | 只冻结 ExportType；所有 operation fail closed，V1 不建 ExportJob |
| Full Production | 否 | 密钥、TTL 数值、备份恢复、媒体安全/保留、幂等参数、监控责任、staging、域名/HTTPS、隐私法务等未完成 |

### 11.3 不变的边界

- Android/Web 子模块不是数据库模型来源，本附录未授权修改客户端。
- 未知旧远程 API 仍是黑盒；没有遥测前不删除、不连接其数据库，也不声称兼容。
- Foundation 之外不创建返回假成功的 Controller、空任务、假下载 URL 或 Mock fallback。
- 任何新增业务字段、状态、权限或 migration 必须先更新 decision log 和唯一 OpenAPI 合同，再进入实现。

## 12. Greenfield Foundation 实施验收附录（2026-08-02）

本附录继续保留第 1–10 节的原始审查过程和第 11 节的实施授权判断，只追加真实实施结果。Foundation 代码范围已经完成，但严格验收 Gate 与业务/Production Gate 必须分别判定。

### 12.1 实施证据

- 根仓库普通目录 `backend/` 已成为唯一权威后端源码路径；Android/Web gitlink 未变化。
- 版本锁定：Node 24 LTS（CI/容器 24.18.0，本机验证 24.13.1）、NestJS app/core 11.1.28、TypeScript 5.9.3、Prisma 7.9.1、PostgreSQL 18.4。
- 初始 migration `0001_greenfield_foundation` 建立 12 表、23 FK、22 unique indexes、88 CHECK、38 total indexes；SHA-256 为 `0573e3d13018e0db103ef4b605eb35278723174507b37379425a489b10e1462d`。
- 独立真实 PostgreSQL 18.4 空库首次 deploy、重复 deploy、schema drift 和约束测试通过。
- OpenAPI 73 paths/86 operations/212 schemas/1,249 refs；权限 86/86、policy diff 0、31 类/140 值枚举 diff 0、143 ErrorCode diff 0；保留 6 条已知非阻塞 warning。
- 后端测试 Unit 12/12、Integration 6/6、E2E 8/8、Contract 3/3、Security 4/4，总计 33/33；format/lint/type/build/generation/migration/audit 检查通过，npm audit 为 0 vulnerabilities。
- Android `testDebugUnitTest` 通过；Web typecheck、production build、25/25 tests 通过；这只是回归，不是新 API 业务联调。
- 本机没有可用 Docker，因此 Compose 启动与 Docker image build 未执行；CI 已配置但没有远程 run。

### 12.2 最终分层判定

| Gate                           | 最终判定 | 解释                                                                                                                  |
| ------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| Greenfield Foundation 实现范围 | 是       | Foundation 合同、源码、数据库、认证/授权、幂等、审计、Outbox、Health、测试和文档已完成                                |
| Greenfield Foundation 验收     | **否**   | 严格验收要求 local Docker 环境可启动且 Docker build 有执行证据；当前机器不具备 Docker，不能以配置文件或未运行 CI 代替 |
| Course / ClassSection          | 否       | ADR-067 未批准，无后端业务实现                                                                                        |
| Enrollment / QR Join           | 否       | transport 合同闭合，但完整表、用例和跨端验证未实现                                                                    |
| Roster                         | 否       | 无后端导入/对齐实现                                                                                                   |
| Session / Media / Record       | 否       | 可信计时/媒体规则仍有 ADR，且无完整实现                                                                               |
| Review                         | 否       | V1 合同闭合但无业务实现                                                                                               |
| Score                          | 否       | 公式、分类、激活/发布仍关闭                                                                                           |
| Export                         | 否       | V1 只冻结类型，不建 ExportJob                                                                                         |
| Full Production                | **否**   | 密钥、TTL、备份恢复、媒体、幂等保留、审计/告警、staging、HTTPS、隐私法务等均未验收                                    |

Foundation 验收 Gate 的“否”是一个明确、可解除的运行环境证据缺口，不撤销 Greenfield 实施授权，也不否定已经通过的真实 PostgreSQL 与测试证据。后续在有 Docker 的隔离环境完成 Compose、image build 和 CI 等价复核后，才可单独追加验收结论；不得顺带打开任何业务或 Production Gate。
