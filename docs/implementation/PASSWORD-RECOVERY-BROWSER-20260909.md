# 教师与分管理员网页密码恢复

2026-09-09，本地 Docker 后端、PostgreSQL、Mailpit 与 Portal 实际浏览器测试。独立合成账号，凭据仅保存在忽略目录。

## 修复及验证

1. 已有账号请求恢复邮件时，审计写入 actorUserId 却遗漏 actorRoleSnapshot，违反 audit_logs_actor_snapshot_check；邮件发送后接口500。ChallengeStage保留角色，审计写入匹配角色。新增教师/管理员真实账号请求202及审计事实检查。
2. Portal 登录框 type=email 拦截分管理员分配账号。改为text、账号或邮箱提示；管理员恢复成功后清空登录账号，避免将恢复邮箱误当作分配账号。布局和CSS未修改。
3. Docker build/typecheck及客户端能力专项14/14通过（10631.626707ms）；Portal完整typecheck通过。
4. 最终浏览器教师、分管理员各通过：发送邮件、从Mailpit取得验证码、重置密码、原会话401、新密码网页登录。分管理员测试凭据已同步落在私有测试状态文件。

## 原始证据

- [首次失败](password-recovery-browser-first-20260909.txt)：发送验证码500，数据库审计约束。
- [第二次](password-recovery-browser-second-20260909.txt)：重建尚未就绪，fetch失败；随后健康检查后重试。
- [第三次](password-recovery-browser-third-20260909.txt)：教师通过；分管理员测试建号遗漏登录账号映射，已补齐种子。
- [第四次](password-recovery-browser-fourth-20260909.txt)：教师通过；分管理员已重置，登录被浏览器邮箱校验拦截。
- [最终通过](password-recovery-browser-fifth-20260909.txt)：两类账号均PASS。
- [Docker专项](recovery-audit-docker-20260909.txt)、[后端重建](recovery-audit-browser-rebuild-20260909.txt)、[Portal类型检查](recovery-login-portal-typecheck-20260909.txt)。

## 交接与范围

脚本 tools/local-integration/seed-v81-password-recovery-browser.mjs、v81-password-recovery-browser-probe.mjs 可复测；复测会再次改变独立测试账号密码并同步私有状态。修复未改变数据库结构。此前第38次99/99为历史全量基线，本次专项包含随后新增管理员案例，不冒称已重跑完整100条。生产邮件投递尚待云端配置验证。

用户本轮“确认”接受先前OCR最小弹窗内容调整请求。网页OCR尚待实现，三端整体目标继续进行。
