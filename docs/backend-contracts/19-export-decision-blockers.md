# Stage 19 Export 决策阻塞

日期：2026-08-04。

## 结论

当前 ACCEPTED ADR 与权威 OpenAPI **不足以实现真实 Export Core**。`docs/backend-contracts/openapi.yaml` 明确写明 V1 不持久化 `ExportJob`、四个 Export operation 返回 `SYSTEM_MODE_UNSUPPORTED`，`ExportStatus` 仍是 `x-unresolved: EXPORT_GATE` 的开放模式。因此 Stage 19 不创建 ExportJob、artifact、worker 或假成功文件，Export Business Gate 保持“否”。

Stage 18 已冻结的唯一可复用输入规则是：未来 Score Export 只能绑定 `PUBLISHED`/`LOCKED` revision，不能读取 working revision，必须冻结 revision/rule/version/fingerprint，且旧 artifact 不随后续 Score/Review 变化。这些规则不足以决定下面的实现参数。

## 尚未批准的必要决策

1. ExportJob/Artifact/Attempt 的正式持久化模型与状态闭集。
2. 每个 `ExportType` 的精确语义、字段白名单和允许角色。
3. artifact 格式；不得擅自选择 CSV、XLSX、PDF 或其他格式。
4. artifact 生命周期、失败终态、重试与恢复语义。
5. private object storage bucket/prefix、独立身份和最小权限。
6. 下载授权、签名 URL TTL 与是否需要二次认证。
7. retention、清理、legal hold 与失败半成品处理。
8. production worker 并发、lease、重试上限和 dead-letter 行为。

这些内容同时受 Export Gate 与未批准的 Production 参数约束；本阶段不把推荐值写成 ACCEPTED ADR。

## Stage 19 安全处置

- `listExports`
- `createExport`
- `getExport`
- `createExportDownloadUrl`

四条真实路由均执行认证、生成的 operation policy、角色限制与 DTO/path 校验，然后稳定返回 `SYSTEM_MODE_UNSUPPORTED`。它们不创建 ExportJob、artifact、对象、AuditLog 成功事实、Outbox 或 signed URL，不返回假空数组，也不使用通用 404 冒充实现。

Backend Operation Coverage Gate 可以凭真实 default-deny 证据闭合；Export Contract/Persistence/Snapshot/Worker/Private Artifact/Business Gate 均保持“否”。
