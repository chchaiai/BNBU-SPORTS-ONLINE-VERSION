# 本地验证记录

状态：局部验证，三端业务验收未完成。日期：2026-09-07。

| 批次 | 结果 | 范围与限制 |
|---|---|---|
| Docker 独立规则镜像构建 | 通过，退出0 | Linux Node 24.18.0，锁定依赖637个；不是 API 构建 |
| Docker V8.1 domain 单元测试 | 6/6通过，退出0 | 真实分钟门槛、每日/每周/分类联合选择、独立穷举对照、同总量保留原组合、补证中断去重、一次补证及原因限制 |
| Docker Prisma 模型校验 | 失败，退出1 | P1012 唯一约束映射名称过长；记录 V81-TEST-001，未修复 |
| Docker PostgreSQL SQL 探测 | 失败，退出1 | PostgreSQL 18.4启动成功；0001校验和不匹配，SQL未执行；V81-TEST-002 |
| Docker API 类型检查 | 最新失败，退出2 | 游泳续传改动触发TS2379，V81-TEST-005；此前通过只覆盖对应历史镜像 |
| API 构建/接口联调 | 未执行 | Prisma及迁移失败仍未处理，类型检查不能替代运行验证 |
| Docker Portal镜像构建 | 通过，退出0 | 553依赖；安装脚本警告V81-ENV-002保持记录 |
| Docker Portal原有typecheck | 失败，退出1 | Portal快照检查通过；Phase 5B SHA不匹配V81-TEST-003，后续tsc未执行 |
| Docker审核投影专项 | 16/17通过，整体失败 | 新增3项V81投影通过；旧源码提示断言失败V81-TEST-004。不是UI/API闭环 |
| Docker课程可完成性专项 | 6/6通过，退出0 | 学校时区、开始窗口、截止当天、排除日期、周共享名额、分类目标及学期范围；不含DB发布事务 |
| Docker游泳受理时间专项 | 3/3通过，退出0 | 15分钟边界、延迟说明、24小时边界及服务器结束事实；不含SQL/传输/页面 |
| Docker游泳续传时间专项 | 7/7通过，退出0 | 包含原3项及故障重叠/暂停/不复活/30分钟边界；服务层类型检查失败 |
| Docker学生补证客户端专项 | 3/3通过，退出0 | 使用fetch模拟验证待办分页、拒绝重复游标、补证请求重试参数；不是API/E2E |
| Docker内部最终成绩协议专项 | 3/3通过，退出0 | INT边界、拒绝额外备注字段、仅教师角色的协议声明；不等于运行权限或数据库通过 |
| 学生—教师—管理员真实闭环 | 未执行 | 页面事件接线及剩余后端业务仍在实施 |
| 腾讯 COS/CVM/PostgreSQL 云端 | 未执行 | 本轮未操作云端 |

## 重现入口

在仓库根目录执行：

```powershell
node tools/local-integration/initialize-v81-sql-probe.mjs
docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml build domain-tests
docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --rm --no-deps domain-tests
docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --rm --no-deps domain-tests node node_modules/prisma/build/index.js validate
```

以上为当前配置重现命令；最初领域测试时尚无SQL服务，因此历史证据中的命令不带env-file。初始化脚本只生成被忽略的本地随机密码，已有文件保持原样。

SQL探测入口：先使用同一compose配置 `build sql-tests`，再执行ISSUES.md中记录的命令。已知校验和失败未修复，不应期望迁移成功。数据库 public 表数量为0，未执行应用种子或业务写入；数据库卷保留供复核。

类型检查：`docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --rm --no-deps sql-tests npm run typecheck`，证据 `evidence/docker-typecheck-20260907.txt`。提交响应投影新增后已重建镜像并复验通过，证据 `evidence/docker-submit-projection-build-20260907.txt`、`evidence/docker-submit-projection-typecheck-20260907.txt`，镜像manifest `sha256:6f3c9ed1298a5dcc03d09980ab9b58eccdd56b09b0789e5c78e245eaaa1b8dc1`。

人工模式状态GET新增后再次按同一后端类型检查命令复验，通过退出0；证据 `evidence/docker-manual-mode-build-20260907.txt`、`evidence/docker-manual-mode-typecheck-20260907.txt`，镜像manifest `sha256:138c0d5176366e2daae79f4d3e0530a9dafa016ed043554076204b413af55bec`。仍未生成新Prisma客户端或执行数据库业务。

课程可完成性改动后，镜像manifest `sha256:d9d5b78b942a5b139369d459439290fdfb4285e63f20ac0f610aa3184a267989`。执行同一compose的 `run --rm --no-deps sql-tests node --import tsx --test test/unit/v81-course-plan.test.ts`（6/6）及 `run --rm --no-deps sql-tests npm run typecheck`（退出0）。证据 `evidence/docker-course-plan-build-20260907.txt`、`evidence/docker-course-plan-tests-20260907.txt`、`evidence/docker-course-plan-typecheck-20260907.txt`。

游泳受理批次镜像manifest `sha256:8af387c386ff2100c8d12a4d9d84f25f1bd23d5d1dc90c18bd09ca47ded6aaff`；同一compose运行 `run --rm --no-deps sql-tests node --import tsx --test test/unit/v81-swim-intake.test.ts`（3/3）及 `run --rm --no-deps sql-tests npm run typecheck`（退出0）。证据 `evidence/docker-swim-intake-build-20260907.txt`、`evidence/docker-swim-intake-tests-20260907.txt`、`evidence/docker-swim-intake-typecheck-20260907.txt`。新模型仅手写同步，P1012及迁移校验失败未修复，不能以旧生成客户端类型检查通过证明新DB可运行。

学生补证客户端镜像manifest `sha256:d3e02e546bd70b25ec7a0ec5ba615bc2758a7ba7545cd4a66a1da38caf1aab33`，同一compose运行 `run --rm --no-deps portal-tests node --test ../frontend/student/v81-proof-client.test.mjs`，3/3。证据 `evidence/docker-student-proof-build-20260907.txt`、`evidence/docker-student-proof-tests-20260907.txt`。

待办后端镜像manifest `sha256:8330780ad418e870ffe2d5844de4c9e041eb3a96f7e4f5b0c522953edfd199b4`，`npm run typecheck`仍退出2、TS2379同一处失败，未修复或计为新增问题；证据 `evidence/docker-proof-todos-build-20260907.txt`、`evidence/docker-proof-todos-typecheck-20260907.txt`。

内部成绩镜像manifest `sha256:2bf3ffcab4772f9fdf20937d4d03fbd68081d8fccba4ad965918588934c3fee2`，同一compose运行 `run --rm --no-deps sql-tests node --test test/unit/v81-final-grade-contract.test.mjs`（3/3）；`npm run typecheck`仍退出2、既有TS2379。证据 `evidence/docker-final-grades-build-20260907.txt`、`evidence/docker-final-grades-tests-20260907.txt`、`evidence/docker-final-grades-typecheck-20260907.txt`。

第一批镜像 manifest：`sha256:5363fa402c9530c384f6a1355836aa55da77d30840d3faff8a60aeee9febee40`。规则测试容器禁用网络、根文件系统只读，仅 `/tmp` 临时可写；执行后已自动删除容器。镜像保留本地以复查，不包含 `.env` 或云端凭据。

证据文件：`evidence/docker-domain-build-20260907.txt`、`evidence/docker-domain-tests-20260907.txt`、`evidence/docker-schema-validation-20260907.txt`。完整失败信息和处理边界见 ISSUES.md。

最新目标更新后复验：V81-TEST-005已修复；Docker镜像manifest sha256:e4bda80f68300687da875b09f14b6c414c927cf5b61173cee2e8cde5411d1782，domain-tests npm run typecheck退出0。证据位于本目录docker-resume-build-20260907.txt及docker-resume-typecheck-20260907.txt。未证明数据库迁移、Prisma生成或三端业务闭环通过。

2026-09-07：Docker db:validate退出0；SQL probe在独立PostgreSQL执行26迁移全部APPLIED，90表、15张V81表，退出0。证据本目录docker-schema-fix-build-20260907.txt、docker-schema-fix-validation-20260907.txt、docker-sql-fix-build-20260907.txt、docker-sql-fix-probe-20260907.txt。

2026-09-07 当前模型构建复验：Docker镜像构建阶段安装OpenSSL/CA并执行Prisma客户端生成；断网backend-build执行npm run build（含db:generate、OpenAPI及迁移清单生成、nest build）退出0，153操作。证据docker-backend-generated-image-20260907.txt及docker-backend-generated-build-20260907.txt。首次断网下载引擎失败保留docker-backend-build-20260907.txt。客户端在容器中重新生成，不依赖宿主旧生成版本。

2026-09-07 应用启动探测：当前源码完整构建后启动dist/main.js，HTTP /api/v1/health/live=200，ready=503，探测退出1。现有SQL探测库未写Prisma迁移历史，应用MigrationCompatibilityService要求该历史。证据docker-startup-image-20260907.txt、docker-startup-probe-20260907.txt。下一步独立运行库正式prisma migrate deploy，不伪造历史。

2026-09-07 正式运行库：run-v81-startup-probe在固定本地sql-postgres服务创建独立v81_runtime_test库（存在则保留），执行prisma migrate deploy，26批迁移全部成功。随后当前dist/main.js真实启动，live=200、ready=200、退出0。证据docker-runtime-migration-image-20260907.txt与docker-runtime-migration-probe-20260907.txt。未插入或伪造_prisma_migrations，原SQL探测库保留。账号/材料/审核闭环尚未验证。

2026-09-07 真实HTTP账号批次通过：ADMIN/TEACHER密码登录、首次改密、重新登录、mustChangePassword=false回读；SUPER开启指定班级人工模式并GET确认enabled=true。Docker退出0，证据docker-account-retest2-image-20260907.txt、docker-account-retest2-20260907.txt。合成账号通过数据库夹具创建，未证明账号创建业务接口；尚未验证材料提交/教师审核。

2026-09-07 Docker加入私有网络MinIO及持久卷v81_media_data，无宿主端口。S3真实对象写入/读回字节一致PASS；启用后端MEDIA_WORKER后live/ready200，账号首次改密和人工模式回归PASS，整体退出0。证据docker-storage-image-20260907.txt、docker-storage-probe-20260907.txt。当前探测使用仅本地MinIO根身份（与本地探测随机密钥），不构成生产COS权限验证；学生上传/确认/绑定与材料审核尚未验证。

2026-09-07 SMTP复验：实际收到验证码并完成学生verify登录（执行到后续/media-uploads），但上传初始化HTTP422，整体退出1。原证据docker-smtp-retest-20260907.txt。已补测试错误输出读取顶层code/details，待精确诊断422。

2026-09-07 相机来源上传正向通过：学生SMTP验证码登录、初始化上传、MinIO PUT、确认、绑定、worker处理至AVAILABLE、实际SHA256/字节大小回读一致，Docker退出0。证据docker-camera-png-image-20260907.txt、docker-camera-png-20260907.txt。会话时长和图片均为合成前置数据，不证明真实拍摄/计时，不含送审/教师判定。

2026-09-07 人工审核正向API闭环通过：教师真实发布V81规则，学生上传材料并创建/提交记录，返回PENDING_TEACHER且计入0；责任教师通过v81-reviews判VALID返回60分钟；学生GET回读VALID/3600秒，数据库workflow为VALID。Docker整体退出0，证据docker-review-closure-image-20260907.txt、docker-review-closure-20260907.txt。包括SMTP/MinIO真实服务；组织、课程、学生成员关系及已结束运动会话仍为合成前置数据，不证明这些对象的创建/运动计时UI闭环；权限负向、幂等、补证及三端全量仍未完成。

2026-09-07 审核权限与幂等：真实学生POST审核返回403，记录仍PENDING_TEACHER；责任教师同key重复判VALID返回完全相同data，数据库review_records仅初始PENDING+一次教师判定（2条），v81_events VALID仅1条，学生回读60分钟。Docker退出0，证据docker-review-security-image-20260907.txt、docker-review-security-20260907.txt。尚未覆盖其他教师/跨组织、并发不同key和补证。

2026-09-07 跨教师/组织隔离真实HTTP通过：同组织非责任教师、其他组织教师均成功登录并改密后，GET目标workflow及POST审核各返回404；责任教师仍正常判定，学生回读60分钟；原越权学生403及同key重试单次判定回归通过。证据docker-review-isolation-image-20260907.txt、docker-review-isolation-20260907.txt，退出0。覆盖这两个接口，不等于所有资源权限验收。

2026-09-07 补证真实API通过：教师退回24小时、学生proof-todos可见、剩余期限有效；学生第二版复用原材料受理，历史保留2版同一媒体引用；再次退回补证422，责任教师最终VALID60分钟，权限与幂等回归通过。命令run --rm -e V81_SUPPLEMENT_CASE=1 backend-startup，退出0。证据docker-supplement-image-20260907.txt、docker-supplement-20260907.txt。未覆盖补证新文件、72小时、故障暂停/过期worker。

2026-09-07 补证新增上传通过：V81_SUPPLEMENT_CASE=1、V81_SUPPLEMENT_NEW_MEDIA=1，待补证时新建上传并真实PUT/确认/绑定/AVAILABLE，第二版包含原ID+新ID，第一版仍仅原ID；最终审核60分钟、权限/幂等回归通过，退出0。证据docker-supplement-upload-image-20260907.txt、docker-supplement-upload-20260907.txt。新文件使用相同合成PNG字节，验证独立上传与版本引用，不证明材料真实性或内容差异识别。

2026-09-07 维护补证复验通过：SUPER维护切换成功；两次proof-todos剩余秒一致且paused=true，提交503；恢复NORMAL后paused=false，截止顺延至少实际1.2秒维护时段；补证最终有效60分钟及隔离/幂等回归通过，退出0。证据docker-maintenance-retest-image-20260907.txt、docker-maintenance-retest-20260907.txt。

2026-09-07 补证过期worker通过：真实退回后把独立测试workflow起始时间设为25小时前（明确合成时间前置），实际后台worker扫描后INVALID/SUPPLEMENT_DEADLINE_MISSED、计入0、待办消失、迟交409；下一扫描周期后SUPPLEMENT_EXPIRED事件仍仅1条。命令V81_SUPPLEMENT_CASE=1 V81_EXPIRY_CASE=1，退出0。证据docker-expiry-image-20260907.txt、docker-expiry-20260907.txt。不是实际24小时等待证据，不覆盖提交与过期并发竞争。

2026-09-07 内部成绩真实API通过：责任教师追加123草稿/125发布（无0–100限制），同key回放不增加版本，历史准确两版；学生/管理员GET403，其他教师/组织GET404；额外note字段422；学生记录无finalGrade且运动计入仍60分钟。Docker退出0，证据docker-grade-api-image-20260907.txt、docker-grade-api-20260907.txt。不覆盖结算后/归档更正版、所有导出与缓存。

2026-09-07 认证真实API闭环通过：按enrollment授权上传认证图片、PUT/确认自动绑定/worker可用；学生创建SCHOOL_TEAM认证申请并提交，责任教师批准课程120分钟，数据库认可active=true/120；教师撤销后REVOKED且认可active=false。Docker退出0，证据docker-certification-fix-image-20260907.txt、docker-certification-fix-20260907.txt。已有运动/内部成绩回归通过；累计3图、认可进度HTTP回读、撤销幂等及归档边界仍待验证。

2026-09-07 学生进度真实回读通过：认证批准后/student-progress显示课程认可7200秒、一般运动3600秒、总10800秒；撤销后认可0、运动3600秒、总3600秒；响应无finalGrade。证据docker-progress-image-20260907.txt、docker-progress-20260907.txt，Docker退出0。未覆盖分类封顶冲突、多记录最优组合、浏览器缓存。

WebP批次：DTO/协议增加image/webp，声明仅EXEMPTION_APPLICATION允许；新增RIFF长度/填充、VP8/VP8L/VP8X尺寸与EXIF/XMP定位元数据检查。Docker media.test.ts 11/11通过（含用途声明测试），证据docker-webp-image-20260907.txt、docker-webp-tests-20260907.txt。尚缺真实WebP上传、位流解码及动画帧结构专项，不能据此声明WebP完整校验完成。

### 2026-09-07 WebP 文件样本验证
- 新增 Pillow 生成的 3×2 有损、无损 WebP 合成文件，分别验证读取尺寸及截断拒绝；截断测试重新计算传输摘要，确保不是仅由摘要不匹配拒绝。
- Docker 媒体测试 15/15 通过，退出码 0。证据：docker-webp-fixtures-tests-20260907.txt；镜像构建：docker-webp-fixtures-image-20260907.txt。
- 现有解析器验证容器结构及图像头，尚未证明压缩图像完整解码、动画帧结构和全部元数据分支；这些仍是媒体验收缺口。未将本次结果视为真实 COS 或三端业务全量验收。

### 2026-09-07 WebP 认证真实接口联调
- 命令：docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml run --rm -e V81_CERTIFICATION_WEBP=1 backend-startup。
- 结果：退出码 0，完整后端构建通过，26 个迁移无待执行项；认证使用实际无损 WebP 文件，经签名 PUT、确认、后台校验到 AVAILABLE，验证实际内容摘要一致。
- 认证提交、教师批准、学生进度增加、撤销及学生进度回退全部通过；运动材料仍使用 IN_APP_CAMERA PNG，并通过运动审核及越权、重放检查。
- 证据：docker-webp-api-image-20260907.txt、docker-webp-api-20260907.txt。
- 范围：本地 PostgreSQL、MinIO、Mailpit 与真实 HTTP API，账户和经过时长为合成夹具；不包含腾讯云 COS、真实相机采集、浏览器三端交互或完整图像解码验收。容器测试后已停止，数据卷保留。

### 2026-09-07 图片完整解码与回归
- 后端新增固定版本 sharp 0.35.4；所有 PNG/JPEG/WebP 在现有容器、摘要、位置元数据校验后，以 failOn=warning、配置像素上限及全部帧模式实际解码统计。参考 https://sharp.pixelplumbing.com/api-constructor/ 和 https://sharp.pixelplumbing.com/api-output/ 。
- 单元 PNG/JPEG 夹具替换为 Pillow 生成的有效图片；增加容器长度及图像头正确但压缩像素缺失的 WebP 拒绝测试。
- Docker 媒体测试 16/16 通过：docker-image-decoder-tests-20260907.txt。
- Docker 完整后端构建、26 迁移检查、运动 PNG 上传审核、认证 WebP 上传批准及撤销进度回退通过：docker-image-decoder-api-20260907.txt，退出码 0。
- 完整后端单元测试 190 项，184 通过、6 失败，退出码 1：docker-decoder-unit-suite-20260907.txt。失败涉及 contract-parity-gate、exercise-record、exercise-session 两项、foundation、score，待按现行规则核对；不宣称全量通过。
- 全部图片格式现已执行解码；动画及元数据的全面恶意样本覆盖、视频完整解码、外部扫描器、腾讯云 COS 和三端浏览器业务验收仍未完成。

### 2026-09-07 单元测试现行规则迁移
依据 docs/business/10-student-flow.md 第 23–25、63–66、197–205 行及第 13 行：更新 exercise-record 的 30/45/60 门槛、分钟取整和单次 60 分钟上限；exercise-session 保留超过两小时的实际时长并验证数值溢出拒绝；foundation 将历史 READ_ONLY 按不支持模式拒绝；score 验证学生访问旧分数投影被拒绝。未改业务实现以迎合旧测试。
Docker 重跑全部 190 项，189 通过，1 项协议 parity 失败。原始失败保留 docker-decoder-unit-suite-20260907.txt，新证据 docker-v81-unit-retest-20260907.txt。剩余 parity 输出包含 swimDelayReason、courseMinutes、generalMinutes 等 DTO/OpenAPI nullable 差异，需修正真实协议不一致，尚未关闭。

### 2026-09-07 DTO/OpenAPI parity 修正
- 将协议中可省略但不可 null 的 V8.1 字段改为仅 undefined 跳过校验；补齐审核/纠正公开原因六枚举和 supplementHours 整数校验。
- parity 检查器支持 TypeScript 数字字面量枚举，避免把 30/45/60、2/3/4 误识别为开放字符串。
- SESSION_NOT_COMPLETED 已有实际调用，移出 reserved 生命周期列表，保留错误码及 HTTP 状态定义。
- Docker 全量单元测试 190/190 通过，退出码 0：docker-parity-fixed-unit-20260907.txt。Docker TypeScript 类型检查通过：docker-parity-fixed-typecheck-20260907.txt。
- 通过范围含 153 操作的静态 DTO/协议一致性，不等于 153 操作全部完成业务运行验收。原始失败证据保留。

### 2026-09-07 真实服务器计时 API
- V81_LIVE_TIMER=1 Docker 启动测试构建通过，26 迁移无待执行，HTTP 开始→暂停→读取→继续→结束→幂等重放→数据库核对→无活动会话全部通过。
- 本次真实累计 ACTIVE 2 秒、PAUSED 1 秒；暂停读取未增加 ACTIVE。开始/暂停分别提交 2020/2030 的客户端观察时间，服务器计时未受影响。
- 原有账户/课程和一小时已结束会话仍为合成夹具；本次另建计时会话完全通过 HTTP 并使用真实等待，未改写其时长。测试不包含长时间运动、断网同步和浏览器设备恢复。
- 证据 docker-live-timer-20260907.txt，退出码 0。测试后依赖容器已停止，数据卷保留。

### 会话同步验证失败
新增真实 HTTP STATE_SYNC 验证，发现第一次同步返回 500 SYSTEM_DATA_INTEGRITY_ERROR，退出码 1。证据 docker-session-reconcile-20260907.txt。开始、暂停、继续、结束之前已通过；本次同步去重和伪造拒绝未验证成功。详见 V81-TEST-016。

### 完成会话同步复测通过
修正同步审计携带未允许的 endReason 后，Docker 构建与真实计时、同步去重、未来时间/伪造增时事件拒绝全部通过。actualDurationSeconds=2、pausedDurationSeconds=1；退出码 0。证据 docker-session-reconcile-retest-20260907.txt，根因见 V81-TEST-016。测试依赖已停止，卷保留。

