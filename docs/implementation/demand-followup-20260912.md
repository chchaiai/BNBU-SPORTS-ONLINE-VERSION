# 2026-09-12 验收反馈修复交接

起始 HEAD：d1e995fb2b6e51f264984bb89af989c161a2abde。保留原有 26 项工作区差异；本轮只按明确路径存档。

## 业务决定与实现

1. 课程名单与结算改为步骤说明、待办卡片和折叠通过项；历史补卡改为独立开关、双日期和保存状态。
2. 删除打卡页和个人中心的原图入口。新增 Android 10+、iOS/iPadOS 14.3+ 原生工程，成功打卡或补证后保存照片和视频到系统相册。首次启用需授权；可关闭，不读取其他相册。网页本身没有自动写入系统相册能力。
3. 25 个运动使用不同 SVG 图标；首页未打卡显示“选择运动，开始今日打卡”。
4. 视频全部转为完整 H.264/AAC MP4，支持无音轨录制；通过解码和缩略图检查后才能提交。
5. 学生资料显示当前教学班；必填资料缺失提示补全，OTHER 要求具体国家或地区名称并持久化。学生新绑定邮箱必须含 bnbu，忽略大小写。
6. 教师可修改最低时长、日/周最多次数。Migration 0069 保存记录创建时规则，旧版本优先保留已计入名额，新规则仅影响之后新增记录；不得把修改后的规则追溯到旧记录。
7. 教师课程卡提供学生名单；生成邀请二维码前检查课程规则是否发布并提示进入课程设置。
8. 管理员列表增加属性与筛选；只有无需改密的 SUPER 详情可返回完整邮箱，其他角色及普通列表不额外披露。
9. Migration 0070 新增具体国家或地区；新增 POST /me/student-profile，自身范围、维护模式检查、版本与幂等控制。

## 本地验证

证据目录：`docs/implementation/evidence/demand-followup-20260912/`。

- 后端单元测试 274/274；学生 smoke 86/86；教师管理端生产 build PASS。
- Contract 检查 PASS：261 operations、391 schemas、2739 references，权限登记差异 0；迁移检查 PASS。
- 本地 Docker PostgreSQL / MinIO / Mailpit 真实 HTTP 回归：历史照片上传、EXIF、教师审核计入、PDF 申请、邮箱投递、新旧规则版本隔离、资料持久化、幂等及角色邮箱权限共 12 项检查 PASS。
- 三端真实浏览器：资料补全与重载、当前班级、图标与原图入口、课程学生名单、规则修改持久化、结算/补卡布局和管理员详情筛选共 4 组 PASS，另新增未配置课程邀请提示与空名单操作 PASS，无 pageerror。
- Android Pixel_9 模拟器：实际录制 MP4，经转换后播放时间前进、画面 320×240；原生相册照片和视频保存确认 PASS，重复请求去重。MediaStore 已完成文件证据见 JSON。此项为原生模块与 Web 桥接集成；完整原生用户界面登录到上传到相册的真机流程仍需设备验收。
- 已构建连接生产 HTTPS 域名的 Android 调试预览 APK，路径及 SHA-256 见 android-apk.json。localhost 测试包未作为交付包。
- 学生端首次 smoke 有 9 项失败，原因是旧文案、旧 PDF 限制及缺少异步持久化环境的测试断言；逐项核对后更新。删除存储失败时保留凭证测试已加入。浏览器曾两次因等待资料保存、规则载入不足失败，补充响应和状态等待后通过，未更改业务行为来规避失败。

本地预览：学生 http://127.0.0.1:4274/student/，教师管理 http://127.0.0.1:4275/。业务数据仅为隔离库 v81_browser_test 的 Synthetic 样本。

复验顺序：启动 compose.v81-test.yml + compose.v81-browser.yml；在 backend-browser 容器依次运行 demand-backfill-media-http.mjs、demand-followup-http.mjs、prepare-demand-followup-browser.mjs（node --import tsx）；宿主运行 demand-followup-browser.mjs。规则测试会改变合成课程，应从 backfill 脚本创建的新 fixture 开始。

