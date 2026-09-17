# 拍摄 EXIF 修复发布 — 2026-09-17

用户线上测试照片显示宽 480、高 640，其余拍摄参数均无数据。只读核验线上 `ai-review-contract-20260917` 的 `checkin.js` 仍使用 canvas 截取相机画面，不包含上一轮本地存档的设备相机入口；本轮开始前上一轮修复尚未发布。

已发布到 `/opt/bnbu-sports-production/releases/photo-exif-20260917`。仅覆盖学生端 `js/screens/checkin.js`、`js/photo-originals.js`，前版完整保留用于原子切回。Backend、Portal 容器 ID、镜像和启动时间保持一致。本轮不发布此前本地 AI 自动判定及历史补审功能。

Android/HarmonyOS 华为 Edge 默认调用设备相机拍照及录像，保留明确的手机相机入口；网页相机支持 ImageCapture 时读取相机照片。新增提示明确原图是否提供完整拍摄信息，上传继续保留允许的 EXIF 并剔除 GPS。未提供的字段不会被伪造；旧截图照片无法补回不存在的数据。

验证：

- 7 项拍摄路由、照片原图与视频元数据定向测试通过；语法和限定文件 diff 检查通过。
- 带完整 EXIF 的合成 JPEG 经当前前端处理后，交给线上 Backend 的真实 MediaValidator：拍摄时间、品牌、型号、焦距、光圈、ISO、曝光时间、宽、高、方向全部符合预期，像素保持一致、GPS 被移除。未读取真实学生材料、未写数据库，不能代替真实手机 HTTP 上传验收。
- 线上两份文件 SHA-256 与发布件一致，Cache-Control 均为 no-store；学生入口、后端 readiness 为 HTTP 200。
- Headless Edge 加 Android Edge UA 加载公开生产入口与实际模块，并触发照片处理函数：设备文件输入选择器的 accept=image/*、capture=environment 正确，无页面异常。此项不是华为真机测试，也不是已登录学生上传测试。

证据：`evidence/photo-exif-20260917/deployment.json`、`exif-verification.json`、`browser-verification.json`。发布脚本 `tools/production/deploy-photo-exif-20260917.py`；EXIF/浏览器验证脚本在同目录。

用户复测：关闭并重新打开学生页面，重新拍摄一张照片；正常应打开手机相机，保存返回网页。若原图提供完整字段，网页显示“拍摄时间、相机及曝光信息已保留”；否则给出信息缺失提示。旧照片的无数据保持原状。
