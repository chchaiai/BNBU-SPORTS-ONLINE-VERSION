# Docker 验证问题登记

当前状态（2026-09-08）：用户已明确允许修复。修复与复测持续进行，原始失败证据保留；下列早期条目中的“仅记录”“未修复”代表当时状态，不能据此判断当前实现。

最新完整结果及剩余工作请先查阅 [当前交接记录](HANDOFF-20260908-CURRENT.md) 和 [第八轮完整 Docker 回归](DOCKER-E2E-EIGHTH-20260908.md)。三端整体验收尚未完成。历史编号未删除或重编号；每个问题是否关闭须依据相应修复及复测记录，不以新增入口批量宣告关闭。

## V81-TEST-001：Prisma 约束映射名称过长

- 状态：OPEN，按用户要求保留，未修复。
- 批次：2026-09-07 Docker 第一批；镜像 `bnbu-v81-local-validation-domain-tests`，镜像构建 manifest `sha256:5363fa402c9530c384f6a1355836aa55da77d30840d3faff8a60aeee9febee40`。
- 命令：`docker compose -f tools/local-integration/compose.v81-test.yml run --rm --no-deps domain-tests node node_modules/prisma/build/index.js validate`。
- 预期：V8.1 Prisma 模型语法与关系通过校验。
- 实际：退出码 1，Prisma 7.9.1 `P1012`。`backend/prisma/schema.prisma:2252` 的 V81Event 唯一约束 map 名 `v81_events_organization_id_resource_type_resource_id_version_key` 超过 PostgreSQL 63 bytes 限制。
- 影响：当前新 schema 未通过验证，客户端生成、构建及依赖该模型的迁移/集成不能宣称通过。现有 SQL 的实际约束名称及 schema 一致性也尚未通过数据库验证。
- 证据：`evidence/docker-schema-validation-20260907.txt`。
- 后续：等待用户授权处理已记录测试问题；不得以重命名约束、排除模型或修改测试绕过本问题。

## V81-ENV-001：独立规则测试镜像缺少 OpenSSL 检测结果

- 状态：RECORDED，未处理。
- 同一次模型验证，Prisma 输出无法检测 libssl/OpenSSL、回退 openssl-1.1.x 的警告。
- 当前命令终止原因是 V81-TEST-001；不能将此环境警告误报为其唯一原因。
- 独立纯领域测试不依赖 OpenSSL，6/6 通过；后续完整 API/migrator 镜像的 OpenSSL 环境须单独验证。
- 证据：同上。

## V81-TEST-002：历史迁移文件字节校验和不匹配

- 状态：OPEN，按用户要求保留，未修复。
- 批次：2026-09-07 Docker SQL 探测，PostgreSQL 18.4；SQL 测试镜像 manifest `sha256:7a89f071649af5cb5cf6a9098e33add087b2229bc6b8ea347355f94baa7b95e8`。
- 命令：`docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml up --no-build --abort-on-container-exit --exit-code-from sql-tests sql-tests`。
- 实际：测试退出1，第一份迁移0001的原始字节 SHA 与 manifest 不匹配，未执行任何迁移 SQL。数据库只读确认 `18.4|0`（版本与 public 表数量）。
- 只读诊断：0001至0020均原始字节不匹配、LF规范化后匹配；0021至0024两者均匹配。0001含850个CRLF；期望 `0573e3d13018e0db103ef4b605eb35278723174507b37379425a489b10e1462d`，实际 `334afd5a098e68c3fef91e245908d2afb86dc177359d202fd447a82043534668`。既有 check-migration-safety.mjs 同样按原始字节计算。
- 影响：未验证 SQL 可执行性、约束或业务持久化；独立 SQL 探测不替代 Prisma 验证。
- 证据：`evidence/docker-sql-build-20260907.txt`、`evidence/docker-sql-probe-20260907.txt`、`evidence/migration-checksum-diagnosis-20260907.txt`。
- 保留迁移、manifest 和校验规则；未转换换行、改校验和或跳过检查。

## V81-TEST-003：网页 Phase 5B 协议 SHA 不匹配

- 状态：OPEN，未修复。
- 批次：2026-09-07 Docker Portal原有npm run typecheck；镜像manifest `sha256:17307c5a87de53caad7318af42549e0b1883130fcc0b06e122be062fc9f1f82a`，镜像构建成功，安装553依赖。
- 命令：`docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --rm --no-deps portal-tests`。
- 实际：退出1。Portal自身3.0.0-web-snapshot绑定与生成检查通过；随后scripts/verify-phase5b-contract.mjs:29报告期望 `667ae751f3e623e3d603db4d68e6e9314d4b3fd6da433a1def8c36b81597d74a`，实际 `9dc75779a6ca21f7f5f83ffe57be345d9008727af1f65d4858ea42e5e76d0433`。
- 影响：整条网页typecheck未通过，后续3份tsconfig的tsc未执行，教师退回补证接线不能声明编译验收通过。
- 证据：`evidence/docker-portal-build-20260907.txt`、`evidence/docker-portal-typecheck-20260907.txt`。
- 未修改协议、固定SHA或校验脚本，未跳过失败门禁；具体差异来源尚未核对，不能直接归因于迁移换行问题。

## V81-ENV-002：网页镜像安装脚本尚未批准

- 状态：RECORDED，未处理。
- Portal镜像npm ci安装成功，但npm提示esbuild、unrs-resolver、workerd的安装脚本不在allowScripts中。
- 不是本次Phase 5B SHA失败原因；后续网页运行构建所需原生组件尚未验证。
- 证据：`evidence/docker-portal-build-20260907.txt`。未运行approve-scripts或调整依赖配置。

## V81-TEST-004：既有审核测试要求保留旧协议阻断提示

