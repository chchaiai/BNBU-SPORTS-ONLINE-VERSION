# 首次改密拒绝响应声明补齐（2026-09-08）

对当前生成协议逐条检查 ACCESS_TOKEN 且允许教师/管理员的操作，发现 16 项缺少运行时 AccessTokenGuard 可能返回的 403：课程/教学班详情、通知列表/已读、推送注册/撤销、偏好读写、反馈列表/创建/详情、结构化免测列表/免测列表/详情、运动目录、定位隐私策略读取。

Draft OpenAPI 为这 16 项补标准 Forbidden 响应并重新生成。运行时 guard、业务服务和前端布局没有修改。

认证 E2E 新增对上述 16 项和既有 /me 的逐项请求，分别在 mustChangePassword=true 及安全记录缺失时验证 403、稳定错误码、空公开 details，共 34 次拒绝请求。原 runtime-conformance-hook 开启，验证实际响应符合协议。现有正确账号、管理权限、234 个未登录接口、会话轮换和撤销等测试继续执行。

独立 Docker/PostgreSQL 构建及认证套件退出 0，11/11 通过，日志 `docker-auth-forbidden-responses-20260908.txt`。协议映射 249/249 和生成检查通过，见 `forbidden-responses-parity-20260908.txt`、`forbidden-responses-generated-20260908.txt`。本批首次运行通过；上一批 registerPushDevice 未声明 403 的原始失败仍保留在客户端能力首轮日志中。

这证明当前所识别的首次改密 403 声明缺口已补齐，不代表所有错误分支或所有角色组合都已验证。其他完整 E2E 套件、Draft 全量诊断与三端业务验收仍需继续。
