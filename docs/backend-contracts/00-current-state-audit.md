# 体育打卡后端统一契约：当前状态审计

> 阶段：0
> 审计基线：根仓库 `8bc3669`；Android 子模块 `e4cd2e5`；Web 子模块 `a602280`
> 审计日期：2026-08-02
> 结论口径：只把当前工作区内可读取的代码、文档和测试当作实现证据；“目标合同”“Mock”“已声明接口”和“真实后端实现”严格分开。

## 1. 审计范围与方法

本次只读检查了根仓库、两个 Git 子模块和三份业务流程文档，共 195 个非生成文件（115 个 Android、76 个 Web、3 个业务文档、1 个根说明文件）。检查覆盖 Kotlin/Compose 源码、TypeScript/React 源码、请求 DTO、响应 DTO、API 路径、Mock、状态常量、测试、README、业务规则和 Git 历史。

当前快照没有 iOS 源码、Web 学生端源码、后端服务源码、SQL/migration 或仓库内 OpenAPI 文件。因此这些部分只能记为“尚未提供/无法从当前仓库验证”，不能沿用旧说明文件把它们判定为已经实现。

## 2. 当前技术栈

| 范围 | 当前可验证技术 | 证据与说明 |
|---|---|---|
| 根仓库 | Git superproject + 两个 gitlink 子模块 + Markdown 业务文档 | `.gitmodules`、`git ls-tree HEAD` |
| Android 学生端 | Kotlin 2.0.21、Jetpack Compose、Android Gradle Plugin 8.7.3、JDK/JVM 17、compile/target SDK 35、min SDK 26 | `BNBU-Sports-Android-master/build.gradle.kts:1-6`；`app/build.gradle.kts:54-63,112-165` |
| Android 网络 | OkHttp 4.12.0 + Gson 2.11.0 + Kotlin Coroutines；手写 endpoint/DTO/repository | `app/build.gradle.kts:137-153`；`core/network/StudentEndpoint.kt` |
| Android 本地状态 | `StudentAppState` 集中状态、SharedPreferences/加密会话、本地运动会话快照与媒体草稿 | `core/state/StudentAppState.kt`；`core/local/`；`feature/checkin/session/` |
| Web 教师/管理端 | TypeScript 5.9、React 19.2、Next 16 API 形态、vinext/Vite、Cloudflare Worker | `BNBU-Sports-Web-new/package.json`；`vite.config.ts:1-58`；`worker/index.ts:1-45` |
| Web 数据层 | 教师主要业务为组件内内存状态；管理员为 Mock service；名单对齐为浏览器会话 Mock adapter | `app/teacher-workspace.tsx`；`app/admin-service.ts:20,50-75,118-162`；`app/roster-reconciliation-service.ts:31-78,145-307` |
| Web 数据库壳 | Drizzle D1 适配器存在，但 schema 为空，D1/R2 binding 均未配置 | `db/schema.ts:1-4`；`db/index.ts:1-14`；`.openai/hosting.json:1-5` |
| 后端 | **当前快照不存在后端源码** | 全仓 `rg --files` 无后端 `package.json`、server、SQL、migration 或 OpenAPI |
| iOS / Web 学生端 | **当前快照不存在实现源码** | 业务文档只声明 iOS/Android/Web 学生端；仓库只有 Android 学生 App 与教师/管理 Web |

## 3. 客户端目录与职责

| 目录 | 实际职责 | 成熟度 |
|---|---|---|
| `BNBU-Sports-Android-master/app/` | 学生登录、联系方式绑定、扫码/邀请码直接入班、课程、运动计时、媒体草稿、打卡提交、成绩、免测、通知、个人资料 | 有真实 API 请求封装和 Mock 分支；服务端是否支持当前所有请求无法在本仓验证 |
| `BNBU-Sports-Web-new/app/teacher-workspace.tsx` | 教师课程、成员、打卡复核、学时调整/补录、成绩、免测/认证 | 完整交互原型；业务数据主要是组件内演示数据 |
| `BNBU-Sports-Web-new/app/admin-*` | 管理员学期、账号、规则、系统模式、帮助、工单、审计 | 浏览器 Mock/本地状态；无真实认证与持久化 |
| `BNBU-Sports-Web-new/app/roster-reconciliation-*` | 官方名单解析、预览、映射、版本、对齐、处置、导出 | 类型与匹配算法已实现，适配路径已声明；实际导入/处置仅保存于浏览器会话 |
| `业务逻辑/` | 学生、教师、管理员目标业务说明 | 包含当前实现、目标合同和历史数据库/后端推断，不能整体视为部署证明 |
| iOS 学生端 | 文档声明的 SwiftUI 客户端 | 仓库中缺失 |
| Web 学生端 | 文档声明的学生浏览器端 | 仓库中缺失；现有 Web 只路由教师/管理员工作区 |