- 状态：OPEN，未修复测试或实现以消除该失败。
- 批次：2026-09-07 Docker审核投影专项；镜像manifest `sha256:724159c40279a73c1b9519ee7a5aa6373bb1f3547b0520c9e3d6ceeb0c25720e`。
- 命令：`docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --rm --no-deps portal-tests node --import tsx --test tests/v81-review-projection.test.mjs tests/checkin-audit.test.mjs tests/review-public-reasons.test.mjs`。
- 结果：17项，16通过、1失败，退出1。新增3项V81投影用例通过，既有tests/checkin-audit.test.mjs:228要求源码包含“当前正式协议1.2.0…不能写入退回补证”的旧阻断提示，当前事件函数已实际调用V81补证审核接口，断言不匹配。
- 影响：该专项整体失败；通过的纯数据投影不证明按钮事件、网络、类型检查或后端持久化闭环。部分既有通过用例仍针对旧规则，不是V81验收。
- 证据：`evidence/docker-portal-review-build-20260907.txt`、`evidence/docker-portal-review-tests-20260907.txt`。
- 失败后未修改断言、补入虚假旧提示或回退接口接线；保留待后续授权处理。

## V81-TEST-005：游泳延迟说明与严格可选属性类型冲突

- 更新：最新目标取消只记录限制后已修复并复验。未提供说明时省略可选属性，保留原类型和编译选项；Docker npm run typecheck退出0，证据docker-resume-typecheck-20260907.txt（本目录）。以下保留原失败记录。

- 状态：OPEN，按用户指令未修复。
- 批次：2026-09-07 Docker游泳续传；镜像manifest `sha256:5e2e1414e114bbb4b6e188ca02ca4e1ad4e758bd595255e6189cf0684d9b2d09`。
- 命令：`docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --rm --no-deps sql-tests npm run typecheck`。
- 结果：退出2，TS2379，exercise-records.service.ts:541。传入initializeRecordWorkflow的swimDelayReason为string或undefined，而开启exactOptionalPropertyTypes后，目标可选属性存在时必须为string。
- 影响：当前后端类型检查不通过；此前旧镜像的通过记录不能代表当前代码可构建。未改传参、类型定义或编译选项绕过失败。
- 同批纯时间专项7/7通过，不包含服务层类型、SQL、文件上传或网页闭环。
- 证据：`evidence/docker-swim-transfer-build-20260907.txt`、`evidence/docker-swim-transfer-typecheck-20260907.txt`、`evidence/docker-swim-transfer-tests-20260907.txt`。

2026-09-07 更新：V81-TEST-001、V81-TEST-002已修复并复验通过。证据本目录docker-schema-fix-validation-20260907.txt、docker-sql-fix-probe-20260907.txt；OpenSSL检测警告仍存在。SQL探测通过不等于Prisma migrate历史、应用启动或业务验收。

V81-ENV-001更新：测试镜像安装openssl和ca-certificates后，当前客户端生成/构建无原检测警告。首次断网构建因Prisma引擎未预下载EAI_AGAIN退出1；已通过镜像构建阶段预生成解决，随后断网npm run build退出0。原失败日志保留。

V81-TEST-006：真实账号探测首次种子插入因随机组织后缀含小写违反organizations_code_format_check，退出1；证据docker-account-probe-20260907.txt。已将合成组织后缀改为大写，待Docker复验。未改业务数据库约束。

V81-TEST-006复验：第一次修正组织代码后暴露users_email_normalization_check（证据docker-account-retest-20260907.txt）；测试邮箱单独转小写后Docker账号批次通过，退出0（docker-account-retest2-20260907.txt）。两次失败原记录保留，数据库约束未弱化。

V81-TEST-007：上传探测创建学生前置数据时学号随机后缀含小写，违反student_profiles_student_number_check（23514）。证据docker-upload-probe-20260907.txt；已将测试后缀转大写，待复验。上传尚未执行，不声明通过。

V81-TEST-008：上传测试错误地让学生使用密码登录，HTTP401。已核对业务00-overview的邮箱一次性验证码规则，测试改为requestStudentSignInCode、Mailpit接收邮件、verifyStudentSignInCode；新增本地SMTP，待复验。原始证据docker-upload-retest-20260907.txt。

V81-TEST-009：学生验证码已受理但Mailpit收件0，测试失败。定位client-capabilities.module在APP_ENV=test时固定内存发信器，忽略显式SMTP。已改为显式emailDelivery优先，无邮件配置的test继续内存适配；待Docker复验。证据docker-email-upload-20260907.txt。

V81-TEST-010：上传初始化422已确认为MEDIA_BIND_TARGET_INVALID；media.service.targetScope与0012数据库约束仅允许运动IN_APP_CAMERA，测试使用FILE_PICKER。现行文档7.5允许运动截图辅助但未明确相册来源，已向用户确认。原失败docker-upload-diagnosis-20260907.txt。测试新增V81_UPLOAD_CAPTURE_SOURCE参数，默认验证现有允许的相机来源（合成素材声明，不证明真实拍摄），文件选择器受理待业务确认。

V81-TEST-010业务结论：用户明确运动材料只允许相机。原FILE_PICKER返回422符合规则，无需放宽；继续相机来源正向测试。

V81-TEST-011：相机来源已允许初始化和PUT，但确认422 MEDIA_INTEGRITY_MISMATCH；本批base64合成PNG总67字节、IDAT结束56、缺完整12字节IEND。已新增synthetic-png.mjs生成完整PNG/CRC，未放宽校验。原始docker-camera-probe-20260907.txt保留。

V81-TEST-012：维护切换POST返回500，PostgreSQL日志确认audit_logs_permission_id_check拒绝SYSTEM_MODE（仅大写/数字/连字符）；事务回滚。已改审计标识SYSTEM-MODE，保留权限枚举SYSTEM_MODE；同时测试恢复版本字段改为接口policyVersion。待Docker复验，证据docker-maintenance-20260907.txt。

