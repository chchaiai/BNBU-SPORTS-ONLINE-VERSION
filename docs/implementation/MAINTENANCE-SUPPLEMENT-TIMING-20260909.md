# 维护中补证时间接线 2026-09-09

原 app.applySystemModeStatus 未向维护渲染器提供 mode，resolveMaintenanceTiming 会直接返回 noActiveTask，导致区域隐藏；并且回退逻辑可把维护前缓存 remainingSeconds 或 null 转换为“服务器确认”时间。

现将 mode 与显式 supplementTiming 传入原渲染器。在维护模式且存在登录会话时，读取允许维护中访问的本人 /student/proof-todos，使用本次服务器 paused/expired/remainingSeconds。没有任务不显示倒计时；全部已逾期显示原逾期状态；所有未逾期任务的有效暂停事实齐全时显示最短剩余时间。缺失、混合不确定状态、读取失败或请求途中切换账号均显示不可确认，不引用旧倒计时。不改 CSS、HTML 布局或控件。

客户端 4/4 通过（maintenance-timing-client-mixed-20260909.txt）：公告/正常模式清理、真实读取路径、暂停/无任务/逾期/无效值/混合状态、读取失败、账号切换隔离和缓存不可假冒当前确认。先前客户端通过日志也保留。

在现有完整补证 E2E 中加入真实管理员维护切换和恢复：教师退回一次补证后，学生本人接口可在维护中读取，paused=true、expired=false；间隔至少 250ms 再读，剩余秒数完全一致；恢复后 paused=false、截止时间顺延；继续补证提交、教师决定和进度链。docker-supplement-pause-20260909.txt 退出 0，影响文件 11/11 严格协议通过。没有修改后端业务或数据库，测试对象为专用 Docker 合成账号。

持续 Docker 浏览器账号本次没有待补证任务，MAINTENANCE_CURRENT_STUDENT_TIMING 返回 noActiveTask、页面没有计时区域，通过实际 OTP 登录及自动维护/恢复、本人入班数据重读。maintenance-timing-browser-20260909.txt 退出 0。不能以此声称有补证任务时的浏览器暂停面板已验证；该项继续需要合适合成任务。补证已受理/逾期工作流的完整页面、多任务边界及断网恢复也仍待验证。

最新完整后端全量仍为第十八轮 96/96，此后历史专项 7/7、本轮影响文件 11/11，未重复跑全量。服务最终 NORMAL。原业务的学校日历排除、相机材料、人工审核决定继续有效。三端完整目标继续。
