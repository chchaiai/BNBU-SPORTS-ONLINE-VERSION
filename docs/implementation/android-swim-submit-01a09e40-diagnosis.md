# 安卓视频提交失败诊断

诊断编号：01a09e40-0be9-748f-940e-53abecc1dc81。
本次只进行服务器日志、数据库只读事务和代码审查，无修复部署、业务数据修改或媒体下载。

## 已确认的服务器事实

- 持久 HTTP 日志：2026-09-14T04:49:52.656Z（北京时间 12:49:52），POST /api/v1/exercise-records/{recordId}/submit，HTTP 422、VALIDATION_FAILED，耗时 34.32ms。
- 按同一 requestId 查询幂等记录并仅在服务器内解密失败结果，明确 details.reason = SWIM_INTAKE_REQUIRED。幂等状态 COMPLETED 表示失败结果已完成缓存，不表示打卡提交成功。
- 此前媒体 initiate/confirm/bind 接口均成功。
- 与截图尺寸和时长一致的记录为 SWIMMING：视频 video/mp4、738022 字节、3 秒；两张 JPEG 分别 34319 与 34328 字节。三份媒体状态均 AVAILABLE，captureSource 均 IN_APP_CAMERA。未读取视频或照片本体，不能确认照片真实拍摄阶段。
- 对应记录仍 DRAFT、version=1、submittedAt=null；v81_swim_intakes 无受理记录。该用户稍早另一条游泳草稿也没有 intake，不能据此认定所有安卓用户都受影响。
- 相关客户端诊断上报标记 WEB_STUDENT。它与截图及学生 Web 提交代码一致，但不足以确认具体 APK 包版本或全部安卓原生逻辑。

## 原因链

1. 服务端 v81-materials.ts 在通过图片/视频格式、大小、时长校验后，检查实时游泳预受理批次。缺少 v81_swim_intakes 时明确抛出 SWIM_INTAKE_REQUIRED。
2. 学生 Web api.js 已定义 getSwimIntake/acceptSwimIntake，但全目录检索未发现提交流程调用。screens/checkin.js 的实际链路为建立草稿 → 上传并验证媒体 → submitRecord，缺少运动前/后阶段标记与游泳材料受理锁定调用。
3. 后端 publicErrorDetails 未传出 reason，而此拒绝也没有 fieldErrors；客户端只收到通用 VALIDATION_FAILED 并显示“资料格式不正确”“修正标记的字段”，无法指明真正缺失步骤。

因此，本次失败的直接原因是游泳材料预受理缺失，视频格式/大小/3秒时长并非此次被拒的原因。服务端拒绝符合当前游泳业务约束；产品问题是提交链路遗漏及错误提示不准确。

## 修复建议及边界

- 补齐游泳前、后照片阶段和同批材料的受理锁定流程，调用现有 swim-intake 接口，再进入正式提交；处理15分钟首次受理、30分钟同批续传、24小时离线延迟说明及历史补卡例外。
- 缺少真正的运动前证据时不能将事后照片伪装成运动前照片，不能直接关闭后端校验。
- 将游泳受理类错误转换为可安全公开的业务原因/操作指引，而非泛化为“格式错误”。
- 失败提交已被幂等缓存，修复后重试策略必须区分同一失败意图与完成必要步骤后的新提交意图。仅原样重试可能重放同一拒绝。
- 现有失败记录保留了已上传媒体，但是否还能按规则恢复提交，取决于当时前后阶段证据、受理时限及延迟说明，不能保证自动恢复。

依据：docs/business/10-student-flow.md 7.6；backend/src/modules/v8/v81-materials.ts；backend/src/common/errors/application-error.ts；BNBU-Sports-Web-new/frontend/student/js/screens/checkin.js 与 api.js。
结论来自当前持久日志和同一诊断号的幂等失败事实。当前后端容器曾重建，最初 Nest warn 明细日志不在当前容器中；本次明确 reason 来自持久化幂等结果，而不是凭通用错误猜测。