V81-TEST-012复验通过：docker-maintenance-retest-20260907.txt退出0。扫描另发现认证撤销CERTIFICATION_REVOKE、分管理员SUBADMIN_MANAGE审计标识同样违反既有格式，已改连字符，尚未完成各自业务运行测试。

V81-TEST-013：认证材料初始化POST /media-uploads返回404 SESSION_NOT_FOUND。生成策略initiateMediaUpload.resourceResolver固定EXERCISE_SESSION_FROM_REQUEST，而认证请求合法使用enrollmentId。需修复权威协议/资源解析按用途校验。另只读发现认证确认后为UPLOADED，worker只扫描BOUND/PROCESSING，需补齐认证附件绑定处理入口。证据docker-certification-20260907.txt；尚未修复，不声明认证闭环。

V81-TEST-013复验通过：用途资源解析及认证确认自动绑定后，上传/提交/批准/撤销完整执行；docker-certification-fix-20260907.txt退出0。原失败记录保留。

V81-GAP-014：认证/免测业务允许WebP，但MediaValidator声明集合和HTTP DTO仅JPEG/PNG，parseImage无WebP分支，协议enum亦缺失。已新增用途区分声明测试，待执行与实现。格式依据Google官方WebP Container Specification https://developers.google.com/speed/webp/docs/riff_container ，需处理RIFF长度、VP8/VP8L/VP8X及元数据；不能只放开MIME而不检查真实文件。

### V81-TEST-015 完整后端单元测试 6 项失败（2026-09-07）
新增图片解码后的完整 Docker 单元测试：190 项，184 通过、6 失败。涉及旧 Contract 1.3 parity 基线、运动时长边界、会话计时两项、READ_ONLY 模式、学生成绩投影。原始证据 docker-decoder-unit-suite-20260907.txt 已保留；需逐项核对现行 V8.1 业务规则及对应实现，尚未分类为实现缺陷或旧测试迁移问题。媒体 16 项全部通过。

### V81-TEST-015 更新
按现行规则迁移 5 项历史断言后，全量 Docker 单元测试 189/190 通过。剩余 contract parity 失败包含 DTO/OpenAPI 可空性等实际差异，继续核查，不以更新缺陷白名单方式自动放行。证据 docker-v81-unit-retest-20260907.txt。

### V81-TEST-015 本轮关闭
DTO 可空性、公开原因枚举、补证小时数类型、数字枚举识别及错误码生命周期修正后，Docker 190/190 单元测试通过，类型检查通过。证据 docker-parity-fixed-unit-20260907.txt、docker-parity-fixed-typecheck-20260907.txt。此状态仅关闭该次单元测试失败，不代替全量业务验收。

### V81-TEST-016 会话同步接口运行时失败（2026-09-07）
扩展真实计时测试以验证完成后的 STATE_SYNC、事件去重、未来时间与伪造时长事件拒绝。首次 reconcile 返回 HTTP 500 SYSTEM_DATA_INTEGRITY_ERROR，测试退出码 1，后续断言未执行。原始证据 docker-session-reconcile-20260907.txt；数据库日志 docker-session-reconcile-db-20260907.txt 未出现对应 SQL 错误，尚不能认定数据库约束是根因。需检查应用层错误转换、事件/审计/Outbox 登记。依赖容器已停止，数据卷保留。

### V81-TEST-016 修正后通过（2026-09-07）
根因：完成会话的同步调用 appendEvidence 时附带 endReason，但 EXERCISE_SESSION_RECONCILED 审计元数据白名单不允许该字段；AuditService 在写库前抛出完整性异常。修正仅在非同步动作附带 endReason，结束原因仍保留于会话和结束审计。
Docker 完整构建及真实计时/同步复测通过，退出码 0。验证 STATE_SYNC 不改变完成状态与实际时长；同一客户端事件用新幂等键再次同步不增加版本，数据库仅一条事件；未来观察时间和 ADD_DURATION 事件均被拒绝（409），时长保持一致。证据 docker-session-reconcile-retest-20260907.txt；原失败证据保留。此项不证明真实设备断网和浏览器重启体验已验收。

### V81-TEST-003 更新：Portal typecheck 已通过
确认旧协议哈希差异仅由 CRLF 导致，恢复 LF 后精确匹配原登记 SHA256，Docker 完整 npm run typecheck 退出码 0。证据 docker-portal-typecheck-retest-20260907.txt。原失败证据保留；无界面布局改动。

### V81-TEST-017 Portal 全量测试首次结果
Docker npm test 构建通过，115 项中 111 通过、4 失败：旧审核纠正文案断言、9 处静态中文缺英文映射、镜像缺少 Python/PyYAML、原生 select 禁止断言。证据 docker-portal-full-tests-20260907.txt。已补充 7 个唯一英文资源键及测试镜像 Python/PyYAML，正在重跑 docker-portal-full-retest-20260907.txt；尚未声明通过。无布局改动。

### V81-TEST-017 复测
补充测试运行依赖与英文资源后，127 项中 125 通过、2 失败；构建通过。剩余旧纠正文案及原生 select 断言仍待核对。证据 docker-portal-full-retest-20260907.txt。

### V81-TEST-017 已关闭
核对原始控件并更新旧审核断言后，Docker Portal 构建及127/127测试通过。证据 docker-portal-baseline-fixed-20260907.txt。原始 UI 控件未变，仍需全量真实业务验证。

