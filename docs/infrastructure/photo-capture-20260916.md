# Safari 现场拍照修复及部署验收

日期：2026-09-16。用户设备：iPhone 17 Pro Max、Safari；系统版本 26.6.2 为用户提供的信息。

## 原因与修改

现场照片先保存本机原图，再生成去除位置元数据的上传副本。旧代码把这两个操作放在同一个异常处理块中，导致本机保存失败也提示“无法转换为 JPEG”。

发布前在 Windows Playwright WebKit 中复现：将 File/Blob 直接保存到 IndexedDB 的事务中止，错误值为 null；同一照片的 JPEG 转换成功。Chromium 两项均成功。证据：`evidence/photo-capture-20260916/before-deploy.json`。这是可复现的 WebKit 路径，尚未获得用户设备的真机复测结果。

复用现有凭证草稿的字节存储方式，原图改为 ArrayBuffer 加 MIME 类型持久化，读取时恢复 Blob，兼容旧 Blob 格式记录。原图字节不变，上传副本仍执行位置元数据清理。分开处理保存与转换错误，保存失败使用现有本机存储错误提示及诊断编号。

修改文件：学生端 `js/photo-originals.js`、`js/screens/checkin.js`。无需修改 API、Domain、数据库迁移、权限或打卡状态机；已有原图记录保持可读。

## 验证证据

| 验证 | 结果 | 证据（相对仓库根目录） |
| --- | --- | --- |
| 原图、隐私处理、错误投影及凭证流程单元回归 | 11/11 通过 | evidence/photo-capture-20260916/unit.log |
| 本地 Chromium 与 WebKit | 均通过；原图字节一致、草稿持久化、刷新恢复、存储错误分类；Chromium 验证旧 Blob 记录兼容 | evidence/photo-capture-20260916/local-browser.json |
| 本地现场拍照到提交 | 模拟摄像头、真实后端及 MinIO；上传 200、提交 200，提交状态清理成功 | evidence/photo-capture-20260916/camera-result.json、camera-captured.png、camera-submitted.png |
| 正式网址 Chromium 与 WebKit | 均通过相同浏览器存储回归；合成测试数据仅存于测试浏览器并清理 | evidence/photo-capture-20260916/online-browser.json |
| 发布资源及服务健康 | 两文件公开资源 SHA-256 与发布包一致；服务健康通过，容器未重启 | evidence/photo-capture-20260916/deployment.json |

可复跑脚本：`tools/local-integration/photo-capture-regression.mjs`（可传正式域名）；`photo-capture-camera.mjs`（本地测试环境）。`photo-capture-diagnostic.mjs` 为发布前诊断，不应覆盖已存档的发布前证据。

## 部署与交接

已发布：`/opt/bnbu-sports-production/releases/photo-capture-20260916`。
上一版本：`/opt/bnbu-sports-production/releases/demand-20260916-final`。
发布脚本：`tools/production/deploy-photo-capture-20260916.py`；发布包及哈希门禁保存在证据目录的 `bundle/`。脚本校验固定基线，切换 current 符号链接，验证失败自动恢复上一版本。后续回滚也应先确认 current 仍指向此次版本，再原子恢复上述上一版本并检查公开资源与健康状态。

未解决/待确认：尚无 iPhone 17 Pro Max 真机复拍证据；WebKit 自动化通过不等同于该设备验收。请用户刷新学生端后重新拍照，不清除浏览器数据，以保留现有本机素材。
