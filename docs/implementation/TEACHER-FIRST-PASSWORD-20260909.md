# 新教师首次改密

2026-09-09。用户已确认六项最小必要界面调整。本项复用登录页现有密码恢复表单，验证码位置改为当前临时密码；保留页面结构及 CSS。登录与会话恢复先读取 account-security，mustChangePassword 为 true 时进入表单，保存调用 own-password 后读取本人资料进入教师工作台。

请求结果未知时先读安全状态：已提交成功则直接恢复工作台，未成功才重试；当前页面相同输入保留同一幂等键。密码只在内存保留，不写浏览器存储，返回登录时清空。该接口当前密码错误的 AUTH_CREDENTIAL_INVALID 属于输入校验，保留有效登录会话；会话撤销等错误仍清除会话。

本地浏览器使用现有 Docker backend-browser、PostgreSQL 和已有批量导入的合成教师账号。teacher-first-password-browser-retest2-20260909.txt 通过：初次登录、刷新仍要求改密、错误临时密码拒绝及可见错误、服务器成功后丢弃响应再刷新恢复、全新浏览器会话使用新密码登录。该测试改变一个合成教师账号密码，凭据仅保存在被忽略的本地 fixture。

保留初始失败：teacher-first-password-browser-20260909.txt 为含必填标记的标签导致测试定位失败，改为已有输入 id；retest 日志发现通用请求层误清登录态，修复后 retest2 通过。类型检查日志 teacher-first-password-typecheck-20260909.txt 退出 0。一次仓库根目录 npx tsc 调用未找到项目编译器，随后在 Portal 目录重跑通过。未修改后端，因此没有新增全量后端通过声明；此前第 23 次 Docker 全量结果独立有效。其余五项入口仍在实施。
