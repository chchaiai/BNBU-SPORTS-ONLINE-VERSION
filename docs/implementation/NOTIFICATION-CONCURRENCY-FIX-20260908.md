# 通知并发事务修复 2026-09-08

## 根因与最终修改

Docker PostgreSQL 中 24 条不同通知并发已读复现 SYSTEM_INTERNAL_ERROR。安全诊断显示两类同源冲突：Prisma P2034，以及提交阶段直接抛出的 DriverAdapterError，其 cause.originalCode 为 40001。原重试识别遗漏后一种，并且三次即时重试容易再次同时竞争。

共享幂等事务服务现在识别明确的直接驱动 40001，在事务已回滚并释放连接后加入有上限的随机退避，最多八次尝试。保留 Serializable 隔离、原请求键、加密结果回放、失败回滚，以及调用方关闭序列化重试的既有开关。唯一约束与连接故障不因本次修改被归为序列化重试。

未知 HTTP 错误增加安全诊断：只记录 requestId、限定错误类型、数据库错误码/SQLSTATE 和固定分类布尔值，不记录请求正文、SQL、凭据或异常原文。接口仍使用原公开错误信封。

## 证据

- docker-notification-concurrency-20260908.txt：原实现并发失败，退出 1。
- docker-notification-concurrency-diagnostic-20260908.txt：P2034 诊断，退出 1。
- docker-notification-concurrency-retest-20260908.txt：仅退避仍遗漏直接驱动异常，退出 1。
- docker-notification-concurrency-diagnostic-second-20260908.txt：一次通过，不能证明间歇问题已修复。
- docker-notification-concurrency-repeated-20260908.txt：重复验证复现 DriverAdapterError，退出 1。
- docker-notification-concurrency-adapter-diagnostic-20260908.txt：明确 SQLSTATE 40001，退出 1。
- docker-notification-concurrency-fixed-20260908.txt：最终识别修复后基础单元 16/16；24 条并发连续三轮通过。每条版本为 2、同键回读时间一致，事件/审计/outbox 各一条。
- docker-browser-notification-backend-rebuild-20260908.txt：更新本地浏览器后端，随后 docker inspect 确认为 healthy。
- notification-concurrency-browser-fixtures-20260908.txt：四次管理员公开回复产生合成未读通知。
- notification-concurrency-browser-recovery-20260908.txt：更新后浏览器单条断网重试与批量部分失败恢复通过。

本次不改变 UI、协议操作数量和数据库结构。旧失败记录保留。并发测试证明上述负载和事务事实，不是生产容量或任意负载保证。诊断上报 /audit-logs/client-errors 的 404 尚待处理，云端依赖及三端其他未验收项继续保持待办。