### V81-TEST-018 反馈处理被旧触发器拒绝
新增 getV81FeedbackDetail/handleV81Feedback，权限映射 STUDENT_FEEDBACK，155 操作静态 parity 通过。Docker 构建通过，学生创建反馈通过，但首次管理员处理返回500。PostgreSQL 明确报错 reject_feedback_mutation(): feedback mutation is unavailable until workflow approval。旧占位保护禁止所有反馈更新，与现行管理员文档第11节冲突。下一步新增迁移替换此触发器为字段、版本及历史约束，保留原始内容与追加记录不可变保护。证据 docker-feedback-api-20260907.txt、docker-feedback-api-db-20260907.txt；后续处理/去重/学生回读断言尚未执行。

### V81-TEST-018 修正后通过
新增0028_v81_feedback_mutation替换旧占位全禁写函数：只允许状态、公开回复、更新时间、版本变化，版本必须递增，不能重新回 OPEN，不能删除反馈。新增延迟约束触发器要求同事务存在匹配 HANDLED 历史。原始内容与追加历史保护保持。
Docker 28 迁移及构建通过，学生真实提交、管理员依次受理/待技术/完成/关闭/重新跟进、五条历史及幂等重放、学生回读最新回复与状态、教师详情403全部通过。证据 docker-feedback-api-retest-20260907.txt，退出码0；原失败保留。尚需负面数据库约束测试、分管理员权限组合、分页搜索、提交人信息、学生历史接口与原页面接线。

### 帮助接口测试脚本 URL 遗漏（2026-09-07，已修正测试脚本）
首次 Docker 创建和回读文章后，负面测试 fetch 使用相对 URL 导致 Failed to parse URL；业务服务未在该步骤被调用。已补 baseUrl，原失败 docker-help-api-20260907.txt 保留，复测 docker-help-api-retest-20260907.txt 通过。此项为测试脚本错误。

### 主机 Prisma 生成客户端过期（2026-09-07）
主机 npm --prefix backend run typecheck 报反馈模块 publicReply/previousStatus 不存在于生成的 FeedbackEvent 类型，并连带 creator/events 推导失败。主机生成文件落后于当前 schema；本轮改用自动 db:generate 的 Docker 镜像验证。未据此修改反馈业务逻辑。

### 原始体测通知读取测试脚本错误（2026-09-07）
首次docker-physical-notification-20260907.txt在原始结果HTTP通过后报Cannot read properties of undefined (reading filter)。原因是测试把通知data数组当作items分页对象；现有接口和反馈测试均使用data数组。已修正测试读取数组，原日志保留，业务通知写入未因此调整。

2026-09-07 体测选中确认首次 Docker 构建失败：ErrorDetails 不允许额外 rowNumber 字段（TS2353）。保留 docker-physical-import-confirm-20260907.txt；错误使用既有 reason 字段，行号疑点由草稿详情提供，复验另存。

2026-09-07 体测确认复验 HTTP 500：PostgreSQL 确认 v81_events_resource_version_key 冲突，批次创建已有版本 1，确认再次写 1。批次锁内按批次审计最大版本递增；行修订亦采用独立批次审计版本，避免不同行共享行版本冲突。保留 confirm-retest 原日志。

### XLSX 体测草稿解析基础（2026-09-07）
后端复用现有 Portal 的 SheetJS 0.20.3 官方 tarball，package/lock 更新。新增 readPhysicalXlsx，要求显式工作表名和技术资源限制；显示字符串保留学号前导零和4.30歧义，日期格式的数字单元格按Excel日期体系转换YYYY-MM-DD；公式、合并单元格、宏、非法单元格类型和超行数拒绝。复用 CSV 五列映射进入草稿行。此代码尚未注册文件上传HTTP，仍需解析进程/解压资源限制和原始XLSX对象留存。
实现依据：https://docs.sheetjs.com/docs/csf/cell/（单元格底层值、显示文本、数字日期及公式字段）；未使用ExcelJS依赖。
正在 docker-physical-xlsx-parser-20260907.txt 运行解析专项。npm-audit-xlsx-20260907.json 记录当前依赖4项告警（fast-uri/mysql2/prisma/qs，2 moderate/2 high），未自动更新依赖或宣称已处置；需后续按具体依赖链评估。

2026-09-07 体测草稿并发首测失败：同一行竞争返回201/500。PostgreSQL记录组织行FOR UPDATE升级与幂等记录组织外键KEY SHARE的死锁；体测导入和正式结果组织锁改FOR NO KEY UPDATE，仍串行化业务变更并兼容外键检查。原证据docker-physical-import-concurrency-20260907.txt保留，复验另存。

2026-09-07 邮箱换绑并发首测服务已返回200/401，但测试误读不存在的user.primaryEmail导致断言失败；现有/me协议仅返回primaryEmailMasked。改为断言脱敏邮箱/已验证标记，并检查数据库完整邮箱与版本。原日志docker-email-rebind-concurrency-20260907.txt保留，未为测试扩大个人信息返回。

### 教师批量确认测试脚本偏差（2026-09-07）
- docker-teacher-import-confirm-20260907.txt 退出1：测试错误访问 /teacher/class-sections，404；当时预览、确认建号、重放、冲突及密码哈希断言已通过。已核对现有控制器，改用 /teachers/{teacherProfileId}/class-sections。
- docker-teacher-import-confirm-retest-20260907.txt 退出1：门禁403符合预期，但测试读取非公开 details.reason。publicErrorDetails 不输出内部 reason；测试改为公开错误码，并验证本人改密后同一路径200。服务未因这两项脚本错误更改业务语义。最终复验日志独立保留。

### 学期摘要去重测试数据修正（2026-09-07）
docker-semester-summary-distinct-20260907.txt退出1：测试直接为同一学生同一学期建立第二条ACTIVE关系，被组织/学期/学生唯一约束拒绝。不是摘要查询失败，也未解除业务数据库约束。测试修正为另一教学班中的REMOVED历史关系，继续验证2条关系仅统计1名学生，复验单独记录docker-semester-summary-history-20260907.txt。