项目中没有“外部教师端”，本契约也不新增该角色或客户端。

## 4. 当前后端状态

1. 根 `CLAUDE.md:10-18,42-94` 描述了一个 Express 5 + TypeScript + MySQL 后端及 `backend/openapi/openapi.yaml`，但当前 Android 子模块根目录实际只有 `app/`、Gradle 配置和测试，没有 `backend/`；Android 子仓库全部历史也未跟踪过该目录。
2. Android 仍以 API client 方式调用远程服务；debug 默认地址为 `http://123.207.5.70:3334/api`，release 要求外部提供 HTTPS 且以 `/api` 结尾（`app/build.gradle.kts:84-103,205-227`）。这证明客户端依赖 API，不证明远程服务与当前业务合同一致。
3. Web Worker 只托管前端路由和图片优化（`worker/index.ts:28-45`），不是体育业务后端。
4. Web 名单对齐声明了 `/api/v1/teacher/courses/{courseId}/...` 路径，但实际导出的 service 是 `mockAdapter`（`roster-reconciliation-service.ts:20-28,307`）。
5. 当前仓库不能验证真实认证、教师/管理员写入、数据库约束、媒体对象存储、审核历史、成绩重算或审计日志。

结论：当前后端状态为“**实现未随本快照提供；客户端合同碎片存在；远端运行版本未知**”，不是“已完成且可按本仓重建”。

## 5. 当前数据库状态

- 全仓没有 `.sql`、migration、ORM 领域 schema 或可执行种子数据。
- Web `db/schema.ts` 明确为空；D1 binding 为 `null`。
- 业务文档提到 `users`、`sport_records`、`grades`、`exemptions` 等表和外键，但这些属于历史/目标描述，当前无 schema 可核验。
- 无法确认生产或测试数据库的引擎、版本、字段、索引、外键、数据量和迁移历史。
- 不允许在本阶段根据文档推断结果执行任何数据库迁移。

## 6. 已有业务对象

### 6.1 Android 可验证对象

`StudentProfile`、`StudentWorkspace`、`Course`、`StudentProgress`、`CheckInRecord`、`CheckInTimeWindow`、`ProofAttachment`、`Membership`、`GradeBlock`、`GradeRow`、`SportHourRule`、`Exemption`、`StudentNotice`、本地 `ExerciseSessionState`。这些对象混合了 API 事实、显示字段和本地状态，尚未形成后端领域边界。

### 6.2 Web 可验证对象

教师端组件内定义 `Course`、`Student`、`CheckinRecord`、`GradeRecord`、`ExemptionRecord`；管理员端定义 `Semester`、`AdminUser`、`RecoveryRequest`、`GradeCorrectionRequest`、`AuditLogEntry` 等；名单模块单独定义 `OfficialRosterSnapshot`、`OfficialRosterStudent`、`PlatformCourseMember`、`RosterReconciliationResult`。多数是 UI/Mock 类型，不应直接等价为数据库实体。

### 6.3 当前缺失的明确边界

`User` 与 Profile、`Course` 与 `ClassSection`、`OfficialRosterEntry` 与 `Enrollment`、`ExerciseSession` 与 `ExerciseRecord`、`ReviewRecord` 历史、`ScoreRule` 版本和 `StudentScore` 计算来源尚未在一个可执行后端模型中分离。

## 7. 已有接口

### 7.1 Android 请求封装

| 模块 | 当前路径示例 | 备注 |
|---|---|---|
| 认证 | `/auth/login`、`/auth/login/email`、`/v1/auth/login/phone` | 版本前缀不一致 |
| 学生概览 | `/sport/summary`、`/sport/identity` | 旧资源命名 |
| 打卡 | `GET/POST /sport/records`、`GET /sport/records/{id}` | 提交 DTO 使用小时与秒的混合字段 |
| 计时策略 | `/student/checkin-time-window` | 客户端把服务端策略视为权威 |
| 媒体 | `/upload/proof` | 当前是 multipart 直传 API，不是附件要求的申请/对象存储/确认三步流 |
| 课程 | `/student/courses`、`GET /v1/course-invites/{code}`、`POST /courses/{courseId}/join` | 版本前缀与资源层级混合 |
| 成绩/免测 | `/student/grades`、`/student/*-exemptions` | 后端支持无法在本仓验证 |
| 通知/帮助/反馈 | `/common/*` 与 `/v1/student/*` 混用 | 路径版本不统一 |

