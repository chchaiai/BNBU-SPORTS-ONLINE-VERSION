# 安卓学生端开发交接

本包供负责原生安卓学生端的同事接入现有业务。内容取自 2026-09-13 本地源码，精确提交和文件 SHA-256 见 [source-manifest.json](source-manifest.json)。先阅读本页，再按功能查接口和实现参考。

## 版本与使用边界

| 内容 | 本包采用的依据 |
| --- | --- |
| 学生业务 | [学生流程](business/10-student-flow.md)和[总流程](business/00-overview.md)；顶部最新日期的确认覆盖正文冲突旧规则 |
| 接口字段 | [OpenAPI 学生子集](api/openapi.student.json)，来自当前 `3.0.0-v81-local-draft`，保留入选操作及递归引用的组件 |
| 接口检索 | [方法、路径和 operationId 索引](api/operations.md) |
| 实现参考 | `reference/` 中的 Web 原始代码和计时函数摘录，用于理解请求、状态及失败处理 |

`3.0.0-v81-local-draft` 是当前实现使用的草案，不能标为正式 Contract 发版。源仓库 `current-contract.json` 仍记录 `2.0.12-contract` 已发布；旧 `contracts/` 则为 `1.2.0-contract` RC。安卓接入本包草案前，须让后端同事确认联调环境实际部署的接口版本。仓库原有后端是此前快照，本 PR 没有更新其运行代码，不能据此认定运行旧后端就支持本包全部接口。

业务原文有“只保留 Web、原生端已移除”的历史范围说明；本次用户明确安排同事负责安卓学生端，本包用于恢复安卓开发参考。业务原文按源文件保存，平台范围说明不应阻止本次安卓工作，也不能作为原生端已完成验收的证明。

旧学生 Web README 中的“固定一小时”“提交立即有效”“只能实时拍摄”已经与后续业务修订冲突。旧 Stage 20 接入包中的密码登录和旧环境状态也不能用于指导本次学生端。接口子集由权限筛选，并移除了定位、设备 Push、自助注销挑战及旧撤回操作；接口被收录仍不表示当前功能已开放，按服务器返回状态显示。

## 建议开发顺序

1. **邮箱登录与入班**：邀请预览 → 获取 Join Capability → 提交入班 → 邮箱验证；已验证账号通过邮箱验证码登录，后续入班复用身份。新成员和已登录成员分别使用普通及 `/member` capability 接口。加入请求使用 `X-Join-Capability`，参考 `joinWithInvite`。长期档案包括学院、专业、出生日期和地域；匿名输入学号不代表身份验证成功。
2. **首页与课程**：读取本人身份、当前学期、在课关系、课程 `v81-rules`、`student-progress` 和补证待办。目标、最低时长、单次上限、日/周次数均读服务端配置。总目标重新分配前可能禁止新开始，须展示实际原因。
3. **运动会话**：读取 active session，接入开始、暂停、继续、结束及取消。发送最近服务端 `version` 作为 `expectedVersion`。界面立即显示处理中，失败恢复已确认状态；重启或网络恢复后重新读取服务端。参考 [暂停/继续摘录](reference/session-transition.md)及 [session.js](reference/session.js)。
4. **材料与记录**：结束会话 → 建立记录草稿 → 上传、确认、绑定媒体 → 等待验证完成 → 提交记录；提交和失败重试复用对应用户意图的幂等键。具体请求体以 OpenAPI 为准，调用顺序参考 [api.js](reference/api.js) 的 `uploadMediaDraft`、`createRecordDraft` 和 `submitRecord`。
5. **历史补卡与补证**：历史范围读取 `history-settings`；历史会话通过 `historical-sessions` 创建，日期必须早于今天且在教师设置范围内。补证读取原记录的 workflow、supplement clock 和补证待办，按 recordId 隔离草稿。不得把历史申报伪装成实时计时，也不得以新打卡替代补证。
6. **免测、历史和辅助功能**：免测申请支持 PDF/JPEG/PNG/WebP，单文件不超过 10 MB，读取实际字节类型。学生能查看本人历史；教师移除、课程退休不等于账号及历史清空。最后接入通知已读、偏好、帮助与反馈。

## 请求与数据处理

