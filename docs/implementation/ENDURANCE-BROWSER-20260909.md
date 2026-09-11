# 换算表网页保存与错误提示

2026-09-09，真实 Portal localhost:3300 连接本地 Docker API/PostgreSQL 合成组织。原编辑弹窗仅修改备注，未改换算区间、分数或布局。

发现并修复：AdminStore 的 clearError 每次上下文变化都会创建新函数，RuleDialog 的卸载清理 effect 因依赖变化而执行，使刚写入的错误状态立即清空。改为 useCallback 稳定函数引用；现有错误提示区域现在保留错误直到重试或关闭。

验证脚本 `tools/local-integration/v81-endurance-browser-probe.mjs`：

- 实际管理员登录、全局规则首行编辑、服务器提交后主动丢弃响应；弹窗错误可见。
- 原保存按钮重试两次 HTTP 使用同键，返回相同表版本 7，没有重复修订。
- 整页刷新回读新备注，原弹窗保存恢复原备注，均通过。只留下正常不可变修订历史。
- 异常退出时，脚本只在当前备注仍等于本次唯一测试标记时通过最新 expectedVersion 恢复，避免覆盖其他变化。

证据：`endurance-browser-fixed-retest-20260909.txt` PASS；`endurance-browser-typecheck-20260909.txt` 为 Portal `npx tsc --noEmit -p tsconfig.json` exit 0。

失败全部保留：`endurance-browser-20260909.txt` 标签未关联导致备注定位失败（未写入）；`endurance-browser-retest-20260909.txt` 预期网络文字超时；`endurance-browser-retest2-20260909.txt` 错误区域消失超时并促成上述缺陷定位。`endurance-browser-fixed-20260909.txt` 修复后测试过早把 textarea 的文字视为完成，未等到重试响应即断言；最终脚本等待弹窗关闭再断言。各次实际写入后的失败均恢复原备注。

本轮只证明编辑备注、同页面丢响应重试、刷新回读和错误提示；不代表增删区间、跨刷新未确认写入恢复、所有弹窗、跨组织或教师历史换算事实验收。后端业务未修改，最新完整 Docker 后端仍第二十轮 97/97，不将本次浏览器专项当作全量重跑。