### 2026-09-07 Portal 完整类型与历史协议门禁通过
- Docker 直接 TypeScript 检查通过：docker-portal-ts-direct-20260907.txt。
- 旧 Phase 5B 哈希失败根因是 contracts/openapi.yaml 工作区 CRLF 换行。实际 raw SHA256=9dc75779a6ca21f7f5f83ffe57be345d9008727af1f65d4858ea42e5e76d0433，仅恢复 LF 后 SHA256=667ae751f3e623e3d603db4d68e6e9314d4b3fd6da433a1def8c36b81597d74a，与原登记完全一致；恢复前执行摘要断言，未修改协议内容或期望哈希。
- 完整 Docker npm run typecheck 通过，包含两组协议校验/生成一致性及 Portal、Worker、student TypeScript 检查；退出码 0，证据 docker-portal-typecheck-retest-20260907.txt。
- 此结果是静态检查，不证明页面所有按钮、后端业务、浏览器交互已完成验收。

### 2026-09-07 Portal 完整构建与测试
Docker npm test 构建成功。首轮缺 Python 导致一组测试无法加载；补齐 python-is-python3/python3-yaml 后执行 127 项，125 通过、2 失败。新增审核提示英文映射覆盖检查通过。剩余为旧审核纠正文案断言、原生 select 禁止断言，需对照现行代码与用户保留 UI 要求核对。证据 docker-portal-full-tests-20260907.txt（首轮）、docker-portal-full-retest-20260907.txt（复测）。未修改布局，尚未声明所有网页业务通过。

### 2026-09-07 Portal 测试与原始 UI 对齐
核对 HEAD 的 teacher-workspace.tsx，原本即存在 course-published-template 和 proofWindowHours 两个原生 select。测试保留两个控件并验证关键属性、24/72 选项，同时禁止其他原生 select；未修改控件。审核测试改为验证实际 decideRecord/RETURN_FOR_SUPPLEMENT/correctRecord 接线，移除过时的“不支持退回补证”预期。
Docker 完整构建与测试 127/127 通过，退出码 0，证据 docker-portal-baseline-fixed-20260907.txt。首次自动编辑因本机 Python 默认 GBK 读取失败未改文件，随后已使用补丁完成；中间未改测试的复跑记录保留 docker-portal-baseline-retest-20260907.txt。通过仍限于现有静态和构建测试，非三端所有实际业务验收。

### 2026-09-07 反馈处理数据库基础
依据管理员文档第 11 节，新增 0027_v81_feedback_history：支持 WAITING_TECH；反馈事件新增 previous_status、next_status、public_reply，HANDLED 事件强制有效前后状态和非空公开回复。原有追加后不可更新/删除触发器保持。未覆盖或改写历史回复。
Docker Prisma 第 27 个迁移实际部署及完整后端构建通过，真实计时/同步回归通过，退出码 0。证据 docker-feedback-migration-20260907.txt。此阶段仅持久化基础，反馈管理写接口、协议、权限、学生回读及网页接线仍待实施，不视为反馈业务验收完成。

### 2026-09-07 反馈处理事务服务
新增 V81FeedbackService：要求 STUDENT_FEEDBACK 权限及组织归属；正常模式内按预期版本更新状态，公开回复非空；同一事务追加 HANDLED 历史和 V81 审计索引；支持幂等键，不覆盖历史记录。详情返回公开回复历史与处理人标识。
Docker TypeScript 检查通过，证据 docker-feedback-service-typecheck-20260907.txt，退出码 0。当前尚未注册 HTTP 控制器、更新协议或接线网页，也未完成真实事务/权限/并发验收。下一步补齐这些入口，并完善提交人信息、搜索分页和学生历史回读。

### 反馈 HTTP 首轮验证
HTTP 路由/模块/权限映射与协议已接入（155 操作 parity 通过），Docker 构建通过。真实管理员处理因旧数据库全更新禁止触发器而失败，退出码1。详细根因及原证据见 V81-TEST-018。当前不宣称反馈闭环可用。

### 2026-09-07 反馈核心接口闭环通过
新增0028替换旧禁写触发器并强制同事务处理历史，Docker全部28迁移及构建通过。V81_FEEDBACK_CASE=1 验证学生提交、五次处理含关闭后重开、历史数量与顺序、重放、学生最新状态/回复、教师403，退出码0。证据 docker-feedback-api-retest-20260907.txt。此结果不覆盖完整管理列表、历史回读界面和分管理员各权限组合。

### 2026-09-07 反馈列表接口实现
新增 GET /admin/feedback（listV81Feedback），STUDENT_FEEDBACK 权限及本组织学生反馈范围；按时间/ID稳定排序，每页固定6条；支持页码、分类、状态及姓名/学号/邮箱/内容/分类/完整反馈UUID搜索；返回当前提交人姓名、学号、邮箱及总量/待处理/待技术/完成概况。列表和汇总在 RepeatableRead 事务读取。
Docker 类型检查通过：docker-feedback-list-typecheck-20260907.txt；156操作静态parity通过。尚未完成该列表真实HTTP分页/筛选/边界测试、严格响应schema、详情人员字段及原网页接线，不能视为完整反馈验收。

### 2026-09-07 反馈列表真实 API 验证
修正搜索 UUID 识别为完整分组格式，避免36个连字符等普通搜索被转换为非法数据库UUID。Docker构建及反馈处理回归通过；新增7条学生反馈验证第一页6条/第二页1条且无重复、分类与状态组合筛选、完整编号搜索、邮箱搜索、当前邮箱资料、待处理汇总和无匹配搜索。无匹配时列表为空但总概况仍保留7条事实。证据 docker-feedback-list-api-20260907.txt，退出码0。
后续仍需提交人姓名/学号搜索、分管理员权限组合、并发/负面数据库约束、严格响应schema、详情处理人名称及原页面接线。测试依赖已停止，卷保留。

### 2026-09-07 反馈详情与响应协议
反馈详情增加提交人姓名、学号、当前邮箱及每条处理历史的管理员姓名；详情仅允许组织内学生反馈。列表、详情和处理成功响应补齐字段明确的 OpenAPI schema（additionalProperties=false），生成156操作并通过静态parity。
Docker类型检查通过 docker-feedback-detail-typecheck-20260907.txt；完整构建/28迁移检查/反馈流程与列表复测通过 docker-feedback-detail-api-20260907.txt（退出码0），新增断言验证提交人资料和五条历史处理人身份/姓名。尚未验证所有响应的动态schema校验、分管理员组合、并发和原页面接线。

### 2026-09-07 反馈并发与输入限制实测
Docker真实HTTP两条同版本处理并发，结果恰为201与409；版本仅增加1、处理历史仅追加1条。重新设为OPEN、空白公开回复、额外internalNote字段均422，历史不增加。原创建/处理/重新跟进/重放/学生回读/列表搜索分页测试同时通过。证据 docker-feedback-concurrency-20260907.txt，退出码0；测试依赖停止、卷保留。仍需分管理员权限、数据库约束负面测试、学生历史和原页面接线。

### 2026-09-07 管理端反馈 API 适配器
新增 app/feedback-api.ts，提供列表、详情、带明确版本及幂等键的处理写入，将后端 OPEN/IN_PROGRESS/WAITING_TECH/RESOLVED/CLOSED 映射为原页面状态及 SupportTicket 处理历史。未改 JSX/CSS 布局。Docker 完整 Portal typecheck 通过，证据 docker-feedback-adapter-typecheck-20260907.txt。适配器尚未由原页面调用；下一步接列表读取/详情/保存及失败重试状态，不能声明网页反馈已完成接线。

### 2026-09-07 反馈数据库负面验证
Docker直接尝试修改反馈原文、修改历史回复、只改状态而不追加匹配历史，三者均拒绝；随后HTTP读取原文/历史/版本保持原值。完整反馈处理/列表/并发回归通过，证据 docker-feedback-db-guards-20260907.txt，退出码0。数据库拒绝是预期用例，不是业务失败。依赖停止、卷保留。
页面接线发现真实模式只读列表与演示模式完整表单两套原UI。因用户禁止改变原UI，已询问是否允许真实登录复用已有完整反馈界面，等待答复；未自行切换，其他后端工作可继续。

### 2026-09-07 反馈分管理员权限运行验证
使用同一合成管理员登录token，数据库夹具分别设为分管理员无权限、仅USER_ACCOUNTS、仅STUDENT_FEEDBACK、撤销全部权限。列表/详情依次403/403/200/403；无反馈权限的写请求403且版本不变。finally恢复测试账号SUPER。权限变更本身为测试夹具，不代表分管理员创建/授权接口已验收；此轮有反馈权限的分管理员只验证读取，写入仍待独立确认。
完整反馈处理/列表/并发/数据库保护回归通过。证据 docker-feedback-permissions-20260907.txt，退出码0。依赖停止、卷保留。页面UI边界问题仍待用户回答，其他后端可继续。

### 2026-09-07 分管理员反馈写入验证
补充仅有STUDENT_FEEDBACK的分管理员实际POST处理：201、版本+1、历史+1，学生读取到公开回复。随后撤销权限，同token写入403，无额外版本/历史。权限变更仍是合成数据库夹具，不代表账号创建授权API验收。Docker完整反馈回归通过，证据 docker-feedback-subadmin-write-20260907.txt，退出码0。依赖已停止，数据卷保留。

### 2026-09-07 反馈处理站内通知
按学生文档10.1要求，管理员每次成功处理与反馈状态、公开历史同事务插入FEEDBACK_UPDATED通知，按学生语言设置中英文标题，正文为公开回复，目标关联本人反馈。重放不重复执行事务。Docker反馈回归通过，5次处理及各自重放后数据库恰有5条本人反馈通知；证据 docker-feedback-notifications-20260907.txt，退出码0。尚需通知HTTP回读/已读状态验证；未发送外部邮件或Push。

### 2026-09-07 反馈通知HTTP回读
Docker真实学生GET /notifications返回5条FEEDBACK_UPDATED本人反馈通知；POST已读及同幂等键重放一致；未读列表剩4条；反馈版本保持不变。反馈全链路回归通过，证据 docker-feedback-notification-read-20260907.txt，退出码0。测试依赖停止，卷保留。学生历史详情及页面接线仍待完成，页面UI边界问题仍待用户答复。

### 2026-09-07 学生反馈公开历史接口
新增GET /student/feedback/{feedbackId}/history，服务按学生角色、组织和创建人匹配，返回公开回复、状态、时间、版本，不返回处理人账号或姓名。协议新增至157操作。Docker完整构建与反馈回归通过，新增断言验证本人五条公开回复与管理历史一致且无actorUserId/actorName字段。证据 docker-feedback-student-history-20260907.txt，退出码0。跨学生/跨组织负面及学生页面调用仍待验证；页面UI决定待答复。

### 2026-09-07 学生反馈历史隔离验证
新增另一学生反馈夹具，当前学生访问该编号与不存在编号均404；教师和管理员访问学生历史路由403；本人历史通过。Docker完整反馈回归通过，证据 docker-feedback-history-isolation-final-20260907.txt，退出码0。新增另一学生记录后列表总量8，分页6+2；本人邮箱搜索仍7条。
两次测试初始化失败保留：docker-feedback-history-isolation-20260907.txt（夹具发布后修改课程被不可变触发器拒绝）；docker-feedback-history-isolation-retest-20260907.txt（夹具重置每日时间导致发布422）。将全部学生初始化放在课程时间设置和发布之前后通过，未削弱业务约束。跨组织学生历史仍未单独验证。依赖已停止，卷保留。

### 2026-09-07 反馈模块后完整后端回归
Docker npm test 190/190通过，包含当前157操作静态协议/处理器一致性检查。证据 docker-feedback-full-unit-20260907.txt，退出码0。ACCEPTANCE.md更新已验证证据及仍缺的浏览器、页面、管理/结算范围，保持完整原始目标。

### 2026-09-07 帮助中心规则实现起步
核对管理员第14节及原help-content分类。旧help_articles为单语言行且缺组织、双语聚合、关键词及排序权重，不能直接支持原编辑器。新增domain/help-article.ts规范标题/正文/关键词（中英逗号分隔、去空白去重）、有限数值排序权重、发布双语正文/关键词门槛、草稿/发布/下线合法转换。Docker领域2/2通过，证据 docker-help-domain-20260907.txt。尚未接入数据库/服务/路由，属于后续帮助管理实现基础，不是业务验收。后续使用固定十分类，服务层须传入该固定列表。

### 2026-09-07 双语帮助文章持久化基础
新增0029_v81_help_articles：组织隔离的文章标识及不可变双语修订（标题/正文/关键词/固定十分类/有限浮点权重/状态/操作者/请求/时间）。数据库拒绝修订更新删除、非连续版本、非法发布状态转换及发布内容缺失；文章行锁串行化修订写入。旧单语言help_articles保留，尚未切换学生读取。
Docker第29迁移部署、完整后端构建及真实计时/同步回归通过，证据 docker-help-migration-20260907.txt，退出码0。该结果只证明迁移与构建，不证明新表业务约束的负面运行覆盖。服务、Prisma模型映射或SQL适配、协议、权限、学生投影和真实帮助业务仍待实施。

### 2026-09-07 帮助保存事务服务
新增V81HelpService，固定十分类，HELP_CENTER权限/组织检查，事务内重新检查权限和系统NORMAL；预期版本一致才追加双语修订，内容发布规则调用领域校验，同事务追加审计索引，幂等重试复用原结果。管理员详情按本组织最新修订读取。规范化返回显式业务字段，避免expectedVersion泄漏至响应。
Docker类型检查通过，证据 docker-help-service-typecheck-20260907.txt；最后的显式字段规范化小改动尚未重新验证。当前服务尚未注册HTTP/模块，SQL数组参数、事务/状态/并发及学生公开投影仍待真实Docker验证。保留未完成状态。

### 帮助文章管理员 HTTP 流程（2026-09-07）
Docker 构建、29 迁移检查、健康检查通过。HELP_DRAFT_PUBLISH_ARCHIVE_REPUBLISH_REPLAY_AND_ACCESS PASS，覆盖 4 修订生命周期、非法跳转/不完整发布 422、旧版本 409、教师/学生写入 403 和幂等重放。详情与保存返回完全相同公开字段，不返回请求 expectedVersion。严格响应协议已生成，160 操作 parity PASS。证据 docker-help-api-retest-20260907.txt。这是本地合成账号真实 HTTP/PostgreSQL 验证，未覆盖学生公开投影、页面与腾讯云。

帮助接口当前代码重新构建 Docker 镜像后，后端完整单元回归 192/192 通过、0 跳过，证据 docker-help-full-unit-current-20260907.txt。此前未重建镜像的单元结果保留为辅助记录，以 current 文件为本次有效证据。

### 帮助查询、公开效果及学生网页 API 客户端（2026-09-07）
- docker-help-publication-20260907.txt：真实 HTTP/PostgreSQL 7 篇文章分 5+2 页，排序 [5,4,3,2,1]/[0,-1.25]；英文标题/中文标题/双语关键词检索通过；字面 % 不作为通配符；筛选概况始终 draft=6,published=1,archived=0；非法页码、状态和分类 422。
- 草稿与下线列表为空、详情 404；发布与重新上线按 zh-CN/en 仅返回相应语言字段，正文/标题裁剪，首次 publishedAt 保持；响应无关键词、权重、双语编辑源或审计字段。
- docker-help-web-client-20260907.txt：以上回归重复通过，并直接执行学生 js/api.js 的 listHelpArticles，以真实登录会话调用新接口成功。仅在 Node 中提供浏览器存储及同源相对地址解析，不模拟后端返回。页面渲染/交互尚未验收。
- 协议与实际处理器 163/163 通过，Docker 构建与 29 已应用迁移检查通过。

### 帮助中心授权与组织隔离（2026-09-07）
Docker evidence: docker-help-access-20260907.txt。相同管理员 token，在测试夹具依次设置 SUB+无权限、STUDENT_FEEDBACK、HELP_CENTER、撤销全部权限后，列表/详情返回 403/403/200/403，写入返回 403/403/201/403；仅授权写新增一个修订至版本5，其余拒绝不改变文章。finally 恢复 SUPER。
另一组织独立总管理员通过真实登录和首次改密后，列表和概况均空，对目标文章 GET/POST 均404；源组织版本仍5。原帮助生命周期、学生可见性、网页API客户端回归同时通过。
边界：权限赋予使用数据库夹具，未验证授权管理接口或页面；跨组织学生读取仍需补测。没有扩大为全三端验收结论。

### 耐力跑换算领域验证（2026-09-07）
Docker docker-endurance-domain-20260907.txt 2/2通过：四套各101条默认表，2404个0..600秒输入按文档公式逐一验证；601秒不猜测分数；非法项目组合、空表、中段删除、非整数/无穷用时、非整数/越界分数、等级不符和分数逆序均拒绝。
这是算法/规则验证；存储、增改删接口和教师正式结果写入尚待实现，不代表历史结果或全局规则页面已经可用。

### 耐力跑数据库约束验证（2026-09-07）
Docker docker-endurance-storage-20260907.txt PASS。实际插入101行默认版本1；空表、中段缺口、重复区间/ID、错误等级、相邻重叠、小数用时、空备注类型、跳号版本，以及UPDATE/DELETE历史均被数据库拒绝；合法备注修改作为版本2追加，版本1与版本2分别精确回读保留。30迁移、构建、健康及实际账号登录通过。证据仅证明存储约束，不证明尚未实现的管理接口或历史成绩绑定。

### 换算表事务服务类型验证（2026-09-07）
当前源码重新构建 Docker（自动 Prisma generate）后 npm run typecheck 通过，证据 docker-endurance-service-typecheck-20260907.txt。主机旧生成客户端失败已在ISSUES记录。服务尚未接HTTP，类型通过不代表事务已运行。

### 耐力跑管理员接口 Docker（2026-09-07）
证据 docker-endurance-api-20260907.txt，ENDURANCE_ADMIN_REAL_HTTP_CREATE_UPDATE_DELETE_REPLAY_AND_VALIDATION PASS。真实登录后读取4表404行，重复读取相同且数据库未因读取创建表；修改备注产生版本1且幂等重放相同，追加601–603秒0分区间产生版本2，删除该末端区间产生版本3。中段删行破坏连续性/等级不符422，旧版本409，教师与学生写入403。回读当前整表一致，数据库版本恰1/2/3。Docker构建、30迁移和健康检查通过。
未验证管理员浏览器界面、分管理员授权组合、跨组织写入、正式教师成绩转换或并发写竞争，不把本证据扩展为全业务验收。

### 换算表并发与分管理员权限（2026-09-07）
Docker docker-endurance-concurrency-20260907.txt PASS。两个不同幂等键并发更新版本3，结果201/409，实际仅增加版本4。相同登录token依次设置SUB无权限/HELP_CENTER/GLOBAL_RULES/撤销权限后读取403/403/200/403，写入403/403/201/403；只有授权写生成版本5，其他三表保持原始投影，数据库版本恰1..5。权限变更由测试夹具设置，不是授权管理接口验收。增改删原回归同时通过。

### 换算表 Portal 接线回归（2026-09-07）
Docker当前镜像 typecheck与原合同绑定检查通过；完整Portal测试127/127通过，证据docker-endurance-portal-typecheck-20260907.txt和docker-endurance-portal-tests-20260907.txt。页面diff仅两个现有保存/删除回调添加state参数，未改渲染布局。新增真实数据适配器和管理员Store加载逻辑已编写，尚待真实HTTP客户端与浏览器操作验收。

### Portal换算表真实HTTP与响应丢失重试（2026-09-07）
Docker docker-endurance-portal-http-20260907.txt PASS。直接执行Portal endurance-api.ts，以真实管理员登录会话读取404行；后端保存成功后丢弃响应导致首次调用失败；同state同输入重试发送同一幂等键，回读同一版本6与正文，数据库仅增加一个修订（总数6）。再次加载规则与保存返回一致。既有增改删、并发201/409、权限撤销回归同时通过。
测试仅提供Node中的浏览器存储和同源URL解析，并注入响应丢失；未模拟数据库或业务响应。尚非真实浏览器渲染交互，完整页面刷新后意图恢复仍未验证。

### 旧换算规则表单版本保护（2026-09-07）
检查发现原适配器从刷新后的当前列表取版本，可能让刷新前打开的旧表单使用新版本保存。已改为编辑表单携带的tableVersion；删除也传入确认对象的版本。Docker docker-endurance-stale-editor-20260907.txt通过：先真实保存至6并重新加载列表，再提交旧版本5表单得到409，回读正文仍是新内容。响应丢失重试和原并发/权限/API回归同时通过。
修改前Portal整体typecheck与127/127回归证据docker-endurance-portal-final-20260907.txt保留，不将它作为此后版本参数调整的类型证据。

### 原始体测历史数据库验证（2026-09-07）
Docker docker-physical-storage-20260907.txt PASS：责任教师追加原始260秒版本1、修正250秒版本2；管理员代写、跳号版本、负秒数、UPDATE/DELETE历史均拒绝，最终两条历史精确保留。31迁移、构建、健康和真实账户登录通过。该测试直接操作数据库，未验证HTTP/学生展示、性别项目业务校验、OCR及年级换算。

### 原始体测教师/学生读取 HTTP（2026-09-07）
Docker docker-physical-read-api-20260907.txt PASS。无记录学生返回NOT_RECORDED；夹具直接SQL追加260→250秒两个版本后，学生当前结果严格仅status/result及version/runType/elapsedSeconds/testedOn。教师limit=1分页分别读取250秒/260秒，游标正确；学生和管理员访问教师历史403，其他本组织/跨组织教师404，教师/管理员访问学生路径403。存储不可变回归同时通过。免测分支、他人学生隔离、正式写接口、页面与转换成绩未覆盖。

### 原始体测教师确认真实HTTP（2026-09-07）
Docker docker-physical-write-api-20260907.txt PASS。原SQL历史260/250秒后，责任教师通过HTTP确认245秒版本3；同幂等键重试完全相同，学生回读245秒。错误性别项目、2026-02-30和4.30秒拒绝422；旧版本409，管理员/学生403，非责任教师404；历史恰3/2/1保留。性别MALE通过测试夹具设置，非身份资料修改接口验收。31迁移、构建和健康通过。
未覆盖免测并发、归档更正、年级转换、OCR、通知及浏览器输入，不能作为完整体测闭环结论。

### 原始体测通知与幂等（2026-09-07）
Docker docker-physical-notification-retest-20260907.txt PASS。确认245秒及幂等重放、各类被拒绝写入后，学生通知API和数据库都恰有1条RAW_ENDURANCE_RESULT，目标本人enrollment，正文精确为1000m · 245 秒 · 2026-09-07，不含分数/等级。原始读写/历史与权限回归同时通过。首次测试脚本失败日志保留，不覆盖。