### 7.2 Web 声明接口

只有名单对齐模块集中声明了 `/api/v1/teacher/courses/{courseId}/official-roster...` 与 `/roster-reconciliations...`；当前由 Mock adapter 执行。教师其他写操作和管理员操作主要直接修改 React state/浏览器存储，没有真实 API 封装。

### 7.3 旧接口判定

由于后端源码、网关路由和调用遥测均缺失，不能把任何接口安全标记为“后端未使用旧接口”或直接删除。阶段 6 只能建立新合同与兼容映射，移除需在真实服务端和客户端版本盘点后决定。

## 8. 已有状态与枚举

| 维度 | 当前表现 | 问题 |
|---|---|---|
| 账户 | Android `PENDING_CONTACT_BINDING` / `ACTIVE`；Web `ACTIVE` / `DISABLED` / `RECOVERY_REQUIRED` | 客户端可见状态与服务端状态边界未冻结 |
| 入班 | Android 响应默认 `enrolled`，模型/文档使用 `active`；Web `active/removed/exited/disabled` | 同义多值；`Enrollment` 与 membership 混名 |
| 运动会话 | Android sealed state `Idle/Active/Paused/Finished/Submitted` | 只有本地状态；缺少服务端 `CANCELLED/EXPIRED` |
| 打卡流程/审核 | Android 多为无流程状态；Web `auditStatus=pending/valid/invalid`，同时又有中文 `status=有效/已调整/系统抵扣` | 流程状态、审核结果、显示标签混合 |
| 名单对齐 | Web `MATCHED/INFO_MISMATCH/POSSIBLE_MATCH/NOT_JOINED/WRONG_COURSE/NOT_IN_OFFICIAL_ROSTER/DUPLICATE` | 与本次基线 `MISSING_IN_PLATFORM/EXTRA_IN_PLATFORM/IDENTITY_CONFLICT/DUPLICATED` 不一致 |
| 媒体 | Android `image/video` 与本地草稿；无统一上传状态 | 缺少后端生命周期 |
| 成绩 | Web `published: boolean`、`NotRecorded/Recorded/Exempt/Absent`；管理员另有修正状态 | 计算、调整、发布、锁定未分离 |
| 系统模式 | `NORMAL/READ_ONLY/MAINTENANCE` | 已有清晰维度，但后端执行不可验证 |

## 9. 已有权限逻辑

- Android 依赖 Bearer token、本人工作区与本地 `isWriteAllowed`；UI 校验不能证明服务端资源归属校验。
- 业务文档要求学生仅访问本人、教师仅管理本人教学班、管理员负责全局系统职责；但当前没有后端中间件或数据查询可验证。
- Web 教师/管理员角色路由、按钮显示和 Mock service 不是安全边界。
- 名单对齐页面在前端传入 `canManage`，真实后端仍必须按组织、教师与教学班关系重新校验。
- 本次统一权限模型固定只有 `STUDENT`、`TEACHER`、`ADMIN` 三个基础角色；资源范围另行校验。

## 10. 当前最严重的 10 个冲突

1. **后端存在性冲突**：根说明称后端完整，当前快照却没有任何后端源码、SQL 或 OpenAPI。
2. **审核模式冲突**：现有业务文档称提交后立即计入、无逐条通过/驳回；本次明确基线要求每条记录产生 `VALID/INVALID` 审核结果，只有有效记录计分。
3. **总学时规则冲突**：现有文档允许教师按教学班自由配置两类目标；本次基线以累计 20 小时触发成绩计算。
4. **客户端缺失冲突**：文档声称学生覆盖 Web/Android/iOS，当前只有 Android 学生端源码。
5. **API 版本冲突**：Android 同时使用无版本路径、`/v1` 路径和基础地址内 `/api`；Web 名单使用 `/api/v1`。
6. **身份与记录链冲突**：`id/studentId/studentNumber/number/account` 被混用，正式记录又缺 `enrollmentId/classSectionId/businessDate` 和显式 `recordId` 全链路。
7. **时间与时长冲突**：Android 混用毫秒、秒、小时并按设备时区的提交日期判断每日一次；Web 使用分钟/小时；目标要求组织时区的开始日期与整数秒。
8. **状态维度冲突**：打卡流程、审核结果、有效学时调整和显示文案被塞进多个 `status/auditStatus/published` 字段，未知账户/系统状态还存在 fail-open 默认。
9. **认证闭环冲突**：学生目标为验证码/设备会话，但 Android 验证成功尚未安装 token/workspace；Web 则为任意凭证 Mock 登录，服务端认证不存在。
10. **数据真实性冲突**：Web 展示完整教师/管理员能力但主要写入内存或浏览器 Mock；页面能力、静态权限和模拟危险操作不能等价为后端能力或业务验收。

