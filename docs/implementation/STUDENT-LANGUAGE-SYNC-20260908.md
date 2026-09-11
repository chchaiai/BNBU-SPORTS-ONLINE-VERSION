# 学生语言偏好同步（2026-09-08 23:10）

基线 3905b204。复用 GET/PATCH /me/preferences。学生登录/刷新读取 locale，切换时携带 expectedVersion 和幂等键；只在服务端确认后应用语言，保留原通信开关。待确认请求保留原输入与键；会话 epoch 防止退出后的旧请求影响新账号。主题保持设备偏好，现有接口无主题字段；不新增界面/CSS布局，设置页现有语言区域显示失败反馈。

验证：
- student-language-browser：英文保存版本 2、刷新回读、中文恢复版本 3，通信开关未变。
- student-language-retry-browser/retest：网络失败没有可见提示；增加设置区域错误显示仍失败。
- student-language-retry-browser-diagnostic：已提交后中断响应，浏览器 ReferenceError: apiRequestMode is not defined。定位到既有公共 logSafeClientError 引用不存在变量，阻断错误转换。删除该引用，继续以有效登录令牌约束上报。
- client-error-projection.test.mjs 增加网络错误可渲染、诊断不包含私密 transport cause 的回归。
- student-language-retry-browser-verified：本地 Docker 后端提交版本 10 后中断响应；显示错误；原键重试仍版本 10。主动把本地语言改回中文后刷新，从后端恢复英文，再保存中文版本 11。全部 PASS，账号已恢复中文。
- student-language-client-regression-final：5/5（错误投影、帮助缓存、补证客户端）；JS 语法检查通过。

测试通过真实 Edge/本地 Docker 后端/PostgreSQL，Mailpit 登录；只有网络响应被测试工具中断，业务写入是真实的。后端代码/迁移/协议未改变，第十四次全量后端结果是历史基线，本轮浏览器验证单独计。

剩余：语言版本冲突、长期跨设备场景及其他角色偏好待验证；客户端错误上报目标 /audit-logs/client-errors 仍不存在，虽然已不会阻断用户错误显示，路由接线待处理。完整三端验收继续。
