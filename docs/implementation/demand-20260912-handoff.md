# demand.md 实施、验收与部署交接（2026-09-12）

## 状态

本轮需求已完成实现、本地真实业务回归和香港部署。云端最终结果为 PASS，见 `evidence/demand-20260912/deployment-result.json`。正式 Contract 发版及其他剩余技术风险单列于下文。

源码提交：`5e76fcfdf1a79e1dc5f2d0e2f8000990ff98a96b`；照片信息可读性/尺寸方向及云验证工具：`dfbce813d00d6848e2edd96cb27eb326c430734e`。本地提交，未推送、合并或创建标签。

## 需求对应结果

| 需求 | 完成内容 | 主要证据 |
|---|---|---|
| 一次认证长期身份 | 已验证本人登录跨学期复用身份和邮箱，匿名冒用被拒绝 | profile-http-fifth.log |
| 学生历史生命周期 | 移除仅结束成员关系，删除课程退休并保留历史，删除教师保留学生；学生仍能读取历史 | history-read-retention-http.log |
| 总管理员全量删除 | SUPER 权限、版本/学号二次确认；子管理员拒绝 | history-read-retention-http.log、既有独立删除流程 |
| 长期档案 | 学院、专业、出生年月日、35 类地域；入班采集、后续复用、个人中心展示 | student-profile-pdf-browser.log、student-long-term-profile.png |
| 运动规则 | 教师自定义最低时长、每日与每周上限，服务端保存和统计，学生读实际值 | teacher-review-browser.log、student-course-rules.png |
| 体育项目 | 官方 22 项课程范围纳入统一清单，保留原有通用运动类型 | sports-catalog.js、下方官方来源 |
| 历史补卡 | 教师设置范围，禁止未来，支持入班前历史，凭证与人工审核必需，按运动日期计入课程 | backfill-media-http.log、student-backfill-browser.log |
| 日/周计入 | 同日三条通过记录仅两条计入，共 100 分钟；周限制及两类共享上限算法测试通过 | teacher-review-browser.log、backend-unit-272.log |
| 截止日期 | 显示当前课程/学期真实可选范围，日期输入 min/max 与后端限制一致，保留完整七天收尾期 | teacher-history-settings.png、teacher-workspace.tsx |
| 免测文件 | PDF/JPEG/PNG/WebP 按真实类型、哈希、大小、结构、扫描和材料关系校验；修复对象键及提交触发器 | backfill-media-http.log、student-profile-pdf-browser.log |
| 原图与 EXIF | 本机按平台用户隔离保存原图；JPEG 保留压缩像素及安全 EXIF；教师显示拍摄信息、尺寸、方向与缺失值 | student-tests.log、teacher-photo-exif.png |

体育课程来源（2026-09-12 查询）：https://sge.bnbu.edu.cn/en/curriculum/tc/WPEC.htm 。官方课程范围不等同于每个项目当学期均开班。

## 验证范围

- 本地 Docker：PostgreSQL、MinIO、Mailpit、Backend；Migration 0063–0068 真实应用。账号、身份绑定、提交、文件上传、教师审核均通过 HTTP，数据结果直接在隔离数据库核对。
- Backend 全量 unit 272/272；后续草稿零计入修复的独立日/周组 6/6；迁移安全 13/13；学生原图及原有移动记录兼容 4/4。没有把独立用例算作全量重新运行。
- Backend 与 Portal typecheck、Contract 结构和 OpenAPI lint 通过。原图保真测试验证压缩像素未变，上传副本无 GPS，拍摄信息保留。
- 学生/教师浏览器使用本地真实后端，无路由拦截和伪造业务响应。合成测试账号及私有 fixture 留在 `.local/`；存档截图仅含合成资料。
- 生产 Backend 镜像内密码哈希验证、JPEG、PDF 运行检查通过；生产 Portal 镜像本地 HTTP 200。
- 源码 diff 空白检查通过；原样 vendored 第三方源码和原始日志保留其空白格式。

## 本地入口与操作

