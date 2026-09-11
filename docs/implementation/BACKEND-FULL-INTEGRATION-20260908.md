# 后端完整集成测试（2026-09-08）

新增独立 Compose `tools/local-integration/compose.v81-full-integration.yml`，项目 bnbu-v81-full-integration。PostgreSQL 18.4 使用 tmpfs、不发布端口、独立内部网络；测试容器共享其网络空间，使既有严格测试连接校验仍指向 127.0.0.1/bnbu_sports_test，不放宽清库保护。使用忽略的本地环境密码，不进入仓库。持续浏览器和 v81_runtime_test 均未被清空。

57 个迁移成功应用，证据 `full-integration-migrations-20260908.txt`；启动日志 `docker-full-integration-db-20260908.txt`。完整构建后执行 npm run test:integration。

首次 57/59 通过，见 `docker-backend-integration-full-first-20260908.txt`。两项旧预期经当前权威来源核对后更新：

- 系统模式：docs/business/30-admin-flow.md 要求正常/维护，0021 迁移约束也仅接受 NORMAL/MAINTENANCE。将原 READ_ONLY 成功断言改为 MAINTENANCE，并新增 READ_ONLY 拒绝断言，保留非法值及事务回滚验证。
- 名单身份：docs/business/00-overview.md 要求保留重号/身份冲突。测试输入含同学号不同姓名，当前确定性算法输出 DUPLICATED；补入期望分类，原私有源文件、冻结快照、历史和回滚断言保留。

第二次复测 58/59，`docker-backend-integration-full-retest-20260908.txt`：名单后续旧断言仍要求重复组没有结果。改为要求一条 DUPLICATED 结果，且 studentId/enrollmentId 都为 null，避免把重复组误作匹配身份。最终复测 `docker-backend-integration-full-final-20260908.txt` 退出 0，59/59、12 suites 全部通过。仅测试配置/断言更新，产品及布局未修改。

独立临时数据库保持运行供后续测试使用，停止容器将清除其 tmpfs 数据。完整 E2E、Draft 协议诊断和三端业务覆盖仍需继续；本测试层通过不等于真实云端或三端全范围验收。