### 体测免测与原始结果衔接（2026-09-07）
Docker docker-physical-exemption-20260907.txt PASS：真实PNG上传/确认/校验后，学生PHYSICAL_TEST申请提交、责任教师APPROVE及相同幂等键重试通过；学生结果变为EXEMPT/result=null，后续普通用时写入409；教师原始历史与原体测通知数量保持。原始读写/通知/存储回归同轮通过。
该证据使用合成图片与本地账户，未使用真实医疗材料；免测补充累计3图、审批并发及浏览器操作仍待验证。

### 学生体测API与既有页面渲染函数（2026-09-07）
Docker docker-physical-student-client-20260907.txt PASS。真实学生会话调用新增API并映射至原renderEnduranceScoring：245秒显示4′05″与2026-09-07，免测批准后显示免测且不再含旧用时，映射enduranceRunScore始终null。原始HTTP/通知/免测/数据库约束回归同时通过。Node只提供浏览器存储与相对URL解析；不是实际浏览器/整工作区验收。

### Portal测试命令覆盖范围核对（2026-09-07）
现有npm test固定列举测试文件，127/127不包含tests/v81-physical-projection.test.mjs和已有v81-review-projection.test.mjs。已新增npm run test:v81单独执行二者，专项结果以docker-physical-teacher-v81-tests-20260907.txt为准；不将固定127测试冒充新增用例覆盖。

### 教师原始体测投影专项通过（2026-09-07）
Docker docker-physical-teacher-v81-tests-20260907.txt 5/5通过，覆盖新增原始用时/版本/日期映射、不复用旧综合成绩、免测隐藏旧用时、无记录状态，以及既有审核投影3项。原Portal类型与固定127回归通过，但该固定列表不含新增专项。
随后检查旧enduranceScoreLabel发现会展示undefined分和免测分数，已调整为仅有真实数字时附换算分、免测只显示免测；这是既有文本绑定修正，未改布局。该最后格式化调整仍需下轮Portal回归覆盖。

### 体测接线最终代码回归（2026-09-07）
Docker docker-teacher-physical-final-regression-20260907.txt：当前源码typecheck、固定Portal127/127和V8.1专项5/5全部通过，覆盖最后的无分数/免测文本调整。docker-physical-backend-full-unit-20260907.txt：当前后端单元194/194通过、0跳过。不能据此替代真实浏览器和全流程验证。
已核对教师现有页面不存在测试日期输入，向用户确认保留布局时采用含日期导入/接口录入，或允许补日期字段；尚未答复，不自动取今天。该边界已列入ACCEPTANCE，并独立保留当前年级来源待确认事项。

### 体测导入草稿解析专项（2026-09-07）
Docker docker-physical-import-domain-20260907.txt 2/2通过：270/270秒/270 s/4:30/4分30秒得到270；4.30等不明确输入拒绝；闰年和不存在日期严格校验；学号精确匹配、同名不同学号不猜人、重复行全部标记、姓名项目冲突标记、无疑点仍未确认。尚不是文件导入或OCR业务验证。

### 体测CSV与草稿联合验证（2026-09-07）
Docker docker-physical-csv-20260907.txt 4/4通过：UTF-8 BOM、引号内逗号、学号001、4.30原文保留并标记歧义；缺列/重复列/破损引号/空数据/非法编码/字节及行数超限拒绝；原用时日期与学号匹配回归通过。仅文件内容解析与草稿算法证据，不覆盖上传/持久化/确认。

### 体测草稿部分确认数据库验证（2026-09-07）
Docker docker-physical-import-storage-20260907.txt PASS。直接SQL建立2行草稿、第一行修订至2；越界行号、跳号版本、确认旧版本、确认后再次修订和删除确认被拒绝；第一行关联正式结果后第二行仍未确认。原体测HTTP/通知/学生渲染/免测回归同时通过。32迁移已应用。此证据只验证存储约束，未验证行内容语义匹配或整批API原子确认。

### 体测导入事务服务类型检查（2026-09-07）
Docker docker-physical-import-service-20260907.txt PASS，当前源码重新生成Prisma客户端后typecheck通过。只证明类型/构建兼容，创建/读取尚未HTTP注册与业务运行验证。

### 体测 CSV 导入草稿 HTTP 验证通过（2026-09-07）
证据 docker-physical-import-api-20260907.txt，Docker 退出 0，172 操作构建、32 迁移与服务健康检查通过。真实 HTTP 覆盖三行 CSV 的正常行、含糊用时、重复学号、非法日期、来源摘要、幂等回放、详情一致、学生/管理员拒绝、其他教师不可见；导入后正式体测结果数量仍为 0。
逐行修订、选中确认事务、源文件对象存储、XLSX/OCR 和教师页面导入仍未完成。本结果仅对应草稿创建和读取，不能代表完整体测导入验收。

### 用户确认的运动材料相机限制复验（2026-09-07）
用户明确运动打卡材料只允许相机。新增真实 HTTP 反向断言：EXERCISE_RECORD + FILE_PICKER 返回 422；随后同一业务的 IN_APP_CAMERA 上传、对象存储确认、绑定、worker 校验、送审、责任教师批准及学生回读全部通过。权限拒绝、审核幂等与认证批准/撤销回归通过。
证据 docker-camera-only-regression-20260907.txt，Docker 退出 0。本次使用合成 PNG 和已结束会话夹具，证明接口来源限制和后端链路，不代表浏览器真实拍摄验收。免测/认证材料继续按现行独立规则处理。

### 体测导入逐行修订（2026-09-07）
新增 POST /physical-imports/{importId}/revisions，责任教师、维护/归档门禁、批次锁和 expectedVersion 校验；新增不可变行版本与 ROW_REVISED 审计，返回整批重新计算疑点后的草稿。已确认行拒绝修改，原始 CSV 行与摘要保留；修订本身不生成正式结果。
173 操作协议 parity 通过。docker-physical-import-revisions-20260907.txt 退出 0，真实 HTTP 验证 4.30 修订为 4:30、重复学号问题随修订消失、原始值保留、版本历史 [1,2]、幂等回放、旧版本 409、越界行 404、学生/管理员 403、其他教师 404、正式结果仍为 0。已确认行拒绝目前由数据库既有专项与服务条件支持，本次 HTTP 测试未覆盖该分支；后续批量确认测试补齐。
下一步选中行原子确认与通知；CSV 原文件对象存储、XLSX/OCR、页面导入尚未完成。整体目标仍未完成，未最终 Git 存档。

### 体测选中确认 HTTP 复验通过（2026-09-07）
证据 docker-physical-import-confirm-event-retest-20260907.txt，Docker 退出 0。有效首行与有疑点次行同批确认失败后，正式结果、RAW_ENDURANCE_RESULT 通知和确认关联均为 0；重复选择/空选择拒绝，旧正式版本拒绝，角色及责任教师范围拒绝。只确认有效行后 pendingCount=2，学生回读 1000m/270秒/2026-09-07，通知仅 1 条；幂等重试不重复，已确认行重新确认和修订均 409。
174 操作、32 迁移构建运行通过。本地合成 CSV/账户证据，不包括 OCR 或浏览器操作；批量负载与不同多行修订的专门并发仍待验证。正在回归抽取共用事务后的单条体测和免测链路。

共用事务回归通过：docker-physical-shared-transaction-regression-20260907.txt 退出 0；原始体测写入/历史/通知、责任教师权限、学生实际 API 与既有渲染器、免测真实上传批准后禁止新体测且保留历史全部通过。

### 体测导入批次列表（2026-09-07）
新增 GET /class-sections/{classSectionId}/physical-imports，仅责任教师可读。返回批次 id、创建时间、总行数、已确认和待处理数量；UUIDv7 id 降序游标分页，默认20条、上限100，RepeatableRead 一致快照。列表不返回学生资料或草稿正文，详情接口仍独立鉴权。
175 操作 parity 通过；docker-physical-import-list-20260907.txt 退出 0，32 迁移构建运行通过。真实 HTTP 验证部分确认计数 3/1/2、第二批计数 3/0/3、两页无重复、末尾空页、非法 limit/游标、角色拒绝和其他教师拒绝；创建、修订、选中确认与回滚原专项同时通过。
下一步补齐文件原件保留和教师现有导入入口接线；XLSX/OCR、年级来源、完整业务与最终本地存档尚未完成。

2026-09-07 CSV 原件 Docker 验证通过：docker-physical-import-source-20260907.txt 退出 0。MinIO 私有对象真实写入和回读，草稿修订/部分确认后 CSV 原文和摘要与初始上传一致，学生/管理员拒绝、其他教师拒绝；此前创建/修订/确认原子回滚/通知/分页专项同时通过。176 操作和32迁移。本证据不覆盖云 COS、篡改故障注入、孤立对象清理、XLSX/OCR 或浏览器。

2026-09-07 体测草稿修订历史 HTTP 验证通过：docker-physical-import-history-20260907.txt 退出 0。第2行版本2显示4:30，下一页版本1保留4.30及完整原始字段，末尾空页；缺失/非法行号拒绝、越界404、学生/管理员403、其他教师404。177操作、32迁移构建运行通过；CSV草稿创建/修订/部分确认/回滚/通知/批次分页/私有原件回读同时通过。全范围任务未完成，未最终本地Git存档。

2026-09-07 XLSX/CSV 解析 Docker 4/4 通过（docker-physical-xlsx-parser-20260907.txt），当前源码 typecheck 通过（docker-physical-xlsx-typecheck-20260907.txt）。覆盖显示学号001、4.30不改写、Excel日期2026-09-07、公式/合并/缺失工作表/超行数拒绝及CSV回归。仅解析基础，不等于XLSX上传、持久化、确认或网页完整业务通过。

2026-09-07 XLSX 编译 worker Docker 验证通过：docker-physical-xlsx-worker-20260907.txt 退出0。真实编译入口保留001/4.30，缺失工作表拒绝，1ms超时终止，两任务运行时第三任务BUSY，结束后新解析成功。构建177操作通过；HTTP上传、解压展开预算及XLSX原件留存仍未完成。

2026-09-07 XLSX 真实HTTP业务链路Docker通过：docker-physical-xlsx-api-20260907.txt 退出0，33迁移成功应用、178操作构建运行。实际XLSX生成/上传/worker解析为260秒、幂等重放、私有原件Base64与SHA256逐字节一致、教师确认pendingCount归零、学生原始结果回读260秒；缺失工作表与非法Base64拒绝。CSV原有创建/修订/确认回滚/通知/分页/原件/历史回归同时通过。当前为本地合成账户和工作簿，不包括真实学校文件或浏览器交互。

2026-09-07 XLSX 原件故障注入通过：docker-physical-xlsx-source-fault-20260907.txt 退出0。本地MinIO合成原件被改写后，责任教师读取返回500/SYSTEM_DATA_INTEGRITY_ERROR；finally恢复原字节后读取恢复且学生正式结果仍260秒。学生/管理员上传403、其他教师404，拒绝前后批次数量一致。既有CSV/XLSX链路同时回归通过。新增PHYSICAL-IMPORT-HANDOFF.md整理接口、证据与未完成事项，整体目标仍未完成。

### XLSX 后完整单元回归与结算接线（2026-09-07）
新增依赖及体测导入修改后的完整后端单元 Docker 200/200、0跳过通过：docker-backend-after-xlsx-full-unit-20260907.txt。此证据是单元层，不替代运行和浏览器。
依据教师业务12.2“未完成教学事项”及11.1“未选中草稿行继续待处理”，结算检查新增PHYSICAL_IMPORT_PENDING，对本组织本人课程全部CSV/XLSX草稿行减去确认关联数；非零BLOCKED。RAW_PHYSICAL_RESULTS/综合名单/OCR尚未完成的来源继续UNAVAILABLE，不据部分实现宣称可结算。
正在docker-physical-import-settlement-20260907.txt验证初始0行CLEAR、多个批次部分确认后5行BLOCKED及完整导入回归。整体结算版本生成仍未完成。

2026-09-07 体测导入结算阻塞 HTTP 验证通过：docker-physical-import-settlement-20260907.txt。初始0行CLEAR，CSV/XLSX部分确认后剩余5行BLOCKED，ready=false；原件故障注入和全部导入专项回归通过。178操作/33迁移。完整结算快照、综合名单及OCR仍未完成。

### 体测草稿并发与锁模式复验（2026-09-07）
首次并发测试暴露真实死锁（原始日志 docker-physical-import-concurrency-20260907.txt）。体测导入/正式结果组织锁改为 FOR NO KEY UPDATE，兼容幂等插入的组织外键 KEY SHARE，同时保留业务写入互斥。锁语义参考 https://www.postgresql.org/docs/current/explicit-locking.html 第13.3.2节；其余模块相同锁升级模式仍需核查。
复验 docker-physical-import-concurrency-retest-20260907.txt 退出0：不同行同时修订201/201，同一行同版本竞争201/409；三行版本均2，原始内容保留，批次审计版本[1,2,3,4]且每次修订对应正确行号/行版本，无重复事件。CSV/XLSX完整局部业务、原件故障注入与结算待处理阻塞同时回归通过。178操作/33迁移；全目标未完成。

### 组织行锁统一与跨模块回归（2026-09-07）
核查其余11个文件、13处同类组织行FOR UPDATE：账号登录/改密、免测、V8业务、分管理员、帮助、INT、反馈、规则表、认证、维护模式。源码未发现这些路径修改组织主键；统一FOR NO KEY UPDATE，兼容幂等记录组织外键KEY SHARE，仍互斥保护业务判断。体测两文件上轮已调整；不是对所有数据库锁做替换。
Docker docker-organization-lock-business-regression-20260907.txt 退出0：规则表并发/分管理员撤权/Portal丢响应重试、反馈并发/历史/通知/权限、帮助发布下线及学生API跨组织权限等3条完整局部探测通过，登录及首次改密一并通过。docker-organization-lock-full-unit-20260907.txt 后端200/200、0跳过通过。178操作parity通过。
剩余锁风险：users表显式FOR UPDATE仍有改密及邮箱验证两处，需要结合用户外键/唯一邮箱修改单独检查和真实并发验证，不能据组织锁调整宣称所有死锁已排除。完整三端目标与最终存档仍未完成。

### 并发改密及用户行锁核查（2026-09-07）
新增 V81_PASSWORD_RACE 真实HTTP探测，首次 docker-password-concurrency-20260907.txt 通过201/409，并未复现死锁。数据库schema/0001迁移确认幂等记录具有principal用户复合外键，改密的显式用户FOR UPDATE存在锁升级风险；改密仅更新密码/版本等非键字段，改为FOR NO KEY UPDATE，正在docker-password-user-lock-regression-20260907.txt复验。
测试检查赢家幂等回放、密码版本只+1、新密码登录、另一会话401、当前会话保留和单条OWN_PASSWORD_CHANGED审计。密码不输出到日志。
邮箱验证会修改唯一邮箱字段，不能直接套用非键更新判断；该路径仍需独立并发评估。整体目标与最终存档未完成。

2026-09-07 用户行锁调整后并发改密Docker通过：docker-password-user-lock-regression-20260907.txt退出0。两请求201/409，赢家幂等回放不重复、新密码可登录、密码版本仅+1、审计仅1条、其他会话401、当前会话可用。178操作/33迁移构建运行通过。邮箱唯一字段更改的并发、其余全业务和最终存档仍待完成。

2026-09-07 学生邮箱换绑Docker复验通过：docker-email-rebind-concurrency-retest-20260907.txt退出0。Mailpit旧/新邮箱双验证码，两并发验证200/401，仅消费一次；赢家重放、脱敏邮箱/已验证标记、数据库新邮箱及版本仅+1全部通过。本地合成学校邮箱，不代表真实邮件服务或所有唯一邮箱并发组合验收。178操作/33迁移，整体任务仍未完成。

2026-09-07 教师自定义邮箱规则Docker专项3/3通过：docker-teacher-import-custom-email-20260907.txt退出0。任意有效域名和子域名接受、非法邮箱拒绝、重复/数据库冲突整批不可建立、CSV密码列拒绝、工号前导零保留、统一初始密码组合校验通过。当前只是预览领域基础，尚无真实教师批量建号HTTP验收。

2026-09-07 教师批量预览 Docker 验证已完成：docker-teacher-import-preview-20260907.txt 退出 0。33 项迁移无待应用项；真实 HTTP 预览接受两个自定义邮箱域名，检查已有教师工号、已有用户邮箱与批内重复，教师越权 403，CSV 密码列 422；重复预览结果一致、账号数不变、响应无密码。此证据仅覆盖预览，确认创建及网页批量建号尚未完成。
后端完整单元回归 docker-teacher-preview-full-unit-20260907.txt：203/203 通过，0 失败、0 跳过，Docker 退出 0。最终交接及本地 Git 存档仍待全任务收尾。

2026-09-07 教师批量确认 Docker 最终复验通过：docker-teacher-import-confirm-final-20260907.txt 退出0。真实HTTP验证两教师建立、响应无密码、Argon2id存储、同键重放仅一批、不同键重复409、预览后出现冲突整批409且另一有效行未创建、越权403、篡改CSV/弱初始密码422。两名新教师均使用自定义域名邮箱登录，首次课程访问403，设置非空单字符个人密码后重新登录并访问课程200；批次事件仅1条且不含初始密码。180操作/33迁移构建运行通过。该证据覆盖后端建号与登录，网页实际导入接线与浏览器验收仍待完成。

### 教师列表及网页导入接线（2026-09-07）
新增 GET /admin/teacher-accounts（USER_ACCOUNTS、本组织、排除已删除账号/资料、ID游标每页100条），解决原网页只从课程汇总教师而漏掉新建无课程教师的问题。新增 teacher-import-api.ts，现有教师列表使用分页接口；现有导入窗口调用真实预览和确认，预览返回原表格格式、确认后刷新列表，修改CSV/密码清除旧预览，异步旧预览不覆盖新输入，失败重试保留同一幂等键。只修改原控件事件、可用状态、数据来源及原提示文案，未新增控件或修改布局/CSS。
验证：181操作协议parity通过；docker-teacher-account-list-20260907.txt退出0，真实无课程新教师出现在列表、组织/用户/工号准确、教师越权403，并回归建号/改密。docker-teacher-import-portal-20260907.txt类型与既有协议检查退出0；docker-teacher-import-portal-tests-20260907.txt网页构建与127/127测试通过，0跳过。
验证边界：上述网页测试不等于真实浏览器点按验收；新导入适配器真实HTTP、分页边界、文件读取/取消期间的异步竞态、各分管理员权限和完整三端仍需继续。教师账号删除仍未接入，不能以本项证明全部账号治理或整体目标完成。最终交接与精确本地Git存档待收尾。

### 教师导入网页客户端真实 HTTP 验证（2026-09-07）
Docker docker-teacher-import-client-20260907.txt 退出0：加载实际 portal/app/teacher-import-api.ts，经真实 api-client 发出预览及确认请求；批量创建101名合成教师，在服务器成功提交后故意丢弃响应，同一幂等键重试恢复原批次。确认仅一个批次事件、无重复账号，实际客户端自动请求两页列表，包含全部新教师且ID唯一；浏览器存储无初始密码。此前2人建号/冲突/首次改密完整探测同时通过，181操作/33迁移。
现有窗口补充：文件读取使用预览修订号，迟到的旧文件不覆盖修改后的输入；关闭窗口使预览失效并清空初始密码。控件/布局不变。该客户端测试使用最小窗口存储环境和实际HTTP，不等同真实浏览器点按或完整三端验收。
仍需完整浏览器工作流、分管理员权限/分页边界更广验证、账号删除及其余全业务；最终本地 Git 存档待整体收尾。
2026-09-07 文件读取/关闭窗口处理后的 Docker 网页类型与协议检查通过：docker-teacher-import-client-portal-typecheck-20260907.txt 退出0。

### 学期创建与即将开始配置编辑（2026-09-07）
核对30-admin-flow.md 8.1–8.4及19.5：原服务仅提供GET /semesters/current；本轮新增POST /admin/semesters与POST /admin/semesters/{id}，183操作parity通过。SEMESTER_MANAGE权限、NORMAL模式、组织锁及幂等Serializable事务；连续学年、FIRST/SECOND/SUMMER、非空显示名、真实公历日期/日期顺序、学年与类型唯一性。创建固定UPCOMING，编辑只接受UPCOMING及最新版本，拒绝status等未知输入。v81_events记录每次配置前后快照及版本，不提供删除/归档恢复。
Docker docker-semester-config-20260907.txt退出0：真实创建/编辑、幂等回放、重复409、非法输入422、教师越权403、当前学期编辑409、旧版本409、不存在404；初始课程/成员数均0，配置历史版本[1,2]。33迁移无需新增，Docker构建启动通过。
补充公历0000年份拒绝，避免JS可表示而PostgreSQL不支持的日期；新增两管理员请求同版本竞争验证，日志docker-semester-config-concurrency-20260907.txt进行中。学期列表/摘要、切换前完整结算检查与原子归档、原网页接线仍需完成。整体目标与最终Git存档未完成。
2026-09-07 学期配置并发Docker复验通过：docker-semester-config-concurrency-20260907.txt退出0。两个同版本请求201/409，学期版本只增至3，审计版本[1,2,3]，公历0000日期422，其余创建/编辑局部链路同时回归通过。

### 学期分页读取（2026-09-07）
新增 GET /admin/semesters，SEMESTER_MANAGE权限及本组织隔离，按ID游标读取全部状态，默认20/最大100条，返回明确日期、当前标记和版本。184操作/37query/94body的协议parity通过。Docker docker-semester-list-20260907.txt退出0：limit=1逐页核对数据库总数、无重复、全部组织一致，当前学期标记及新学期最新版本正确；教师403，limit=0/101和非法游标422；创建/编辑/并发/审计同时回归通过。33迁移无需新增。
检查现有页面发现正式模式仅只读当前学期，已有创建/编辑/切换完整界面在demo分支。已向用户确认是否允许真实模式复用仓库已有管理界面，以遵守不改布局要求；尚未收到答复前不替换正式模式页面。学期课程/学生摘要、结算依赖和切换归档继续待实现，完整三端与最终存档未完成。

