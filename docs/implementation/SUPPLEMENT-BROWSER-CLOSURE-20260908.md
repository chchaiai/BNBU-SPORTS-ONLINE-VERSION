# 浏览器一次补证链路

本轮继续使用本地 Docker 后端、PostgreSQL、MinIO、Mailpit 和真实 Edge 浏览器。相机是浏览器合成视频源，账号和身份均为合成测试数据。没有修改原 UI/UX 布局或 CSS。

## 本轮修复

- 教师退回弹窗仍显示旧“展示设计/不写入”，实际处理函数已经请求后端；已改为明确的退回说明和确认按钮文字。
- 学生没有草稿时补证按钮一直禁用，无法补拍。现有按钮现在先打开原相机弹窗，拍摄后用于提交，保留原有位置和布局。
- 教师确认前读取最新 workflow，已使用补证机会时提示不能再次退回；后端仍承担最终限制。
- 测试工具增加独立学生夹具用途，不修改已发布课程或已有测试记录。prepare-v81-browser-student.mjs 仅允许专用 v81_browser_test、有限用途名，已存在时核对成员归属。

## 验证结果

第一条记录：browser-supplement-initial-submission-20260908.txt、browser-teacher-return-supplement-20260908.txt、browser-student-supplement-first-20260908.txt、browser-teacher-supplement-final-review-20260908.txt、browser-student-supplement-final-result-20260908.txt，均通过相机初次提交、教师退回、学生补拍上传、教师复核和学生回读。

专项复验使用第二个新合成身份 supplement-once：

- browser-supplement-once-initial-20260908.txt：真实相机拍摄和初次提交。
- browser-supplement-once-return-20260908.txt：教师选择材料不清晰，开启 24 小时一次补证。
- browser-supplement-once-resubmit-20260908.txt：学生补拍、提交；同键重放相同结果，新键重复提交 409；原版本 1 项材料保留，新版本有原材料及新增照片共 2 项。
- browser-supplement-once-second-return-20260908.txt：页面提示机会已用完；直接后端第二次退回返回 422，workflow 仍 PENDING_TEACHER，版本不变。
- browser-supplement-once-final-review-20260908.txt、browser-supplement-once-final-result-20260908.txt：教师通过、学生读回“有效 · 未计入”，0h。
- sql-browser-supplement-final-20260908.txt：两条记录均 VALID、supplement_used=true、material_version=2，原件 1 项、补证版本 2 项、计入 0 秒。

docker-supplement-current-20260908.txt 的 V81_SUPPLEMENT_CASE=1 后端专项和人工审核主流程退出 0，包含 RETURN_SUPPLEMENT_REUSE_ORIGINAL_SECOND_RETURN_DENIED。Portal tsc 退出 0；本轮脚本和学生模块语法检查通过。

## 原始失败与限制

browser-teacher-supplement-second-denied-20260908.txt 是首次负向测试断言失败：测试将业务校验预期写为 409，现行接口对第二次退回返回 VALIDATION_FAILED / 422。修正断言并使用新身份完整复验，没有回退或改写原记录事实。

本轮是 24 小时照片补证、短时长不计入场景；未覆盖录像、72 小时真实等待、到期和维护暂停的浏览器场景，也不代表正时长计入或三端全部功能完成。学生身份由本地夹具建立，注册/名单流程不能据此判定通过。现有账号当天已有提交，重复测试应使用新合成身份或新业务日。后续继续正计入、名单、结算和学期切换等目标；迁移安全旧检查器的 20 项白名单缺口仍在。
