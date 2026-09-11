# 学生通知失败恢复 2026-09-08

## 修改与验证

通知已读请求失败后，原实现恢复未读状态，但弹层内没有显示错误。断网浏览器验证在 FAILED_READ_VISIBLE 阶段失败。现复用既有错误组件在原通知内容区显示错误，保留弹层尺寸、列表和按钮布局；再次点击原通知可以重试成功。

全部已读原用 Promise.all 对当前所有未读通知同时写入，浏览器实测出现 HTTP 500。现逐条提交，继续处理其他通知，失败项保留未读供再次点击“全部已读”。用管理员真实反馈回复产生新通知后，验证一次人为断网导致一项失败，其他项成功；重试只写入剩余项，成功项没有重复提交，最终未读列表为空、按钮禁用、弹层错误清除。

- student-notifications-retry-browser-20260908.txt：原错误提示缺失，退出 1。
- student-notifications-retry-browser-retest-20260908.txt：单条失败恢复通过，退出 0。
- student-notifications-batch-browser-20260908.txt：原并发批量出现 500，退出 1，原证据保留。
- student-notifications-batch-browser-diagnostic-20260908.txt：重试前未读夹具不足，退出 1；不作为产品回归失败。
- student-notifications-fixture-replies-20260908.txt：管理员四次正式公开回复操作通过，补充合成未读通知。
- student-notifications-batch-browser-retest-20260908.txt：单条及批量部分失败恢复通过，4 项成功写入，退出 0。
- student-notifications-client-regression-20260908.txt：客户端回归 5/5，退出 0。

## 剩余依赖

浏览器测试连接现有本地 Docker 后端、PostgreSQL、Mailpit，使用合成账号；产品后端本轮未改。原并发 500 的底层原因未定位，逐条提交后的通过不证明后端任意并发稳定。失败时诊断上报 /audit-logs/client-errors 返回 404，仍待处理。通知跨页、其他类型跳转、刷新中的未确认请求及云端环境未由本轮覆盖。

复现脚本 tools/local-integration/v81-student-notifications-retry-browser-probe.mjs 需要至少三条未读通知，成功后会正式标为已读；不要对真实账号运行或假定可无准备地重复执行。