### 学期摘要统计（2026-09-07）
GET /admin/semesters 每项新增 courseCount/studentCount，在同一RepeatableRead快照中读取配置与摘要，仅对当前页学期统计。courseCount为该学期教学班数；studentCount为该学期曾建立成员关系的不同学生数，包含已结束关系，不代表当前有效成员人数或考核完成人数。协议明确统计含义；不读取学生个人资料，也不把摘要代替课程/学生明细。184操作parity通过。
Docker docker-semester-summary-20260907.txt退出0：每个分页项目的课程数/学生数与独立数据库查询一致，新建学期两项为0；创建/编辑/分页/版本/权限同时通过。追加同一学生两门课程的合成数据，正在docker-semester-summary-distinct-20260907.txt验证人数去重。
学期真实页面复用决定尚待答复；切换归档与课程结算依赖、全部三端验收及最终本地Git存档仍未完成。
2026-09-07 学期历史成员去重Docker复验通过：docker-semester-summary-history-20260907.txt退出0。同一学生两条关系（一ACTIVE、一REMOVED）计为1人，新建学期课程/学生均0，每页摘要与数据库一致，创建/编辑/并发/分页/权限同时通过。唯一有效关系约束来自0003_identity_enrollment_qr_join的enrollments_one_active_per_semester_student_idx，保持原约束。

### 学期权限与归档边界验证（2026-09-07）
Docker docker-semester-permissions-20260907.txt退出0。真实HTTP拒绝归档学期编辑409、其他组织学期编辑404；测试夹具依次设置分管理员无权限、SEMESTER_MANAGE、仅COURSE_VIEW，列表为403/200/403，授权时编辑成功版本3→4，撤权后创建和编辑均403。数据库确认未创建越权目标学期、已有配置未额外增版、归档学期保持原值；最后恢复仅测试管理员的原权限。完整创建/编辑/并发/分页/去重摘要探测一起通过。此测试以数据库构造权限夹具，不代表分管理员创建/授权管理UI已验收。
ACCEPTANCE.md已校正过时的操作/迁移和教师建号、学期摘要状态，仍明确列出未完成业务。切换归档、结算、页面复用决定、完整三端与最终本地Git存档继续待完成。

### V8 名单注册核对基础（2026-09-07）
核对20-teacher-flow.md 8.1–8.3：旧ROSTER_ALIGNMENT_V1的PlatformAlignmentEntry没有邮箱验证字段，不能直接作为V8注册完成证明；旧名单导入在解析后直接设为当前VALIDATED，尚缺V8教师确认快照语义。
新增domain/roster-registration.ts，只读投影四类结果MATCHED/PENDING_REGISTRATION/IDENTITY_CONFLICT/EXTRA_IN_PLATFORM。学号保留前导零，姓名精确规范化匹配；完成必须同时满足本班成员、邮箱已验证和唯一匹配。重复官方身份/无有效学号或姓名保留原始行，分母null，不报告完成；平台身份歧义不合并，名单外另列且不计分母。函数输入需由后续数据库层提供每个身份的当前事实，不能直接混入同一人的所有历史关系。
Docker docker-roster-registration-domain-20260907.txt 3/3通过，0跳过：邮箱/入班/姓名门槛、人数相等但身份不同、前导零、官方重复、平台歧义、名单外与空名单。当前仅领域基础，尚未接数据库/协议/网页，也未形成确认快照或结算报告；不据此宣称名单业务已完成。
下一步实现受教师权限保护的真实投影、正式名单确认与不可变来源快照，并接后续综合名单/结算。184协议操作、33迁移保持；整体目标与最终Git存档未完成。

### 名单注册核对真实数据库预览（2026-09-07）
新增 GET /roster-imports/{rosterImportId}/registration-preview，185操作parity通过。仅责任教师/本组织范围，在RepeatableRead中读取指定VALIDATED源名单及本班ACTIVE成员，实际查询邮箱验证时间和必要身份字段；返回四类核对、原行数、分母、名单外列表、源版本和生成时间。最大500官方行，不生成确认快照、不修改成员、不将旧VALIDATED状态冒充V8教师确认。
Docker docker-roster-registration-api-retest-20260907.txt退出0：真实HTTP读取合成名单夹具，邮箱未验证PENDING_REGISTRATION，数据库验证事实更新后MATCHED；名单外1人单列、分母1、管理员403、其他课程及其他组织教师404；查询前后成员/名单行数不变。33迁移、实际构建与启动通过。首次不合法夹具失败日志保留于ISSUES。
边界：本轮使用数据库构造符合旧生命周期的源名单，未验证电子文件上传或OCR；尚缺V8教师确认、来源不可变关联、综合名单/结算报告、网页接线与真实浏览器验证。旧导入存在部分错误行仍可VALIDATED的逻辑，后续确认层必须结合原行状态处理，不能仅凭此预览判定整批可确认。整体目标与最终Git存档未完成。

### 教师确认官方名单快照（2026-09-07）
新增0034_v81_confirmed_rosters迁移及GET/POST /roster-imports/{rosterImportId}/confirmation；187操作parity通过。责任教师、NORMAL模式、源当前VALIDATED、最新源版本、1–500行、无INVALID错误行且有文件摘要方可确认；重复行原样保留供后续核对。确认独立于注册/考核完成，不创建成员。
数据库快照绑定组织/课程/导入ID/源版本/SHA256及按原顺序聚合的完整人员行、行状态、错误和原始安全字段；触发器校验来源和责任教师、人数一致与连续版本，禁止UPDATE/DELETE，同一来源最多确认一次。服务以组织锁和幂等Serializable事务建立快照及审计事件，读取返回原快照。
Docker docker-roster-confirmation-20260907.txt退出0：34迁移应用成功；真实确认、旧版本409、管理员403、其他教师404、源版本/摘要/原行号/内容、同键重放、GET回读一致、直接UPDATE/DELETE均被数据库拒绝，成员数不变。源文件使用上轮数据库夹具，因此不作为真实文件上传/COS原件验收。
追加关闭前受理名单的关闭后确认校验，确认接口拒绝源创建时间晚于课程关闭时间；正在docker-roster-confirmation-closed-20260907.txt复验。尚需错误/重复/切换来源等组合、结算检查关联、完整输入确认接线、综合名单/结算报告与浏览器验证。最终本地Git存档仍待整体收尾。
2026-09-07 关闭前名单继续确认Docker复验通过：docker-roster-confirmation-closed-20260907.txt退出0。先受理源名单再关闭课程，责任教师仍可确认该来源；权限/版本/幂等/快照不可变和成员保留同时回归。关闭后新来源拒绝分支已编码但本条未单独运行，不能据此宣称所有关闭边界完成。

### 已确认官方名单接入结算检查（2026-09-07）
v81-settlement-check 新增 CONFIRMED_OFFICIAL_ROSTER：按当前官方名单来源ID、课程、组织匹配不可变教师确认快照，未确认BLOCKED/count1，已确认CLEAR/count0。保留CURRENT_ROSTER及综合名单、体测、OCR等独立检查；单项通过不表示整个课程可结算。
Docker docker-roster-settlement-check-20260907.txt退出0：确认前BLOCKED，确认后CLEAR，整体ready仍false且CONFIRMED_COMPOSITE_ROSTER仍UNAVAILABLE；确认和注册核对全部既有探测回归通过。
追加更换当前名单来源后旧快照不能解除阻塞、旧快照原样可读、关闭后新来源确认409且无新快照，正在docker-roster-settlement-source-change-20260907.txt验证。仍使用数据库源名单夹具，不代表文件导入/回退页面操作已通过。187操作/34迁移；完整综合名单、正式结算报告及全目标未完成。
2026-09-07 更换来源与关闭后来源Docker复验通过：docker-roster-settlement-source-retest-20260907.txt退出0。确认前BLOCKED→确认后CLEAR；更换当前来源后重新BLOCKED，旧快照读取完全不变；关闭后才建立的新来源确认409且数据库快照数0。其他名单注册/权限/幂等/快照不可变探测一并通过；仍为源名单数据库夹具，文件上传与网页操作未包含。

### 综合名单所需进度核算基础与学生接口回归（2026-09-07）
新增domain/progress-accounting.ts，将认证认可/运动计入/剩余目标计算抽为共享categoryProgress，现有/student-progress已复用。新增exerciseAccounting以秒保留实际总量、审核无效实际时长、有效未计入、实际计入和待处理实际时长，检查非负安全整数、实际不少于计入及非VALID不得计入，避免把上限截断归为无效。
Docker docker-progress-accounting-full-unit-20260907.txt完整后端209/209通过、0跳过；新增用例验证认证优先与目标上限、四类时长守恒、无效记录不得携带计入等边界。
Docker docker-progress-accounting-business-20260907.txt退出0：真实材料上传确认/人工审核60分钟、相机来源限制、权限/重放、INT内部隔离、认证申请批准与撤销、学生进度随认可更新及撤销回读均通过。仍采用本地合成材料，时长夹具不等于本轮真实计时验收。
综合名单的数据库汇总/接口、最终报告快照与结算仍待接入exerciseAccounting；不能将共享核算基础或学生接口回归当成综合名单已完成。187操作/34迁移，整体目标及最终Git存档未完成。

### 综合名单实时预览接口（2026-09-07）
新增GET /class-sections/{classSectionId}/composite-roster，188操作parity通过。责任教师在RepeatableRead中读取当前已确认官方名单、已发布课程规则、本班现有/历史成员、运动及计入投影、认证认可、原始体测最新版本与免测申请。按学号/姓名核对，名单内与名单外分开；每行独立返回注册状态、原始体测状态、分项目进度及实际/无效/有效未计入/计入/待处理时长，注册完成不替代体测或目标达标。关联不明确的身份不拼接个人业务数据。
返回源快照/规则版本和生成时间，isSettlementSnapshot=false；缺确认来源或发布规则409。pendingCount当前涵盖记录待判定及已提交/需补充申请，尚不代表OCR/传输等全范围阻塞；完整结算仍读取独立检查并待最终报告实现。
Docker docker-composite-roster-preview-retest-20260907.txt退出0：已确认名单来源、注册完成但目标未达成/剩余72000秒、名单外1人、原始体测由NOT_RECORDED到RECORDED并回读270秒及版本、管理员403/其他教师与其他组织404均通过；名单确认/源更换阻塞/关闭后来源拒绝也回归。前次gender=OTHER夹具导致422的日志保留。
边界：本轮综合名单数据为零运动并实测体测变更；非零运动/认证/无效记录、免测优先、历史纠错、数据库最终快照、导出和网页实际操作仍需后续完整验证。不能把此实时预览当作课程已结算。34迁移，整体目标和最终Git存档未完成。

### 综合名单非零运动/认证/纠正真实HTTP验证（2026-09-07）
扩展现有默认业务探测：真实材料上传、教师批准60分钟运动、认证批准120分钟，构造遵守数据库生命周期的名单来源并通过真实接口确认，再读取综合名单。Docker docker-composite-roster-accounting-20260907.txt退出0。
综合名单actual=credited=3600秒、无效及有效未计入均0，分项目认可/运动计入与学生接口一致；认可批准后剩余61200秒，撤销后68400秒。责任教师通过/corrections把该合法旧记录纠正为INVALID后，报告实际秒数保持3600、无效实际3600、计入0、有效未计入0、剩余72000秒。证明撤销和纠正会重新读取真实事实，不把无效时间伪装为有效未计入。
验证边界：运动经过时间仍为明确标注的服务器夹具，媒体/审核/认证/纠正/报告读取为实际HTTP；名单源为数据库夹具，尚非文件导入验收。有效但因日周目标上限未计入的非零业务组合、免测优先、完整待办范围、报告正式结算版本/导出/网页仍待验证实现。188操作/34迁移，整体目标和最终Git存档未完成。

### 综合名单预览XLSX导出（2026-09-07）
新增GET /class-sections/{classSectionId}/composite-roster/export，189操作parity通过。复用责任教师范围内同一RepeatableRead生成的实时报告，返回XLSX内容、文件名、MIME与生成时间。说明/名单内/名单外三个工作表；说明明确实时预览未结算、来源确认/导入ID、名单/规则版本、分母、时间和计数范围。各项时长保留秒，不混合注册、体测、运动目标状态；未关联身份的数字留空。学号/姓名以字符串单元格写入，不用CSV自动类型转换。
Docker docker-composite-roster-export-20260907.txt退出0：真实HTTP导出并用XLSX解析实际文件字节，三工作表、预览标记、生成时间、文本学号且无公式字段、纠正后的实际3600/无效3600/计入0/剩余72000秒、空名单外表头，以及管理员403/其他教师与组织404通过；非零运动/认可批准撤销/纠正链同时回归。
本轮未保存用户个人文件，验证对象为本地合成业务数据。导出网页按钮接线、最终结算报告版本/更正版本、完整浏览器验收尚未完成。已向用户询问未注册/未体测学生是否允许教师确认未完成原因后结算，答复前不据未明确语义实现放行规则。34迁移，整体目标及最终Git存档未完成。

### 现有教师名单确认按钮接线与测试阻断（2026-09-07）
roster-reconciliation-api-service.ts 的真实分支在上传 VALIDATED 当前来源后调用 POST /roster-imports/{id}/confirmation。上传和确认各持有稳定幂等键；同一解析对象、映射、课程、会话及内容摘要的重试保留来源，避免确认响应丢失后再次上传。非重复学号的本地校验错误提前拒绝。沿用现有按钮，未新增 UI 控件或修改布局。
Docker 类型检查 docker-roster-confirmation-portal-typecheck-20260907.txt 退出0；现有名单投影/Mock回归 docker-roster-confirmation-portal-tests-20260907.txt 10/10通过。上述检查不代表真实上传确认链通过。
新增 V81_ROSTER_CLIENT 探测计划通过实际 Portal 文件解析/接口适配器、真实 multipart 上传和数据库确认，丢弃首个确认成功响应后验证单次上传、同键确认重放、唯一源及快照。实际运行 docker-roster-confirmation-client-20260907.txt 退出1：Cannot find package 'xlsx' imported from /workspace/BNBU-Sports-Web-new/portal-teacher-admin/app/roster-import.ts。四个角色登录及首次密码修改已通过，名单文件解析阶段被容器依赖解析阻断，尚未执行上传与确认请求。保留失败，仅记录；不将链路标为已通过。
剩余：容器 Portal 依赖解析、真实链路及重试验收；原始 XLSX 保留、服务器解析、重复/错误行完整处理仍未完成。新增综合名单下载控件仍等待用户对 UI 范围确认。189操作/34迁移；整体目标和最终精确 Git 存档未完成。

### 综合名单免测优先与导出真实HTTP验证（2026-09-07）
扩展 V81_PHYSICAL_STORAGE 实际业务探测：教师确认原始体测245秒，构造遵守数据库生命周期的合成名单来源并经真实接口确认，读取综合名单RECORDED/245；学生真实上传合成图片申请免测，教师真实审批后，综合名单EXEMPT/result=null。名单来源、分母、运动进度保持一致，XLSX名单内显示已免测且项目/原始秒数/测试日期/版本四字段为空，历史原始成绩仍可读取且免测后的追加写入409。
Docker docker-composite-roster-exemption-20260907.txt 退出0，相关学生原有渲染函数、体测历史/责任教师权限、确认幂等、通知事务、体测草稿部分确认同时回归。免测材料与审批、名单确认、综合名单、实际XLSX字节读取均走真实服务；名单来源为数据库合成夹具，不等于文件导入验收，也不是三端浏览器点按验收。
本轮更新 ACCEPTANCE.md 的过时操作/迁移/测试数字，并分列名单、综合名单已证实与未完成项。未修复上一轮Portal容器xlsx依赖失败。仍欠非零有效未计入组合、完整待办范围、最终确认与结算快照、OCR与文件导入、管理功能及三端浏览器验收。189操作/34迁移，整体目标和最终Git存档仍未完成。

### 课程关闭后仍可新增名单来源（2026-09-07，未修复）
依据 docs/business/20-teacher-flow.md 第4节关闭规则（第110行）及第8.1节名单受理：关闭后延续的是关闭前已受理链路。新增 V81_ROSTER_CLOSED_INTAKE 使用真实CSV multipart文件、真实责任教师令牌与真实后端/存储；开放课程首次上传201且VALIDATED，数据库将课程置为CLOSED后，以新幂等键上传另一名单仍201，official_roster_imports数量由1增加到2。期望409且来源数量不变，断言失败。证据 docker-roster-closed-intake-20260907.txt，Docker退出1。
定位：backend/src/modules/roster/application/roster-imports.service.ts:create 入口调用 assertTeacherSection，该方法只核对组织和责任教师，未检查课程关闭状态；源受理事务也未见课程状态条件。V8后续确认接口拒绝关闭后来源的已有验证不能替代入口受理约束。此问题会在关闭后写入新来源，需要后续处理受理事务与关闭并发边界；本轮按测试问题记录要求未修复。

### 名单XLSX服务器源表解析基础（2026-09-07）
新增 backend/src/modules/v8/domain/roster-xlsx.ts：直接读取指定工作表，保留每个人员行的源行号和原始显示单元格，保留重复身份、缺失身份及额外来源列；按100MB文件/500人员行上限拒绝超限，要求学号与姓名列，拒绝公式、合并格及宏。保留显示格式中的前导零，不自动合并身份或创建正式名单。
Docker docker-roster-xlsx-source-20260907.txt 退出1，3项测试2通过1失败。前导零、原始空白文本、重复及错误行对应断言通过，失败在后续输入Buffer深比较：SheetJS为输入对象添加chk/l/read_shift/write_shift辅助属性。日志未证明文件字节改变；原件字节一致性需另行针对字节/摘要验证，当前不把该项列为通过，未修复。
以本轮实际构建的domain-tests镜像执行npm run typecheck通过（docker-roster-xlsx-typecheck-20260907.txt）。另一次backend-build使用已有独立镜像，日志docker-roster-xlsx-build-20260907.txt退出0不作为本新增源码编译证据。
当前只是服务器解析基础，尚未接入HTTP受理、私有原件保存及摘要、隔离解析worker、教师确认与协议。公共入口接入前必须完成隔离和资源限制验证；现有CSV/XLSX网页转换流程仍未替换。189操作/34迁移，整体业务验收和最终Git存档未完成。

### 名单XLSX隔离线程与编译后运行验证（2026-09-07）
新增 roster-xlsx-isolated.ts / roster-xlsx-worker.ts：编译后的独立worker读取源表，每个Node进程最多2个解析任务，默认5秒期限（允许范围1–30000毫秒），V8堆256MB/新生代16MB/栈4MB，失败或超时后终止线程并释放并发名额。上传最大100MB校验在启动线程前执行；原件应先按后续受理流程持久保存。
Docker docker-roster-xlsx-worker-20260907.txt 退出0，本轮 --build 构建实际源码后 npm run build 并执行实际dist线程。前导零、重复/缺失身份三行、父线程Buffer SHA-256及属性集合不变、缺工作表拒绝、1毫秒超时、两个并发完成/第三个BUSY、结束后再次成功均通过。此前直接解析输入对象辅助属性失败日志不删除，本次证明隔离调用的父线程输入不被改动。
限制：worker堆限制不等于进程总内存或ZIP展开大小限制，未覆盖100MB极端文件及压缩炸弹；公共上传接线前仍须落实压缩资源预算和容器内存。尚未接入名单HTTP/私有原件/数据库批次与教师确认，不将此基础判为完整文件业务。189协议操作/34迁移保持，整体三端验收和最终Git存档未完成。

### XLSX压缩目录资源预检（2026-09-07）
新增 xlsx-archive-budget.ts，名单worker在SheetJS读取前检查ZIP中央目录：条目默认最多1024、声明展开总量最多256MiB；核对目录范围、本地文件头及名称、压缩方法、非描述符模式下尺寸一致性，拒绝重复条目、加密/分卷/ZIP64等不支持布局。字段依据PKWARE APPNOTE 6.3.10第4.3.12/4.3.16节：https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT 。预算为服务器技术限制，不改变100MB上传或500人员行业务上限。
Docker docker-roster-xlsx-archive-budget-20260907.txt 退出0：3项专项测试通过（stored/deflated正常表、声明展开/条目超限、截断目录/本地尺寸矛盾）；本轮源码编译通过，实际dist名单worker原件摘要、源行、超时、并发拒绝和名额释放回归通过。
限制：声明展开大小并不证明实际输出大小；仍需受限解压或进程级内存保障，不能凭此预检宣称压缩炸弹防护完整。名单HTTP受理、原件保存及摘要、数据库批次与教师确认接线仍待实现。原有失败记录不关闭；整体目标和最终Git存档仍未完成。

### XLSX实际解压输出与校验（2026-09-07）
压缩包检查现在对每个DEFLATE条目调用Node inflateRawSync并设置maxOutputLength，不超过已通过累计256MiB预算的条目声明尺寸；实际输出必须精确等于声明尺寸，且CRC32必须一致。stored条目同样校验实际长度及CRC32。此步骤在已有超时隔离worker内执行。API依据Node官方zlib文档 https://nodejs.org/api/zlib.html ，实际验证环境为仓库Docker Node24。
Docker docker-roster-xlsx-bounded-inflate-20260907.txt 退出0：5项专项通过，包括本地头与中央目录同时伪造过小展开值仍被限制拒绝、stored原始字节篡改被CRC拒绝；正常文件、预算和目录异常回归通过。后端本轮实际源码编译、dist线程源文件摘要/行数/超时/并发名额回归均通过。
边界：这验证所覆盖条目的有界解压与校验，不是完整ZIP恶意语料审计；两个worker加SheetJS对象及文件复制仍需要CVM进程/容器总内存预算。上传HTTP、对象存储原件、批次数据库及教师确认接线尚未完成。既有失败保持记录；189操作/34迁移，整体目标及最终Git存档未完成。

### 私有原件XLSX解析与行分类接线（2026-09-07）
RosterCsvParserService新增parseStoredXlsx：经ObjectStoragePort读取私有原件流，逐段计数100MB上限并计算SHA-256，与受理时expectedSha256一致后才进入受限XLSX线程；工作表及必要列明确选择，复用原有人员字段校验和重复标记，不创建账号、成员或正式快照。XLSX允许未映射来源列但保留原件；旧CSV严格表头路径默认行为保持。
Docker docker-roster-stored-xlsx-20260907.txt退出0，本轮实际源码编译后调用正式服务类；分块原件流、摘要核验、两条重复身份/一条无学号错误行全量保留、原始行号[2,3,4]、前导零000123均通过；篡改原件后SOURCE_DIGEST_MISMATCH拒绝。隔离线程及资源检查同时回归。
明确边界：本轮ObjectStoragePort为in-memory-port-fixture，尚未验证MinIO/COS真实读写；新方法尚未由HTTP上传调用。后续仍需上传XLSX原件、持久文件格式/工作表/来源摘要、可恢复受理事务、确认以及Portal原文件传输接线。当前旧上传协议仍仅CSV。189操作/34迁移，整体目标及最终Git存档未完成。