### 名单注册预览测试夹具生命周期（2026-09-07）
docker-roster-registration-api-20260907.txt退出1：测试直接创建VALIDATED官方名单被0004数据库初始状态约束拒绝（必须RECEIVED）。测试改为RECEIVED→VALIDATING→插入人员行→VALIDATED，不解除任何数据库约束。此失败发生在夹具构造阶段，尚不能判断预览API运行结果。复验日志docker-roster-registration-api-retest-20260907.txt独立保留。

### 更换名单来源测试的可空JSON字段（2026-09-07）
docker-roster-settlement-source-change-20260907.txt退出1：测试通过展开读取记录复制新RECEIVED来源，复制了failureDetailsSafe:null。该可空JSON字段写入时成为JSON null，触发要求failure_details_safe IS NULL的初始状态约束。测试改为不传该字段，使用数据库NULL默认值；生产服务和数据库约束均未因此调整。复验日志docker-roster-settlement-source-retest-20260907.txt。

### 综合名单体测联调夹具（2026-09-07）
docker-composite-roster-preview-20260907.txt退出1：综合名单读取/零进度断言已通过，后续体测写入422；通用学生夹具gender=OTHER，而本次输入为男子1000m。测试明确把该合成学生设置为MALE后复验，不修改后端项目匹配规则。复验日志docker-composite-roster-preview-retest-20260907.txt。

### Portal 名单文件解析容器依赖阻断（2026-09-07）
证据 docker-roster-confirmation-client-20260907.txt，退出1。后端启动及四角色登录/首次改密通过，但加载真实 Portal 文件解析模块时找不到 xlsx，错误路径为 /workspace/BNBU-Sports-Web-new/portal-teacher-admin/app/roster-import.ts。名单上传、教师确认和确认响应丢失重放尚未执行，不能据此判断这些接口通过或失败。类型检查和名单专项10/10不关闭此问题。当前仅记录，尚未修复。

### 课程关闭后仍可新增名单来源（2026-09-07，未修复）
依据 docs/business/20-teacher-flow.md 第4节关闭规则（第110行）及第8.1节名单受理：关闭后延续的是关闭前已受理链路。新增 V81_ROSTER_CLOSED_INTAKE 使用真实CSV multipart文件、真实责任教师令牌与真实后端/存储；开放课程首次上传201且VALIDATED，数据库将课程置为CLOSED后，以新幂等键上传另一名单仍201，official_roster_imports数量由1增加到2。期望409且来源数量不变，断言失败。证据 docker-roster-closed-intake-20260907.txt，Docker退出1。
定位：backend/src/modules/roster/application/roster-imports.service.ts:create 入口调用 assertTeacherSection，该方法只核对组织和责任教师，未检查课程关闭状态；源受理事务也未见课程状态条件。V8后续确认接口拒绝关闭后来源的已有验证不能替代入口受理约束。此问题会在关闭后写入新来源，需要后续处理受理事务与关闭并发边界；本轮按测试问题记录要求未修复。

### 名单XLSX服务器源表解析基础（2026-09-07）
新增 backend/src/modules/v8/domain/roster-xlsx.ts：直接读取指定工作表，保留每个人员行的源行号和原始显示单元格，保留重复身份、缺失身份及额外来源列；按100MB文件/500人员行上限拒绝超限，要求学号与姓名列，拒绝公式、合并格及宏。保留显示格式中的前导零，不自动合并身份或创建正式名单。
Docker docker-roster-xlsx-source-20260907.txt 退出1，3项测试2通过1失败。前导零、原始空白文本、重复及错误行对应断言通过，失败在后续输入Buffer深比较：SheetJS为输入对象添加chk/l/read_shift/write_shift辅助属性。日志未证明文件字节改变；原件字节一致性需另行针对字节/摘要验证，当前不把该项列为通过，未修复。
以本轮实际构建的domain-tests镜像执行npm run typecheck通过（docker-roster-xlsx-typecheck-20260907.txt）。另一次backend-build使用已有独立镜像，日志docker-roster-xlsx-build-20260907.txt退出0不作为本新增源码编译证据。
当前只是服务器解析基础，尚未接入HTTP受理、私有原件保存及摘要、隔离解析worker、教师确认与协议。公共入口接入前必须完成隔离和资源限制验证；现有CSV/XLSX网页转换流程仍未替换。189操作/34迁移，整体业务验收和最终Git存档未完成。

### CSV名单501人员行仍受理并成为当前来源（2026-09-07，未修复）
现行教师业务8.1要求客户端/服务器均校验500人员行。Docker docker-roster-csv-row-limit-20260907.txt退出1：真实CSV500行201且VALIDATED；随后501行仍201、数据库当前来源totalRowCount=501，并替换先前500行来源。期望422且保留原当前来源，断言失败。
backend/src/common/roster-ingestion/roster-csv-parser.service.ts的MAX_ROSTER_ROWS仍为10_000；Portal roster-import.ts同值，客户端专项另行验证。V8确认接口拒绝大于500行并不能替代上传/预览上限。此问题仅记录，本轮不修复。

### 网页CSV/XLSX人员行上限（2026-09-07，未修复）
Docker docker-roster-portal-row-limit-20260907.txt退出1：两个格式均通过500行解析断言，但501行没有按现行规则抛出ROW_LIMIT_EXCEEDED，2项测试均失败。原因定位为roster-import.ts沿用10_000上限。测试新增roster-row-limit.test.mjs并纳入test:v81；失败不掩盖、不修改生产逻辑。
因此当前XLSX服务器501行拒绝已通过，但网页CSV/XLSX和CSV服务器的500行上限未通过；CSV服务器还会将501行来源设为当前。完整三端验收、剩余业务和最终Git存档继续未完成。189操作/35迁移。

