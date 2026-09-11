# 学生退出登录验证（2026-09-08 23:00）

基线 12295468，本轮产品代码无变化。Edge 实际 Mailpit OTP 登录后，从设置选择退出登录并确认，等待真实本地 Docker 后端 POST /auth/logout 200；使用该请求捕获的旧 Authorization 访问 /me，返回 401；刷新后显示邮箱验证码登录入口，不显示“我的”。student-logout-browser-verified-20260908.txt PASS。令牌未写入日志或文件。

student-logout-browser 与 diagnostic 两次超时发生在最后页面断言：已有隐私同意的登录页直接显示“邮箱验证码登录”，测试错误等待“直接登录”。服务端撤销和旧令牌拒绝在诊断日志中均 PASS。修正定位后完整脚本通过。原失败保留。

偏好检查发现：学生 setThemeMode/setAppLanguage 仅写本地 store；后端 /me/preferences 已有 locale、pushEnabled、emailEnabled 和版本字段，不含主题字段。语言同步尚未接线，后续处理；不得凭本地存储声称后端同步成功。业务禁止正式结果通过邮件/系统 Push 发送，不得因接偏好开启这些通道。

本轮是正常网络退出验证，不证明离线时服务端撤销、跨设备退出或刷新凭据全部边界。三端完整验收继续。
