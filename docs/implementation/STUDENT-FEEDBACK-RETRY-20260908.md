# 学生反馈响应丢失恢复（2026-09-08 23:19）

基线 54d9eb11。Playwright 向本地 Docker 后端真实提交反馈，先取得成功结果，再中断浏览器响应。

- student-feedback-retry-browser：复现 sameId=false、sameKey=false，原网页每次重试创建新键，产生两个不同反馈。保留该 synthetic 重复记录及失败证据。
- UI 保留 submissionIntent 的原 category/content/幂等键；未确认时禁用输入编辑，提交按钮仍允许原请求重试；明确 401/403/404/422 后解除原请求；成功后解除并按反馈编号合并列表。
- createFeedback 接受显式幂等键，兼容原未传键调用者。
- student-feedback-retry-browser-retest/verified：同编号、同键、列表恰好一条；verified 同时确认失败后原内容锁定，成功后输入恢复。PASS。
- student-feedback-retry-client-regression：现有客户端 5/5。未修改后端协议/数据库/服务或 CSS/布局，不重复后端全量测试。

验证为真实 Edge、Mailpit 登录、本地 Docker PostgreSQL；业务响应不是模拟成功，只有传输被中断。后续仍需核对刷新/重新登录时的未确认请求恢复及反馈历史的学生展示。/audit-logs/client-errors 404 仍作为接线缺口，整体目标继续。
