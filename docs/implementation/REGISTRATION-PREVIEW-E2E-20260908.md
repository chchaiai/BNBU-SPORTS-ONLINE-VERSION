# 名单注册预览 Docker E2E（2026-09-08）

现有 OCR/电子名单切换 HTTP 链路增加两次真实 CSV 上传后的注册预览。校验名单、教学班和来源版本对应，sourceRowCount=1、denominator=1、matchedCount=0、unresolvedRowCount=1、registrationComplete=false，名单行 PENDING_REGISTRATION 且学生/选课标识为空，无平台额外人员。读取前后教学班选课数仍为零，管理员403，其他教师404。

首轮严格协议 hook 发现未声明的404，补充 previewV81RosterRegistration 的 NotFound 响应并重新生成产物，249 操作静态 parity 通过，Docker OCR 整条套件复测 1/1 通过。原始日志 docker-registration-preview-e2e-first-20260908.txt，复测日志 docker-registration-preview-e2e-retest-20260908.txt。

本轮验证未注册状态与访问隔离，不代表真实学生 OTP 注册后全部匹配、重名冲突和重复学号已全部验收。对象存储与 OCR 提供方依然是明确测试替身；未改 UI。整体目标继续，最新全量第九轮90/90、28项门禁缺口。
