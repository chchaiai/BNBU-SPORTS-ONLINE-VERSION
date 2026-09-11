# 结算后最终成绩更正

2026-09-09。按照 docs/business/20-teacher-flow.md 第 12.3 节，结算后只能更正旧事实，原因用于审计，原成绩及原报告不覆盖。使用既有成绩弹窗加入结算后更正原因和内部发布状态，没有修改全局布局、样式或学生成绩可见性。

实现：打开成绩弹窗读取本人课程结算报告状态，加载完成前禁止保存；未结算继续普通草稿接口，已结算通过 final-grades/corrections 保存。结算后无既有成绩时不允许补造新事实。批量发布已结算课程时提示到对应学生弹窗逐条填写更正原因。接口权限、结算前原成绩存在性及事务报告生成继续由现有后端校验。

原请求恢复记录增加 correctionReason，按用户隔离保存在 sessionStorage；原成绩、发布状态、更正原因、预期版本和幂等键一起恢复，不把丢失响应当作未写入。确定的状态/版本冲突及校验失败会清除待确认请求，允许核对后重新操作。

Docker 本地浏览器 PASS：独立合成课程通过真实接口确认名单、保存体测、保存并发布原成绩 80、执行首次结算；浏览器空白原因拒绝，更正为 91 并发布；实际 201 被丢弃后刷新并原键重放，返回相同成绩 v2；成绩历史完整保留，结算 v1 完整对象不变，仅生成结算 v2，原因与成绩版本关联正确；再次刷新显示 91。证据 final-grade-correction-browser-20260909.txt，脚本 tools/local-integration/v81-final-grade-correction-browser-probe.mjs。

4/4 待确认请求持久化检查及完整 Portal typecheck 通过，日志 final-grade-correction-intents-20260909.txt、final-grade-correction-portal-typecheck-20260909.txt。后端实现未改动，第 24 次 Docker 全量后端回归仍为对应实现证据。

保留失败：首次种子调用错误使用 Node strip-types，无法将 Prisma 的 .js 导入映射至源码 .ts，在写库前失败；改用容器已有 tsx 后创建成功，见 final-grade-correction-fixture-20260909.txt。普通成绩旧浏览器脚本首次在登录工作台阶段失败，原日志 final-grade-normal-after-correction-browser-20260909.txt 保留；改为 45 秒等待，并按目标教学班在后端列表中的位置定位，消除多个教学班同课程名称的问题。

普通成绩录入、发布、刷新回读复测 PASS：整数范围校验拒绝 1.5，允许 INT 值 123，草稿 v1、发布 v2，刷新保留 123；证据 final-grade-normal-after-correction-browser-retest-20260909.txt。

依赖与边界：本次合成课程已结算，尚未归档；教师 CLOSED/ARCHIVED 历史课程入口及管理员成功学期归档的整体验证仍待完成。没有上线、推送或外部腾讯服务验收结论。