## 剩余依赖和风险

- iOS 工程已实现，但当前是 Windows，无 Xcode/iOS SDK。iPhone/iPad 编译、签名、相册及录制真机验收 PENDING；不能宣称 iOS 安装包已发布。需要 macOS、Xcode、Apple 开发者团队；分发另需图标、商店资料和审核。
- Android 交付为调试预览包，正式签名和渠道分发 PENDING；不同厂商/低内存/旧 WebView 真机矩阵 PENDING。三端页面已实测 Edge、Firefox、Windows WebKit 和 Android WebView；桌面 WebKit 不能替代 Safari/iOS 真机验证。
- 自动相册只保存照片和视频；拒绝授权可正常打卡。iOS 仅添加权限不读取现有照片，手动删除已保存文件后不自动补回。端侧空间不足、进程被系统终止时需要重试。
- 原生桥接测试与 Docker 业务测试各自通过，不能代替所有系统的端到端相册实测。
- 0069/0070 为向前迁移；新规则版本写入后旧后端不理解快照语义，部署脚本故障时保留数据和应用状态，要求使用理解快照的版本向前修复，不自动降级旧应用或恢复数据库。
- 本轮 Contract 是现行本地业务实现更新；不将此前正式 Contract 发布门禁的 PENDING 当成已通过。

## 部署与存档

源码本地存档、生产镜像构建和部署均已完成，结果见下文。发布脚本为 tools/production/deploy-demand-followup-20260912.py，预期从 demand-20260912 升级到 demand-followup-20260912。部署前单独备份并验证 pg_restore 清单，保留上一发行目录。


### 构建记录

源码存档 32dea80860184cef4b6c5dc8f9a09c5626d13cf9。镜像从此提交的隔离 Git 导出目录构建，保留用户工作区已有 26 项差异。首次导出构建发现 61 个历史 Migration 的 Git LF 与清单原始 CRLF 哈希不一致；仅在隔离导出中恢复清单匹配的换行字节后通过，未修改历史 SQL 或清单。复现工具 tools/production/restore-exported-migration-bytes.py 只允许 .local 构建目录并逐文件严格校验 SHA-256。


### 最终生产验证

- 已部署源码：32dea80860184cef4b6c5dc8f9a09c5626d13cf9。
- 当前发行：/opt/bnbu-sports-production/releases/demand-followup-20260912；上一发行 demand-20260912 已保留。
- 备份：/opt/bnbu-sports-production/backups/before-bugfix-20260912T083534Z.dump，3,471,650 字节，权限 0600，pg_restore 清单检查通过。
- 0069/0070 迁移应用成功，数据库应用角色权限重新收紧；现存已发布课程记录缺失规则快照数量为 0。
- backend/portal 健康，11 个学生端更新文件逐一校验线上 SHA-256，通过。
- 香港 COS 私有图片/PDF 上传、ClamAV 扫描、原字节与 EXIF 保留、签名下载和匿名 403 通过。仅使用合成对象，没有修改真实学校业务行。
- 学生 https://www.student.bnbusports.cn/student/ 与教师管理 https://www.teacher.bnbusports.cn/ 入口浏览器检查通过，无 pageerror。
- 额外兼容性：Edge、Firefox、Windows WebKit 各自完整运行三端 4 组浏览器回归。Firefox 带声音 WebM 录制转换为 H.264/AAC MP4 后播放通过；Android MP4 原生录制转换播放通过。Windows WebKit 缺少 canvas.captureStream，合成视频录制探针 PENDING，不等同 iOS 相机失败或成功。
- 生产探针第一次尝试复制到容器被只读文件系统拒绝；改为经标准输入执行只读探针后通过，未解除容器只读保护。

Android 生产域名调试 APK 位于 .local/demand-followup-artifacts/BNBU-Sports-Android-preview.apk；正式渠道签名、iOS Xcode 编译与手机实测仍按“剩余依赖”列为 PENDING。本轮没有发布 App Store / TestFlight / Android 商店安装包，也没有推送 GitHub。
