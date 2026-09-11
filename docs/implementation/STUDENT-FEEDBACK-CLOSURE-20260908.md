# 学生反馈网页闭环（2026-09-08 23:15）

基线 886b4e1f，依据学生业务文档 10.4。真实 Edge 操作本地 Docker 后端及 PostgreSQL，学生通过 Mailpit OTP 登录。

- student-feedback-browser-current：现有学生页面提交问题，POST /feedback 201，content 与输入一致、初始状态 OPEN；“我的反馈”读取到该内容。新 synthetic 反馈定位写入忽略目录 student-feedback-current.json，不覆盖旧 feedback-submission.json。
- student-feedback-admin-browser-current：管理员页面打开该反馈，添加公开回复并保存，状态 IN_PROGRESS；同请求回放返回相同版本；刷新后历史新增一条，公开回复存在。使用 V81_FEEDBACK_CURRENT=1 选择本轮反馈。
- student-feedback-reply-readback-browser：学生重新登录进入“我的反馈”，在本轮内容对应卡片中读到管理员公开回复及“受理中”。
- 修复学生列表直接展示 OPEN/IN_PROGRESS 等原始枚举，按业务五状态显示待受理/受理中/待技术团队处理/处理完成/已关闭，并支持英文。未知状态明确不可用。没有 CSS/布局改变。
- student-feedback-client-regression：5/5；support.js 语法检查通过。

保留 synthetic 反馈及公开回复历史。未发送外部真实用户消息，未连接腾讯云。后端源码未变化，不重复第十四次后端全量测试。

继续：学生提交响应丢失后的原请求重试尚未验证；当前 createFeedback 每次调用会生成键，需检查是否存在重复建单风险；历史多条公开回复的学生展示也需对照业务进一步核对。整体验收及诊断上报路由仍继续。
