# 学生本人名单状态展示

2026-09-09。用户批准原课程区域增加本人状态。学生 workspace 只对自己的有效入班关系请求已有 getOwnRosterStatus，并额外核对 classSectionId。该方法严格接受七个本人字段；不引入其他学生身份、名单分母或核对结果。课程详情原信息卡新增“本人名单”行，并提供刷新重试；中英文文案齐备，未改 CSS 或页面结构。网络或协议错误显示暂不可用，不冒充匹配成功。刷新沿用现有会话隔离与工作区加载逻辑。

本地浏览器连接 Docker 后端、PostgreSQL 和 Mailpit，student-own-roster-retry-browser-20260909.txt 验证原账号 available=false 的未确认状态，student-own-roster-matched-browser-20260909.txt 使用结算合成学生验证 MATCHED。两次均实际邮箱 OTP 登录、课程详情自动请求、七字段投影检查、可见状态与接口一致、断开 roster-status 后显示暂不可用、恢复请求后刷新正确。已查看当前页面截图。api.js 和 courses.js 的 node --check 及 git diff --check 通过。

原始缺口日志仍在旧 STUDENT-COURSE-OWN-INFO 记录中。本次没有宣称身份冲突、名单外及待注册三种状态都经真实浏览器验证；这些文案已接线，后续边界测试继续。原始体测编辑与教师/管理员通知仍待实施。
