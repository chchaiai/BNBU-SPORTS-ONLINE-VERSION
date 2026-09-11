# OCR 识别到教师草稿核对 E2E（2026-09-08）

在统一OCR上传/任务重试场景中补充合成识别表头与姓名单元格，复用 v81-ocr-draft-api-probe.mjs 完整探针，所有业务请求经过严格HTTP协议校验。Docker完整链路复测1/1通过。

验证草稿尚不存在时404；管理员403、其他教师404；失败识别尝试不可选用409；重复页选择、未知页、错误表头、重复映射、空映射、伪造isFormal等422；合法识别创建草稿版本1，字段值和原证据单元格索引正确、pendingReviewCount=1且isFormal=false，重放不增版；禁止伪造source、未知行、非本用途字段、错误核对标志。两个教师修订请求并发201/409，胜出版本2、待核对数零且仍非正式；原source和ocrIssues不变；旧版本可读、重放一致，数据库版本与审计各只有1和2。

首轮草稿GET/POST的404未声明，补getV81OcrDraft/createV81OcrDraft后生成协议，249操作/249handler静态对应通过。日志：docker-ocr-draft-e2e-first-20260908.txt、docker-ocr-draft-e2e-retest-20260908.txt。未修改界面布局。

云OCR提供方模拟、内存对象存储、显式执行worker的边界继承OCR-INTAKE-E2E-20260908.md。本轮验证到教师核对后的非正式草稿；正式名单确认及体测确认仍需后续链路。全量门禁最新仍第七轮70项缺口，其他业务与三端整体验收继续。