### 名单来源格式与工作表持久化（2026-09-07）
0035_v81_roster_source_format为official_roster_imports新增source_format/source_sheet及Prisma字段，允许显式CSV或XLSX/工作表组合并校验文件扩展名，OFFICIAL_API仍无文件格式信息。历史CSV的NULL格式按旧CSV解释，不回填更新源记录/版本/已确认快照。格式与工作表作为不可变来源事实，由独立触发器禁止更新。
Docker docker-roster-source-format-schema-20260907.txt退出0，35迁移应用、旧CSV默认NULL及新XLSX字段回读、缺格式/缺工作表/CSV带工作表/空工作表拒绝通过。首轮更新拒绝用例可能同时命中旧生命周期条件，不能单独证明新增触发器。
追加docker-roster-source-format-trigger-20260907.txt退出0：在合法RECEIVED→VALIDATING且版本+1的更新中更改工作表或旧NULL格式，明确断言新增触发器消息；相同合法转换不改来源字段则成功到版本2。迁移manifest本地检查通过。
当前仍待multipart XLSX上传及受理阶段保存/恢复新字段，私有原件真实存储测试、HTTP与Portal接线；本轮未新增界面。189协议操作/35迁移，整体目标和最终Git存档未完成。

### XLSX原件multipart受理与确认真实闭环（2026-09-07）
扩展现有名单上传协议：FILE支持CSV/XLSX，XLSX必填sheetName，CSV不接受sheetName；按文件名、MIME、二进制签名及实际摘要核对，原始文件直接写入私有对象存储。上传阶段持久化source_format/source_sheet；幂等请求绑定工作表，受理阶段恢复从数据库读取格式、工作表、摘要，XLSX调用私有原件受限解析。确定的文件解析错误保留为来源失败；worker忙/超时/运行故障保持可恢复处理。
本地Draft仍189操作，协议/处理器/查询37/请求95 parity通过。Docker docker-roster-xlsx-upload-20260907.txt退出0：实际HTTP multipart→MinIO→PostgreSQL→解析→教师确认；从MinIO读回原件字节完全一致，数据库XLSX/名单工作表/摘要正确，000123前导零保留，同key重放返回同结果且唯一来源，确认成功。此证据替代前期仅内存存储替身的范围限制，但不证明所有异常分支。
Docker docker-roster-upload-regression-20260907.txt现有CSV摄取和受理阶段测试5/5通过。35迁移保持；本轮未修改网页UI。
剩余：Portal传输原始XLSX仍未接线（旧网页转CSV）；实际重启恢复/丢响应客户端组合、异常XLSX/权限/100MB配置与500行全入口边界、重复全行确认及OCR未完成。已记录关闭后新来源受理缺陷仍未修复；不因本次上传通过关闭该问题。整体目标、三端浏览器验收和最终Git存档未完成。

### 网页名单原件传输接线（2026-09-07）
parseRosterFile保留originalFile引用；原有名单确认服务直接上传CSV/XLSX原始字节，通过Blob只规范MIME，不转换内容。XLSX携带解析预览对应sheetName；幂等意图包含格式、工作表、原件摘要、映射、课程和会话。真实服务不接收旧XLS二进制；XLS仍可本地解析但不能通过真实上传替代为CSV。没有修改页面布局或新增控件。
Docker docker-roster-original-portal-20260907.txt 类型检查和原有名单10项回归通过；docker-roster-original-upload-client-20260907.txt 新增客户端专项1/1通过：真正File→SheetJS预览→真实服务适配器→捕获multipart字节，两格式与原件一致，工作表字段正确，模拟确认响应丢失后同键重试且只上传一次。新测试纳入test:v81命令。
本次客户端专项使用模拟fetch响应，不能与上一轮实际后端上传拼接称为浏览器完整链路；原先backend容器Portal依赖解析阻断仍未关闭。实际三端点按、丢响应完整客户端HTTP、重启恢复、100MB部署配置/CSV500行、重复身份确认及OCR仍待完成。189操作/35迁移，整体目标及最终Git存档未完成。

### XLSX拒绝分支与当前名单保护（2026-09-07）
Docker docker-roster-xlsx-negative-20260907.txt退出0。真实multipart权限：管理员403、其他责任教师/组织404；缺sheetName、文件格式与实际XLSX不一致422且无新增Import。不存在的源工作表及501人员行文件422，各保留唯一FAILED来源、没有人员行、非当前；同一key重复失败仍422且不增加来源。所有失败之后当前名单仍是最初成功导入ID，确认快照仍唯一。
同轮回归真实MinIO原件读回逐字节一致、XLSX格式/工作表/摘要持久化、学号前导零、成功幂等及教师确认通过。没有据此验证100MB配置、压缩极端语料、CSV501行、实际服务重启恢复或浏览器全链。
ACCEPTANCE.md更新35迁移及本轮证据范围，历史整套通过数字不覆盖后续所有新模块；已记录失败继续保持。189操作/35迁移，完整业务目标与最终Git存档尚未完成。

### CSV名单501人员行仍受理并成为当前来源（2026-09-07，未修复）
现行教师业务8.1要求客户端/服务器均校验500人员行。Docker docker-roster-csv-row-limit-20260907.txt退出1：真实CSV500行201且VALIDATED；随后501行仍201、数据库当前来源totalRowCount=501，并替换先前500行来源。期望422且保留原当前来源，断言失败。
backend/src/common/roster-ingestion/roster-csv-parser.service.ts的MAX_ROSTER_ROWS仍为10_000；Portal roster-import.ts同值，客户端专项另行验证。V8确认接口拒绝大于500行并不能替代上传/预览上限。此问题仅记录，本轮不修复。

### 网页CSV/XLSX人员行上限（2026-09-07，未修复）
Docker docker-roster-portal-row-limit-20260907.txt退出1：两个格式均通过500行解析断言，但501行没有按现行规则抛出ROW_LIMIT_EXCEEDED，2项测试均失败。原因定位为roster-import.ts沿用10_000上限。测试新增roster-row-limit.test.mjs并纳入test:v81；失败不掩盖、不修改生产逻辑。
因此当前XLSX服务器501行拒绝已通过，但网页CSV/XLSX和CSV服务器的500行上限未通过；CSV服务器还会将501行来源设为当前。完整三端验收、剩余业务和最终Git存档继续未完成。189操作/35迁移。

### 教师私有名单原件读取（2026-09-07）
新增GET /roster-imports/{rosterImportId}/source，仅责任教师组织范围内可读FILE来源。返回文件名、格式、工作表、原件摘要、大小与base64内容，不暴露存储路径；读取私有对象流并执行100MB大小与SHA-256一致性校验，Cache-Control:no-store。可核对已受理源原件，不自动确认名单或修改历史。
Draft190操作/190处理器、查询37/请求95 parity通过，35迁移。Docker docker-roster-private-source-20260907.txt退出0：真实XLSX上传后经新接口逐字节读回；文件字段及摘要一致、不返回sourceFileStorageKey；管理员403/其他教师和组织404。仅本地MinIO篡改原件后500且无fileBase64，finally恢复原件后200并核验no-store与完整字节。原件上传/确认/幂等/501行等拒绝分支同时回归。
边界：本轮尚未通过学生真实登录测试此接口；权限策略及服务均限定TEACHER。当前采用有界base64返回，与大文件并发的内存/响应大小仍需CVM配置和压力验证；网页原件读取入口未接线，没有新增UI。既有上限和关闭后受理等失败未修复，完整三端验收及最终Git存档未完成。

### 学生本人名单核对接口（2026-09-07）
新增GET /enrollments/{enrollmentId}/roster-status。限定STUDENT本人组织/成员关系；读取当前已确认来源并复用教师端projectRosterRegistration规则。无确认来源明确available=false/status=null/registrationComplete=false；有来源只返回本人成员关系/班级ID、时间、名单版本、本人核对状态及是否注册完成，不返回全班名单、姓名学号、分母或原件。
本地Draft191操作、191处理器/查询37/请求95 parity通过，35迁移。Docker docker-student-own-roster-20260907.txt退出0：真实SMTP学生登录，无来源不可用→教师实际确认名单后MATCHED且完成，名单版本与教师综合名单一致，响应字段白名单准确；教师/管理员403、不存在成员404，学生原件读取403。默认真实材料/审核/内部成绩隔离/认证批准撤销/综合名单纠正与导出同时回归。
边界：本轮未验证另一真实学生关系、未验证邮箱失效/身份冲突/名单外组合的HTTP状态；领域规则已复用但不替代这些验收。学生网页尚无该状态的现有展示接线，未改UI。已记录CSV/网页上限、关闭后受理等失败未修复；完整目标和最终Git存档尚未完成。

### 学生名单状态边界及测试助手阻断（2026-09-07）
Docker docker-student-roster-boundaries-20260907.txt退出1。默认真实业务链、本人名单基础及导出回归先通过；新增测试随后用本地数据库身份夹具验证emailVerifiedAt=NULL→PENDING_REGISTRATION、姓名不符→IDENTITY_CONFLICT、学号不在源名单→EXTRA_IN_PLATFORM，三者registrationComplete=false且与教师综合名单逐项一致。各断言执行完并在finally恢复原邮箱/姓名/学号后，创建另一学生时失败。
失败位置backend/test/helpers/exercise-session.ts:30，seedExerciseSessionStudent尝试更新已经发布的课程时间，数据库P0001拒绝“Published V8.1 schedule is immutable”。此为测试助手不适用于该阶段的夹具阻断，不能算学生本人查询接口失败；也不能把尚未执行的读取他人关系404或最后MATCHED回读标为通过。末尾整体PASS标记未输出。本轮记录而不修复助手，不放宽已发布时间约束。
新增身份变更仅是数据库夹具，不代表学生或教师有修改身份权限。另一学生成员关系隔离验证、客户端展示与完整三端仍待完成。191操作/35迁移，整体目标和最终Git存档未完成。

### 学生网页本人名单状态数据层（2026-09-07）
api.js新增getOwnRosterStatus，调用本人/enrollments/{id}/roster-status；校验返回成员ID一致、字段白名单、来源版本/可用性/状态和registrationComplete的组合。不可用必须status/rosterVersion为null且未完成，只有MATCHED可为注册完成；额外全班名单字段或身份错配以SYSTEM_INVALID_RESPONSE拒绝，不返回错误成功数据。
Docker docker-student-roster-client-20260907.txt退出0，2/2测试通过：不可用和四类注册状态准确保留，GET路径正确；他人成员ID、虚假完成、无效版本、额外sourceRows和无效日期均拒绝。测试使用模拟fetch响应，未新增页面元素或布局。
当前只是可调用数据层方法，尚未接入学生页面状态展示；真实客户端HTTP与他人成员关系API测试仍待完成（旧助手故障保留）。191操作/35迁移，完整三端、剩余业务与最终Git存档未完成。

### 学生名单网页客户端真实HTTP（2026-09-07）
Docker docker-student-roster-client-http-20260907.txt退出0：沿用V81_PHYSICAL_STORAGE真实SMTP学生登录，把真实会话交给原学生api.js，通过getOwnRosterStatus实际HTTP读取。教师确认来源之前available=false/status=null，之后available=true/MATCHED且完成，客户端响应校验通过。此项新增完整客户端→HTTP→数据库读证据，不是模拟fetch返回；只把相对URL解析到本地服务。
原始体测真实确认/通知/历史、学生现有体测渲染函数、上传免测材料及审批、综合名单免测优先与实际XLSX导出同时回归。该流程未使用失败的“已发布后创建另一学生”助手，不关闭该独立失败。
页面尚未展示名单状态，不能把数据方法验证等同浏览器操作验收。ACCEPTANCE更新191操作/35迁移及学生本人名单证据。原有记录问题、剩余业务和最终Git存档继续未完成。

### 管理员课程名单只读汇总（2026-09-07）
新增GET /admin/class-sections/{classSectionId}/roster-summary，COURSE_VIEW在全局权限守卫及同一RepeatableRead事务内双重检查。只读当前已确认来源，复用注册核对算法，返回可用性、版本、分母/是否已确认、匹配/待注册/冲突行数、名单外数和注册完成状态。无来源时计数为null而非0，不泄露学生名单、姓名学号或原件；注册完成不代表运动目标或结算完成。允许同组织关闭课程的治理读取，符合收尾汇总要求。
Draft192操作/192处理器、查询37/请求95 parity通过，35迁移。Docker docker-admin-roster-summary-20260907.txt退出0：无来源不可用→确认后分母1/匹配1/待注册0/冲突0/名单外1，版本与教师快照一致；响应字段白名单、教师403、跨组织404；将合成管理员切为SUB后仅COURSE_VIEW允许200，空权限/仅SEMESTER_MANAGE为403，finally恢复SUPER。
原有教师确认/快照不可变/源更换结算阻塞/体测与进度分列同时回归。日志中关闭后拒绝仍指确认阶段，不关闭已记录的上传入口允许新受理问题。管理员页面尚未接入该汇总；隐私和人数边界更多组合、完整三端和最终Git存档未完成。

2026-09-07 管理员当前课程目录后端汇总：新增 GET /admin/course-directory（getV81AdminCourseDirectory），总管理员或 COURSE_VIEW 子管理员可读。同一 RepeatableRead 快照按当前学期 UPCOMING/ACTIVE 课程统计，顶部学生及教师分别去重；课程使用教师自定义 displayName；当前成员与已移出成员分组返回记录数量、审核阶段数量和有效记录实际计入秒数，不输出学生、成员、记录标识。已发布规则提供目标，未发布为 null，完成学生数及完成率固定 null。
Docker 证据 docker-admin-course-directory-20260907.txt 退出 0：193 个操作/路由 parity；35 项迁移、Nest 构建、真实账号首次改密、实际 HTTP 当前学期与未关闭目录范围、成员数、教师去重、未发布目标为空、无学生标识、教师拒绝、子管理员 COURSE_VIEW 撤销/恢复通过。
验证边界：本次数据没有非零运动记录；非零计入、移出成员历史隔离、无当前学期、并发快照仍需专项验证。此接口暂未接入 admin-courses.tsx；该页面本次无 diff，原布局未改。docker-admin-directory-portal-typecheck-20260907.txt 仅是现有 Portal 类型检查，不是新目录网页接线或浏览器验收。下一步完成这些统计场景与原页面数据加载接线。既有测试失败保持记录，未修复；总目标未完成，最终 Git 本地存档待完整范围核验。

2026-09-07 现有 Portal Docker typecheck 退出 0（docker-admin-directory-portal-typecheck-20260907.txt）；admin-courses.tsx 无修改，因此不计作新课程目录接线验收。测试依赖容器已停止，数据卷保留。

2026-09-07 管理员课程目录网页数据接线：admin-courses.tsx 的真实模式使用 admin-course-directory-api.ts 调用 /admin/course-directory，顶部人数使用服务器去重 summary；当前成员记录和计入秒数来自 currentMembers，移出人数来自 removedMembers。页面不再逐课程读取学生成员和运动记录明细。页面 return JSX 与 HEAD 逐字比对（统一换行后）一致，未改控件、布局、样式。演示数据保留原逻辑。
验证：docker-admin-directory-portal-http-20260907.txt 退出0，真实管理员登录后运行 Portal 数据适配器，仅请求一次 /api/v1/admin/course-directory，与后端统计相同；docker-admin-directory-portal-wiring-20260907.txt 退出0，Portal typecheck 和新适配器测试通过。测试包含跨课程人数按服务器去重、当前成员1800秒不混入移出成员36000秒、空学期、目标不可用、权限错误透传；数值场景属于合成响应适配测试，不证明数据库时长或历史隔离。新测试已加入 test:v81，已有名单501行失败测试仍保留。
尚未进行真实浏览器三端验收；页面原有布局没有对应位置显示全部新统计字段及 generatedAt，本次保留未展示字段，不能宣称管理员课程详情所有业务字段已展示。Docker 人工审核非零计入专项另记结果。

2026-09-07 docker-admin-directory-manual-credit-20260907.txt 整体退出1。新增真实 HTTP 断言 ADMIN_DIRECTORY_MANUAL_VALID_RECORD_CREDIT_3600 和 ADMIN_DIRECTORY_CORRECTION_INVALID_REMOVES_CREDIT_PRESERVES_SUBMISSION 均通过：原相机材料/人工审核合法记录计入3600秒，纠正无效后0秒、有效数0/无效数1且提交人数保持1。实际时长由既有 elapsedSessionFixture 构造，非真实运动实拍。最后仍在 backend/test/helpers/exercise-session.ts:30 创建另一学生时更新已发布课程时间表，P0001 Published V8.1 schedule is immutable，属于已有夹具阻塞，未修复，不得把整条运行标为通过。数据库移出成员非零历史分组、无当前学期真实数据库以及浏览器验收仍未证明。

2026-09-07 管理员课程目录成员历史专项 docker-admin-directory-member-history-20260907.txt 退出0。复用相机来源合成PNG、服务器时长夹具、真实提交与责任教师人工审核，记录计入3600秒后由教师实际 POST /enrollments/:id/remove：当前成员人数/提交人数/记录数/计入秒数均归零，removedMembers人数1/有效记录1/提交人数1/计入3600秒；顶部去重学生数减1。同幂等键重放结果一致，再由教师实际恢复同一成员，当前与历史分组全部计数回到原值、顶部人数恢复，没有双计。本专项在该验证后正常结束；不包含已知默认完整探测末尾的另一学生夹具失败，也不关闭该问题。
该证据补齐数据库移出成员非零历史分组和恢复验证。无当前学期、并发快照、实际浏览器显示及其余全范围功能仍未完成。原有UI布局未修改，本地Git最终存档待全范围核验。

2026-09-07 管理员原始体测治理摘要：新增 GET /admin/class-sections/:classSectionId/physical-summary（getV81AdminPhysicalSummary），仅总管理员或 COURSE_VIEW 子管理员可读，组织隔离。按当前已确认官方名单人员行统计，返回来源版本、总行数、已录入/已免测/未录入/注册未解决人数；无已确认名单时 available=false 且计数为null。注册未解决行不猜身份或直接算未录入；免测优先于已存在原始体测历史；原始秒数、日期、学生和成员标识均不返回。采用同一 RepeatableRead 快照。此摘要不决定缺失体测是否允许结算。
Docker docker-admin-physical-summary-20260907.txt 退出0：194操作协议/路由parity，35迁移及Nest构建；真实HTTP确认名单前不可用、确认后已录入1人、未验证邮箱暂归注册未解决1人、批准免测后免测1人/已录入0人；名单版本与教师报告一致，响应字段白名单；教师/学生403、跨组织404，COURSE_VIEW子管理员授权与撤销通过。既有原始245秒三版本历史、真实合成PNG上传免测审批、学生实际API和原渲染函数、综合名单/导出回归同次通过。
尚未单独验证匹配成功但无原始记录的notRecordedCount非零场景、重复名单及并发快照。本接口暂未新增页面显示控件，原UI/UX未修改。OCR草稿受理/识别/核对以及综合名单最终确认、结算快照仍未完成；RAW_PHYSICAL_RESULTS结算检查仍保持UNAVAILABLE，未把摘要当成结算许可。

2026-09-07 OCR 草稿接入基础：新增 domain/ocr-table-source.ts，以腾讯云 RecognizeTableAccurateOCR 的 TableDetections/Cells 为输入，输出保留原文、单元格位置、置信度、四点坐标、请求标识和输入原件SHA256的草稿证据。永远 requiresTeacherConfirmation=true，不推断表头、不转学号或4.30用时、不合并重复/姓名、不用置信度自动通过。输出资源限制为32表、32000单元格、1Mi字符；这是上游响应资源限制，不替代业务500人员行/100MB源批次限制，后续必须在明确选择表头/表格后执行业务限制。
官方接口依据 https://cloud.tencent.com/document/product/866/86721 和数据结构 https://cloud.tencent.cn/document/product/866/33527 ，仅用于字段适配设计，未调用腾讯云OCR、未传输任何材料或启用收费服务。SDK/签名调用、原件受理、任务重试、数据库草稿及教师确认仍未实现。解码器接收的SHA256由未来服务端读取原件后核验，不是当前已验证的原件上传链路。
Docker docker-ocr-table-source-20260907.txt 3/3通过、退出0：前导零/重复/含空白换行姓名/4.30原文保留、输入对象不变、缺省置信度、非法类型/坐标/置信度/空结果/提供方错误与资源边界。随后 docker-ocr-table-source-typecheck-20260907.txt 退出2：新测试代码直接数组下标触发TS2532，故意构造null/非字符串坏输入与测试工厂推断类型不兼容触发TS2322；已按用户要求只记录不修复。运行测试通过不等于类型门禁通过，当前不能宣称后端整套检查通过。

2026-09-07 OCR 人员草稿字段选择：新增 domain/ocr-personnel-draft.ts，教师显式指定表格、表头行和字段列，名单要求学号/姓名，体测要求学号/姓名/项目/用时/日期；不猜表头或自动格式化文字。草稿保留原件SHA256、识别请求、选择配置、源行和单元格索引，所有行confirmed=false。缺失、多重匹配、空字段、合并/非法跨度、重复学号均作为待核对问题保留；计数包含错误、重复及跨行占位，不静默去重；单次选择超过500人员行拒绝。跨页/跨表批次总500行和100MB源材料校验仍须在未来批次受理服务统一落实，本函数不代替该全批校验。
Docker docker-ocr-personnel-draft-20260907.txt 2/2通过退出0：原文/重复/缺失和来源索引保留、500接受/501拒绝（错误行计数）、错误映射拒绝、合并单元格跨行均保留问题。docker-ocr-personnel-draft-typecheck-20260907.txt退出2，报告仍是ocr-table-source.test.ts的已知TS2532/TS2322测试代码错误，本轮新选择器及其测试未报告类型错误。已知失败未修复；不能宣称整个类型门禁通过。
此轮仍是草稿转换领域逻辑，尚无OCR原件上传、服务调用、不可变数据库草稿或教师确认HTTP，未变更UI/UX、未增加正式接口操作数或迁移。下一步需接入原件批次及草稿持久化，不能将以上单元测试当成真实OCR业务验收。

