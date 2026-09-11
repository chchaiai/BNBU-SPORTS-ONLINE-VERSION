# 进度边界与第十四次 Docker 全量回归（2026-09-08 22:30）

基于 036e96b0，本轮修改：
- 未发布规则课程取消虚构的 10/10h 目标；保留是否已配置、进度是否可用的状态。现有进度组件在不可用时显示破折号和提示，保持 DOM/CSS/布局。课程概览显示尚未发布规则。
- 新进度入口分页测试覆盖两条报名分两页、不重复不遗漏、limit 超限、改变 limit 后复用游标及同校/跨校账号复用游标被拒。
- 认证审批后 7200 秒及撤销后 0 秒，教师和学生完整进度对象逐字段相等。
- 增补进度与最终成绩静态中英文文案。

验证：
1. docker-progress-boundaries-20260908.txt：Docker E2E 11/11。
2. progress-unconfigured-typecheck-final-20260908.txt：新增英文词条与既有“未录入/录入成绩”重复，TS1117；删除新增重复键，保留既有翻译。progress-unconfigured-typecheck-retest-20260908.txt 为最终复测。
3. progress-unconfigured-browser-20260908.txt：中文课程概览通过；bilingual 初测及 diagnostic 在打开弹窗时点击遮罩下语言按钮超时；脚本关闭弹窗后切换语言并重开，bilingual-retest 中英均通过。保留原始失败，不修改产品遮罩行为。
4. docker-backend-e2e-full-thirteenth-20260908.txt：91/92，匿名访问测试固定预期 234 个受保护接口，实际新增为 235，未进入逐接口检查导致运行覆盖门禁亦失败；runtime-conformance-thirteenth 保存失败。
5. 更新匿名接口数量断言为 235，保留全部逐接口 401 校验。
6. docker-backend-e2e-full-fourteenth-20260908.txt：92/92、25 suites、123.25 秒（不含构建）；运行契约 216/216 enabled successes、250/250 error/access、34 default-deny，门禁通过。日志两次门禁输出是同一报告重复检查，不是两次测试。

本轮数据库仍 57 迁移，无新增数据库迁移。Docker 为隔离 PostgreSQL 和本地模拟外部提供者，浏览器使用已有本地 Docker 后端；不证明腾讯 COS、云 SMTP 或生产 OCR 模型已验证。

剩余：未配置课程有真实成员时的列表不可用显示尚无专门浏览器案例；成绩版本冲突、响应丢失、多学生部分发布及动态英文消息待验证。需要按现行业务四文档更新整体验收矩阵，补齐所有三端动作，而非用全量后端测试替代网页验收。正式契约发布配置/历史兼容性、云依赖和最终交接仍未完成。
