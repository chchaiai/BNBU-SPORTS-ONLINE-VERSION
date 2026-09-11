# 第 30 次 Docker 全量回归

2026-09-09。保留容器 `bnbu-v81-e2e-thirtieth-20260909`，使用隔离 PostgreSQL、Mailpit、MinIO。

先执行 Prisma migrate deploy，实际应用 0059_v81_recognition_adjustment，再运行完整 E2E。97/97、25 suites、0 fail/skip，128118.312292ms；219/219 启用成功、253/253 错误/权限响应、34 fail-closed，严格运行协议校验通过。

新增覆盖：已批准认证调整的非责任教师/学生拒绝、首次改密后资源越权 404、空原因/非整数/超限分钟 422、关闭后调整、旧版本拒绝、原键重放、不可改写原申请事实、学生/教师进度一致、历史保留及后续撤销。未替代结算/归档后认证更正等剩余业务。

证据：docker-backend-e2e-thirtieth-20260909.txt、runtime-conformance-thirtieth-20260909.json/.md。此前第 28 次 96/97、第 29 次 95/97，失败及修复原因见 RECOGNITION-ADJUSTMENT-20260909.md。

后续覆盖 compose 的 command 时必须保留 `node node_modules/prisma/build/index.js migrate deploy` 在测试前执行。仅 `npm run test:e2e` 会构建但不会部署新迁移；旧回归库不能作为当前迁移的完成证据。

当前候选 253 操作、59 迁移；正式发布及云端验收未完成。原始输出空白保留，所有操作本地执行。
