# 学生课程本人信息核对 2026-09-09

现行业务 docs/business/10-student-flow.md 第 44、167、400 行要求学生看到本人名单核对结果。当前 api.js 存在 getOwnRosterStatus，但全学生源码没有页面调用；courses.js 详情仅包含任课教师和开课学期。

本地 Edge 通过真实 SMTP OTP 登录持续 Docker 后端，在课程列表进入详情。student-roster-current-browser-20260909.txt、student-roster-current-browser-recheck-20260909.txt 均退出 1：页面自动名单请求为 0；主动通过同一浏览器会话调用现有接口方法成功，当前合成课程没有确认名单，返回 available=false、status=null、registrationComplete=false。返回字段严格为七个本人投影字段，没有其他学生资料。本次没有验证 MATCHED 或其他核对状态的网页展示，也没有把“修读中”当作名单匹配完成。

同时发现原任课教师字段错误显示待公布：班级投影没有 teacherDisplayName，原代码依赖旧邀请缓存。已接入受现有本人有效成员范围保护的 GET /teachers/{id}，按教师 ID 在单次工作区加载内去重，404 保持原有回退；其他错误仍正常传播。只给有效成员班级加载教师资料。未改 courses.js、HTML、CSS 或布局。

student-roster-teacher-browser-20260909.txt 确认真实教师姓名显示通过；仍因名单未接线退出 1。截图 student-course-teacher-current-20260909.png 已检查。已有学生名单客户端测试 2/2 通过，api.js 语法检查通过。浏览器探针关闭截图动画，避免捕获进入过渡时的空白区域；首次与复查失败日志均保留。

已请求用户批准在现有详情卡片添加一行本人名单状态，等待答复期间未新增该行。首次改密与结算入口的先前调整也仍待答复。本轮未改变后端或数据库，完整 Docker 后端基线仍为第十六次 94/94；三端完整验收尚未完成。教师目录接口增加一次按不同教师去重的读取，生产网络与多课程负载未验证。