- 环境通过安卓构建配置注入，Base URL 包含 `/api/v1`；本包不提供生产凭证或真实测试账号。向后端负责人取得可联调环境、机构标识和合成账号，先完成版本核对。原生端不能直接沿用 Web 的同源代理配置。
- Access Token 通过 `Authorization: Bearer` 发送。Refresh 串行合并，轮换结果落盘后再恢复请求；退出或换账号后，旧请求不得覆盖新账号状态。安卓应使用平台保护的凭证存储，勿照搬 Web 的 localStorage。
- 同一次操作的重复点击、超时重试保留 `Idempotency-Key`。401 只在可刷新场景刷新；409 先获取最新状态再决定是否重试，其他错误不盲目重放。计时参考中的一次冲突恢复不能推广成所有写请求无限自动重试。
- 错误按 `code` 和 HTTP 状态分支，向用户展示安全提示及 `requestId`。禁止直接显示或记录完整响应、Token、签名链接、私有对象键和个人资料。未知枚举或响应结构应明确失败，不能转成业务成功。
- 日期按上海业务日期处理；计入时长、目标完成量及审核结果使用服务端 projection。客户端计时仅用于显示，不能自行计算正式计入结果。学生界面不展示最终分数、换算分、等级或排名。
- 媒体顺序为 initiate → 返回的私有上传地址 PUT（使用 requiredHeaders）→ confirm（ETag）→ bind → 查询验证状态 → AVAILABLE 后提交。上传中、转码中、验证中及失败可重试必须有明确反馈。签名 URL 短期有效，业务关联保存 mediaId。
- 图片上传副本只保留允许的拍摄信息并去除 GPS/身份元数据；原图独立保存，提交记录不清空原图。照片方向和像素应保持正确。视频必须核验真实格式、有声轨道及当前允许时长，处理未完成不能当成可提交材料。Web 的 IndexedDB、Blob URL 和 FFmpeg 方案应改用安卓对应能力。
- 当前人工审核优先；提交后展示后端实际审核状态与公开说明。教师退回补证仅一次，受对应补证时钟限制。游泳材料批次和首次上传时限按当前课程/记录规则处理。

## 精选代码的用途

这些文件是阅读与移植参考，保留了源代码中的 import；本目录不是可启动 Web 应用或可编译安卓项目。

| 文件 | 安卓开发可参考的内容 |
| --- | --- |
| [api.js](reference/api.js) | 邮箱、入班、刷新并发、错误脱敏、会话、上传状态及业务 DTO 映射；其中兼容旧合同的函数须对照本包索引使用 |
| [session.js](reference/session.js) | 上海业务时间、服务端会话恢复、课程动态时长配置 |
| [proofs.js](reference/proofs.js)、[recorded-video.js](reference/recorded-video.js) | 凭证限制、录制结果检查与失败恢复 |
| [photo-originals.js](reference/photo-originals.js)、[material-files.js](reference/material-files.js) | 图片原图、允许的 EXIF、实际文件格式和免测材料处理 |
| [checkin-drafts.js](reference/checkin-drafts.js)、[application-draft-store.js](reference/application-draft-store.js) | 按账号/记录隔离持久化草稿、删除及重启恢复 |
| [v81-review.js](reference/v81-review.js) | 学生可见审核、公开理由和维护状态；展示标签不可直接当作接口枚举 |
| [sports-catalog.js](reference/sports-catalog.js)、[student-regions.js](reference/student-regions.js) | 体育项目与地域显示清单；运行时优先使用服务端有效配置 |

## 联调验收清单

以下是安卓同事需要执行的验收项，本次资料 PR 只做静态一致性检查，没有执行安卓编译、模拟器或真机验收。

- [ ] 新成员入班、首次邮箱验证、已验证账号再次入班、验证码登录和换账号隔离；无效邀请、过期验证码有正确提示。
- [ ] Access 过期时并发请求仅触发一次刷新；刷新失败及退出后无旧凭证恢复。
- [ ] 暂停/继续立即反馈；慢网络、409、失败回滚、锁屏和杀进程后恢复正确；以服务端有效秒数为准。
- [ ] 教师变更最低时长、单次上限、日/周次数和总目标后，新旧会话分别遵循各自规则。
- [ ] 拍照/录像权限拒绝、相机中断、视频有声、回放时间推进、切换页面后回放及转码状态均正确。
- [ ] 上传断网、重复点击、签名 URL 过期、缺 ETag、验证失败均可解释；重试不产生重复打卡。
- [ ] 历史日期边界、上传本机凭证、教师审核后的日/周计入正确。
- [ ] 补证显示原记录信息与截止时间；两条记录草稿互不覆盖，过期和再次补证被拒绝。
- [ ] 免测 PDF 和图片格式/大小校验正确；草稿删除后重启不复活；原图不随提交清除。
- [ ] 退出、被移除、课程退休后本人历史可见范围正确；无越权数据或最终成绩泄露。

## 更新和核验

维护者在当前权威源码执行 `node backend/scripts/generate-openapi.mjs --check` 后，在资料仓库执行：

```powershell
python docs/android-student/export-handoff.py <权威源码目录>
python docs/android-student/verify-handoff.py
```

导出器只读取显式选定文件，生成学生接口及其引用依赖。每次更新仍需审阅业务变化、被排除操作和 README。本次资料包没有携带教师/管理员界面、后端部署脚本、数据库迁移、构建产物、运行日志或账号配置。
