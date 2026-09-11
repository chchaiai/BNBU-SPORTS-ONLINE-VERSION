# 客户端能力端到端复测（2026-09-08）

独立 Docker tmpfs PostgreSQL 中构建并运行 client-capabilities.e2e.test.ts，原 runtime-conformance-hook 开启，报告路径设为容器 /tmp/client-conformance.ndjson。最终退出 0，10/10 通过，证据 `docker-client-capabilities-current-retest-20260908.txt`。

测试覆盖学生邮件挑战/首次绑定、双邮箱换绑、OTP 登录与免测材料审核、教师找回密码撤销会话、通知归属与已读、推送令牌加密及撤销/转移、偏好保存、反馈和发布帮助读取，以及停用定位与旧换算接口拒绝。HTTP 和 PostgreSQL 为真实执行，外部邮件/存储由套件测试机制提供；不是云端投递或三端浏览器完整验收。

改动仅本套件前置账号和预期、Draft 协议及生成物：

- 教师 A/B 和管理员补现行已改密安全数据，管理员为 SUB、仅 GLOBAL_RULES 权限，具备登录账号；不修改共享基础 fixture，不赋予 SUPER。
- 首次专项补教师 A 后 8/10，通过证据及两个失败见 `docker-client-capabilities-current-first-20260908.txt`。教师 B 推送转移仍因未改密拒绝；补齐其账号前置状态。
- 旧活动换算接口只允许教师/管理员，旧测试却以学生期待 503。保留学生请求并明确验证 403，增加教师请求验证原 503 停用；协议补缺失 Forbidden 响应。
- 管理员无定位策略操作授权，现行管理权限守卫先返回 403，更新对应预期；其他定位操作仍验证 503。运行时权限与采集状态未改动。

249/249 handler 映射和生成检查通过，见 `client-capabilities-contract-parity-20260908.txt` 与 `client-capabilities-generated-check-20260908.txt`。没有执行全接口覆盖汇总或完整 E2E，不能据此改写完整套件通过率。

待继续：本次首次失败也揭示 registerPushDevice 首次改密拒绝的 403 未在协议声明；同类通用端点的拒绝响应需要集中核对和补充验证，不能仅凭正常账号成功宣告协议完整。其余 E2E 套件、Draft 全量诊断和三端业务验收继续。
