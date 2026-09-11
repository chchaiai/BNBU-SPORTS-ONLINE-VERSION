# 通知来源与导航验收边界核对

2026-09-09。核对 backend/src/modules 内 notification.create/createMany 和 INSERT INTO notifications，另查迁移中的写入与触发器，排除种子、测试、审计 targetType 和生成客户端。通知表迁移有约束/变更保护、索引，未发现额外业务生成触发器。

| 实际业务写入 | 接收者 | 对象 | 来源 |
|---|---|---|---|
| 运动结果、退回补证、补证受理/逾期 | 对应学生 | EXERCISE_RECORD | v81-notifications.ts / notifyRecord 调用链 |
| 免测审核、认证审核与调整撤销 | 对应学生 | EXEMPTION_APPLICATION | exemption-applications.service.ts、v81-certifications.ts |
| 原始体测结果 | 对应学生 | ENROLLMENT | v81-physical-results.ts |
| 指定补练开放/撤销 | 对应学生 | ENROLLMENT | v81-makeup-windows.ts |
| 反馈公开回复与状态变化 | 反馈创建学生 | FEEDBACK | v81-feedback.ts |
| 截止前14天的未完成目标/待办 | 学生、责任教师 | ENROLLMENT / CLASS_SECTION | v81-course-reminders.ts |
| 系统维护与恢复 | 同组织有效用户三端 | 无目标 | system-mode.service.ts |

目前没有找到管理员账号 USER、教师名单 OFFICIAL_ROSTER_IMPORT、SETTLEMENT_REPORT 等实际通知写入；前端 routes 中出现这些值并不证明有业务事件。此前把所有预留映射都写入“剩余通知定位”的交接过宽；不再以补齐预留名称作为完成门槛。业务文档明确要求的通知仍应按规则验收，不能用“未实现写入”替代业务验收。特别是教师逾期提醒与管理汇总，需要结合用户忽略学校工作日日历的决定和现行 SLA 实现核对，尚不能据本次搜索判为完成。

已交付的课程/打卡/申请/管理员反馈详情定位仍保留，浏览器日志已明确使用合成通知引用真实本地持久化业务对象。这证明目标导航，不证明这些角色对应的通知会自动生成。管理员通知入口的真实业务来源目前为无目标系统模式广播，不能把合成 FEEDBACK/CLASS_SECTION 通知当作业务投递证据。

下一步优先按业务规则核对教师逾期提醒、全范围剩余功能与 OCR 接线。网页 OCR 缺少操作入口，必要弹窗内容调整仍待用户答复；其他独立工作可以继续。

第 37 次当前全量 Docker：类型检查、99/99 E2E、25 套件、0 失败/跳过，129776.912427 ms；219/219 已启用成功和253/253错误/权限覆盖，34项明确关闭。包含新增电子名单关闭续办和此前 OCR 关闭续办。证据 docker-backend-e2e-thirtyseventh-20260909.txt、runtime-conformance-thirtyseventh-20260909.json/.md。该结果不覆盖缺失的网页 OCR，不证明所有业务要求已完成。

2026-09-09 13:27纠正：ARCHITECTURE.md 已有明确范围记录“排除学校统一工作日日历及其SLA验收；保留教师轮次事实”。上文再次将教师日历SLA列为待核对门槛不准确，现按既有决定排除，不增设替代时限。见 CURRENT-ACCEPTANCE-20260909.md。
