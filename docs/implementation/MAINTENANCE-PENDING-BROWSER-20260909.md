# 有待补证任务的维护浏览器验收

2026-09-09，本地 Docker 后端、PostgreSQL、MinIO、Mailpit 与现有学生/教师网页，最终退出码 0。

- 新建独立 maintenance-supplement 合成学生；保留此前已 VALID 的测试记录。浏览器 SMTP 验证码登录、合成相机拍摄、真实上传及提交通过。记录实际时长不足，不证明有效学时或真实设备拍摄。
- 教师现有审核页面定位该学生，退回补证成功，后端返回 AWAITING_SUPPLEMENT。
- 管理员通过真实接口开启维护；已登录学生及教师自动轮询进入维护，没有手动刷新。学生现有补证卡显示“计时已暂停”；两次服务器读取间隔 1.5 秒，剩余秒数相同且大于零。
- 真实接口恢复 NORMAL 后，学生自动回到业务页，/enrollments 200 重读一次；本人任务仍存在，paused=false、expired=false。教师课程管理恢复。
- 已检查截图 maintenance-pending-student-20260909.png。最终本地模式 NORMAL，policyVersion=43，后端 healthy。

## 失败与修正

准备脚本首次在旧镜像副本执行，未识别新增测试用途；仅将该测试准备脚本复制到容器后创建成功，未重建或修改服务逻辑。

第一次教师脚本在 QUEUE 超时，后续维护测试因此得到 noActiveTask，均保留失败日志。将等待 networkidle 改为等待审核行，并按新合成学生姓名定位，教师复测通过。第二次维护测试已证明暂停，却在恢复时过早检查读取计数；改为最多等待 10 秒的真实网络响应后最终通过。没有放宽状态或结果断言。

证据文件：maintenance-pending-fixture-20260909.txt、maintenance-pending-camera-20260909.txt、maintenance-pending-teacher-20260909.txt、maintenance-pending-teacher-retest-20260909.txt、maintenance-pending-browser-20260909.txt、maintenance-pending-browser-retest-20260909.txt、maintenance-pending-browser-final-20260909.txt。

本轮仅修改测试脚本和文档。既有 Docker 补证专项 11/11、客户端 4/4 见 MAINTENANCE-SUPPLEMENT-TIMING-20260909.md；没有重新执行全量测试，最新完整全量仍为十八轮 96/96。浏览器覆盖一个尚未逾期任务；已逾期、多任务、英文补证卡及真实云服务不在本次证明范围。新增合成学生及待补证记录保留于隔离数据库，便于复测，身份凭据文件保持本地忽略。
