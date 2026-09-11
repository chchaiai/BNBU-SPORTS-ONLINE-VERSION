# 学生开始运动由后端核验时段

2026-09-09。发现真实学生页面 evaluateReadiness 在发送请求前调用旧 CheckInTimeWindow 判断，本地日期可能阻止合法补练窗口到达后端。真实模式仍检查账号及入班、课程存在，随后由 exercise-sessions 开始接口判断当前课程、常规截止、本人补练授权和并发会话。只有真实开始成功才建立本地计时。

首页与打卡准备页的现有状态文案显示“待核验”，说明开始时由服务器确认课程时段与本人补练资格。演示模式保留原时间窗判断。元素、结构、控件与样式未增加或删除，变更为判断逻辑和现有文案。

## 浏览器证据

- student-stale-window-browser-20260909.txt 退出 0：真实 SMTP 学生登录，在浏览器响应中将 class-sections 的旧起止日期改为 2000 年，仅影响本次页面数据；数据库课程安排不变。现有开始入口成功调用 Docker 后端，并完成合成相机拍照、暂停、继续和短会话结束。未提交新记录、不计有效学时。
- student-window-denial-browser-20260909.txt 退出 0：同样提供过期页面日期，开始请求注入 SESSION_OUTSIDE_TIME_WINDOW 409；恰好一次请求，页面显示现有错误，本地 loadSession()=null、无暂停按钮。此项为客户端拒绝响应处理，不冒充真实补练权限配置。

复现：运行 tools/local-integration/v81-student-browser-probe.mjs，V81_STUDENT_PURPOSE=maintenance-supplement、V81_STALE_WINDOW=1；正向再设置 V81_STUDENT_CAMERA=1，拒绝分支仅设置 V81_DENIED_WINDOW=1。正向结束后没有活动会话，旧待补证记录保留。

后端本人补练授予/撤销、新开始拒绝及原会话后续规则由 MAKEUP-MEDIA-20260909.md 和第二十轮 97/97 覆盖。本轮没有修改后端或重跑全量，也未证明教师网页授权到学生真实补练的完整浏览器链；其最小界面调整仍待用户答复。移动视口及关闭课程恢复场景未由本轮证明。
