# 教师通知定位课程与打卡详情

2026-09-09 13:00。此前通知只传递模块，丢弃 targetType/targetId。本轮将对象信息随现有导航交给教师工作台，CLASS_SECTION 打开对应课程设置详情，EXERCISE_RECORD/REVIEW_RECORD 打开对应打卡详情。沿用现有弹窗和布局，不改 CSS。等待真实数据加载，匹配当前教师可见集合；无法匹配时明确提示，避免误打开其他对象。退出登录清除待定位对象。

Portal 完整 typecheck 通过（notification-target-typecheck-20260909.txt）。真实 Edge 浏览器连接本地 Docker 后端，以合成通知引用前序真实关闭课程/运动链的持久化对象：课程通知直接打开该课程详情，并收到该 ID 的 settlement-check 200；刷新后打卡通知打开目标详情，验证该运动的特有说明。最终两项通过，见 notification-target-browser-final-20260909.txt；截图 notification-target-course.png、notification-target-record.png 已查看。

第一次浏览器失败等待 workflow：详情直接使用已加载记录，打开动作不会调用该接口，截图已显示正确详情。第二次失败为说明文本完全匹配未命中；最终改为现有弹窗内核对该记录特有说明。首次和复测失败日志均保留，未将它们标为通过。

seed-v81-notification-targets.mjs 在隔离 v81_browser_test 中建立两条显式合成通知，不代表线上事件生成验收；通知列表、已读 API 均为真实 HTTP。重跑 seed 会追加新测试通知，正常只需运行浏览器探针即可。未修改后端或数据库结构，前序 Docker 结果仍为其原覆盖范围。

剩余：免测/认证、成员/名单、结算报告及管理员通知仍只到模块；教师网页 OCR 尚需接线范围核对。这两类通知通过不代表全部三端验收完成。
