# OCR 配置治理 HTTP E2E（2026-09-08）

新增 v81-ocr-governance.e2e.test.ts，在专用 Docker PostgreSQL 与真实 Nest HTTP 中执行严格协议校验，首轮1/1通过。

验证总管理员读取部署默认配置；教师和学生不能读状态/历史或保存，改为拥有SYSTEM_MODE/GLOBAL_RULES的分管理员后也不能访问；未批准provider、endpoint、secret字段、空腾讯region和禁用provider却启用等输入422。总管理员保存与原key重放一致，同版本并发保存201/409，最终版本2；历史分页保留两版本，数据库UPDATE/DELETE均被拒绝；事件恰好两条；状态不含密钥字段，并保留executionEnabled=false、providerConnectivity=UNVERIFIED、automaticPassValidation=NOT_PROVIDED和正式事实须教师确认的声明。

日志：docker-ocr-governance-e2e-first-20260908.txt。本轮未调用腾讯云OCR，未启用自动通过，未改UI。身份/组织为合成夹具，权限切换由测试数据库设置以验证服务实时鉴权；服务配置保存走HTTP。后台识别任务、维护切换中任务处理和OCR草稿正式确认仍需对应专项。

全量门禁最新仍第七轮84/84通过、70项覆盖失败。其余业务成功证据、清单校准、三端浏览器和云服务依赖继续。
