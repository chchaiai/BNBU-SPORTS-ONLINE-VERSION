# 管理员反馈通知具体对象定位

2026-09-09 13:08。Portal 将通知对象传递到管理员工作台，再传给现有反馈组件；FEEDBACK 使用 targetId 请求既有 /admin/feedback/{id}，打开既有详情弹窗。权限继续由原管理员页面权限和后端范围检查执行。异步读取带取消和会话代次检查，切换目标先清空旧详情，失败显示原错误组件；没有新增布局、反馈回复或业务状态写入。

完整 Portal typecheck 通过：admin-feedback-notification-typecheck-20260909.txt。真实 Edge + 本地 Docker HTTP：合成管理员通知分别引用此前学生网页创建的反馈单和不存在 UUID；前者 200 并显示对应 ID、原反馈内容和历史，后者 404、错误提示、无详情弹窗。admin-feedback-notification-browser-20260909.txt 两项通过；截图禁用过渡动画后复测同样通过，见 admin-feedback-notification-browser-retest-20260909.txt。截图 admin-feedback-notification.png。

seed-v81-admin-feedback-notification.mjs 仅向隔离 v81_browser_test 插入明确标注的测试通知，通知对象和反馈内容均经真实接口读取；不是管理员通知事件生成验收。重跑 seed 会追加测试通知。本轮无后端、协议或迁移变化，未重跑全量后端套件。

剩余：管理员课程/账号等目标定位、教师成员/名单/报告通知和网页 OCR。OCR 弹窗内容调整仍待用户答复，当前未做依赖该答复的修改。