2026-09-07 OCR原件和识别尝试持久化：0036_v81_ocr_sources新增v81_ocr_batches与v81_ocr_page_attempts，原件清单记录每页UUID、私有storageKey、SHA256、媒体类型及字节数，批次100MiB上限和合计一致性，页面数1000技术资源上限（不替代500人员行）。课程/组织/责任教师范围、创建时课程未关闭且学期未归档由插入触发器校验；批次原件不可更新删除。识别尝试按页从1连续追加，锁批次串行校验，失败保留错误码，成功证据必须绑定原SHA及保留requiresTeacherConfirmation=true；不覆盖历史，不形成正式名单/体测事实。
Docker docker-ocr-storage-20260907.txt退出0：36项迁移、Nest构建和健康检查通过；真实PostgreSQL校验批次字节不符、重复页/存储键、null字段、超100MiB、关闭课程、另一教师及跨组织受理均拒绝，100MiB边界元数据接受；批次及尝试UPDATE/DELETE拒绝；失败第1次→成功第2次历史保留、跳号/错误页/SHA/取消教师确认标记拒绝。该证据storageMetadataOnly=true，未实际上传100MiB或验证对象内容；源文件校验、完整草稿结构校验由后续服务接入，当前数据库成功证据只做最低来源/草稿标记约束。
迁移manifest已更新且generate --check通过。现有OCR测试文件typecheck失败仍未修复；Nest构建排除test，因此构建通过不能关闭该测试类型问题。当前正式操作数仍194；OCR HTTP上传、调用、查询/核对/确认和并发重试验收尚未实现，UI/UX未改动。

2026-09-08 OCR真实原件受理：新增 ocr-multipart.ts 流式接收及 V81OcrIntakeService/Controller，POST /class-sections/:classSectionId/ocr-roster-batches 与 /ocr-physical-batches；仅责任教师可受理未关闭、未归档课程。先验权限后消费文件，提交前锁组织和课程、复查NORMAL及责任范围；流式SHA256/整批100MiB文件字节上限、PNG/JPEG/WebP签名、私有服务器生成路径；事务内保存不可变源清单及SOURCE_ACCEPTED事件。幂等指纹包含用途、按顺序各页SHA/字节/类型，重放返回原批次并清理本次多上传对象；失败时不返回部分批次。仅返回页UUID、SHA、类型及大小，不返回私有存储路径，recognitionStatus=NOT_STARTED。
Docker docker-ocr-multipart-20260908.txt 2/2通过（内存存储适配）：两页原件字节/总量/哈希、错误签名和字段导致整批清理。docker-ocr-intake-http-20260908.txt退出0：196操作parity、36迁移及Nest构建，真实教师HTTP分别受理名单/体测原件、同键重放保持同批、MinIO读回原始合成PNG字节相同且最终对象数仅2、数据库批次数2；管理员403、另一教师404、关闭课程409、伪PNG422通过。
边界：本次真实HTTP为小PNG；100MiB实际传输、超限/中断/并发同键/关课竞争、JPEG/WebP完整解码和存储故障分类/清理失败仍待测试。签名检查不等于完整图像解码。上传尚未触发OCR收费服务，也没有完整教师草稿查询/确认；现有OCR测试typecheck错误仍未修复。原有UI/UX未改，完整目标与最终Git本地存档未完成。

2026-09-08 OCR批次回读：新增 listV81OcrBatches/getV81OcrBatch/getV81OcrPageSource/getV81OcrPageRecognition；责任教师可分页查看本人课程批次、详情和每页最新尝试，原件及识别证据仅本人可读，关闭课程已有源仍可只读查看。列表/详情不返回storageKey；识别尚未运行时latestAttempt=null，不伪造成功。原件读取完整校验字节数与SHA256后才返回base64，Cache-Control:no-store。
Docker docker-ocr-read-http-20260908.txt退出0：200操作/200路由、query38/body95 parity，36迁移和Nest构建；真实受理后分页1+1无重复、详情/识别无尝试、原件PNG字节一致、管理403/其他教师及其他组织404、不存在页面404通过。MinIO原件被临时替换后源接口500且无fileBase64；finally恢复源后200字节一致。课程关闭后既有详情及原件读取仍通过。原上传重放清理与范围回归同次通过。
尚未验证有识别尝试时的完整证据回读、故障/并发、100MiB返回内存压力。base64源读取当前需内存校验完整文件，生产并发容量需验证。识别调用、草稿修改与确认、正式名单/体测桥接、UI接线仍待实现；既有类型检查失败未修复，未因本次Nest构建通过而关闭。

2026-09-08 腾讯OCR提供方适配：新增 tencent-ocr-provider.ts，复用已安装 tencentcloud-sdk-nodejs-common AbstractClient，固定 HTTPS ocr.tencentcloudapi.com、2018-11-19、RecognizeTableAccurateOCR、TC3签名及CVM角色临时凭据。RuntimeConfig接入OCR_PROVIDER（默认DISABLED）、OCR_TENCENT_REGION、OCR_TIMEOUT_MS（默认20000，1000..60000）。不读取COS静态密钥，不在默认启动时请求角色凭据或识别；尚未注册识别HTTP执行服务。每次识别校验原件SHA，使用ImageBase64及AbortSignal，输出原件绑定且需教师确认的草稿；上游错误文字不透传，只返回稳定内部错误码。
官方依据 https://cloud.tencent.com.cn/document/api/866/86721 （表格V3图片/PDF Base64后不超过10M）；SDK构造、request/action/signal及解包行为另核对仓库已安装4.0.825源码。本实现将编码上限设10000000字符，仅PNG/JPEG直接送识别；WebP虽可作为私有原件受理，目前OCR调用会明确FORMAT_UNSUPPORTED，大图明确SIZE_LIMIT，转换/派生图及原件映射尚待实现，不缩小业务100MiB源批次受理范围，也不声称全部已受理原件可识别。
Docker docker-tencent-ocr-provider-20260908.txt退出0：Nest构建及提供方适配单元3/3通过，覆盖默认禁用、配置校验、精确字节请求/源SHA核验、草稿需确认、超编码大小/不支持格式本地拒绝、上游错误脱敏、空表不算成功。使用注入的模拟SDK请求对象，未实际调用腾讯云、未验证云权限/计费/识别准确率/真实超时。旧ocr-table-source.test.ts类型错误仍保留；Nest构建排除test不代表全类型检查通过。
下一步接入批次执行、并发/幂等和失败尝试持久化，再完成教师核对确认；当前接口200、迁移36，UI未改。

2026-09-08 OCR持久化任务基础：0037_v81_ocr_jobs新增排队/执行/成功/失败任务，绑定批次、页、责任教师、预期已完成识别次数和请求。每页仅一个QUEUED/RUNNING任务；任务建立检查来源与组织/责任教师、学期未归档及关闭前合法原件。领取及过期重领需要版本递增，租约未到期不可抢占；终态必须由当前未过期租约持有人提交，并引用对应页下一次识别结果且结果状态一致；终态与删除受约束。
Docker docker-ocr-job-storage-20260908.txt退出0：37项迁移及Nest构建通过；实际PostgreSQL验证预期次数错误、错误页/教师、重复活动任务、未领取直接完成、未到期抢占、旧租约持有人完成、结果状态不符及终态重开/删除拒绝。过期后换执行者、失败结果追加并关联任务终态、随后建立下一次排队任务通过。syntheticLeaseTimes=true，测试通过构造时间验证数据库约束，不代表已验证真实计时/进程崩溃恢复/多进程工作器。
任务HTTP建立/查询及后台领取、实际OCR调用和结果事务仍未接通，本次仍无云端调用。外部OCR请求即使有本地幂等，也不能在网络响应丢失时保证提供方只计费一次；执行器需保留这一边界。原有OCR测试类型错误保持未修复。当前操作200、迁移37；UI/UX未改，完整验收和最终Git存档仍未完成。

2026-09-08 OCR任务接口：新增 POST /ocr-batches/:batchId/pages/:pageId/recognition（createV81OcrJob，expectedAttempt）及 GET /ocr-jobs/:jobId（getV81OcrJob）。仅责任教师可建立/查询，原件必须存在于当前组织的该批次；事务复查NORMAL、未归档及关闭前合法源，锁批次检查最新识别次数和活动任务，原子创建QUEUED任务及事件。同键重放同任务，不把排队称为识别成功。默认DISABLED提供方返回503，识别服务启用后才受理任务；未接入后台执行器，此阶段任务保持排队。
Docker docker-ocr-jobs-http-20260908.txt退出0：202操作/202路由、query38/body96 parity；37迁移、Nest构建及真实HTTP任务建立/回读、同键重放、不同键已排队冲突、预期次数冲突、两个不同请求竞争同一页201/409、2页仅2个QUEUED任务及2条审计、管理员403/其他教师和其他组织404通过。workerDisabled=true，本地仅开启提供方配置允许排队，没有后台执行器或真实腾讯调用；未来工作器必须继续遵守探测器OCR_WORKER_ENABLED=false。
docker-ocr-jobs-disabled-20260908.txt退出0，复用同一已构建镜像验证默认OCR未启用时503且0任务。两次均回归真实原件上传/重放清理、分页/源哈希篡改恢复/关闭后读取。旧OCR测试typecheck失败仍未修复。
下一步接入任务领取、私有源校验、OCR请求、带租约版本的结果落库与任务终态，再完成教师核对确认。页面未接OCR控件，未改变原UI/UX；原目标和最终精确本地Git存档仍未完成。

2026-09-08 OCR后台执行器：V81OcrWorker使用数据库SKIP LOCKED领取QUEUED/过期RUNNING任务，120秒租约与版本令牌，读取原件并核验字节/SHA后在事务外调用识别提供方；完成事务复查当前租约/版本和NORMAL，原子追加识别尝试、更新任务终态及审计。过期或已换执行者的结果不落库；失败保留稳定脱敏码和原件，可由教师带最新expectedAttempt重新建立任务。默认每5秒领取一个，进程内防重入、数据库负责跨执行者互斥；需OCR_PROVIDER=TENCENT_TABLE_V3且OCR_WORKER_ENABLED=true才自动运行，默认false。配置示例已补充，未启用真实云调用。
Docker docker-ocr-worker-20260908.txt退出0：37迁移、Nest构建、真实HTTP任务排队/回读与私有MinIO源，手动驱动两个执行器实例；提供方使用模拟SDK响应。第1次模拟ETIMEDOUT成为FAILED/attempt1且errorCode=OCR_PROVIDER_TIMEOUT，另一页成功；重新排队后两执行器同时竞争，只一个领取成功，attempt2=SUCCEEDED，原失败历史保留；教师HTTP读回原始000123文字、requiresTeacherConfirmation=true。3次提供方调用对应1失败2成功，无重复领取。此证据providerSimulated=true，不是腾讯云识别准确率或生产CVM凭据验证。
尚需验证自动定时启动、多进程重启/租约过期、读取中断/慢对象、维护与归档竞争、真实提供方超时/权限、WebP或大图派生处理。仅设置AbortSignal的提供方请求时限，私有对象读取当前依赖存储适配器超时，完整慢读取/容量测试未完成。当前操作202、迁移37；教师草稿修改确认/正式名单和体测桥接、UI接线与全范围验收仍未完成。已知OCR测试typecheck失败未修复，Nest构建通过不关闭该问题。

2026-09-08 OCR教师草稿存储：0038_v81_ocr_drafts新增按批次连续追加的草稿修订，记录页/识别次数/表格/表头/字段选择、原始行定位及OCR问题、教师可编辑值和reviewedAgainstSource。初版必须覆盖全部原件页、引用最新成功识别且没有活动任务，初始行一律未核对；单版1..500行、JSON合计8MiB技术上限。修订保留行ID/顺序/来源/OCR问题和选择配置，不能删行重排或改写原始证据；可另存教师修订值及核对状态。旧版本不能UPDATE/DELETE，当前责任教师和未归档/关闭前合法源范围由数据库校验。
Docker docker-ocr-draft-storage-20260908.txt退出0：38迁移、Nest构建，数据库拒绝初版自动已核对、引用失败旧尝试、缺页、重复行ID、501行、另一教师、跳版本、改写来源/原OCR问题和原版本修改删除；合法修订值追加到版本2后版本1原值与来源仍保留。该草稿部分storageMetadataOnly=true，测试直接构造草稿行验证存储约束，不是完整图像映射或教师HTTP核对流程。原HTTP上传/任务/执行器模拟提供方/重试/原件读回回归同次通过。
当前需接入教师字段选择与草稿创建/修改/读取，再将已核对行通过原始体测事务或官方名单快照确认。识别成功和reviewedAgainstSource标记均不等于正式体测/正式名单，本迁移未生成正式事实。当前操作202、迁移38；已有类型错误未修复，UI/UX未改，总验收和最终本地Git存档仍未完成。

2026-09-08 OCR教师草稿HTTP：新增创建 POST /ocr-batches/:batchId/draft、读取 GET 同路径（可选version读取历史）、修订 POST /ocr-batches/:batchId/draft/revisions。责任教师显式选择页、最新成功识别次数、表格、表头和列；首次创建覆盖全部源页且无活动识别任务，跨页合计最多500人员行。保留原始值、单元格索引及OCR问题，初版全部未核对；修订只能提交已存在行ID、字段值和reviewedAgainstSource。每版追加、带expectedVersion、幂等键和审计，JSONB实际文本合计8MiB限制。组织NORMAL/未归档/关闭前合法源复查；GET可按版本读取不可变历史，响应no-store。reviewedAgainstSource及pendingReviewCount仅表示教师核对标记，isFormal始终false，不能当成业务校验全部通过或正式结果。
Docker docker-ocr-draft-http-20260908.txt退出0：205操作/205路由，query39/body98 parity；38迁移及Nest构建通过。真实HTTP+PostgreSQL+MinIO链路下，用明确模拟的OCR表头/学号/姓名创建版本1，保留000123及源单元格索引；管理员403、其他教师/组织404、旧识别次数409、重复表选择/缺页/非法表头与列/空columns/越权字段422；修订未知行、来源篡改、错误业务字段和字符串核对值422；同键重放一致、两个版本1修订竞争201/409，只有版本1/2和各一条审计；版本1原值、版本2修订值及相同来源/OCR问题读回。原件上传/重放清理、任务重试、模拟执行器竞争、原件哈希篡改恢复和关闭后原件读取同次回归通过。
该测试为单页ROSTER草稿，未验证多页/多表500边界、PHYSICAL字段、草稿修改与维护/归档竞争、关闭后草稿修订、跨页重复身份提示、完整容量/慢读取或实际腾讯识别。正式确认、学生身份精确匹配、项目/用时/日期校验以及选中行有疑点时阻断正式提交仍待实现；页面尚未接OCR草稿交互。原有OCR测试typecheck失败及其他已知问题未修复，本次构建通过不代表整套类型测试通过。未改UI/UX；Docker依赖已停止，持久卷保留；全范围验收、最终交接与精确本地Git存档仍未完成。

2026-09-08 OCR体测正式确认规则准备：domain/ocr-physical-confirmation.ts复用现有physical-import精确身份/性别项目/用时/日期规则，先检查全批1..500行和唯一行ID，再评估选择范围。整批重复学号不能通过仅选择其中一行绕过；选中行必须已对照原件核对、五字段存在、身份精确匹配且无业务问题，全部满足才返回待写入结果。未选中且身份不同的疑点行继续待处理，原输入不修改。该规则尚未接正式HTTP事务、数据库来源关联或学生通知，返回解析后的值不等于已经生成正式事实。
Docker docker-ocr-physical-confirmation-domain-20260908.txt退出0，2/2领域测试：未核对、前导零身份不匹配、相似姓名、性别项目冲突、4.30模糊用时、非法日期及缺字段阻断；跨选择范围重复身份阻断；合法4:30解析270秒，仅选合法行允许、同时选疑点行阻断，重复选择/未知行/501行拒绝，输入保留。测试使用合成成员及草稿对象，无真实HTTP或数据库提交。下一步增加草稿行到正式体测版本的不可变关联表，并在同一事务内校验最新草稿/结果版本、写正式体测及关联，保留未选行状态。仍205操作/38迁移，已知测试问题未修复，目标未完成。

2026-09-08 OCR体测来源关联存储：0039_v81_ocr_physical_confirmations新增batch/row到draft_version和enrollment/result_version的不可变关联，源行只能确认一次，同一正式版本只能被一个OCR行引用。数据库要求PHYSICAL批次、最新已核对草稿行、责任教师、当前组织NORMAL/未归档、ACTIVE成员和合法课程源；正式版本的责任教师、请求标识、时间、精确学号姓名、项目和日期必须对应。新增草稿修订触发器冻结已确认行的完整工作值与核对标记，其余未确认行可继续追加修订；既有正式体测纠正仍通过正式结果历史机制，不能倒改已确认OCR来源。
Docker docker-ocr-physical-storage-20260908.txt退出0：39迁移全部应用、Nest构建、205操作协议生成；直接SQL草稿/正式结果夹具证明未核对、旧草稿版本、错误操作者和错误请求ID拒绝；合法关联落库后重复确认、UPDATE/DELETE、修改已确认用时、撤销核对标记拒绝；仅保留已确认行原值的后续草稿修订可追加，关联仍指向版本2/正式结果1。原真实HTTP原件/任务链及模拟提供方工作器回归通过。该新增来源关联证据storageMetadataOnly=true，未通过正式确认API生成结果；数据库关联守卫不取代领域层全批重复身份/模糊用时解析检查，下一步仍需事务内调用领域校验、正式体测服务及关联写入，并回读选中与待处理行。
当前205操作、39迁移。无新的测试失败，既有失败未修复；本次未改变前端界面。全范围实现、三端真实操作验收、交接及最终精确本地Git存档尚未完成。

2026-09-08 OCR正式体测确认接口已实现：GET/POST /ocr-batches/:batchId/physical-confirmations（getV81OcrPhysicalConfirmation/confirmV81OcrPhysicalRows）。读取最新草稿的精确身份/项目/用时/日期/源核对问题、已确认关联和待处理数量；POST带expectedDraftVersion与每行expectedResultVersion，锁组织NORMAL及批次，复查责任教师/未归档/合法课程源，先按全批校验重复身份，再检验选择范围未确认且无问题，事务内调用正式体测追加服务，生成学生通知、0039来源关联和事件，未选行保持待处理。草稿修订接口补充已确认行409拒绝；原正式纠正历史入口不受本次替代。
本地协议静态parity通过：207操作/207路由，query39/body99。第一次Docker构建因镜像仓库TLS超时退出1（docker-ocr-physical-confirmation-build-20260908.txt）。重试docker-ocr-physical-confirmation-http-20260908.txt退出1：Nest构建通过、39迁移无待应用、原OCR排队/权限/重放检查通过；新增测试尚在seedExerciseSessionStudent创建合成学生时触发23514 student_profiles_student_number_check，未进入新增GET/POST及学生结果回读断言。不得声称正式体测OCR HTTP闭环通过。按用户要求保留失败，不修改夹具或业务代码规避失败。
新增测试使用randomUUID前8字符作为学生夹具suffix；既有helper直接拼入学号，并固定gender=OTHER。学号格式约束与该输入存在不兼容；另有性别OTHER无法映射800/1000项目的静态测试前置风险，尚未运行到该断言，不能称其已复现。需要后续用户授权处理测试问题后再验证正式确认、原子拒绝/回滚、通知一次、来源关联、学生仅正式结果、剩余行状态及确认行禁止编辑。原领域和来源存储局部通过不能替代此HTTP证据。
当前207操作/39迁移，前端UI/UX未改，原已知测试问题仍保留，全范围验收、最终交接与精确本地Git存档尚未完成。

2026-09-08 OCR纸质名单快照规则：prepareOcrRosterSnapshot要求全批1..500行、行ID唯一、每行已对照原件核对、学号姓名存在且符合既有字段容量。按现有名单核对规范NFC/学号大写形成核对值，同时另存原学号/姓名文本、源定位和OCR问题，绝不删除重复行。重复学号标记duplicateIdentity，交由现有projectRosterRegistration显示IDENTITY_CONFLICT及分母未确认；没有平台成员的合法名单身份仍为PENDING_REGISTRATION，不要求先注册，不自动创建身份或成员。
Docker docker-ocr-roster-snapshot-20260908.txt退出0，2/2领域测试通过：前导零与原文本/源/OCR问题保留、重复身份两行保留且分母null/不报完成、无成员时待注册、深拷贝与输入不变、未核对/缺字段/空身份/重复行ID拒绝、500个重复人员行保留而501拒绝。该规则未接数据库正式确认或HTTP，不代表纸质名单业务已完成。
存储审查发现0034正式名单及4处摘要/学生/综合名单消费者依赖official_roster_imports电子源与is_current。后续需增加明确的OCR源类型及统一当前基准选择，保证电子名单导入/回退和OCR确认可切换同一个基准，保留全部历史及当前电子名单的既有行为；不得伪造FILE/CSV来源或仅在OCR返回成功而下游仍读旧名单。当前仍207操作/39迁移。原正式体测HTTP合成学生夹具失败未修复，完整验收与本地Git存档仍待完成。

2026-09-08 0040统一名单基准迁移完成：正式名单支持互斥电子导入/OCR批次来源；OCR快照关联草稿版本、有序原件清单摘要、全量原始行与问题，要求最新版本全部已核对、责任教师、NORMAL及合法课程源。课程快照版本延续统一序列；OCR确认自动追加基准历史，电子is_current启用也自动追加，旧电子当前源在迁移时回填。统一视图只返回最新基准的已确认快照；已确认OCR名单不允许追加改写草稿。
Docker docker-ocr-roster-basis-storage-20260908.txt退出0：40迁移、Nest构建、原OCR原件/队列/模拟工作器/草稿HTTP回归通过；新增直接SQL确认储存测试证明旧版本/来源原文篡改/管理员操作者拒绝，合法快照从统一视图读回且电子外键null、OCR外键真实，重复确认/快照修改/基准历史删除/确认后追加草稿拒绝，基准历史版本1指向对应OCR批次。该确认部分confirmationStorageOnly=true，尚非HTTP正式名单确认。电子/OCR交错选择和回退、并发锁及下游消费者仍待验证；207操作不变，40迁移。原体测HTTP夹具失败保持未修复，UI/UX未改，完整验收与最终Git存档仍未完成。

