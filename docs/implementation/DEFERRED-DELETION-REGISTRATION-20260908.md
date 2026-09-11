# 学生注销暂缓登记（2026-09-08）

按用户明确决定，学生注销显示“暂时功能无法实现，敬请期待”。当前V81AccountDeletionController.challenge在调用服务之前直接返回503 SYSTEM_SERVICE_UNAVAILABLE，details.currentState=FEATURE_DEFERRED；旧挑战服务未从此入口调用。现有Draft协议已经准确声明503及暂缓说明，无需再改变成功状态。

检查现有client-capabilities.e2e.test.ts：合成有效学生同键两次请求均503/FEATURE_DEFERRED，教师403，用户整行未变，注销挑战0条，既有会话/me仍200。该测试不检查邮箱投递记录；“不发注销验证码”同时依据控制器未进入服务的代码证据，不能写成实际SMTP收件验收。

清单新增此操作的精确控制器/入口、无写入路径、保留迁移0048、真实测试与本证据引用，列入停用。当前93普通+34停用登记、122未登记，总127/249。原失败门禁仍保留，后续全量报告验证分类。

Docker对应套件11/11通过，日志docker-deferred-deletion-registration-first-20260908.txt，静态清单生成通过。未改产品、协议或UI；教师删除同样按用户要求暂缓，但不把本项测试作为教师删除独立验收。三端整体目标继续。