### 学生名单状态边界及测试助手阻断（2026-09-07）
Docker docker-student-roster-boundaries-20260907.txt退出1。默认真实业务链、本人名单基础及导出回归先通过；新增测试随后用本地数据库身份夹具验证emailVerifiedAt=NULL→PENDING_REGISTRATION、姓名不符→IDENTITY_CONFLICT、学号不在源名单→EXTRA_IN_PLATFORM，三者registrationComplete=false且与教师综合名单逐项一致。各断言执行完并在finally恢复原邮箱/姓名/学号后，创建另一学生时失败。
失败位置backend/test/helpers/exercise-session.ts:30，seedExerciseSessionStudent尝试更新已经发布的课程时间，数据库P0001拒绝“Published V8.1 schedule is immutable”。此为测试助手不适用于该阶段的夹具阻断，不能算学生本人查询接口失败；也不能把尚未执行的读取他人关系404或最后MATCHED回读标为通过。末尾整体PASS标记未输出。本轮记录而不修复助手，不放宽已发布时间约束。
新增身份变更仅是数据库夹具，不代表学生或教师有修改身份权限。另一学生成员关系隔离验证、客户端展示与完整三端仍待完成。191操作/35迁移，整体目标和最终Git存档未完成。

2026-09-07 docker-admin-directory-manual-credit-20260907.txt 整体退出1。新增真实 HTTP 断言 ADMIN_DIRECTORY_MANUAL_VALID_RECORD_CREDIT_3600 和 ADMIN_DIRECTORY_CORRECTION_INVALID_REMOVES_CREDIT_PRESERVES_SUBMISSION 均通过：原相机材料/人工审核合法记录计入3600秒，纠正无效后0秒、有效数0/无效数1且提交人数保持1。实际时长由既有 elapsedSessionFixture 构造，非真实运动实拍。最后仍在 backend/test/helpers/exercise-session.ts:30 创建另一学生时更新已发布课程时间表，P0001 Published V8.1 schedule is immutable，属于已有夹具阻塞，未修复，不得把整条运行标为通过。数据库移出成员非零历史分组、无当前学期真实数据库以及浏览器验收仍未证明。

2026-09-07 OCR 草稿接入基础：新增 domain/ocr-table-source.ts，以腾讯云 RecognizeTableAccurateOCR 的 TableDetections/Cells 为输入，输出保留原文、单元格位置、置信度、四点坐标、请求标识和输入原件SHA256的草稿证据。永远 requiresTeacherConfirmation=true，不推断表头、不转学号或4.30用时、不合并重复/姓名、不用置信度自动通过。输出资源限制为32表、32000单元格、1Mi字符；这是上游响应资源限制，不替代业务500人员行/100MB源批次限制，后续必须在明确选择表头/表格后执行业务限制。
官方接口依据 https://cloud.tencent.com/document/product/866/86721 和数据结构 https://cloud.tencent.cn/document/product/866/33527 ，仅用于字段适配设计，未调用腾讯云OCR、未传输任何材料或启用收费服务。SDK/签名调用、原件受理、任务重试、数据库草稿及教师确认仍未实现。解码器接收的SHA256由未来服务端读取原件后核验，不是当前已验证的原件上传链路。
Docker docker-ocr-table-source-20260907.txt 3/3通过、退出0：前导零/重复/含空白换行姓名/4.30原文保留、输入对象不变、缺省置信度、非法类型/坐标/置信度/空结果/提供方错误与资源边界。随后 docker-ocr-table-source-typecheck-20260907.txt 退出2：新测试代码直接数组下标触发TS2532，故意构造null/非字符串坏输入与测试工厂推断类型不兼容触发TS2322；已按用户要求只记录不修复。运行测试通过不等于类型门禁通过，当前不能宣称后端整套检查通过。

2026-09-08 docker-ocr-physical-confirmation-build-20260908.txt退出1：构建器请求docker.io/library/node:24.18.0-bookworm-slim清单时TLS handshake timeout，未进入新代码编译。保留原日志；随后另行重试构建并执行真实HTTP探测，结果以docker-ocr-physical-confirmation-http-20260908.txt为准。未因网络问题修改业务代码或依赖版本。

2026-09-08 OCR正式体测确认接口已实现：GET/POST /ocr-batches/:batchId/physical-confirmations（getV81OcrPhysicalConfirmation/confirmV81OcrPhysicalRows）。读取最新草稿的精确身份/项目/用时/日期/源核对问题、已确认关联和待处理数量；POST带expectedDraftVersion与每行expectedResultVersion，锁组织NORMAL及批次，复查责任教师/未归档/合法课程源，先按全批校验重复身份，再检验选择范围未确认且无问题，事务内调用正式体测追加服务，生成学生通知、0039来源关联和事件，未选行保持待处理。草稿修订接口补充已确认行409拒绝；原正式纠正历史入口不受本次替代。
本地协议静态parity通过：207操作/207路由，query39/body99。第一次Docker构建因镜像仓库TLS超时退出1（docker-ocr-physical-confirmation-build-20260908.txt）。重试docker-ocr-physical-confirmation-http-20260908.txt退出1：Nest构建通过、39迁移无待应用、原OCR排队/权限/重放检查通过；新增测试尚在seedExerciseSessionStudent创建合成学生时触发23514 student_profiles_student_number_check，未进入新增GET/POST及学生结果回读断言。不得声称正式体测OCR HTTP闭环通过。按用户要求保留失败，不修改夹具或业务代码规避失败。
新增测试使用randomUUID前8字符作为学生夹具suffix；既有helper直接拼入学号，并固定gender=OTHER。学号格式约束与该输入存在不兼容；另有性别OTHER无法映射800/1000项目的静态测试前置风险，尚未运行到该断言，不能称其已复现。需要后续用户授权处理测试问题后再验证正式确认、原子拒绝/回滚、通知一次、来源关联、学生仅正式结果、剩余行状态及确认行禁止编辑。原领域和来源存储局部通过不能替代此HTTP证据。
当前207操作/39迁移，前端UI/UX未改，原已知测试问题仍保留，全范围验收、最终交接与精确本地Git存档尚未完成。