## 11. 其他主要冲突与目标差距

- `Course` 在 Android/Web 同时承担课程定义与具体教学班职责；缺少 `ClassSection`。
- Android 将本地计时结束状态与正式提交结果靠 UI 流程衔接；不存在服务端 `ExerciseSession` 事实。
- 媒体响应直接暴露 `cosKey`/URL（`StudentApiResponses.kt:263-269`），存在存储实现字段直接暴露给客户端的风险。
- 现有上传为单次 multipart；目标合同要求预签名/上传/确认/绑定 `mediaId` 的独立流程。
- Web 教师端用数值 `studentId/recordId/courseId`，Android 用字符串；后端 ID 类型没有统一。
- Web 登录接受任意非空凭证并按账号正则猜角色，账号删除/全量清理甚至校验前端硬编码密码；这些只能用于演示，绝不能迁移为真实认证。
- Web 教师对象没有 `teacherId`，`teacherCourses` 实际取全部课程；管理员权限则来自静态全局集合，均没有资源范围安全性。
- 同一 Web Mock 学号在教师数据与管理员数据映射到不同姓名，Mock 不能充当身份 fixture。
- 教师端硬编码耐力成绩换算，管理员端维护另一套区间表，同一用时可得到不同分数。
- 已结束课程在 Web 中仍能进入名单、邀请、设置和成绩写操作，归档只读规则未落地。
- Android DTO 具有大量默认值，会把缺失字段伪装为 `0`、空串或默认状态，可能掩盖合同错误。
- Android 对未知 `AccountStatus` 默认 `ACTIVE`、未知/缺失 `SystemMode` 默认 `NORMAL`，属于写权限相关的 fail-open 风险。
- Android Mock 中使用中文状态与显示文本，和稳定英文业务枚举混合。
- Android 个人资料把内部 `student.id` 显示为学号，恢复申请也用 `studentId` 承载用户输入的学号；Mock 又直接令二者相等。
- Android 验证码页面成功后没有解析/保存 `LoginResponse`，外层明确回到登录方式选择，验证码会话闭环未完成。
- Android 每日一次按 `submittedAt` 和设备 `ZoneId.systemDefault()` 判断，而现有业务规则要求按运动开始日期；跨日/跨时区可能重复或误拦截。
- Android 采集位置但正式提交 DTO 没有位置字段；当前业务文档与隐私政策又对是否上传定位相反。
- Android 学生记录 DTO 含 `teacherInternalNote`，即使 UI 不显示也违反最小披露。
- “不足 1 小时后是否保留媒体草稿”在业务文档与实现相反；“达到 2 小时”在旧文档的自动结束、当前代码的暂停封顶和本次指令的停止累计待确认提交之间语义不一。
- 当前代码没有完整 `ReviewRecord` 历史；Web 修改 state 会覆盖结果。
- 当前代码没有可追溯的 `ScoreRule` 版本/快照与 `StudentScore` 来源链。
- 业务文档保留直接数据库操作、物理清理等建议，与阶段 8 要求的 migration、审计和删除策略需要重新裁定。
- 归档成绩修改职责在教师文档与管理员文档中相反：一处要求管理员开窗/审批，一处要求教师直接处理。
- 切换当前学期是否自动归档旧学期在教师/管理员文档中不一致。
- 学生“无密码、入班后绑定联系方式”的新合同，与遗留账号密码 DTO、隐私政策和历史 `password_hash/email NOT NULL` 描述冲突。
- GPS 是否上传并保存 90 天，与当前隐私政策“只单次获取、不上传”冲突。
- 打卡必须实时拍摄，与隐私政策允许系统照片选择器的宽泛表述冲突；需要按打卡、免测、反馈三种用途拆分。
- “通知不可关闭”只能约束服务端生成 App 内消息，不能覆盖操作系统层的 Push 权限。
- 管理员全量清理与隐私政策中教学记录六年、成绩可能长期留存的承诺冲突。

