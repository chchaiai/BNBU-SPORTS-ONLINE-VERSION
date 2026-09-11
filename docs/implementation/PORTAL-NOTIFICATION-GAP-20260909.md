# 教师与管理员通知入口缺口

2026-09-09，当前页面和代码复核发现：

- portal-app.tsx 虽有通知图标 JSX，但 teacher-workspace.css 的 `.workspace-header-tabbed .icon-button { display: none; }` 对两端均生效。教师课程页另有隐藏规则。实际浏览器在课程和学生管理页均找不到可见通知按钮。
- 原回调仅显示本地计数提示，教师分支固定无新通知，未请求本人通知；也没有通知列表、已读或业务跳转界面。
- 后端 `GET /notifications` 支持按当前主体和组织过滤、unreadOnly 与游标分页；`POST /notifications/:notificationId/read` 支持幂等已读。接口存在不等于页面功能完成。

尝试给原按钮补读取提示后，类型检查通过，但浏览器仍因入口隐藏失败，因此已撤回本轮 portal-app.tsx 接线，产品源码保持本轮开始时状态。没有强制点击隐藏按钮或修改样式来冒充用户可操作。

失败证据 `portal-notification-browser-20260909.txt`、`portal-notification-browser-retest-20260909.txt`；`portal-notification-typecheck-20260909.txt` 仅属于已撤回方案，不能当作已交付功能证明。`v81-portal-notification-browser-probe.mjs` 保留为待实现入口的验收探针，当前预期因无可见按钮失败，不纳入已通过套件。

已询问用户是否允许显示现有通知图标、复用弹窗提供本人通知列表/逐条已读/跳转；该调整会改变当前可见界面，需协调原 UI/UX 限制。答复尚未到达。下一步在获准后完成真实通知接线和权限/失败/跳转验证；不得宣称两端通知完成。
