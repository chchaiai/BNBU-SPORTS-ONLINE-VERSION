# Stage 21 客户端能力合同与 GPS 默认拒绝报告（历史基线与当前剩余项）

历史快照日期：2026-08-05。当前对齐日期：2026-08-06。

> 本报告的“30 项全部 default deny、无 Prisma/Migration”结论只描述 2026-08-05 的合同登记快照，已由 ADR-097、ADR-098 和 `21-client-capabilities-local-integration-report.md` 取代。保留本文件是为了让历史 SHA 与当时验证可追溯，不得用它声称当前 30 项仍全部关闭。

## 交付范围

本阶段为 Android 学生端、Web 教师端和 Web 管理端补齐 30 个此前缺少的 operation，其中包含 6 个 GPS/位置隐私 operation。所有 operation 都有真实 NestJS 路由、输入 DTO、生成权限政策和 runtime coverage 记录。

冻结机器基线为 OpenAPI `1.1.0-contract`，SHA-256 `fb040b671e3f25c48279ad6b173ced5f633de1b1a1a9db0cc0f23a11e3fde4d1`；结构化记录见 `21-client-capabilities-contract-baseline.json`。

该历史快照的运行处置为：122 operations = 82 `IMPLEMENTED_VERIFIED` + 40 `IMPLEMENTED_DEFAULT_DENY`；0 `NOT_IMPLEMENTED`；0 `BLOCKED_BY_ADR`。当时新增 30 个 operation 均稳定返回 `SYSTEM_MODE_UNSUPPORTED`。

当前处置为：122 operations = 104 `IMPLEMENTED_VERIFIED` + 18 `IMPLEMENTED_DEFAULT_DENY`；0 `NOT_IMPLEMENTED`；0 `BLOCKED_BY_ADR`。Stage 21 的 8 个剩余 default-deny operation 为运动目录/折算 2 和 GPS/位置 6；另外 10 个 default deny 来自既有阶段。22 个已本地集成的 operation 及限制见新报告。

## GPS 安全结论

- 学生 GPS mutation 先绑定既有 ExerciseSession 所有权；不能给其他学生的 Session 写样本。
- 教师/管理员读取先绑定既有 ExerciseRecord 责任或组织范围。
- 原始 `latitude/longitude` 仅为 `writeOnly` 输入；公共响应没有原始坐标。
- 教师、管理员和学生将来只能取得相同的粗化摘要模型；精确起终点不进入 projection。
- 当前已有 GPS 持久化和应用层基础，但 6 个位置 HTTP operation 仍走 no-success default deny，因此 HTTP 请求不会写入位置事实。
- 位置采集、保留、删除、同意撤回与生产安全参数尚未批准，GPS Business/Privacy/Production Gate 均保持关闭。

## 持久化与迁移

2026-08-05 快照当时没有修改 `backend/prisma/schema.prisma` 或 Migration。当前已新增 forward-only `0011_client_capabilities` 并建立相关结构；已完成 Migration 仍不得修改。结构存在不表示对应 HTTP operation 已开放，更不表示生产事实已经获得业务验收。

## 验证范围

2026-08-05 快照曾通过：Unit 64/64、Contract 30/30、Security 41/41、新增能力轻量 HTTP route 2/2、strict typecheck、ESLint、Nest build、OpenAPI/permission contract、122-operation runtime coverage、generated artifact check、Prisma validate、Migration safety、from-empty schema diff、`npm audit --omit=dev`（0 vulnerabilities）和 `git diff --check`。这些数字不是当前代码的最终复验结果。

当时环境没有 `TEST_DATABASE_URL`、`MIGRATION_DATABASE_URL` 或 Docker 命令。当前本轮是否通过本地 PostgreSQL migration/E2E 以 `21-client-capabilities-local-integration-report.md` 和最终命令输出为准；无论本地结果如何，都不能据此关闭 Staging、Client Integration、GPS Privacy 或 Production Gate。

客户端页面到 operation 和后端文件的逐项对应见 `21-client-capabilities-operation-map.md`。
