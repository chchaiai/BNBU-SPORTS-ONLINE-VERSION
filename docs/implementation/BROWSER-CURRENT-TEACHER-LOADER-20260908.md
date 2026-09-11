# 当前三端浏览器刷新与教师初始化修复（2026-09-08）

基线 cc709ed8。专用本地 backend-browser 容器重新构建并健康，保留 v81_browser_test、MinIO 和 Mailpit；日志 browser-backend-refresh-20260908.txt。教师/管理员 http://localhost:3300 使用现有 vinext dev，学生 http://127.0.0.1:4274/student/ 使用文件预览服务。开发服务读取当前源码；全部为本地合成账号，凭据保持忽略文件中，未存入本次证据。

学生浏览器实际 SMTP OTP 登录、主页读取和刷新会话恢复通过，日志 student-browser-current-20260908.txt。其课程/进度文字存在仅是页面读取证据，不证明本次新增运动、材料上传或进度金额正确。

教师首轮真实失败：工作区初始化 loadTeacherGrades 仍读取已停用 /student-scores，403使整个工作区错误。修复 teacher-data.ts，按已取得的本教师成员读取 V81最终成绩历史和原始体测历史，保留免测投影，使用实际最终成绩版本和发布状态；finalGrade独立字段，不把内部最终成绩假装成耐力换算分。未修改JSX/CSS/DOM布局。旧自动计分/发布函数仍存在，成绩编辑动作及学时总额接线还需继续处理；本轮不是完整成绩页验收。

教师复测又遇旧脚本只允许一个“进入课程”按钮，而保留库已有22门课程；脚本改用指定夹具课程及真实目录名称定位。另修正脚本对目录响应数组和fixture.activeCourseId的假设。全部失败按顺序保留 teacher-browser-current、current-retest、current-diagnostic、current-final 日志；current-retest2 通过后，增加严格断言再跑 current-verified，通过。

最终教师验证：五个页面导航无alert、指定已发布模板只读回读、确实请求最终成绩历史200、没有调用旧/student-scores。仍有未配置目标测试课程的/progress-target 404，脚本只允许这一明确类别，其余错误失败；不宣称所有请求200或所有22门课程配置完整。该404是否应在页面标成未配置及目标/学时准确性，仍需业务矩阵核对。

管理员 subadmin 浏览器完整链通过：SMTP OTP、错误码后重试、创建刷新、停启用、资料/新邮箱OTP、权限撤销和删除刷新，日志 admin-browser-current-20260908.txt。该删除仅分管理员，学生注销/教师删除仍暂缓。

Portal tsc通过，物理事实投影2/2通过，日志portal-teacher-loader-typecheck/projection-20260908.txt。浏览器使用真实Docker后端/PostgreSQL/SMTP；未重跑全量HTTP，最近全量仍第十二轮92/92。严格浏览器通过也不替代教师最终INT录入、学生/教师学时汇总、结算和其他全部页面动作。

下一步优先修复教师成绩写入和真实学时读取，继续当前三端业务矩阵。历史发布配置与当前草稿兼容差异仍保留交接。服务继续运行，本轮不部署云端。
