# 用户授权修复后的首批复测

用户已明确答复“允许修复”，从本轮起可以修复已记录问题并另存复测证据。旧失败日志保留，业务歧义仍待答复。

1. Compose 显式指定继承来源 compose.v81-test.yml，修复 backend-startup 无法找到。实际启动后发现内部网络未发布宿主机端口；浏览器覆盖配置增加 browser-access 桥接网络，后端、MinIO、Mailpit 继续仅发布到 127.0.0.1，PostgreSQL 保留内部网络。
2. getV81SemesterSwitchCheck 映射到 SEMESTER_MANAGE。docker-semester-switch-check-fix-20260908.txt 退出 0：学期创建/编辑、历史、角色/组织/权限撤销及切换预检查日期/分页/共享阻塞/无写入断言通过。正式结算来源仍不可用，不代表切换归档已实现。
3. 协议检查器读取数组 items 的枚举，保留枚举差异检测。真实 schema 提取路径新增匹配与不匹配断言，原检查器自测 6 场景通过；parity-array-enum-fix-20260908.txt 退出 0，232 操作/处理器、47 查询、110 请求体通过，无新增静态例外。

持续后端实际在独立 v81_browser_test 应用 52 项迁移并建立合成账号、规则模板、已发布课程及人工审核模式。重新创建容器后复用已有状态，宿主机 /api/v1/health/live 和 /health/ready 均 200，见 browser-ready-fix-20260908.json。MinIO 19000 和 Mailpit 18025 也由宿主机访问得到 200。

此前首次宿主机探测失败但容器内 healthy，仅内部网络时 HostConfig 有映射、NetworkSettings.Ports 为空；修正网络后 docker port 显示 127.0.0.1:3199。不能用容器健康替代宿主机连接证据。

后端入口 http://127.0.0.1:3199/api/v1；合成账号记录仅保存于忽略路径 .local/v81-browser-state/ACCOUNTS.local.md，未输出密码或提交该文件。当前测试容器保持运行供后续联调。未启动网页服务器，未完成真实浏览器业务验收。

并行运行独立专项时应在依赖已运行后使用 run --no-deps，或始终合并浏览器覆盖配置，避免基础 Compose 重建依赖并移除宿主机端口。不得输出展开后的含密钥 Compose 配置。

这些复测关闭上述配置/权限/枚举检查问题，不关闭其他 CSV、OCR、账号清理、夹具等失败。三端完整目标仍未完成。未更改前端 UI/UX。

存档检查：明确暂存15个文件；git diff --cached --check退出2，仅三个原始Docker日志的尾随空格，保留输出并记录未通过。
