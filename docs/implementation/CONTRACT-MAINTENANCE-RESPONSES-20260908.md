# 维护与服务不可用响应契约（2026-09-08）

基线 f751dc8e。SystemModeGuard 对除健康探针/OPTIONS 外请求读取组织或公开策略；默认仅 NORMAL，显式允许 MAINTENANCE 的接口仍可能因策略缺失、组织不可用或公开模式不一致返回 SYSTEM_SERVICE_UNAVAILABLE 503。依据实际 guard/service 补齐 51 个写接口的 ServiceUnavailable 声明，不改变维护白名单或服务端权限。

check-system-mode-responses 改用 YAML parseDocument 和结构化状态键读取，支持单引号、双引号、无引号及别名；保留默认只读/--write 明确写入，缺响应块拒绝。共享检查函数及两项测试纳入默认契约检查，验证各种引号/别名、四种写方法、缺块拒绝。没有通过格式匹配绕过缺少503。

生成及249操作/handler对应检查通过。Docker系统管理5/5通过，约6.34秒不含构建，日志docker-maintenance-responses-20260908.txt。脚本重构后独立Docker两项检查器测试及当前响应全覆盖检查通过，日志docker-maintenance-checker-20260908.txt；容器将工具依赖路径链接至已有backend node_modules以读取yaml，未修改宿主依赖或凭据。两次退出均0，未执行新的全量，最新全量仍第十二轮92/92。

完整contract:check已推进至兼容性：基础契约、维护响应、既有勘误和OpenAPI lint通过。lint保留72条warning、5项明确忽略，不能称无警告；兼容性夹具7/7通过。随后失败：Published 2.0.11-contract snapshot hash mismatch，日志contract-maintenance-retest-20260908.txt。现有release-config仍为2.0.12-contract/published，当前实现为3.0.0-v81-local-draft，不能通过重写已发布哈希或将草稿标成发布来消除错误。接下来核对来源和当前草稿/发布校验适用边界，发布门禁尚未通过。

未改UI或运行时业务。三端当前浏览器复验、全业务矩阵与最终交接继续。
