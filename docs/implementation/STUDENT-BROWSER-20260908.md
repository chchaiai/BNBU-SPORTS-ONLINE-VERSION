# 学生浏览器联调

学生服务运行在 http://127.0.0.1:4274/student/，preview-server.cjs 使用 PORT=4274、API_PORT=3199、MINIO_PORT=19000，指向本地 Docker 后端。会话 15793 保持运行。

browser-student-login-guide-final-20260908.txt 退出 0：真实隐私确认、邮箱验证码页面、Mailpit 收码、登录、刷新、跳过首次运动指引并返回首页通过。后台 me/current semester/class-sections/enrollments/records/notifications/progress 等请求 200。使用专用合成学生，无本地演示登录。

保留中间失败日志：首次登录成功；重复测试可能取得历史邮件，改为只读取本轮新增邮件；刷新测试等待首页导航超时，诊断页面处于既有“运动指引”，补齐跳过步骤后通过。没有修改产品以消除指引或放宽认证。

网络中发现 /api/v1/student/course 返回 404。调用位置 frontend/student/js/api.js 的 studentCourseApi 仍使用旧路径；需要按当前协议替换并验证课程详情。当前登录通过不代表首页全部接口无错误，也不代表相机、打卡或三端浏览器全量验收完成。

## 课程规则调用修复

getOwnCurrentCourseContract 现接收当前教学班 ID，读取 /class-sections/{id}/v81-rules；无当前教学班不发请求，未发布规则不显示已锁定门槛，已发布规则校验 minimum_minutes 为 30/45/60。投影到既有 creditPolicy 字段，单条封顶 60 分钟与后端 V8.1 crediting 规则一致。未修改页面结构或样式。

browser-student-course-rules-final-20260908.txt 退出 0：登录和刷新恢复通过，教学班规则接口 200 且门槛值有效，无 /student/course 调用。本轮第一次浏览器脚本在响应已完成后才设置监听导致等待超时，保留 browser-student-course-rules-20260908.txt；改为刷新前登记响应监听后复验通过。响应监测覆盖本次首页加载，不扩展为三端全量无错误。
