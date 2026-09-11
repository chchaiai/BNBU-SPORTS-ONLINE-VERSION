# 成绩 HTTP E2E 现行业务校准（2026-09-08）

依据 docs/business/20-teacher-flow.md 第 318 行：责任教师录入、修改和发布 INT 最终成绩，不限定 0—100，不需管理员批准；发布只形成内部版本，学生不展示成绩，不设成绩备注。

将旧双管理员审批测试替换为三个现行业务场景：草稿/发布历史与相同幂等键重放；并发版本冲突、权限与非法输入；旧管理员成绩规则入口拒绝且无规则新增。学生记录在发布前后保持一致，不含成绩字段。

失败证据按执行顺序保留：
- docker-score-e2e-current-first-20260908.txt：旧管理员创建规则预期 201，实际按权限返回 403。
- docker-score-e2e-current-retest-20260908.txt：新测试编号过长，数据库拒绝；缩短合成编号。
- docker-score-e2e-current-final-20260908.txt：辅助函数未返回 enrollmentId，测试构造无效路径；改读入库运动记录的 enrollmentId。
- docker-score-e2e-current-verified-20260908.txt：2/3 通过，跨教师访问正确返回 404，但 OpenAPI 未声明。为成绩历史、写入和更正三个操作补充 NotFound，重新生成协议产物。

最终结果见 docker-backend-e2e-full-third-20260908.txt。本次未修改产品界面、数据库约束或成绩权限。归档后成绩更正由既有专项验证承担，本测试没有把旧审批功能恢复为当前业务。
