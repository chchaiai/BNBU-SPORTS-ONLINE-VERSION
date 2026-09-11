# 后端安全测试层复测（2026-09-08）

Docker `npm run test:security` 首次 52/53，见 `docker-backend-security-first-20260908.txt`。媒体权限测试仅提供 sessionId，缺少现行 MEDIA_TARGET_FROM_REQUEST 必需的 businessPurpose，在角色验证前被 MEDIA_BIND_TARGET_INVALID 拒绝。

测试默认请求补齐 EXERCISE_RECORD 用途及 sessionId，保留学生写入/教师管理员拒绝和读取角色断言，新增用途缺失、同时指定 session/enrollment、未知用途的拒绝验证。未修改产品权限或校验规则。

重建 Docker 镜像后 `docker-backend-security-retest-20260908.txt` 退出 0，53/53、11 suites 通过。该层以守卫、DTO、投影、配置、脱敏及源码边界测试为主，没有启动真实数据库业务服务；不等于生产安全审计或全量真实权限验收。

首次失败保留。后端完整集成、Draft 协议诊断及三端业务覆盖仍需继续。未执行云端操作或变更界面。
