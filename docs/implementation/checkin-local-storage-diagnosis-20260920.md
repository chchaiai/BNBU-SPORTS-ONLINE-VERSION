# 2026-09-20 学生打卡本机保存失败排查

## 结论

截图诊断编号 `95a46da1-0f04-467d-bab2-9c251cee2cd7` 已匹配生产数据库，发生时间为北京时间 2026-09-20 22:22:28.373。截图提示对应前端 `ProofDraftStorageError`。生产记录仍为 DRAFT，视频已 AVAILABLE。故障定位为前端本地凭证持久化错误阻断提交；具体底层异常未被保留，无法据此确认设备空间不足。

## 只读核查结果

- 当前生产静态版本：`browser-open-all-20260920`。
- 公开访问的 `checkin-drafts.js` 已使用 ArrayBuffer 存储，不能归因于尚未部署此前 File/Blob 存储修复。
- 记录 `01a0bf2e-52a7-7218-914e-26d05c08a8e1`：22:17:59.207 创建，核查时为 DRAFT，submittedAt 为 null。
- 同一运动 session 的视频 `01a0bf31-e62c-70df-b5d8-fb6f184c5794`：8,374,186 字节，22:21:53.574 创建，22:22:12.868 达到 AVAILABLE，failureCode 为 null。
- 22:17:59 至 22:23:16 共查得该账号 8 条 UNKNOWN 客户端错误；只有截图对应的一条能借助截图文案确定为本地凭证保存错误，其他 UNKNOWN 不足以单独确定原因。
- 诊断上报没有原始异常名称、存储配额、设备型号或具体保存阶段。
- 数据库查询启用 default_transaction_read_only，未修改业务记录、服务配置或发布版本。

## 代码链路与缺陷

`frontend/student/js/checkin-drafts.js` 的 enqueue 将所有异常重新包装为 ProofDraftStorageError，丢弃原始异常。saveProofDraft 每次完整读取 blob.arrayBuffer 并写入 IndexedDB。缺失文件、文件读取失败、数据库连接异常及配额问题均可能进入同一错误包装。

`frontend/student/js/api.js` 将该异常统一映射为 UNKNOWN，固定提示释放设备存储空间；这一提示并未基于配额检查。

`frontend/student/js/screens/checkin.js` 在提交前对所有非 serverOnly 凭证再次保存，并在上传检查点和 finally 中继续保存。即使凭证已有 mediaId、服务端已 AVAILABLE，只要本地保存失败，也会阻断后续正式提交。finally 中的保存失败还可能覆盖先前上传异常。

生产公开资源已核实包含以上逻辑。独立 Node 故障注入分别模拟 QuotaExceededError、InvalidStateError、UnknownError，均返回相同 ProofDraftStorageError，cause 均未保留。此检查验证错误归类缺陷，不代表复现了学生真机底层故障。

## 建议修复方向

1. 保留并按白名单上报底层异常种类及保存阶段；仅确认配额不足时提示释放空间。
2. 将凭证二进制保存和上传状态保存拆开，避免每个检查点重复读写整个视频。
3. 已由服务端确认 AVAILABLE 且归属当前记录的凭证，允许通过服务器恢复路径继续提交，避免本地缓存更新失败持续阻断。
4. 处理 IndexedDB 失效连接的关闭、重新打开与有限重试，避免旧连接一直失败。

学生现有页面应先保留，避免刷新、清除网站数据或点击放弃导致仍仅存在本机的其他凭证丢失。已确认的视频可以从服务端恢复；目前尚未执行修复或替学生提交。

## 修复和部署完成

以上为排查阶段结论。用户随后授权修复部署，并针对第二个照片问题明确要求解除服务器像素上限。已发布 `proof-storage-pixels-20260920`，回滚基线为 `browser-open-all-20260920`。

最终改动：

- 服务端确认 AVAILABLE 的凭证不再强制重复保存到本机；IndexedDB 无法读取时，同一运动的已上传凭证可从服务端恢复。
- 对失效的 IndexedDB 事务连接重新打开并有限重试；保留原始异常，仅 QuotaExceededError 提示空间不足；界面显示细分错误码。后台既有诊断白名单对新客户端码的归一化规则未在本次扩展。
- 移除上传 finally 中重复的凭证保存，避免覆盖原始错误。
- `MEDIA_MAX_IMAGE_PIXELS=0` 表示不设服务器像素上限，并将 sharp 的 limitInputPixels 设置为 false；照片保持原始分辨率。文件字节大小、真实格式、完整性、位置元数据和病毒扫描校验继续执行。
- 完整性错误的提示改为重试上传或重新选择凭证，不再要求修改未显示的表单字段。

第二个诊断编号 `1e20dcc0-6fed-4068-8960-b658b323fbc6` 对应 18:15:02 的图片确认失败。该运动连续五次上传同一张 7,298,951 字节 JPEG，均因 MEDIA_INTEGRITY_MISMATCH 失败。只读核对确认对象大小、MIME、SHA-256 与声明一致；实际像素为 6144 × 8192 = 50,331,648，超出原 40,000,000 上限。sharp 原先明确报 Input image exceeds pixel limit。

验证结果：

- 25 项前端相关测试、25 项后端媒体测试、后端 TypeScript 检查通过。
- 三组浏览器回归通过：真实 IndexedDB 保存恢复与失效连接重试；配额异常分类及未上传凭证保护；本机数据库全部不可用时服务器凭证恢复和两条提交路径。浏览器使用本地 Chromium、模拟 API 和合成素材。
- 候选镜像与正式运行容器均以只读方式校验本次失败的原照片：保留 6144 × 8192 和原 SHA-256，完整验证通过；人为错误摘要仍被拒绝；EXTERNAL_REQUIRED 扫描继续启用。
- 正式运行的两个后台模块摘要、三个公网前端模块摘要及 no-store 缓存策略通过；学生与教师入口和健康检查通过。
- 无数据库迁移、无学生业务记录修改、未替学生提交打卡。学生真机重新提交结果尚待反馈。

部署证据：`evidence/proof-storage-20260920/deployment.json`、`prepared.json`、`browser.json`。回滚命令（服务器）：`sudo python3 /home/ubuntu/bnbu-proof-storage-20260920/deploy.py --rollback`。
