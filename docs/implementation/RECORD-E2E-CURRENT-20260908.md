# 运动记录提交端到端复测（2026-09-08）

独立 Docker/PostgreSQL 构建后运行 exercise-record.e2e.test.ts，runtime-conformance-hook 开启，最终8/8、退出0，日志 docker-record-e2e-current-verified-20260908.txt。

前置流程经真实HTTP完成管理员模板发布、教师课程规则发布、总管理员开启人工审核模式。使用30分钟门槛、两类各600分钟的明确合成配置，准备完整每日时段；已改密账号只用于此套件。媒体与已完成会话仍为数据库fixture，不代表在此测试了相机拍摄/对象存储传输。

按当前规则更新旧预期：

- 提交后SUBMITTED/PENDING，等待教师，不自动VALID；材料绑定和同键重放保留。
- 29分59秒低于30分钟门槛，允许提交并保留记录，creditedDurationSeconds为0。依据docs/business/00-overview.md第11节及domain规则；原59分59秒不足一小时即拒绝的预期过时。
- 同日两条真实运动都可提交进入PENDING_TEACHER，各有材料及PENDING审核记录，不抢占旧daily slot。该项不证明审核后每日有效计入上限，计入算法专项仍需单独核对。
- 完整材料集合、未选中的处理中材料不阻止提交、重复草稿冲突、草稿丢弃追加历史、撤回拒绝无副作用等原有检查通过。

失败证据：first文件记录测试密码常量漏导入；retest为4/8，暴露自动有效、一小时门槛、同日提交限制旧预期；final为7/8，29分59秒旧拒绝预期；verified为8/8。四份文件均使用docker-record-e2e-current-前缀及-20260908.txt后缀，保留不覆盖。

本轮仅测试与证据改动，产品及UI未改。旧成绩套件、完整E2E与全接口覆盖、Draft协议及三端总体验收继续。
