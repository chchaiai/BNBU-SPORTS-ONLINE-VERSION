# 教师审核端到端修复（2026-09-08）

独立 Docker/PostgreSQL 运行 exercise-review.e2e.test.ts，runtime-conformance-hook 开启，最终 5/5、退出 0，日志 `docker-review-e2e-current-retest-20260908.txt`。随后后端完整单元回归 242/242、48 suites、退出 0，日志 `docker-review-fix-unit-regression-20260908.txt`。

本套件为教师 A/B、隔离机构教师 C、管理员建立已改密安全记录。管理员仍不具备审核权限；学生、管理员、其他教师和跨机构拒绝继续验证。

真实产品修复：旧审核路径允许非空 internalNote，0021 数据库 guard_v81_review_notes 按现行业务禁止新隐藏备注，写入触发异常后接口返回 500。normalizeReviewDecision 现在先对非空隐藏备注返回 VALIDATION_FAILED/422，空白仍按原归一化规则处理为 null。数据库保护未修改，也不删除历史。依据 docs/business/30-admin-flow.md 和 0021 的新审核禁止隐藏备注规则。

新增真实 HTTP 验证隐藏备注拒绝后 reviewRecord 仍只有原来 1 条、exerciseRecord.version 仍为 2；随后无隐藏备注的正常请求成功。正常历史断言改为 internalNote=null，公开说明保留。

5 项场景覆盖系统有效记录追加无效、有效审核与历史/重开/无效链路且时长事实不改、同键重放与并发旧版本、批量有序部分结果及重放、角色及机构隔离。这些历史路径测试使用未建立 V8.1 workflow 的 fixture，不替代新的材料版本/补交/事实纠正专项；重开也不代表 V8.1 已审核事实允许普通重开。

首次专项 `docker-review-e2e-current-first-20260908.txt` 为 4/5，500 响应校验失败保留。诊断 `docker-review-e2e-diagnostic-20260908.txt` 仍 4/5，临时 scores.processReviewChange 包装未收到错误，结合数据库隐藏备注触发器确认错误发生在审核写入阶段，而非成绩重算；临时诊断代码已移除。

本轮修复仅明确提前拒绝原本已被数据库拒绝的非法输入。原界面未改，持续浏览器后端尚未重建包含本修复。请求协议中旧 internalNote 字段的描述与其他旧模型仍需后续集中核对；完整 E2E 和三端总体验收继续。
