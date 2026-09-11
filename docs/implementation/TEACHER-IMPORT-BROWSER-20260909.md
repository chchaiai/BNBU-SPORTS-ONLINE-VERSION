# 教师批量建号浏览器核对 2026-09-09

本地 Docker 后端、PostgreSQL、Edge 浏览器。管理员在现有“用户与账号 → 教师账户 → 批量建立教师”对两个不同自定义邮箱域名的合成账号预览、确认创建，然后刷新页面重新读取，均通过。密码仅在内存及忽略目录 .local/v81-browser-state/teacher-import-current.json 中保存，未进入本次存档。创建是真实本地写入，不删除账号来重跑。

同一脚本随后以新教师临时密码登录，首次改密入口等待失败，整个脚本退出 1。独立诊断确认 POST /auth/password-login 为 200，随后 GET /me 403，页面仍停留登录表单并显示“该资源不在你的管理范围内”；没有进入首次改密流程。/audit-logs/client-errors 也因首次改密安全门禁返回 403，该情形不能用上一轮普通已启用账号的诊断 200 证明覆盖。

源码 api-client.ts 已有 getAccountSecurity 和 changeOwnPassword，但正常登录页面没有消费首次改密状态。后端 TEACHER-IMPORTS-E2E 及当前全量已有临时密码门禁、改密后可用、旧密码失效证据；缺口在网页登录接线。已请求用户确认复用原密码弹窗：将验证码字段用于当前临时密码、保留新密码和确认密码，保持尺寸与布局。批准前不修改这部分表单。

本轮修正教师账户说明仍称“无课程职责的账号可以删除”的过时文案，使其与用户已确定的暂缓删除一致。只修改说明文字；Portal TypeScript 退出 0。

证据：teacher-import-browser-20260909.txt（建号 PASS，首次改密 FAIL，退出 1）、teacher-first-login-diagnostic-20260909.txt（状态诊断，退出 0）、teacher-import-browser-typecheck-20260909.txt（退出 0）。脚本 tools/local-integration/v81-teacher-import-browser-probe.mjs 与 v81-teacher-first-login-browser-probe.mjs。

验收表同步清理名单、学期、帮助和结算等早期快照中已过时的描述，只引用已存档证据和当前实现；不认定这些模块全部完成。正式结算网页入口的最小调整也已向用户询问。三端目标保持完整且未完成。