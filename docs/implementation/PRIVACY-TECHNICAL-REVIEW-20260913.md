# 学生端隐私说明技术一致性审阅稿

状态：待确认，未修改线上隐私政策。依据当前已部署学生端行为整理，不代表学校法律或制度审阅完成。

## 已确认的技术差异

| 位置 | 当前文字/缺漏 | 代码依据 | 建议 |
|---|---|---|---|
| 中文第四节 | 照片统一重编码 JPEG 并移除原始 EXIF | js/screens/checkin.js normalizeCapturedPhoto；js/photo-originals.js prepareJpegEvidence | 区分 JPEG、PNG 与其他格式，说明保留的相机信息和本地原件 |
| 中文第六节 | 未集成自动崩溃上报，未区分 API 错误诊断 | js/api.js 错误日志及 /audit-logs/client-errors 调用 | 说明已登录状态下部分 API 错误诊断会提交服务器，不扩写为全局崩溃采集 |
| 英文开头及中英文联系节 | 北京师范大学珠海校区作为运营或联系单位 | 当前产品名称 BNBU；主体身份不能仅由代码确定 | 等待确认准确运营主体和联系部门 |
| 英文照片章节 | 未说明本地原件和上传副本分支 | 同上 | 与中文同步补充 |

## 建议替换文字

### 照片与本地原件（中英文）

您主动拍摄或选择照片后，客户端会尝试将原照片保存到当前浏览器的本地相册，供您查看和删除；原件可能保留文件原有元数据。本地保存依赖浏览器存储能力，不保证永久保存。上传副本与本地原件分开处理：JPEG 副本保留压缩图像数据及部分相机、拍摄时间和图像参数，移除 GPS、XMP、IPTC 等位置或身份相关元数据；PNG 按原文件提交；其他支持的图像格式可能转换后上传。服务器仍检查上传文件的类型、完整性及可识别的位置元数据，不将坐标作为运动业务事实保存。

After you actively capture or select a photo, the client attempts to save the original in this browser's local photo album for viewing and deletion. The original may retain its existing metadata. Local storage depends on browser support and is not guaranteed to be permanent. Upload copies are handled separately: JPEG copies retain compressed image data and selected camera, capture-time and image parameters while removing GPS, XMP, IPTC and other location or identity metadata; PNG files are submitted as supplied; other supported image formats may be converted before upload. The server still checks file type, integrity and recognizable location metadata. Coordinates are not stored as exercise business facts.

### 错误诊断（中英文）

为排查请求失败，客户端可能在控制台记录经过限制的错误诊断，并在已登录时向服务器提交部分诊断信息，例如错误码、类别、请求关联标识、时间、HTTP 状态、请求方法和脱敏路径。不将密码、验证码、完整访问令牌或材料正文写入这些诊断。当前实现不应表述为已经验证的全局崩溃采集系统。

To investigate failed requests, the client may record limited diagnostics in the console and submit some diagnostics to the server while signed in, including error codes, categories, request correlation identifiers, timestamps, HTTP status, request method and redacted paths. These diagnostics do not include passwords, verification codes, complete access tokens or evidence contents. The current implementation should not be described as a verified system for collecting all application crashes.

## 发布前必须确定

- 准确的运营主体名称及联系部门/渠道；不自行将品牌名当作法律主体。
- 中英文政策版本、更新与生效日期，以及是否需要向已有用户重新提示。
- 学校对本地照片原件、相机元数据和错误诊断说明的确认。

保留事项：学生邮箱无法使用时是联系学校的帮助流程，未发现自助恢复政策冲突。新拍摄视频最长十秒及包含音轨与现行客户端一致，本轮不修改。

验收边界：以上是源码与页面一致性审阅建议，不是实机相机、存储删除或真实错误诊断送达的完整验收证据。
