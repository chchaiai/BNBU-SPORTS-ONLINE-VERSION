# 结算检查补全已结束但首次材料未提交的运动

依据教师业务 §5.3/§13：关闭前展示已有合法会话和首次材料未受理事项；结算前必须处理会话、材料与其他待办。现有 course-settlement.tsx 已在课程管理详情、关闭区域上方显示 ACTIVE_SESSION / UNSUBMITTED_RECORD 等检查。

本次发现真实遗漏：FINISH 接口将 exercise_sessions 状态改为 COMPLETED，但尚未创建 exercise_records。旧 UNSUBMITTED_RECORD 只统计 DRAFT 记录，导致该合法未提交运动从待办中消失。Docker 实际 HTTP start/recovery/pause/resume/reconcile/finish 后查询 settlement-check，返回 CLEAR/0，而应 BLOCKED/1；原始失败见 unsubmitted-session-first-20260909.txt。

修复：未提交计数 = 现有 DRAFT 记录数 + COMPLETED 且不存在关联记录的会话数。已经有记录的会话不重复计数，取消会话不计入；不改变会话、记录、期限或原历史。现有结算检查和预览共用此服务，课程截止提醒也使用此待办来源。无迁移、接口形状或 UI 改动。

exercise-session.e2e.test.ts 在真实完成后验证 ACTIVE_SESSION=0、UNSUBMITTED_RECORD=1、尚无记录；取消用例验证未提交计数为0。原失败保存后允许修复。当前长期未提交会话仍保留待办，本轮没有发明自动失效/截止清理规则；用户若放弃材料后的终结策略需依业务规则另核对。

第38次全量Docker：类型检查通过，99/99 E2E、25套件、0失败/跳过，130497.325004 ms；219/219启用成功与253/253错误/权限覆盖，34项明确关闭。证据 docker-backend-e2e-thirtyeighth-20260909.txt、runtime-conformance-thirtyeighth-20260909.json/.md。新增断言位于既有会话测试内，因此总测试数仍为99。本地联调后端重建日志 unsubmitted-session-browser-rebuild-20260909.txt。