2026-09-08 OCR正式名单HTTP：新增GET/POST /ocr-batches/:batchId/roster-confirmation，责任教师按expectedDraftVersion确认完整纸质源。事务锁组织NORMAL、课程和批次，复查合法课程源/未归档、最新草稿及全行已核对；prepareOcrRosterSnapshot保留重复和原证据，正式快照与0040基准选择及审计原子写入。接口sourceManifestSha256明确指源清单摘要；GET返回不可变快照，不返回原图私有键。已确认名单的草稿修改提前409拒绝。
Docker docker-ocr-roster-confirmation-http-20260908.txt退出0：209操作/209路由，query39/body100 parity；40迁移及Nest构建通过。真实HTTP原件/模拟提供方/教师草稿修订链上，管理员403、其他教师/组织404、旧草稿409、注入sourceRows422；两个确认请求并发201/409，只一个快照/一次审计，同键重放和GET一致，源行学号000123及OCR原证据/原问题/教师核对文本保留，统一基准视图指向新快照，成员数量不变，确认后草稿修订409。原件篡改校验恢复及关闭后合法源读取回归通过。
本次providerSimulated=true，为单页单行ROSTER；尚未在真实HTTP确认多页重复名单、关闭后确认、维护/归档竞争及电子/OCR交错切换。学生本人名单、管理员摘要和综合名单尚未使用统一视图，不能把本接口成功当作三端已使用新名单。原体测HTTP夹具失败及其他已知测试问题未修复。当前209操作/40迁移，未改前端UI/UX；完整验收和最终本地Git存档仍未完成。

2026-09-08 统一名单下游读取：学生本人名单状态、管理员注册摘要、管理员体测摘要及教师综合名单四处查询改读v81_current_confirmed_rosters。综合名单协议增加sourceKind（ELECTRONIC/OCR）、ocrBatchId，rosterImportId改为可空；电子源继续保留原id，OCR源不会冒充电子导入。导出说明列使用实际来源类型与源ID，未修改网页UI/UX布局。
Docker docker-ocr-roster-consumers-20260908.txt退出0：209操作parity、40迁移和Nest构建；OCR实际HTTP确认后管理员注册摘要从不可用变为分母1/待注册1/匹配0/未完成，体测摘要变为源1/注册未解决1/已录0；姓名、000123和OCR批次ID均不出现在摘要。原OCR草稿与确认竞争/重放/来源/原件读取同次回归通过。
Docker docker-unified-roster-electronic-regression-20260908.txt退出0：复用本次已构建镜像，原电子名单注册核对/邮箱验证/名单外成员、管理员聚合权限撤回和字段限制、教师综合名单正式源/注册/原始体测/运动目标独立列、正式确认版本/重放/历史不可变及新基准替换/关闭后新来源确认拒绝均通过。该电子测试构造数据库源夹具，不能称真实CSV字节上传回归；本次OCR测试没有学生匹配成员和已发布规则，因此OCR来源下学生本人状态/综合名单导出、电子与OCR交错切换尚未实测。结算检查仍使用旧电子基准且OCR待办标UNAVAILABLE，尚需单独接入；未宣称结算可执行。
当前209操作/40迁移。原体测HTTP夹具失败等问题未修复；仍需完整三端真实操作、业务缺项、交接和最终本地Git存档。

2026-09-08 结算检查接入统一基准/OCR待办：CURRENT_ROSTER与CONFIRMED_OFFICIAL_ROSTER跟随0040最新基准；电子差异只统计当前基准对应的alignment run，OCR差异由当前确认名单与成员/邮箱验证状态实时投影。OCR_DRAFTS由UNAVAILABLE改为实际未完成批次数：有QUEUED/RUNNING识别任务、ROSTER未确认、PHYSICAL无草稿或存在未确认行的批次各计1；失败未处理来源也因尚未正式确认而保留待办。确认旧批次后不因保留识别历史自动重复算待办，活动重识别任务仍算。整体RAW_PHYSICAL_RESULTS和CONFIRMED_COMPOSITE_ROSTER仍UNAVAILABLE，不宣称可以正式结算。
Docker docker-ocr-settlement-check-20260908.txt退出0：40迁移、Nest构建；真实HTTP OCR测试在名单确认前待办批次2，确认后1，当前与正式名单检查CLEAR，未注册名单差异1/BLOCKED，ready=false。原草稿/确认/摘要/提供方模拟及原件链回归通过。随后docker-settlement-electronic-regression-20260908.txt退出0，复用代码镜像验证既有电子名单确认/替换、综合名单和管理员摘要、权限、关闭后非法新源确认阻断仍通过。协议描述补充计数口径，209操作parity通过（query39/body100）。
尚未实测OCR全部体测行确认后的0批次、部分确认行、多页活动任务、维护与归档竞争和跨源切换；正式体测HTTP原夹具失败未修复。未实现综合名单结算快照及正式结算事务，注册未完成的业务例外仍待确认。当前209操作/40迁移，UI/UX未改；完整目标与最终本地Git存档仍未完成。

2026-09-08 OCR学生/综合名单导出新增探测：tools/local-integration/v81-ocr-roster-member-probe.mjs计划在现有OCR确认后建立合成匹配成员和名单外成员，检查学生本人范围、管理员未录体测数量、教师综合预览和XLSX来源元数据。docker-ocr-roster-member-export-20260908.txt退出1：40迁移/Nest构建及已有OCR草稿、结算阻塞、摘要、确认检查通过，随后/auth/password-login返回401 AUTH_CREDENTIAL_INVALID，后续新增断言全部未执行，不能宣称学生或导出通过。
只读定位：backend/src/modules/auth/auth.service.ts passwordLogin明确拒绝非TEACHER/ADMIN角色（约189行）；新增测试把合成学生错误地送入密码登录。该失败属于测试登录流程与后端角色规则不符，未发现密码登录应放开学生的业务依据。依用户“测试出问题仅记录”保留原测试与401证据，不放开后端规则，也未修改为另一登录流程重跑。既有正式体测HTTP测试还有独立学号夹具失败，均未修复。
当前209操作/40迁移；本轮仅新增测试，无前端改动。OCR学生本人状态、匹配后的管理员体测未录数量、OCR综合名单和导出仍缺本次真实HTTP验收证据。后续若获准修复测试，应使用学生现有授权登录流程并重新验证上述断言；不能以以前的局部通过补作本次通过。完整目标、交接和最终本地Git存档尚未完成。

2026-09-08 OCR/电子名单交错基准真实HTTP验证：新增v81-ocr-roster-switch-probe.mjs，经OCR草稿核对和正式确认后，实际multipart上传两份独立CSV、回读原件字节与SHA、分别教师确认，再使用既有电子名单rollback接口回退第一份电子名单。docker-ocr-electronic-roster-switch-20260908.txt退出0，40迁移/Nest构建及既有OCR链回归通过。
新增证据：新电子源受理未确认时统一视图为空、管理员摘要available=false，不回落到旧OCR基准；第一/第二电子正式快照版本为2/3，OCR原版为1，回退后恢复原电子快照版本2而非生成伪新快照；基准历史连续1..4，来源为OCR、电子1、电子2、电子1。两份实际CSV原件字节/SHA一致，旧OCR和被回退电子快照仍可完整回读，课程成员保持0。此测试覆盖OCR到电子及电子之间回退，尚未提供或验证“重新选择旧OCR快照”业务接口；也未验证切换期间并发或归档。
当前209操作/40迁移，本轮新增测试未改UI/UX或业务实现。原学生密码登录401测试问题、正式体测学号夹具问题及其他失败仍保留未修复。完整业务实现、全范围验收、交接及最终本地Git存档仍未完成。

2026-09-08 统一名单历史基准选择：新增GET/POST /class-sections/:classSectionId/roster-basis（getV81RosterBasis/selectV81RosterBasis）。GET返回当前基准版本及电子/OCR源、已确认快照标识和快照版本；无源时version0。POST接受confirmedRosterId/expectedVersion/reason，仅责任教师，组织NORMAL、未归档及合法课程源；确认过的历史快照可重新选择，基准历史递增而快照版本保持原值。选择非当前电子源时同步电子is_current并利用0040触发器追加；选择OCR或电子标志已当前但统一基准不同的快照时直接追加。清理旧alignment当前标记并记录操作者/原因/前后版本，保留原快照、成员和所有教学事实。
Docker docker-roster-basis-selection-20260908.txt退出0：211操作/211路由，query39/body101 parity，40迁移/Nest构建；原真实CSV切换链后GET基准4，管理员403、空白原因422、不存在快照404、旧版本409；并发恢复OCR为201/409，唯一基准5指向原快照版本1，同键重放与GET一致；再选已有电子当前标志源得到基准6/快照2，再选非当前电子源得到基准7/快照3。历史1..7连续，新增选择审计版本5/6/7各一条，原因一致，成员仍0；原OCR/实际CSV源/确认及基准回退链回归通过。
未覆盖跨教师目标快照、维护/归档竞争、关闭后历史选择和浏览器入口；既有电子名单“当前”接口仍描述电子来源，统一基准入口需前端业务接线时使用新接口，不能据本次API通过声称页面已正确显示OCR基准。原测试失败均未修复。当前211操作/40迁移，UI/UX未改；完整业务和最终Git存档仍待完成。

2026-09-08 教师历史名单快照目录：新增GET /class-sections/:classSectionId/roster-basis/snapshots（listV81ConfirmedRosterSnapshots），按快照版本倒序分页，limit默认20/最大100，beforeVersion游标；返回源类型及ID、源版本/行数、确认时间和读取时当前选中标记。仅责任教师，不将名单明细/姓名/学号/原图混入列表，借此可取得历史confirmedRosterId用于已有基准选择接口。只读历史允许查询归档课程。
Docker docker-roster-snapshot-list-20260908.txt退出0：212操作/212路由，query40/body101 parity；40迁移/Nest构建；实际OCR/两份CSV确认/基准恢复链后分页2条版本3/2、下一页版本1且游标终止，当前选中只有版本3，旧OCR版本元数据真实；beforeVersion1为空，limit0/101及游标0为422，管理员403，返回字段精确限定为9个摘要字段。原基准并发选择、重放、原因审计、源字节及历史回归通过。
本轮未验证跨教师/跨组织列表、归档读取或大历史容量；页面入口尚未接入。原失败保持未修复。当前212操作/40迁移，未改UI/UX；全面实现与验收、交接及最终本地Git存档仍待完成。后续应推进此前尚未实现的补练窗口、学期切换归档与正式结算，并保留业务歧义待确认。

2026-09-08 补练规则开始接入：依据业务总览560/564、教师102/106/324及学生191/193，补练只能在已公布七天收尾期内对指定成员开放，原学期当前/未归档、课程未关闭、成员有效，不倒填日期或放宽计入上限。只读检查发现当前exercise-sessions.service.start仍仅调用普通assertStartWindow，尚未读取补练授权；这是待实现接线，未通过测试宣称补练已经可用。
新增domain/makeup-window.ts：校验有限时间、已公布七天收尾期、非空且不超范围的窗口及窗口尚未结束；实际开始授权采用服务器时间，须不早于授权受理时间并位于[startsAt,endsAt)，撤销生效后不允许新开始。该判定不更改既有会话、不设置业务日期或改动日周计入。允许当前时刻已处于窗口内时受理授权，但受理前的历史时刻不能获得追溯授权。
Docker docker-makeup-window-domain-20260908.txt退出0，2/2领域测试：边界窗口合法、收尾范围外/零长度/已结束/非七天/非法日期拒绝；受理前不能开始、受理时可开始、结束前1ms可开始/结束时不可、撤销前后分界及非法服务器时间验证。尚无数据库授权、接口、学生会话启动与计入链证据；权限/成员/课程/学期及结算状态仍须在事务内实现，纯时间函数不替代这些条件。当前212操作/40迁移，UI/UX未改，原测试失败未修复，完整目标与本地Git存档待完成。

2026-09-08 补练存储0041：新增v81_makeup_windows、v81_makeup_revocations、v81_makeup_session_sources。授权记录绑定组织/课程/成员、已发布规则版本、窗口、责任教师和请求时间，数据库检查NORMAL、课程ACTIVE、学期CURRENT、成员及账号有效、窗口在公布收尾期与学期日期内；受理时间早于窗口结束。授权内容不可UPDATE/DELETE，撤销另存一次带原因记录；会话关联要求本人关系、服务器开始时间位于已受理且当时未撤销窗口，关联时间等于会话开始时间。原会话和原授权历史不因撤销改写。
Docker docker-makeup-storage-20260908.txt退出0：41迁移全部应用、Nest构建；直接SQL/Prisma合成夹具验证管理员授权/移出成员/错误规则版本/收尾期外/过期授权拒绝，合法授权保留且修改删除拒绝；合法会话关联后教师撤销，管理员撤销/重复撤销拒绝，撤销后开始的另一合成会话不能关联，旧会话仍COMPLETED且原关联保留，撤销与关联删除拒绝。storageMetadataOnly=true、syntheticTimes=true，使用2027年窗口和合成会话时间，不是实际客户端运动或会话启动API通过。
尚需创建/查询/撤销HTTP接口、会话启动普通截止与补练授权分支、同一事务当前权限/模式/成员复查、日周计入仍按真实时间、学生授权查询与页面接线。正式结算状态尚未实现，未来接入后必须额外阻止已结算课程新补练；本存储检查不能代替该未实现条件。当前212操作/41迁移，UI/UX未改，既有失败未修复；完整验收和最终本地Git存档待完成。

2026-09-08 教师补练HTTP：新增GET/POST /class-sections/:classSectionId/makeup-windows及POST /makeup-windows/:windowId/revocation。创建绑定指定enrollmentId/expectedRuleVersion及带时区的起止时间；责任教师、NORMAL、当前学期、ACTIVE课程、有效成员/账号、已发布规则、收尾期与学期日期事务内复查。授权不可覆盖，撤销追加原因/服务器时间/事件；version1为授权、2为已撤销。教师列表倒序游标分页，windowState仅表示时间/撤销状态，不代表其他会话启动条件已满足。尚未通知学生或接入会话开始。
Docker docker-makeup-http-20260908.txt退出0：215操作/215路由，query41/body103 parity，41迁移/Nest构建；真实教师HTTP发布规则后管理员403/其他教师及组织404，移出成员与规则版本冲突409，收尾期外和无时区日期422；同键创建返回同一授权，两授权按1条分页完整回读；并发撤销201/409、重放返回原撤销结果，列表反映REVOKED，原授权保留且CREATED/REVOKED各一条事件。membersSeeded=true，实际窗口在2027年，未进行客户端补练运动。
仍需学生本人授权查询、通知与现有网页服务接线、会话启动使用授权并关联0041来源、原普通截止后的新运动限制以及日周上限真实时间回归。正式结算状态尚未实现，后续须添加已结算课程禁止新补练检查。维护/归档/关闭/成员变化竞争、撤销其他组织授权及过期状态尚未专项覆盖。原测试问题未修复，UI/UX未改，整体目标与最终本地Git存档仍未完成。

2026-09-08 补练接入会话启动：exercise-sessions.service.start在事务内锁组织NORMAL、课程和成员；已发布regular_deadline之后查询本人已受理/当前窗口内/未撤销授权，无授权返回SESSION_OUTSIDE_TIME_WINDOW。普通截止前仍用原普通日期/日内/排除日检查；补练窗口作为普通窗口之外的指定授权，但仍要求ACTIVE课程、CURRENT学期及真实业务日期在学期内。服务器生成开始时间/业务日，0041会话来源与新会话原子写入；日周计入代码未改。已结算课程阻止新会话的条件仍待正式结算状态实现后接入。
Docker docker-makeup-session-20260908.txt整体退出1：41迁移/Nest构建通过，新增测试成功通过本地Mailpit学生验证码登录、普通截止后无授权409、教师授权后201、同键重放、服务器业务日不同于客户端7天前时间、授权来源关联、撤销后已有会话仍IN_PROGRESS等顺序断言。随后取消会话请求携带clientObservedAt，被422 VALIDATION_FAILED拒绝；CancelExerciseSessionRequestDto仅接受reason和expectedVersion，该测试多传字段。按用户要求保留测试及失败，不修改测试流程或放宽DTO。因在取消处停止，撤销后再次启动拒绝和最后关联数量断言未执行，不能称整条补练闭环通过。
测试留下一个合成IN_PROGRESS会话及已撤销授权作为失败证据；停止Docker服务保留持久卷，不把它取消或抹除。尚需正常窗口启动回归、撤销/关闭/维护/成员变化竞争、补练会话结束提交与原日周上限、学生查询通知及网页接线。协议补充startExerciseSession语义，本地215操作parity通过，query41/body103。既有失败继续保留，UI/UX未改；完整目标及最终Git存档未完成。

2026-09-08 学生本人补练查询与通知：docker-makeup-student-notifications-20260908.txt和docker-makeup-student-inbox-20260908.txt均退出0。后者覆盖真实本地学生验证码登录、本人授权分页/撤销历史、越权与limit边界、教师授权/撤销幂等及并发通知去重、学生GET通知、标记已读重放和未读过滤。41迁移/Nest构建通过；216操作parity与迁移manifest通过。合成数据、本地服务，不证明云端或完整补练会话与三端浏览器闭环。原补练取消测试422未修改，Docker停止且保留卷；完整范围及最终Git存档未完成。

2026-09-08 docker-semester-switch-check-20260908.txt退出1。217操作parity、41迁移/Nest构建及已有学期管理回归通过；新增switch-check首个管理员HTTP请求403，未进入新接口业务断言。静态定位为V81AdminPermissionGuard未映射新操作，问题按要求保留。不能声称切换检查运行通过或归档切换完成。
2026-09-08 docker-settlement-reader-regression-20260908.txt退出0：共享读取提取后的原教师结算检查及电子名单流程回归通过；不代表新增管理员switch-check通过。Docker服务停止，数据卷保留。

2026-09-08 docker-rule-templates-20260908.txt退出0：42迁移/Nest构建；模板固定参数、SUPER发布、教师/分管理员403、跨组织404、并发版本201/409、幂等和版本分页、课程显式templateId必需、有效发布/重放、后续模板不改旧课程与模板SQL不可修改/删除。220操作parity及迁移manifest通过。当前合成HTTP证据；旧客户端/直接SQL夹具未迁移模板ID，不能沿用此前全套通过结论。原测试问题保留、前端本轮无改动、Docker停止保留卷。

2026-09-08 docker-course-reminders-20260908.txt退出0：43迁移/Nest构建；模板回归、测试时钟14天边界、维护模式暂停、并发和重跑去重、剩余目标与待办、教师HTTP站内通知、系统审计通过。实际驱动提醒处理服务；后台调度延迟/重启/大批量和不足14天发布完整HTTP尚未验证，不作通过结论。220操作parity、迁移manifest通过。原失败不修复，Docker停止保留卷。

2026-09-08 docker-reminder-live-worker-20260908.txt退出0：真实应用后台5秒定时器/SystemClock，维护期间零提醒、恢复后1062毫秒首条、学生/教师HTTP各1条、学生已读重放、继续12秒扫描无重复、实际时间与系统审计通过。合成课程临近截止安排直接入库，不证明可完成性或完整发布；不证明重启与负载。43迁移/Nest构建通过，服务停止保留卷。原失败不修复。

2026-09-08 docker-final-grade-http-20260908.txt退出0：43迁移/Nest构建，真实HTTP内部INT32边界、负数、草稿/发布、并发201/409、幂等、历史分页、越界/小数/类型/备注拒绝、学生/管理员/其他教师/跨组织范围、学生无成绩通知、审计关联及数据库不可变性通过。合成学生；正式结算/归档更正及全网页未验证。本轮无业务或UI改动，原失败保留，Docker停止保留卷。

2026-09-08 docker-composite-final-grades-20260908.txt退出0：43迁移/Nest构建、内部成绩回归；模板规则发布、真实CSV上传确认、教师综合名单latestRevision与publishedRevision分离、后续草稿不改已发布值/运动/体测、未注册行空成绩、真实XLSX四列和学生/管理员403通过。220操作parity通过。综合报告仍为实时预览，不证明不可变结算快照或归档更正；原失败保留，Docker停止保留卷。

2026-09-08 docker-unified-audit-events-20260908.txt退出0：统一两类事件查询、组织时区日期边界、组合筛选与分页、缺失结果/角色保持null、V81安全版本元数据、未知操作原值、来源详情、跨组织/教师/分管理员权限、非法limit/日期及游标签名条件隔离通过。43迁移/Nest构建、222操作parity通过。使用合成事件；V81角色/结果快照写入、系统主体标记、运行日志ZIP及页面接线仍未完成。原失败保留，Docker停止保留卷。

2026-09-08 docker-runtime-log-source-20260908.txt退出0：真实Nest stdout来源，组织/日期过滤、未知/敏感字段丢弃、协议路由模板、未配置来源及无效日期拒绝通过。43迁移/Nest构建与222操作parity通过。仅组织HTTP诊断来源；不证明完整运行日志、生产采集/保留、ZIP任务或下载。原失败保留、前端未改、Docker停止保留业务卷。

2026-09-08 运行日志归档后端接线：新增 0044_v81_runtime_archives 持久任务及会话绑定下载凭据，注册管理员创建、查询、取消、签发下载凭据和二进制下载共 5 个接口，权限为 AUDIT_QUERY。后台按租约生成 ZIP 并写入私有对象存储；当前覆盖范围明确为组织内可用 HTTP 诊断记录。未修改前端界面。
验证：runtime-archive-parity-20260908.txt 退出0，227操作/227处理器、query46/body107；docker-runtime-archive-build-20260908.txt 退出0。docker-runtime-archive-startup-20260908.txt 退出0，44项迁移成功应用，健康检查及四类账号登录/首次改密、真实应用stdout日志来源回归通过。该回归脚本仍输出旧字段 runtimeZipNotImplemented=true，该字段不能证明新归档接口状态；本轮未执行归档任务HTTP专项，不宣称生成、下载、取消或权限撤销闭环已验收。
剩余：补齐任务响应协议结构、ZIP独立解码和实际HTTP/MinIO闭环测试、失败/过期/取消对象清理、生产日志采集挂载及保留策略。新增任务与数据库迁移尚未本地Git存档，整体目标未完成。既有测试失败继续保留，不因本轮构建通过而关闭。

2026-09-08 运行日志归档实际HTTP专项通过：docker-runtime-archive-http-20260908.txt退出0，44项迁移无待应用。使用真实Nest后台定时任务、PostgreSQL、MinIO私有存储和应用stdout，创建日期范围任务并同键重放，轮询SUCCEEDED，签发会话绑定凭据并下载application/zip二进制；文件长度/SHA256与任务一致，独立SheetJS CFB解码manifest.json和runtime.ndjson，20条日志均属本组织且敏感查询标记未泄漏。教师创建403、非法日期422、匿名下载401、教师下载403；成功任务取消后原凭据下载404。未执行权限撤销、凭据过期、并发取消/租约恢复或对象清理专项，不能据此宣称这些分支通过。
已补齐任务摘要及短时下载响应协议结构，227操作/227处理器、query46/body107本机parity通过。Docker专项运行在该响应协议补充前构建的镜像上；业务实现相同，完整最终协议镜像尚待后续验证。来源回归遗留输出runtimeZipNotImplemented=true为旧脚本标记，后续RUNTIME_ARCHIVE_LIVE_WORKER_PRIVATE_ZIP_DOWNLOAD_CANCEL通过才是本轮归档HTTP证据。日志覆盖仍限于组织内可用HTTP诊断记录，生产日志采集与存储保留策略未验收；整体任务和本地Git存档未完成。