## 12. 缺失内容

- 单一权威后端仓库位置、技术栈与部署版本。
- 可执行数据库 schema、migration、索引、外键和数据迁移基线。
- iOS 与 Web 学生端源码及其真实 API 合同。
- 教师/管理员真实认证、授权、资源范围和写接口。
- 统一领域模型、字段字典、状态机、权限矩阵、错误码与 OpenAPI。
- 服务端运动会话、防双设备计时、时钟可信度和异常恢复。
- 媒体对象存储确认、病毒/签名校验、缩略图和孤立文件清理。
- 审核历史、并发控制、成绩规则版本、重算和来源追溯。
- 生产接口清单、遥测、真实数据库映射和兼容期客户端版本盘点。
- 正式隐私政策运营主体、联系方式和法务确认；当前政策仍有占位/待审核内容。

## 13. 高风险内容

| 风险 | 等级 | 原因 | 当前措施 |
|---|---|---|---|
| 按不存在的后端说明直接开发/迁移 | 阻塞 | 技术栈和真实 schema 无证据 | 阶段 10 前必须确认权威后端仓库与数据库基线 |
| 审核/计分语义未迁移 | 阻塞 | 会改变哪些记录计入总时长 | 新合同按本次基线设计；现有客户端列入迁移矩阵 |
| 20 小时与教学班自定义目标冲突 | 阻塞 | 直接改变达标与成绩 | 需要业务方确认“固定 20h”是否取代双目标配置 |
| ID 混用 | 高 | 可能串学生、串记录、泄露数据 | 内部 UUID 与 `studentNumber` 强制分离 |
| Web Mock 被误当真实写入 | 高 | 业务验收与数据安全风险 | 所有相关能力标记 Mock/尚未实现 |
| 演示认证/硬编码管理密码被复用 | 高 | 任意凭证可登录，危险动作只有前端校验 | 新后端接入前移除真实环境入口并实现服务端认证 |
| 客户端双份成绩算法 | 高 | 相同输入可能产出不同分数 | 只保留版本化服务端 ScoreRule；客户端仅展示 |
| 每日规则按错误日期/时区执行 | 高 | 跨午夜或设备时区变化可造成重复/误拦截 | 服务端以组织时区和 session start 生成 businessDate |
| 教师内部备注下发学生 API | 高 | 未授权信息泄露 | 学生 DTO 永不包含 internal note，教师 API 单独授权返回 |
| 直接暴露存储键/长期 URL | 高 | 可能越权访问媒体 | 新合同仅返回受控 `mediaId` 与短期访问 URL |
| 无 Review 历史/乐观锁 | 高 | 并发审核覆盖且无法追责 | 设计 append-only `ReviewRecord` + version |
| 客户端时间为最终事实 | 高 | 可篡改时长 | 服务端校验/重算；客户端只提供观测值 |
| 旧接口直接移除 | 高 | 未知远端与缺失客户端会中断 | 先兼容映射、遥测，再按版本废弃 |
| 管理员全量物理清理 | 高 | 审计与恢复风险 | 作为待确认高危运维流程，不进入普通 API |

## 14. 推荐统一顺序

1. 冻结本审计、冲突矩阵和决策日志。
2. 分离 20 个核心领域对象及关系。
3. 统一内部 ID、学号、时长秒和时间格式。
4. 分离入班、名单、会话、记录、审核、媒体和成绩状态机。
5. 冻结后端裁决的业务规则与边界值。
6. 建立三角色 RBAC + 组织/资源归属校验。
7. 生成唯一 `/api/v1` OpenAPI 及旧接口兼容表。
8. 统一枚举、错误码、国际化边界和工程安全规范。
9. 交叉审计合同并明确所有阻塞决策。
10. 只有阶段 9 标记“可以开始后端实现”后，才选择权威后端仓库、建 migration 和实现模块。

## 15. 阶段 0 基础检查

本阶段执行的检查均未连接或修改业务数据库：

- 根仓库与两个子模块在审计开始时均为 clean；根仓库已切换到 `backend/unified-contracts`。
- `git diff --check`：通过。
- Android `./gradlew.bat :app:testDebugUnitTest`：通过（首次运行需要下载项目指定的 Gradle 9.3.0；获准联网后完成）。
- Web `npm run typecheck`：通过。
- Web `npm test`：通过；包含 production build，25 项测试全部通过。
- 上述测试只能证明当前客户端/Mock 自洽，不证明缺失后端、数据库、iOS 或 Web 学生端已经实现。
