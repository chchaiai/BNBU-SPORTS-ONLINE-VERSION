# 注销暂缓协议与回归（2026-09-08）

依据用户明确决定：学生注销、教师删除暂时不可用，显示“暂时功能无法实现，敬请期待”。当前学生注销控制器已返回 SYSTEM_SERVICE_UNAVAILABLE / FEATURE_DEFERRED，但 Draft OpenAPI 仍承诺成功发放 OTP，旧专项脚本仍要求实际发送注销邮件。

本次将 /me/account-deletion-challenges 的说明及响应改为暂缓行为：删除 201 成功响应和该路径不会到达的版本冲突响应，补充 503。认证/角色/输入校验响应继续保留。仅同步协议和测试，没有恢复注销能力。

在客户端统一 E2E 新增暂缓场景：同一请求重试两次均 503、教师 403、用户行完全不变、验证码表没有新增记录、原学生会话仍能 GET /me。完整客户端套件 11/11 通过，退出 0，严格运行时协议校验开启。

将 V81_DELETION_DEFERRED 与旧 V81_DELETION_CHALLENGE 专项入口统一到当前暂缓探针，旧探针不再断言发放注销 OTP。Docker 专项真实使用合成学生邮箱登录，并验证暂缓、角色拒绝、账户不变和会话可用，退出 0。

证据：
- docker-deferred-client-e2e-first-20260908.txt：客户端 11/11。
- docker-deferred-probe-current-20260908.txt：57 个迁移无待执行；账号首次改密检查通过；DELETION_DEFERRED_NO_CHALLENGE_NO_ACCOUNT_CHANGE_SESSION_REMAINS_VALID 通过。

OpenAPI 生成检查和 249 操作/249 handler 对应检查通过。原始历史日志不改写。本次没有界面布局修改，也没有新增教师删除 API。运行时覆盖清单仍未同步当前暂缓与其余新接口；完整门禁最新仍为第三轮 136 项缺口，不能据此次专项宣称三端总体验收完成。