2026-09-08 运行日志归档权限与凭据专项：docker-runtime-archive-access-20260908.txt退出0，镜像包含完整任务响应协议；44迁移、构建、实际后台ZIP/MinIO下载原链回归通过。将合成管理员改为无AUDIT_QUERY子管理员后既有链接403，授予AUDIT_QUERY后恢复200，finally恢复SUPER。将本测试归档的临时凭据时间明确调整为过去后下载404，重新签发新凭据200；这是合成过期状态验证，未等待真实120秒流逝。未改变历史业务事件或归档任务事实。取消回归通过；对象清理、多实例租约、全量非HTTP运行日志和实际网页接线仍待完成，整体目标未完成。ACCEPTANCE清单已更新227操作/44迁移和运行日志实际验证边界。未修复既有测试失败。

2026-09-08 诊断归档内容专项docker-runtime-archive-diagnostics-20260908.txt退出0；44迁移、227操作构建及原HTTP下载/权限撤销/合成凭据过期/取消链回归通过。独立解码实际MinIO ZIP，确认audit.ndjson含合成审计事件并保留V81未知角色/结果null，safeMetadata只有version、原facts秘密标记不泄漏；health.json计数与实际HTTP记录一致，requests.json真实requestId连接对应HTTP索引和审计ID。该专项未覆盖所有审计日期边界、10万条容量、后台非HTTP日志或基础设施历史健康，后两项仍属缺失源。架构说明已记录跨日志与DB读取并非原子业务快照。未修改UI、未修复既有测试失败；本地Git存档和整体交付未完成。

2026-09-08 派生ZIP清理专项docker-runtime-archive-cleanup-20260908.txt退出0；45迁移成功应用，227操作parity及迁移清单检查通过。真实定时任务清理取消归档，MinIO HeadObject返回404，任务GET仍与取消响应完全一致，唯一清理记录对应一条不含存储键的审计事件。原生成/独立ZIP解码/审计关联/权限撤销与恢复/合成凭据过期/取消链均通过。未验证真实任务过期清理、存储失败重试、事务中断、并发锁负载及上传登记前崩溃产生的孤立文件；保留这些待验收项，不将取消清理通过扩大为全部生命周期通过。整体三端业务验收及本地Git存档仍未完成。

2026-09-08 分管理员权限编辑：新增POST /admin/subadmins/{id}/permissions，仅SUPER、同组织现有SUB、NORMAL模式；固定8项权限替换（可撤销全部）、expectedVersion、幂等重放、并发组织锁、用户更新时间和不可变权限变化审计。既有会话请求由当前权限守卫读取新权限；不改账号身份、密码或启停状态。当前228操作/45迁移。
测试结果：subadmin-permissions-parity-20260908.txt退出1，permissions数组枚举ENUM_MISMATCH；已记录未修复。docker-subadmin-permissions-20260908.txt退出1：Docker构建、45迁移、健康与四类基础账号登录/首次改密通过，新合成管理员adminProfile.create报字段值过长，权限更新HTTP断言尚未执行。合成user已创建而adminProfile未建立，不把该残留夹具当成真实管理员，不删除或隐瞒。测试与实现均未据此修复，权限更新/并发/撤销/越权尚无运行通过证据。整体目标和本地Git存档未完成。

## 2026-09-08 固定拒绝入口与学生注销缺口复核
可复现命令：node tools/local-integration/inventory-v81-runtime-boundaries.mjs。输出runtime-boundaries-20260908.json，当前228操作中静态定位13个直接调用deny/denyStudentUpdate的处理器，另确认学生网页两项注销方法存在而本地协议没有对应路由。此脚本只覆盖显式拒绝与指定注销动作，不能证明其余215项功能完整。
分类：6个定位/轨迹及位置隐私入口按学生业务第11节禁止采集的要求继续拒绝；学生资料更新入口受管理员只读边界限制，不能为了清空占位统计开放。旧4个/exports入口继续固定拒绝，现行综合名单XLSX及运行诊断ZIP另有专用接口，旧入口与现有页面调用关系仍需逐一核对。sport-catalog、activity-conversion-rules旧入口用途需对照现行运动选择及换算语义，不能直接用任意种子数据补成功。
新增明确缺口：学生业务10-student-flow.md第5.6节要求本人当前已验证邮箱OTP确认注销。现有网页api.js已调用POST /me/account-deletion-challenges及POST /me/account-deletion-challenges/{challengeId}/confirm，且严格校验挑战和DELETED结果；backend/src当前未发现AccountDeletion/ACCOUNT_DELETION/account-deletion实现或路由。当前不能完成该实际业务动作。后续必须实现挑战投递/身份重验/进行中运动及其他阻塞校验/全会话撤销、账号个人资料物理删除以及独立历史主体引用保留；禁止把users.deleted_at软删除冒充文档要求的物理删除，也不能删除运动、课程、媒体、审核、成绩和审计事实。
该检查不修改已有界面或业务代码，不修复此前两项分管理员权限测试失败。下步优先梳理账号资料与历史事实外键边界，补齐遗漏的本人注销能力；教师/分管理员删除共享历史主体设施但各自权限和职责阻塞独立。

2026-09-08 本人注销历史主体基础：0046新增v81_user_subjects及student/teacher/admin主体表，仅保存稳定UUID、组织、初始角色或父用户主体、创建/退出时间，不含姓名/邮箱/学号/密码。为现有账号资料回填主体，新建资料同事务建立主体，实际删除资料时标记退出，主体身份及退出事实不可改删；原UUID不能重新建立当前账号。尚未移动原业务外键，因此不开放注销接口或宣称已有业务账号可删除。
Docker docker-history-subjects-20260908.txt退出0：46迁移/构建/基础账号登录回归通过，检查全部user主体覆盖、教师主体对应、列级无个人资料、不可改删；仅新建并删除无业务关系的合成ADMIN测试行，保留退出主体并拒绝同UUID重新建号和取消退出。该测试不代表学生/教师业务事实注销验收。
当前数据库元数据导出history-identity-foreign-keys-20260908.json，82条仍指向当前身份：users68、student_profiles10、teacher_profiles4。下一步逐项区分应删除的账号凭据/挑战/会话/当前资料与须迁往历史主体的业务和审计引用。现阶段没有将任意外键改为CASCADE；没有删除现有业务测试数据。分管理员权限协议及夹具失败继续保留，当前协议全量检查仍未通过。整体目标及本地Git存档未完成。

2026-09-08 0047历史引用迁移：按history-reference-classification-20260908.json明确分类，66条业务/审计外键改接v81_user/student/teacher_subjects，保留原标识、组织复合键与RESTRICT删除边界；16条当前账号引用保留。迁移以BEGIN/COMMIT原子执行，没有删除行或新增ON DELETE CASCADE。
Docker docker-history-references-20260908.txt退出0：47迁移应用、构建及基础账号回归通过；真实数据库创建带成员关系和审计事实的合成学生，显式删除该夹具会话/学生资料/用户行后，成员与审计整行回读和原值一致，两个主体均退出且不可删除，当前身份外键剩16。测试为受控直接数据库验证，未调用尚不存在的注销API，没有证明所有运动/媒体/成绩历史查询。前置历史主体探测中的businessForeignKeysMigrated=false为原探测固定范围标记，后续66条迁移专项才是本次证据。
下一阶段必须处理账号验证码/凭据/会话/偏好/幂等数据清理及注销身份重验、权限、阻塞、并发；Prisma历史relation仍指向当前资料，部分include/inner join可能不能读取已删除身份，必须适配历史投影与模型后才开放真实注销。当前不宣称数据模型及历史读取已全部兼容。已记录的权限协议枚举及测试夹具失败继续保留，不能以此次迁移/构建通过关闭。整体目标及本地Git存档仍未完成。

2026-09-08 删除身份后的历史读取适配：EnrollmentRepository移除强制student/teacher当前资料include，批量读取稳定主体与仍存在的当前资料；已退出学生只保留id/userId/退出标记，既有成员API仍按原业务字段返回，不补造姓名学号。JoinResult对退出主体拒绝输出新的入班资料。运动记录权限解析改为组织范围内关联学生/教师历史主体，继续核对实际责任教师身份。
Docker docker-history-read-http-20260908.txt退出0：47迁移及构建/基础账号/原历史引用专项回归；合成学生账号与资料物理删除后，责任教师GET成员详情、列表成功且原关系保留，管理员GET审计详情保留学生角色、主体ID及真实结果；其他教师和跨组织教师详情404。运动记录权限解析本轮只完成构建，尚无带实际运动记录的删除后HTTP专项。其余名单、免测、成绩及资料关联的Prisma include/历史模型仍待逐项适配，不能宣称所有删除后查询已完成；注销验证码和删除API尚未实现。未修改前端布局，既有测试失败保留；整体目标及本地Git存档未完成。

2026-09-08 学生注销挑战：新增POST /me/account-deletion-challenges，响应精确匹配现有网页challengeId/mode=STUDENT_EMAIL_OTP/expiresAt/version。0048存储当前用户/会话/用户版本与邮箱/code HMAC摘要；10分钟有效、60秒重发间隔、15分钟最多3次。复用现有reserveStage/completeStage及邮件投递，投递外置，成功后复核当前账号/邮箱/版本/会话状态与NORMAL模式，再激活；失败不输出成功挑战。新增ACCOUNT_DELETION中英文邮件用途，SMTP和腾讯SES模板用途适配，未实际调用腾讯云服务。
Docker docker-deletion-challenge-20260908.txt退出0：48迁移、构建、真实学生SMTP登录后请求注销验证码、Mailpit收到用途明确的邮件；教师/管理员403、客户端指定email字段422、旧版本409、同键重放同挑战、立即另键重发429、唯一ACTIVE记录且数据库无明文邮箱、审计事实为空安全对象。账号与学生资料仍存在；本轮只验证挑战，不代表确认注销或清理已完成。数据库保存摘要的实现已核对，邮件内容未写入验证日志。
全量协议deletion-challenge-parity-20260908.txt退出1：229操作/229处理器、query46/body109，唯一报告仍为既有setV81SubadminPermissions.permissions枚举不一致，未修复。验证码错误次数、过期、邮箱变更、并发投递/故障及确认后的全设备失效与账号数据清理仍待完成；新增挑战使账号侧用户外键增加1条（目前17条），后续清理应包含该表。整体目标和本地Git存档未完成。

2026-09-08 注销的会话/偏好/设备历史引用：0049新增三个只含id、组织、历史用户主体、创建/退出时间的表，为现有行回填并维护新增/删除主体；12条事件/运动历史外键改接这些非认证主体，当前refresh token、幂等、入班能力、推送设备及验证挑战仍引用当前会话。元数据来源history-session-foreign-keys-20260908.json；不保存设备令牌、偏好内容或会话认证状态到历史主体。
Docker docker-session-subjects-20260908.txt退出1：49迁移成功应用，构建/健康/基础账号登录通过，专项在prisma.userPreference.delete处被既有0011_client_capabilities/migration.sql:1058触发器拒绝，P0001:user preferences cannot be deleted。按用户要求记录，未修改触发器/删除逻辑/测试以规避失败，后续会话删除与历史不变断言未执行。session-subject-rollback-20260908.json只读核对最新合成偏好事件，偏好、会话、事件仍在，两个主体均未退出，失败事务已回滚。
该现有不可删除规则阻断偏好清理，当前不能宣称完整账号清理通过；注销确认及删除回执仍未实现。已向用户确认业务歧义：待审核、待补证、技术处理中材料及待处理认证/免测是否阻止注销，尚无答复；与本次数据库触发器失败分别保留。整体目标及本地Git存档未完成。

2026-09-08 前端保留检查：node tools/local-integration/audit-v81-ui-preservation.mjs以HEAD fb511a9ccbad65c2f76c74a2de1e04883083b287为基准生成ui-preservation-20260908.json。检查20个已跟踪改动源码：无独立HTML/CSS文件变化，HTML字面模板片段一致；JSX元素顺序、标签、className/style/id/role及静态JSX文本一致。admin-users.tsx完整JSX文本不一致，原始差异另存admin-users-wiring-diff-20260908.txt：批量建号按钮disabled条件、事件/预览失效处理、状态提示文案改变，均保留在报告，不能声称JSX全文或全部UX完全不变。language.tsx等14个文件存在JSX外字符串差异，包括服务错误、业务反馈和动态文案，需要最终浏览器核对。
此静态证据不验证响应式布局、条件分支、渲染时样式或全部用户体验；不含未跟踪文件。当前未跟踪前端源码主要为新增API适配器，仍需最终逐路径存档审阅。此前概括“未改JSX”的说法以本次精确记录为准；本轮没有为消除报告差异修改任何前端源码。注销待办规则问题仍待用户答复，偏好删除P0001及其余已记录测试失败未修复，整体目标未完成。

2026-09-08 阶段本地存档前检查：明确清单暂存1341文件，约36.3MB，无范围外路径、无删除。当前业务权威docs/business无差异。凭据模式扫描35处数据库URL候选，均为示例/测试、仅供schema生成的127.0.0.1:1占位地址或运行时插值；无匹配私钥、腾讯/AWS访问密钥或JWT。实际.env、.local、依赖和密钥目录不在清单。该扫描是有限模式检查，不等于完整安全审计。
暂存SQL字节逐项校验：49个migration.sql与暂存manifest.json的SHA256全部一致；Git换行转换未改变迁移校验内容。git diff --cached --check退出2，14842行报告涉及408个文件：83个Prisma生成文件、323个证据/文档文件，另.gitignore和v81-feedback.ts。为保留原始输出和已记录失败，本次不批量改写生成代码或测试日志，明确记录空白检查未通过。阶段提交保存当前状态，不据此宣称质量门禁/整体验收通过。

2026-09-08 审计操作人快照：0050只为新插入的v81_events保存同组织当前用户的角色，忽略调用方自行提供的角色值；既有事件不回填，没有当前用户来源时保持NULL，不推断系统身份或成功结果。统一审计HTTP与运行日志ZIP诊断读取存储的角色快照，原有不可修改触发器继续约束历史。
Docker docker-event-actor-20260908.txt退出0：50个迁移成功应用，构建、健康、四组基础账号验证及专项通过；专项确认教师角色不能被插入参数伪装为管理员、真实HTTP读回角色、修改事件被拒绝、未知角色保持NULL。本轮未改前端。运行日志ZIP投影只完成构建验证，未重跑ZIP集成；旧审计/ZIP专项中“所有新V81事件角色均NULL”的断言需按新语义另行整理，不能引用旧结果为本次全量回归。用户偏好删除P0001等已记录失败保持未修复，注销确认与正式结算等依赖仍未完成。
本次逐路径存档11文件；暂存迁移SHA256与manifest一致。git diff --cached --check退出2，原因是Docker原始输出尾部空格，保留日志原样；不宣称空白检查通过。

2026-09-08 系统审计来源：0051迁移与共用写入函数覆盖OCR后台领取/结果、补证自动逾期、课程提醒、运行ZIP后台生成和清理；SYSTEM事件不能带用户操作人，历史不回填。查询/结果筛选/ZIP读取存储的实际结果与安全原因。docker-system-audit-ocr-20260908.txt、docker-system-audit-archive-20260908.txt、docker-system-audit-reminder-20260908.txt三个专项退出0，已应用51迁移；详细证据、腾讯响应替身、未运行的补证逾期及旧断言范围见SYSTEM-AUDIT-20260908.md。system-audit-parity-20260908.txt退出1，仍是原权限数组ENUM_MISMATCH，未修复。整体目标保持未完成。
系统审计本次存档26文件，暂存0051 SQL的SHA256与manifest一致；前端、docs/business、冻结contracts无差异。暂存空白检查退出2，报告来自三个Docker原始日志的尾部空格，保留原始证据。三个专项Docker退出0不代表协议或全部质量门禁通过。

2026-09-08 OCR服务治理：新增3个仅SUPER可用接口（状态、配置历史、追加配置），维护期间可恢复服务；0052保存不可变配置及每次领取的执行参数。暂停阻止新识别和领取，旧服务版本响应保持STALE，恢复后原任务按新租约绑定新配置。docker-ocr-governance-20260908.txt退出0：52迁移/构建/基础账号/配置治理及原件真实HTTP和MinIO专项通过，腾讯响应为替身，租约推进注入时钟121秒。ocr-governance-parity-20260908.txt退出1，232操作/处理器、47查询、110请求体，仍是原权限数组ENUM_MISMATCH，未修复。范围、命令标志及剩余依赖见OCR-GOVERNANCE-20260908.md；本轮未改前端，整体目标未完成。
OCR治理本次按25个明确路径存档；0052暂存SQL的SHA256与manifest一致，前端/业务文档/冻结contracts无差异。空白检查退出2，仅Docker原始日志docker-ocr-governance-20260908.txt尾部空格，按保留证据要求不改写。专项通过不关闭原协议检查或其他已记录失败。

2026-09-08 持续浏览器联调准备：新增独立启动覆盖文件及引导脚本，但docker-browser-startup-20260908.txt退出1，Compose无法解析backend-startup继承目标。按用户要求保留原配置，不修复或绕过；浏览器后端未启动，状态目录不存在，browser-database-presence-20260908.txt确认独立数据库不存在。脚本仅语法检查通过。独立的MEDIA_STORAGE_PUBLIC_ENDPOINT能力已完成Docker存储适配器专项：docker-media-signing-origin-20260908.txt退出0，52迁移/构建/基础账号及真实MinIO签名上传下载、私有读取、错误Host与匿名403通过；没有真实浏览器代理或完整学生上传业务证据。详见BROWSER-STARTUP-20260908.md。未改前端，原有失败保持未修复，整体目标未完成。
持续联调准备本次15个明确路径存档，无前端/业务文档/冻结contracts及真实凭据文件。空白检查退出2，仅保留的Docker媒体签名日志尾部空格；持续启动Compose失败未修复。没有新增迁移，独立测试库存在性为false。

2026-09-08 帮助中心学生隔离：docker-help-student-isolation-20260908.txt退出0，52迁移无待应用项。两个合成组织学生通过真实邮件验证码登录，英文/中文在发布、下线、重新发布三个状态中验证列表与详情组织隔离、404不含正文，最终版本4。专项范围及复现见HELP-STUDENT-ISOLATION-20260908.md；补足跨组织学生隔离证据，页面接线/浏览器/内容安全和全量验收仍待完成。未改产品源码，已有失败未修复。

2026-09-08 反馈跨组织隔离：docker-feedback-tenant-isolation-20260908.txt退出0，两个组织真实学生邮件登录、双向8个越权请求404、原记录与通知不变、搜索汇总隔离及正常回复通知通过。52迁移无待应用项。共享登录辅助函数调整后，docker-help-student-isolation-shared-login-20260908.txt重跑退出0。详见FEEDBACK-TENANT-ISOLATION-20260908.md；本次补足反馈跨组织专项，页面与全量验收仍待完成，既有失败未修复。测试服务已停止，卷保留。

2026-09-08 申请历史读取：认证列表与免测列表/详情移除不参与投影的当前学生资料必需加载，保留组织/责任教师过滤。docker-application-history-read-20260908.txt退出0，52迁移/构建通过；合成学生当前资料直接删除后两条草稿原数据不变、教师HTTP投影一致、越权404。范围见APPLICATION-HISTORY-READ-20260908.md，不代表注销/完整清理/已批准材料验证。分管理员新邮箱验证生效方式待用户答复。旧失败未修复，测试服务停止且卷保留。

2026-09-08 反馈历史读取：管理列表/详情使用学生历史主体及可选当前资料，保留原协议空值和组织范围。docker-feedback-history-read-20260908.txt退出0：7条合成反馈删除当前学生资料后分页、汇总、字面搜索、空资料和不可变原记录通过；docker-feedback-history-tenant-regression-20260908.txt退出0，双向越权/通知隔离回归通过。详见FEEDBACK-HISTORY-READ-20260908.md。52迁移无待应用项；不代表注销完整清理或全量验收，原失败未修复，未改前端。测试服务已停止，卷保留。

2026-09-08 运动记录历史读取：docker-record-history-read-20260908.txt退出0，构建/52迁移/基础账号通过。既有历史主体权限实现经合成已审核记录验证：删除当前学生后列表、详情、无媒体证据上下文和审核历史HTTP一致，存储记录/会话/审核不变，6个越权请求404。范围见RECORD-HISTORY-READ-20260908.md，不代表真实材料审核或注销完整清理。本次未改产品源码，原失败未修复。测试服务已停止，卷保留。

2026-09-08 用户已授权修复。Compose继承与内部网络端口发布已修正，宿主机3199健康/就绪200；学期切换预检查权限403复测通过；协议数组枚举检查修正后232操作parity通过。详见REPAIR-STARTUP-GATES-20260908.md及新复测日志，旧失败保留。正式结算/注销与其余失败未完成，业务歧义继续待答复；持续测试容器保持运行。

2026-09-08 名单边界修复：服务端CSV与Portal CSV/XLSX统一500行，新受理锁课程并拒绝关闭状态，成功旧请求仍可同键重放。4份Docker复测均退出0、232操作parity通过，见REPAIR-ROSTER-BOUNDARIES-20260908.md。持续后端刷新后本机3199就绪200。旧失败证据保留，其他名单问题继续处理。
2026-09-08 用户新决定：学生注销和教师删除暂缓，显示“暂时功能无法实现，敬请期待”；分管理员以邮箱OTP核验身份，其余技术选择自行合理决定。已停用学生入口/后端挑战和教师删除按钮，最终Docker无挑战无账号变更且会话有效通过，学生弹窗本地断言通过。详见DECISION-DEFER-DELETION-OTP-20260908.md。删除及偏好清理移出本轮必交范围，原历史证据保留；分管理员OTP仍待实现，三端整体未完成。
2026-09-08 分管理员权限复测完成：修复合成工号长度并按业务补齐独立登录账号，docker-subadmin-permissions-final-20260908.txt退出0，授权/重放/并发/旧会话撤权/越权与版本事件通过。管理员OTP邮件用途及SMTP/SES双语适配器6项Docker测试通过；实际身份挑战及建号仍需实现。见SUBADMIN-PERMISSIONS-OTP-PREPARATION-20260908.md。
