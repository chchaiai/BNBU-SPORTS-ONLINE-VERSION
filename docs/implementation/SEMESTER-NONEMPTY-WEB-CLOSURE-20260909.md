# 非空学期网页结算、切换和归档回读

2026-09-09，现有本地 Docker 后端及 v81_browser_test 内独立的 BNBU-TESTSWITCH 合成组织。原联调组织和当前学期保持原值。账号及夹具标识只存忽略目录 .local/v81-browser-state/semester-switch-browser.json，不在交接复制凭据。

前提：该新组织的旧当前学期为 2025–2026 SUMMER，2026-08-01 至 2026-09-08，一门课程、一名学生。其他基础合成课程在首次业务前归入该组织原历史学期，未删除课程或把未结算课程冒充已结算。已到期课程规则和名单文件来源为明确合成前提；名单确认、原始体测 270 秒和内部成绩 80 由真实 API 写入，未直接植入结算报告或成功切换结果。

首次网页闭环 PASS（semester-settled-switch-browser-20260909.txt）：
1. 管理员在原学期页面新增 2026–2027 FIRST，2026-09-09 至 2027-01-31。
2. 尚未结算时预检显示“仍有课程未结算”，确认切换禁用。
3. 责任教师在原课程弹窗确认综合名单并执行结算，真实后端生成 v1。
4. 管理员重新预检，后端 totalCourseCount=1 且全部条件满足，网页确认切换。
5. 实际 201 响应被测试脚本丢弃，刷新页面恢复原请求和幂等键，重试返回完全相同结果。
6. 管理员回读原学期 ARCHIVED、新学期 CURRENT，只有一个 CURRENT；教师课程显示原学期名称和“已归档”，设置不可写，原结算报告完整对象保持不变。

归档后更正 PASS：archived-semester-grade-correction-browser-20260909.txt 验证内部成绩 80→91、原因必填、201 丢失后刷新原键恢复，成绩 v2/报告 v2，旧成绩和原报告保留。archived-semester-physical-correction-browser-20260909.txt 验证原始体测 270→271 秒、原因必填、原键恢复，体测 v2/报告 v3，旧报告保留。

归档历史与下载复查 PASS（semester-archived-history-export-browser-20260909.txt）：实际下载 v1 XLSX，文件名与 PK 文件头正确，原 v1 后端报告对象逐字段未变。该复查没有重做学期切换，输出 unsettledGate/lostResponseReplay=false，如实区分首次业务验证。管理员学期表与教师归档报告区截图已查看，截图保留在忽略目录 semester-switch-admin.png、semester-switch-teacher.png。

本轮仅增加本地测试与交接，不改产品代码或布局；后端版本仍对应第 26 次 Docker 97/97 与 252 操作覆盖结果。保留 58 迁移，无云端变更。准备命令见 seed-v81-semester-switch-browser.mjs，必须用容器已有 tsx 执行；脚本校验专用数据库及合成组织代码。

剩余工作：关闭前已有运动、首次材料、一次补证、名单/OCR、免测/认证等网页合法收尾分支；完整权限和各页面失败恢复边界按 ACCEPTANCE 继续核对。腾讯实际服务与生产配置仍为外部依赖，不据本次结果宣称全范围或上线完成。
