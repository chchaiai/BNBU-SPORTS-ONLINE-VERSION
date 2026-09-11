# OCR 图片与任务重试 HTTP E2E（2026-09-08）

新增 v81-ocr-intake.e2e.test.ts。真实PNG经multipart接口上传名单与体测两个批次，专用Docker PostgreSQL持久化业务记录，严格HTTP协议校验启用；原图对象存储使用内存适配器，腾讯请求使用测试替身，后台执行调用真实worker，不访问云服务。

复测1/1通过：名单上传及重放一致，体测批次独立；管理员403、其他教师404；摘要匹配原始图片且响应不含storageKey；读取原图Base64逐字节一致；未识别状态及列表两页正确；任务排队重放一致、新请求冲突409；批次对其他教师不可见；真实worker处理模拟ETIMEDOUT，HTTP读取失败状态及OCR_PROVIDER_TIMEOUT；以期望尝试1重试，worker成功，任务resultAttempt=2；数据库保留FAILED尝试1与SUCCEEDED尝试2；提供方只调用两次，识别证据requiresTeacherConfirmation=true。

首轮因createV81OcrRosterBatch/getV81OcrBatch跨教师404未声明失败，已补协议并生成产物；249操作/249handler静态对应检查通过。日志：docker-ocr-intake-e2e-first-20260908.txt、docker-ocr-intake-e2e-retest-20260908.txt。未改UI布局。

本轮未证明腾讯服务实际连通、COS持久化、自动worker调度、OCR草稿核对或正式名单/体测确认。后台worker由测试显式执行，组织及身份是合成夹具。接下来继续OCR草稿至正式事实；全量门禁最新仍第七轮70项缺口。
