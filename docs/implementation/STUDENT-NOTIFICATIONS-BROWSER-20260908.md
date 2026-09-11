# 学生通知浏览器验证 2026-09-08

本地 Docker 后端、PostgreSQL、Mailpit 与 Edge 浏览器的合成账号验证通过。沿用反馈人工处理产生的第二条公开回复通知，完成学生邮件 OTP 登录、打开通知、POST 已读、刷新回读及未读筛选。服务端 readAt 刷新前后相同，已读通知不再出现在未读筛选；对应反馈仍为 IN_PROGRESS。

证据：student-notifications-browser-20260908.txt，退出 0；可复核脚本 tools/local-integration/v81-student-notifications-browser-probe.mjs。脚本依赖现有合成反馈第二条回复且尚未已读，重复执行前需产生新的未读反馈通知；不会输出令牌或验证码。

本次未更改产品代码或布局。批量已读、网络失败、跨页通知、其他业务类型的页面跳转和隐私边界尚需专项核对，不能据此认定通知模块全面通过。云端 SMTP、COS、CVM 和托管 PostgreSQL 尚未验收。