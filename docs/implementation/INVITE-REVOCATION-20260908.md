# 课程邀请码独立撤销

教师原有撤销入口现在调用 POST /class-sections/{classSectionId}/course-invites/revocations，提交当前邀请码，确认弹窗改为真实撤销说明，结构与 CSS 保留。请求使用固定幂等键，未确认失败可重试。撤销只影响指定邀请码，不再通过创建新码替代。

后端限制 NORMAL 模式、当前有效责任教师、同组织同教学班和完整令牌匹配。锁定教学班后修改邀请为 REVOKED，保留来源和历史，追加无令牌内容的撤销事件；不会修改已有成员。0055 迁移允许 TEACHER_REVOKED 没有替代邀请，保留原有轮换替代关系的要求及 ACTIVE/EXPIRED 约束。

本地验证：

- browser-invite-revocation-initial-20260908.txt 六项 PASS。实际浏览器建课、发布、生成邀请码、确认撤销；撤销前预览 200，撤销后预览 410；撤销前取得但未使用的入班凭证被拒绝 401；相同幂等请求重放结果一致；页面重新打开邀请弹窗显示生成入口。
- sql-invite-revocation-evidence-20260908.txt：持续浏览器数据库已应用 55 个迁移；测试邀请 REVOKED、无替代 ID、同班有效邀请码 0、撤销事件 1。
- docker-manual-invite-regression-20260908.txt：隔离测试库应用新迁移，人工审核/材料/学时/认证等主流程退出 0。
- Draft 协议静态检查 239 operations / 239 handlers / query 47 / body 117；Portal tsc 退出 0。
- 本机 backend build typecheck 最初使用旧 Prisma 生成物失败，见 local-invite-build-stale-prisma-20260908.txt。按现行 schema 重新 generate 后退出 0，见 local-invite-build-prisma-retest-20260908.txt；生成时只提供不连接的合成占位 URL，未访问云数据库。Docker 构建原本已自动生成并通过。

迁移安全旧检查器 check-migration-safety.mjs 固定只允许 0001—0020，执行失败已保存 migration-safety-legacy-allowlist-20260908.txt。这是尚待修正的检查器缺口，不能写成所有检查通过。

存档说明：现行 Prisma schema 生成物已在 c93529c6 单独同步。Prisma 7.9.1 原生生成注释和原始 Docker/SQL 日志含行末空格，原样保留；diff --check 对这些文件不通过，不能报告全仓空白检查通过。手写代码与协议单独检查。

范围限制：本测试使用合成账号、合成待入班身份和本地 Docker；没有验证真实学校数据。跨组织/其他教师撤销、撤销与入班并发、已经入班成员不受影响的独立场景、真实到期后的十分钟宽限场景仍需专项。当前代码的邀请状态检查会拒绝未消费凭证，但本次没有推进时钟模拟完整宽限期。学生完整相机提交和其他三端业务仍在实施。