2026-09-08 OCR学生/综合名单导出新增探测：tools/local-integration/v81-ocr-roster-member-probe.mjs计划在现有OCR确认后建立合成匹配成员和名单外成员，检查学生本人范围、管理员未录体测数量、教师综合预览和XLSX来源元数据。docker-ocr-roster-member-export-20260908.txt退出1：40迁移/Nest构建及已有OCR草稿、结算阻塞、摘要、确认检查通过，随后/auth/password-login返回401 AUTH_CREDENTIAL_INVALID，后续新增断言全部未执行，不能宣称学生或导出通过。
只读定位：backend/src/modules/auth/auth.service.ts passwordLogin明确拒绝非TEACHER/ADMIN角色（约189行）；新增测试把合成学生错误地送入密码登录。该失败属于测试登录流程与后端角色规则不符，未发现密码登录应放开学生的业务依据。依用户“测试出问题仅记录”保留原测试与401证据，不放开后端规则，也未修改为另一登录流程重跑。既有正式体测HTTP测试还有独立学号夹具失败，均未修复。
当前209操作/40迁移；本轮仅新增测试，无前端改动。OCR学生本人状态、匹配后的管理员体测未录数量、OCR综合名单和导出仍缺本次真实HTTP验收证据。后续若获准修复测试，应使用学生现有授权登录流程并重新验证上述断言；不能以以前的局部通过补作本次通过。完整目标、交接和最终本地Git存档尚未完成。

2026-09-08 补练接入会话启动：exercise-sessions.service.start在事务内锁组织NORMAL、课程和成员；已发布regular_deadline之后查询本人已受理/当前窗口内/未撤销授权，无授权返回SESSION_OUTSIDE_TIME_WINDOW。普通截止前仍用原普通日期/日内/排除日检查；补练窗口作为普通窗口之外的指定授权，但仍要求ACTIVE课程、CURRENT学期及真实业务日期在学期内。服务器生成开始时间/业务日，0041会话来源与新会话原子写入；日周计入代码未改。已结算课程阻止新会话的条件仍待正式结算状态实现后接入。
Docker docker-makeup-session-20260908.txt整体退出1：41迁移/Nest构建通过，新增测试成功通过本地Mailpit学生验证码登录、普通截止后无授权409、教师授权后201、同键重放、服务器业务日不同于客户端7天前时间、授权来源关联、撤销后已有会话仍IN_PROGRESS等顺序断言。随后取消会话请求携带clientObservedAt，被422 VALIDATION_FAILED拒绝；CancelExerciseSessionRequestDto仅接受reason和expectedVersion，该测试多传字段。按用户要求保留测试及失败，不修改测试流程或放宽DTO。因在取消处停止，撤销后再次启动拒绝和最后关联数量断言未执行，不能称整条补练闭环通过。
测试留下一个合成IN_PROGRESS会话及已撤销授权作为失败证据；停止Docker服务保留持久卷，不把它取消或抹除。尚需正常窗口启动回归、撤销/关闭/维护/成员变化竞争、补练会话结束提交与原日周上限、学生查询通知及网页接线。协议补充startExerciseSession语义，本地215操作parity通过，query41/body103。既有失败继续保留，UI/UX未改；完整目标及最终Git存档未完成。

### 学期切换前检查与新增鉴权缺口（2026-09-08）
实现 GET /admin/semesters/{id}/switch-check：按组织业务日期检查目标UPCOMING/开始日期，读取旧当前学期及版本，汇总全部课程数并分页返回课程结算阻塞。V81SettlementCheckService抽取同事务读取方法，调用方分别验证责任教师范围或SEMESTER_MANAGE权限，不伪造教师身份。正式课程结算来源仍未实现；旧学期有课程时FORMAL_COURSE_SETTLEMENT为UNAVAILABLE，ready=false。该接口只读，不执行切换/归档，也不清空待办或改变教学事实。
Docker docker-semester-switch-check-20260908.txt退出1：217操作/217处理器parity通过（query43/body103），Nest构建与41迁移通过，已有学期创建、编辑、并发版本、历史、归档配置只读、跨组织和分管理员授权回归通过。随后管理员首次请求新增switch-check?limit=1返回403 PERMISSION_RESOURCE_SCOPE_DENIED，新增日期/分页/课程一致性/不写入等断言未执行。
只读定位：backend/src/common/policy/v81-admin-permission.guard.ts 的operations映射未包含 getV81SemesterSwitchCheck；守卫对未映射操作返回ADMIN_OPERATION_NOT_ASSIGNED。按用户“测试出问题只记录”要求保留代码缺口、原失败及测试，不补映射、不绕过守卫。后续需用户允许修复后再完成运行验收。正式结算来源、原子切换/历史/唯一当前与并发保护仍待实现；不得将本次预检查实现称作学期切换已完成。

### 2026-09-08 分管理员权限数组协议检查失败（保留未修复）
证据：subadmin-permissions-parity-20260908.txt，退出1。228 operations/handlers、query46/body108，新setV81SubadminPermissions.permissions报告ENUM_MISMATCH：contract OPEN_STRING，backend八项固定权限枚举。当前本地OpenAPI以array.items.enum表达枚举，DTO以IsIn(ADMIN_PERMISSIONS,{each:true})表达；本轮只记录观察，不修改检查器、DTO或协议来消除失败，不宣称当前协议parity全通过。Docker运行探测与该静态协议检查分别报告。