- 学生：http://127.0.0.1:4274/student/ （本轮隔离机构 fixture URL 由测试脚本添加 `api=local&org=...`）。
- 教师/管理：http://127.0.0.1:4275/ 。
- Backend：http://127.0.0.1:3199/api/v1；Mailpit：http://127.0.0.1:18025/ 。
- 当前合成 fixture 位置：`.local/v81-browser-state/demand-fixture.json`；勿提交、外发或作为真实用户账号使用。运行 HTTP probe 会生成新的隔离机构。
- 教师：进入课程，发布运动规则后在“历史补卡”启用并保存日期范围。学生：“打卡”选择运动类型→补录历史运动→日期/时长→凭证→提交。教师审核后按课程日/周规则计入。
- 学生：“我的”可查看长期档案、发起免测申请、查看本机原图。原图下载与上传副本分开处理，提交不会清除本机原图。

## 部署和回滚

现行目标为香港 `43.129.193.7`，主机 `VM-0-13-ubuntu`；发布目录 `/opt/bnbu-sports-production/releases/demand-20260912`。旧目录 `/opt/bnbu-sports-production/releases/course-delete-20260911` 保留。

部署脚本 `tools/production/deploy-demand-20260912.py` 校验镜像及静态文件哈希，备份 PostgreSQL 并校验备份目录，再迁移、启动新容器，健康后原子切换 current 并核对公网 29 个文件字节。运行配置、角色权限、COS 前缀和网络规则保持现行配置。

失败时恢复旧应用并保留前向迁移，不自动覆盖数据库。若在新业务已产生数据后人工回滚，应先暂停业务写入并评估旧版兼容性；旧版课程/教师删除规则不符合本轮历史保留要求，不应恢复后继续开放这些删除操作。数据库恢复须单独评估数据损失，禁止直接覆盖新记录。

## 剩余依赖和风险

1. 正式 Contract 发布门禁仍有现行 `3.0.0-v81-local-draft` 与工具要求 `2.0.12-contract` 的版本基线冲突。本轮完成实际业务实现和部署，不等于另行完成正式 Contract 发版。
2. npm audit 现有依赖树 11 项（2 moderate、9 high），涉及既有 Nest、Prisma、nodemailer 等；新增 exifr/pdf-lib 未被列入该报告。需后续安排有针对性的依赖升级与兼容验证。
3. 网页原图保留在 IndexedDB；清除浏览器数据、卸载或存储不足会影响保留。网页不能保证自动写入系统相册，学生可从本机原图入口主动下载。没有 EXIF 的网页相机照片不会伪造拍摄信息。
4. 本轮没有 Android 原生工程改动；验证对象是当前仓库学生 Web 与教师/管理 Web。真实 AI/OCR、生产邮件投递不属于本轮新增能力验收，既有依赖状态保持独立。
5. 保留开始前已有的 25 份历史报告删除及 0061 migration 工作区行尾状态。源码存档包含当前上传页面继续依赖的既有移动视频/审核投影改动；未覆盖其他历史工作。
6. 最初失败均保留在本地日志：测试登录/选择器/容器地址准备问题已修正；真实 PDF 对象键与材料触发器缺陷、历史草稿误报计入时长、照片信息低对比度已修复并回归。


## 最终云端结果

- 发布完成：current=`/opt/bnbu-sports-production/releases/demand-20260912`，Backend 与 Portal 均 healthy。
- 公网学生入口：https://www.student.bnbusports.cn/student/ ；教师/管理入口：https://www.teacher.bnbusports.cn/ 。两端真实 Edge 浏览器加载通过，未出现页面脚本错误。
- 29 个公网静态文件与部署清单逐字节 SHA-256 一致；镜像 ID 见 deployment-manifest.json。
- Migration 0063–0068 全部成功，应用数据库权限加固完成；配置文件未改变。
- 备份：`/opt/bnbu-sports-production/backups/before-bugfix-20260912T062008Z.dump`，3,396,280 字节，权限 0600，pg_restore 目录校验通过。备份保留在服务器私有目录，没有下载业务数据。
- 云端真实 COS + ClamAV 验证：一份 574 字节 PDF、一份 545 字节带相机信息的 JPEG，页数/元数据与私有原件字节一致，匿名 GET 均为 403。两个合成对象的精确键保留在 cloud-provider.log；没有改动真实学校业务行，也没有扩大 COS 权限。
- 历史补卡强制教师审核补充回归通过：课程人工审核模式关闭时，历史记录仍进入 PENDING_TEACHER。
- 云端验证边界：公网入口、部署文件、数据库新结构、真实存储/扫描验证通过；完整学生→教师业务操作证据来自本地 Docker，未将 provider 验证冒充生产真实用户业务验收。
- 发布过程未触发回滚，旧发布目录与数据库备份均保留。最终本地证据提交不改变已部署业务源码。
