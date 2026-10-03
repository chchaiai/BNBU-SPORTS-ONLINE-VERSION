# 管理端学生批量操作发布

- 发布日期：2026-09-29
- 页面：https://www.teacher.bnbusports.cn/#admin/accounts
- 新增：批量要求重新完善、批量开放第二个班级；复用当前页/全部筛选结果勾选。
- 确认窗口固定名单和统一原因，逐人顺序处理，显示成功/失败/跳过，支持停止和继续。同一请求编号用于结果未确认后的重试。
- 开放第二班仅授予当前学期名额，学生仍需邀请码入班；已开放或无当前学期跳过。权限沿用现有总管理员批量工具栏。

## 验证

- TypeScript 检查、生产构建通过。
- 新增 10 项批量逻辑测试全部通过。全量 156 项，153 通过，3 项失败与 profile-correction-20260929 基线完全一致，详见 validation.json。
- 12 人虚构名单：第二班 10 完成、2 跳过；完善资料停止后继续 10 完成；模拟失败后同一请求编号重试成功；空原因禁止提交。确认单一弹窗和 390px 窄屏布局。
- 在线只读验收：1170 人筛选结果显示两个新增按钮；当前页 10 人的完善资料确认窗口可打开/取消；第二班确认正确显示处理 9 人、跳过 1 人；最终取消并清空选择。
- 未对真实学生提交批量更新。真实业务写入仍待管理员按实际名单使用验收。
- 浏览器测试中发现相邻组件 key 冲突导致重复弹窗，已修正并通过重新测试。

## 部署

- 当前 release：/opt/bnbu-sports-production/releases/student-bulk-actions-20260929
- Portal 镜像：sha256:3ac5d8e94603c5ed21bcd5c001324225ff7c10e189ad143a81f571e429292cb9
- 上一版：/opt/bnbu-sports-production/releases/profile-correction-20260929
- 热切换及健康检查通过，193 项新旧资源校验通过；Backend 容器和学生页面保持原基线。
- 发布脚本：tools/production/deploy-student-bulk-actions-20260929.py
- 服务器发布目录：/home/ubuntu/student-bulk-actions-20260929
- 回滚命令：sudo python3 /home/ubuntu/student-bulk-actions-20260929/deploy.py --rollback
- 不涉及数据库迁移。
