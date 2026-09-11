# 教师与管理员通知入口

2026-09-09。用户批准显示原隐藏图标并复用弹窗。只为原通知图标增加更具体的 display 规则；其他图标和页面布局保留。原账号弹窗作为通知容器，包含服务端列表、全部/未读筛选、分页、单条已读、刷新及相关业务模块导航。标题正文按文本渲染；仅使用受控模块映射，不跳转通知携带的任意地址。当前导航到对应模块，尚不自动打开某个记录的编辑弹窗。

读取经统一认证请求层；前端逐条校验 recipientUserId 为当前用户，保留会话 epoch 防止跨身份晚到数据。标记已读保留当前弹窗的同键重试，后端已读操作自身也支持重复调用。页头未读点取 /notifications?unreadOnly=true&limit=1，读后刷新、登录后及每分钟重新读取；通知正文不自动标为已读，用户显式标记或打开相关业务才写入。

portal-notification-list-browser-20260909.txt 教师/管理员均通过：真实登录、可见图标、20 条首页及下一页去重、本人范围、已读响应丢失后同键重放、刷新保持已读、未读筛选、断网可见错误与恢复、相关课程模块跳转。另以只读截图模式查看两端通知弹窗。six-entry-portal-typecheck-20260909.txt 完整 npm run typecheck 通过，含原合同检查和三个 TypeScript 项目。

合成前提：seed-v81-portal-notifications.mjs 在唯一允许的本地 v81_browser_test 事务内为两个合成账号各建 21 条 COURSE_UPDATE，关联已有合成课程；不声称这些通知由真实课程截止流程生成。最初使用 COURSE_DEADLINE_REMINDER 被 v81_course_deadline_notification_once 唯一约束拒绝，整个事务回滚后改用可多次发生的课程更新类型。没有删除/放宽约束，也没有发送真实外部邮件。旧 PORTAL-NOTIFICATION-GAP 的隐藏图标失败日志保留。

待补：更多通知类型、精确记录定位和移动视口；原模块导航仍接受后端自己的业务权限检查。全量 Docker 第 24 次结果另见 DOCKER-E2E-TWENTYFOURTH-20260909.md。
