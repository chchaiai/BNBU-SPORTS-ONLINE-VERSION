# Portal 完整 Docker 检查复测（2026-09-08）

完整 `npm run typecheck`：`docker-portal-full-gate-current-20260908.txt` 退出 0，包含仓库现配网页快照校验、Phase 5B 合约绑定与两份生成物检查、三份 tsconfig 编译。历史 Phase 5B SHA 失败不再重现；此门禁检查既有 1.2.0-contract 绑定，不替代 V8.1 Draft 全量协议检查。

首次 `npm test`（含生产构建）退出 1，127 项中 122 通过、5 失败，保留 `docker-portal-full-tests-current-20260908.txt`。核对当前源码后确认旧断言与已完成接线不符：

- 教师队列现在同时显示服务端 pending 与 invalid；用户已选择人工审核闭环，旧“新提交待 AI 初审”文案断言失效。
- 管理员课程目录已改用 `/admin/course-directory` 服务端聚合；旧断言要求网页逐课程读取成员/记录并过滤 CLOSED/ARCHIVED，不能再代表当前责任边界。
- 分管理员已通过真实邮箱身份挑战、核验和建号接口；旧占位提示文案不再存在。

相应更新三份测试，仍检查待办状态来源、必填字段及标签、公开原因、纠错接口、内部成绩不披露、目录读取与状态类型、OTP 验证结果传入建号。测试更新不替代已有 Docker 权限/目录/人工审核业务测试。产品源码及布局未改。

本机受影响测试 35/35 通过（`portal-gate-targeted-first-20260908.txt`）。重新构建 Docker 镜像后完整 `npm test` 127/127 通过，退出 0（`docker-portal-full-tests-retest-20260908.txt`）。另运行 `npm run test:v81` 通过，退出 0（`docker-portal-v81-tests-current-20260908.txt`）。编辑准备时曾因工作目录与相对路径组合错误导致命令未执行，随后修正路径；未更改仓库外文件。

这些结果证明当前 Portal 工程检查与所列测试通过，不证明三端所有真实业务已验收；V8.1 Draft 既有 391 项诊断、完整功能覆盖及外部依赖仍待处理。未执行云端操作。
