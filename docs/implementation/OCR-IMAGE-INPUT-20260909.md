# OCR 提供方图片输入衔接

2026-09-09。本轮承接网页接受WebP、提供方仅收PNG/JPEG及单图限制的问题。整体三端目标仍进行中。

## 实现与依据

核对[腾讯表格识别V3官方输入说明](https://cloud.tencent.com/document/product/866/86721)：图片Base64不得超过10M，支持PNG/JPG/JPEG等，未列出WebP。本地原材料仍按既有100 MiB批次限制受理。

TencentOcrProvider校验原始SHA后，将WebP或超出提供方大小限制的PNG/JPEG通过sharp准备为PNG。保持图像尺寸，不裁切、不缩小文字、不采用JPEG降质压缩；原存储对象和识别证据sourceSha256不变。已经满足限制的PNG/JPEG继续发送原始字节。

转换限定原输入100 MiB、4000万像素、单页和20秒处理超时。编码后仍超过10,000,000 Base64字符则返回明确大小错误，无法解码则返回IMAGE_INVALID。worker保留这些安全错误码，网页显示重拍/拆分或重试提示。无需新迁移或放宽权限；没有修改页面布局/CSS。

## 验证

- [首次失败](ocr-image-input-first-20260909.txt)：新增WebP与大图测试在旧实现上2项失败，旧3项通过，保留原始证据。
- [本地提供方测试](ocr-image-input-local-20260909.txt)：6/6。核对WebP转PNG像素、原bytes不变、原SHA绑定、可无损压缩的大图、畸形数据、随机噪声大图无法压到限制内时不调用上游。
- [Docker专项](ocr-image-input-docker-20260909.txt)：build/typecheck、6个提供方测试、2个原有OCR业务闭环通过。
- 随后新增真实HTTP WebP上传→读取原图→任务超时重试→识别→草稿核对→名单及体测确认的关闭后续办场景。提供方网络响应使用显式客户端替身，生产TencentOcrProvider转换逻辑实际执行；对象存储为该E2E既有MemoryObjectStorage，不能称为腾讯COS验收。
- [第40次完整Docker](docker-backend-e2e-fortieth-20260909.txt)：提供方6/6；HTTP E2E101/101、25套件、0失败/跳过，131976.371087ms；完整类型检查通过。运行覆盖219/219开启操作成功、253/253错误/权限响应、34明确关闭。[覆盖矩阵](runtime-conformance-fortieth-20260909.md)。
- [Portal类型检查](ocr-image-input-portal-typecheck-20260909.txt)通过。[浏览器后端重建](ocr-image-input-browser-rebuild-20260909.txt)完成，容器healthy，默认OCR仍关闭。

## 交接及剩余依赖

网页的WebP接收与后端转换已衔接，大小限制有明确失败处理。原图仍用于教师核对，转换不会自动批准任何行。正式腾讯OCR调用及本校真实手写样本验证、CVM角色权限、生产邮件/COS/PG连接仍按既有架构记录为云端依赖，本轮未部署或调用收费云服务。

本轮不重复宣称完成所有网页多页/最大批次边界。下一步回到三端原始业务章节的最终逐入口核对，复用已有事实证据，补齐必要缺项；不把独立提供方或HTTP测试冒称为三端全部验收。
