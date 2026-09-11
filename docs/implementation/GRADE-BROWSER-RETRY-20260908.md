# 成绩浏览器异常恢复（2026-09-08 22:41）

基于 6556f5eb，真实 Edge 页面访问本地 Docker 后端。Playwright route.fetch 先向真实后端提交，再 abort 浏览器响应，模拟后端已提交而响应丢失；未模拟业务成功响应。仅使用 synthetic 教师及学生，测试成绩历史保留。

发现与修复：
- grade-lost-response-browser-20260908.txt：原页面刷新后重试更换 expectedVersion 和幂等键，版本 5 后又写出版本 6，重复追加。
- 改为按报名保留未确认请求的原成绩、发布状态、版本和幂等键，成功确认后清除；明确版本/参数/权限拒绝清除，传输失败保留。保存遇到未确认的不同请求先提示处理原请求。发布重试仍包含已回读发布状态但原请求未确认的成绩。
- grade-lost-response-browser-retest：版本 7 重放仍为 7，sameKey/sameInput true。
- grade-retry-conflict-browser：保存响应丢失重试版本 8 不变；并发请求先保存版本 9，当前请求 409，无自动覆盖；再次点击保存才生成版本 10。
- grade-retry-save-conflict-publish-browser 与 publication-retry-browser-diagnostic：发布错误已被捕获但弹窗未渲染错误，等待 alert 超时。已在现有提示区域显示 FormError；不新增页面布局或 CSS。
- grade-publication-retry-browser-retest：发布响应丢失后显示错误，原键重试返回同一版本 18，通过。
- grade-retry-typecheck-verified：最终 Portal tsc exit 0。补充原请求待确认的中英文文案。

后端源代码及协议未变，本轮不重复第十四次完整后端测试；本轮浏览器确实使用 Docker 后端。历史 92/92 不能替代本轮异常恢复验证。

继续项：多个学生批量发布中途失败与继续、浏览器刷新/重新登录后的未确认请求恢复仍需验证；客户端错误上报 /audit-logs/client-errors 在故障场景返回 404，尚待接线。完整三端业务矩阵及最终交接继续，不能宣布整体完成。
