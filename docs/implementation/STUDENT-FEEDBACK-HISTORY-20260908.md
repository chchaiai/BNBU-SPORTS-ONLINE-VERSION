# 学生公开反馈历史接线（2026-09-08 23:23）

基线 79452fd4。学生业务文档 10.4 要求管理员每次保存新增学生可见回复并保留原记录。后端已有 GET /student/feedback/:id/history，限定本人、同组织，仅返回公开事件。旧页面只使用列表 publicReply，显示最后一条。

listMyFeedback 读取每条本人反馈的公开历史，以历史响应的当前状态/版本更新卡片。现有公开回复区域按顺序渲染全部公开回复；仅无事件的旧数据保留既有 publicReply 显示。继续使用 esc 转义，没有 CSS/页面结构调整。

验证：
- feedback-history-admin-browser：在前一轮 synthetic 反馈追加第二条公开回复；同键回放、刷新历史验证 PASS。
- feedback-history-student-browser：学生重新登录，在对应反馈卡片同时读到原回复和第二条，PASS。
- feedback-history-student-privacy-browser：同时检查每条历史只含 id、occurredAt、publicReply、status、version，且至少两条，PASS。没有管理员账号信息或内部元数据。
- feedback-history-client-regression：现有客户端 5/5。

实际使用 Edge、Mailpit、本地 Docker 后端和 PostgreSQL，保留 synthetic 历史。本轮无后端/契约/迁移修改，不将历史后端全量测试称为本轮新跑。

后续：大量反馈历史读取的规模、失败时缓存提示及刷新后的未确认建单恢复需继续核对；通知页面动作与剩余三端验收尚未完成。
