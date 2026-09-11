# 学生教师维护公告接线 2026-09-09

学生与 Portal 原先只查询模式，不读取公告。现改读公开 /system-mode/announcement，沿用原标题、正文和预计恢复时间位置；学生采用当前语言，Portal 原双语区显示双语正文。正常模式清空公告。原有布局、CSS 和控件结构维持，教师已有会话在维护页隐藏管理员治理入口，后端权限仍独立校验。

本地 Edge + 持续 Docker PostgreSQL 真实切换验证：学生公开入口显示合成中文公告；已登录教师刷新后显示双语标题/正文及服务器预计恢复时间；日常课程入口不可见，教师无管理员治理按钮；恢复 NORMAL 后教师原会话进入课程管理、学生回到公开登录/入班入口。maintenance-notice-role-final-20260909.txt 退出 0，管理员切换/丢响应原键重试/刷新恢复回归 maintenance-notice-admin-regression-20260909.txt 退出 0。客户端公告映射及正常模式清理 2/2，Portal 类型检查、预览配置测试通过；截图 student-maintenance-notice-20260909.png、teacher-maintenance-notice-20260909.png 已检查。

失败及修复：

- 原学生 4274 服务 APP_ENV=unknown，按静态预览规则跳过模式查询；因此旧普通业务验证不能替代维护入口验证。新增 run-v81-student-preview.cjs，明确 APP_ENV=test、API3199、MinIO19000、仅回环地址。核对旧进程后替换该预览服务，未动其他服务器。初版 require 仅加载模块未监听，改为启动原预览主脚本；相关连接拒绝日志保留。当前运行此明确联调脚本。
- 教师刷新时 workspaceMode 尚未恢复，旧逻辑跳过模式查询，但 /me 又被维护拦截。已有会话现在继续读取公开状态。
- 业务拒绝事件会短暂抹去已加载公告。改为保留当前维护公告并立即重读状态。截图复核发现并修正该问题，不把首次表面通过视为最终结论。
- 诊断响应监听器在跳转后读取 response.json 抛错，导致探针提前退出；已捕获该诊断读取错误。该轮通过真实管理员切换 API 恢复 NORMAL，保留审计。其余轮次 finally 按本校历史恢复。失败日志 maintenance-notice-browser、diagnostic、browser-retest、browser-final、teacher-diagnostic、stable 均保留，不覆盖。

本轮不改后端、协议或数据库。最新完整后端全量仍为第十八次 96/96，历史分页专项另有 7/7；没有新跑全量。当前服务 NORMAL，学生与 Portal 预览继续运行。测试只证明学生公开入口、教师已登录会话及管理员恢复，尚未证明学生已登录补证剩余时间、学生英文公告实际页面、后台自动轮询恢复与移动视口。生产学校公告及腾讯云依赖、首次改密/结算/本人名单最小界面待答复事项继续，三端完整目标未完成。
