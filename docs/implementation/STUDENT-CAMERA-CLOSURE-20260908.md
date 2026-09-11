# 学生相机提交与教师审核

2026-09-08，本地 Edge 浏览器连接学生端 4274、教师端 3300、Docker 后端 3199、PostgreSQL 和 MinIO。使用合成账号、浏览器合成相机源；真实执行 getUserMedia、JPEG 编码、对象上传、后端验证和业务请求，没有用网络 Mock 返回成功，也没有推进服务器时间。

## 已验证链路

1. 邮箱 OTP 登录及刷新恢复；浏览器开始运动、现场拍照、暂停、恢复。browser-student-camera-initial-20260908.txt 通过，首次单独相机测试以取消该测试会话清理。
2. 短运动由后端 finish 确认为 COMPLETED，页面进入待提交记录。browser-student-camera-finish-20260908.txt 通过；不再由客户端按旧一小时门槛自动取消。
3. 输入说明、上传相机照片并提交。browser-student-camera-upload-initial-20260908.txt 通过。sql-student-camera-submission-20260908.txt 确认为 SUBMITTED / PENDING_TEACHER，实际与计入秒数均为 0。本场景操作很短，分段整秒计时结果为 0；不得宣称正学时验收。
4. 教师网页打开该记录，点击通过。browser-camera-teacher-review-queue-retest-20260908.txt 通过；sql-camera-teacher-reviewed-20260908.txt 确认为 REVIEWED / VALID，计入仍为 0。
5. 学生重新登录读取同一记录，网页显示“有效 · 未计入”和 0h。browser-student-camera-reviewed-assertions-20260908.txt 有明确断言；此前显示内容见 browser-student-camera-reviewed-result-20260908.txt。

## 修复内容

- 学生旧一小时取消、0/60/120 阶梯预估、两小时强制结束不符合 V8.1，已移除。预估读取课程 30/45/60 分钟门槛，整分钟取整、60 分钟封顶；未知规则显示未知。预估仅用于展示，结果仍由服务端审核决定。
- 完成界面使用后端返回的实际秒数，校验会话身份、状态、版本及当前本地会话；防止旧响应覆盖其他会话。结束操作期间防止并发点击。未达门槛仍交由后端完成和后续记录流程处理。
- 教师默认队列原来只显示无效，漏掉待人工审核记录；现在包含 pending 与 invalid。保留布局，调整相关说明和计数文字。首次 browser-camera-teacher-review-initial-20260908.txt 记录队列无行，同时测试错用了 button 查询实际 tab，后续脚本也已修正。
- 学生补证、教师退回补证的旧“仅展示、不写入”说明已改为当前已接线行为；本轮不因此扩大为补证流程全部验收。

## 校验与边界

student-credit-boundaries-20260908.txt 两项测试通过：29:59/30:00、45/60 门槛、45:59 整分钟、90 分钟封顶、未知规则、超过两小时继续计时。Portal tsc 与学生 checkin.js 语法检查通过。

V81_STUDENT_CAMERA=1 执行相机和短运动结束；同时 V81_STUDENT_SUBMIT=1 才提交。提交后写入忽略目录 .local/v81-browser-state/camera-submission.json 的记录 ID，供教师脚本定位。教师脚本之后 V81_CAMERA_RESULT=1 可验证学生回读。固定测试账号已产生当日提交，不能为重复跑测试删除或改写事实，应使用新合成身份或新业务日期。脚本没有验证相机拍摄到真实运动内容；没有验证超过门槛的实际持续运动、正计入端到端、录像、补证/拒绝和中断恢复全部情形。

整体三端目标仍未完成。下一步补充正计入场景、补证及名单等写入流程，正式结算/更正、学期切换和迁移旧检查器仍有未完成项。腾讯 COS/CVM/PostgreSQL 正式环境没有连接或部署。