2026-09-08 分管理员权限编辑：新增POST /admin/subadmins/{id}/permissions，仅SUPER、同组织现有SUB、NORMAL模式；固定8项权限替换（可撤销全部）、expectedVersion、幂等重放、并发组织锁、用户更新时间和不可变权限变化审计。既有会话请求由当前权限守卫读取新权限；不改账号身份、密码或启停状态。当前228操作/45迁移。
测试结果：subadmin-permissions-parity-20260908.txt退出1，permissions数组枚举ENUM_MISMATCH；已记录未修复。docker-subadmin-permissions-20260908.txt退出1：Docker构建、45迁移、健康与四类基础账号登录/首次改密通过，新合成管理员adminProfile.create报字段值过长，权限更新HTTP断言尚未执行。合成user已创建而adminProfile未建立，不把该残留夹具当成真实管理员，不删除或隐瞒。测试与实现均未据此修复，权限更新/并发/撤销/越权尚无运行通过证据。整体目标和本地Git存档未完成。

## 2026-09-08 固定拒绝入口与学生注销缺口复核
可复现命令：node tools/local-integration/inventory-v81-runtime-boundaries.mjs。输出runtime-boundaries-20260908.json，当前228操作中静态定位13个直接调用deny/denyStudentUpdate的处理器，另确认学生网页两项注销方法存在而本地协议没有对应路由。此脚本只覆盖显式拒绝与指定注销动作，不能证明其余215项功能完整。
分类：6个定位/轨迹及位置隐私入口按学生业务第11节禁止采集的要求继续拒绝；学生资料更新入口受管理员只读边界限制，不能为了清空占位统计开放。旧4个/exports入口继续固定拒绝，现行综合名单XLSX及运行诊断ZIP另有专用接口，旧入口与现有页面调用关系仍需逐一核对。sport-catalog、activity-conversion-rules旧入口用途需对照现行运动选择及换算语义，不能直接用任意种子数据补成功。
新增明确缺口：学生业务10-student-flow.md第5.6节要求本人当前已验证邮箱OTP确认注销。现有网页api.js已调用POST /me/account-deletion-challenges及POST /me/account-deletion-challenges/{challengeId}/confirm，且严格校验挑战和DELETED结果；backend/src当前未发现AccountDeletion/ACCOUNT_DELETION/account-deletion实现或路由。当前不能完成该实际业务动作。后续必须实现挑战投递/身份重验/进行中运动及其他阻塞校验/全会话撤销、账号个人资料物理删除以及独立历史主体引用保留；禁止把users.deleted_at软删除冒充文档要求的物理删除，也不能删除运动、课程、媒体、审核、成绩和审计事实。
该检查不修改已有界面或业务代码，不修复此前两项分管理员权限测试失败。下步优先梳理账号资料与历史事实外键边界，补齐遗漏的本人注销能力；教师/分管理员删除共享历史主体设施但各自权限和职责阻塞独立。

2026-09-08 注销的会话/偏好/设备历史引用：0049新增三个只含id、组织、历史用户主体、创建/退出时间的表，为现有行回填并维护新增/删除主体；12条事件/运动历史外键改接这些非认证主体，当前refresh token、幂等、入班能力、推送设备及验证挑战仍引用当前会话。元数据来源history-session-foreign-keys-20260908.json；不保存设备令牌、偏好内容或会话认证状态到历史主体。
Docker docker-session-subjects-20260908.txt退出1：49迁移成功应用，构建/健康/基础账号登录通过，专项在prisma.userPreference.delete处被既有0011_client_capabilities/migration.sql:1058触发器拒绝，P0001:user preferences cannot be deleted。按用户要求记录，未修改触发器/删除逻辑/测试以规避失败，后续会话删除与历史不变断言未执行。session-subject-rollback-20260908.json只读核对最新合成偏好事件，偏好、会话、事件仍在，两个主体均未退出，失败事务已回滚。
该现有不可删除规则阻断偏好清理，当前不能宣称完整账号清理通过；注销确认及删除回执仍未实现。已向用户确认业务歧义：待审核、待补证、技术处理中材料及待处理认证/免测是否阻止注销，尚无答复；与本次数据库触发器失败分别保留。整体目标及本地Git存档未完成。

### 2026-09-08 持续浏览器联调 Compose 继承失败（保留未修复）
证据docker-browser-startup-20260908.txt，命令合并compose.v81-test.yml与compose.v81-browser.yml启动backend-browser，退出1：cannot extend service "backend-browser" ... service "backend-startup" not found。配置解析阶段失败，未启动服务。保留失败覆盖文件及引导脚本，不更改extends引用或绕过启动；独立数据库与状态目录均未产生，未执行三端浏览器验收。独立媒体签名适配器专项通过不能关闭该失败。详见BROWSER-STARTUP-20260908.md。

2026-09-08 用户已授权修复。Compose继承与内部网络端口发布已修正，宿主机3199健康/就绪200；学期切换预检查权限403复测通过；协议数组枚举检查修正后232操作parity通过。详见REPAIR-STARTUP-GATES-20260908.md及新复测日志，旧失败保留。正式结算/注销与其余失败未完成，业务歧义继续待答复；持续测试容器保持运行。

2026-09-08 名单边界修复：服务端CSV与Portal CSV/XLSX统一500行，新受理锁课程并拒绝关闭状态，成功旧请求仍可同键重放。4份Docker复测均退出0、232操作parity通过，见REPAIR-ROSTER-BOUNDARIES-20260908.md。持续后端刷新后本机3199就绪200。旧失败证据保留，其他名单问题继续处理。
2026-09-08 分管理员权限复测完成：修复合成工号长度并按业务补齐独立登录账号，docker-subadmin-permissions-final-20260908.txt退出0，授权/重放/并发/旧会话撤权/越权与版本事件通过。管理员OTP邮件用途及SMTP/SES双语适配器6项Docker测试通过；实际身份挑战及建号仍需实现。见SUBADMIN-PERMISSIONS-OTP-PREPARATION-20260908.md。
