# 后台期末提醒到网页验收

## 结果

实际后台定时任务为测试学生和责任教师各生成一条 `COURSE_DEADLINE_REMINDER`。学生通过 Mailpit 邮件验证码登录，在原通知详情查看常规截止和剩余 1200 分钟；教师通过原通知入口打开对应课程设置，读取该课程的收尾检查。数据库回读确认两条通知已读、目标准确。

## 证据

- [后台生成与重扫](live-reminder-seed-first-20260909.txt)：两个实际系统审计事件，操作人为空，12 秒后重扫未重复生成通知。
- [网页首次运行](live-reminder-browser-first-20260909.txt)：学生读取成功，教师打开准确课程后，脚本误把班级编号当成弹窗课程名称，断言失败。页面标题实际按课程目录名称显示；保留失败日志。
- [网页复测](live-reminder-browser-retest-20260909.txt)：学生通知详情、教师准确 `classSectionId` 的收尾检查及原课程设置弹窗通过。
- [独立数据库回读](live-reminder-readback-20260909.txt)：两条通知均已读且目标不变。

脚本为 `seed-v81-live-reminder-browser.mjs`、`v81-live-reminder-browser.mjs`、`verify-v81-live-reminder-browser.mjs`，均在 `tools/local-integration`。私有测试账号与通知定位信息在忽略目录 `.local/v81-browser-state/live-reminder.json`；不归档凭据。

## 范围

临近截止的历史课程安排是明确标注的数据库夹具，通知由运行中的后台任务自行生成，测试没有插入通知或直接调用提醒处理器。此证据不覆盖从网页首次发布新课程，也不代表真实学校数据或云端邮件服务验收。

本轮只增加测试与交接记录，没有修改产品代码或 UI。最新完整后端回归仍为第 41 次 101/101，通过证据见 MAKEUP-DEADLINE-FIX-20260909.md。与补练分段网页证据合并，补足学生主流程第 10 项和教师第 9 项的本地提醒/补练操作证据。
