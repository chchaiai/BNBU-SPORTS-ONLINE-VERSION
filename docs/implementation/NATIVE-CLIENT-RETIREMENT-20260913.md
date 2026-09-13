# Android、iOS 客户端移除

2026-09-13 用户明确选择：删除仓库客户端代码及相关构建配置，并下线官网下载入口。

## 仓库处理

- `android-student/` 的 14 个跟踪文件已删除，包括 Java 宿主、相册保存实现、Manifest、Gradle 配置及 wrapper。
- `ios-student/` 的 6 个跟踪文件已删除，包括 Swift 宿主、相册保存实现、Info.plist 和 Xcode 工程。
- 两个目录在当前工作区及 Git 索引均不存在。安卓模拟器已关闭；忽略的历史构建缓存与本轮图标产物移至 `.local/retired-android-artifacts-20260913/`，未作为客户端源码或安装包发布。
- `docs/business/00-overview.md` 和 `10-student-flow.md` 已同步为 Web 学生端与教师/管理员 Web 端范围。原生端全流程及 Android 发布策略不再列为当前交付阻塞项。
- 已有历史验证文档保留。服务端兼容接口、用户账号与业务数据不属于此次源码及下载入口删除。

## 官网处理

仓库：`C:/Users/23328/Desktop/new_version-untracked-backup-20260810-15s`。

源码提交：`8e939cc9ad46`。删除未使用的 DownloadSection，移除 Android/iOS 平台选项、安装步骤、TestFlight 链接和下载文案；中英文均仅保留学生网页版入口。保留官网标志、校园内容及现有视觉风格。

独立类型检查和 lint 通过，本地真实页面未发现 Android/iOS/TestFlight/APK 文案或对应下载链接，学生入口仍为 `https://www.student.bnbusports.cn/student/`。

发布使用仓库规定入口 `deploy.ps1 -Action Publish -Site sports`，操作号 `20260913T031113Z-8e939cc9ad46-b348a52f`，状态 SUCCEEDED，03:12:50Z 验收通过。完整 Git 提交为 `8e939cc9ad4641aa6faeacf656809eb3c3e29f4f`。

首页与全部文件、私有路径拒绝、生产域名跳转均经源站与公开 HTTPS 检查通过。旧版本私有备份为 `/var/backups/bnbu-sports-download/20260910T101557Z-cad9eb3826aa-c886cd49.tar.gz`。

线上中文及英文页面均确认原生端文案不存在、下载链接为 0、学生网页版入口为 1。证据：`web-only-site-deployment.json`、`web-only-site-browser.json`、`web-only-site-production.png`。

## 执行记录

- 整目录递归删除被自动审批策略拦截，未给出具体原因。改为逐一 git rm 已核对源码/配置，并将剩余忽略的缓存移出客户端目录，操作成功。
- 官网第一次清理因 CRLF 导致部分移除未匹配，类型检查及时发现；修正后 typecheck 与 lint 均通过。
- 首次发布因暂存文件清单包含已删除路径而未形成完整提交，被干净工作区门禁阻止，未上传。补齐准确文件并修正本轮未发布提交后，通过正式发布入口重试。

## 本轮其他生产变更

已批准的 OCR 大文件入口、邀请期限策略和网页官网标签图标保持上线。邀请 5 分钟自然到期、固定到期后 10 分钟截止、重放不延长与最终拒绝均已验证；详见 OCR-APPROVED-RELEASE-20260913.md。

整体 OCR/Web 业务全量验收仍未完成，剩余 8 个接口缺少云端登记证据，另有最终合成数据清理与完整交接。此移除不应表述为整体目标全部完成。
