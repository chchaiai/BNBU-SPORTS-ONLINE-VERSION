# 认证撤销和认可历史网页接线

2026-09-09。沿用现有“更多 → 撤销抵扣”和审核弹窗，撤销原因复用审核意见；后台真实撤销接口追加历史、审计和通知，并重算学生认可分钟。详情区读取完整分页认可历史，显示每版分钟、有效状态及原因。批准详情不再允许普通重复审核；撤销后显示“已撤销”，不会误计入待审核。此轮不改页面结构或样式。

审核/撤销共用按账号和申请保存的原请求。网络结果不明时保留操作类型、版本、原因和幂等键；刷新后恢复、锁定字段并重试原请求。撤销确认成功后清理恢复记录。旧认可历史不覆盖。

发现并修复的协议问题：候选 `ExemptionApplication` 已有 REVOKED，但 `StructuredExemptionApplication` 缺少该枚举。现已同步候选 YAML、可重复生成脚本和生成产物；Portal 旧正式类型通过明确的本地候选扩展接收 REVOKED。正式 `contracts` 发布基线不变。

## 本地验证

- `certification-revoke-browser-final-20260909.txt`：在上一轮独立 `replay` 合成课程中，教师通过网页撤销关闭前已受理、关闭后批准的认证。201 响应被测试主动丢弃，刷新后保留原因和原键，重放返回相同完整结果。历史恰好两条，旧 30/15 分钟对象逐字段保留，最新为 0/0 且 inactive；教师结构化列表返回 REVOKED，详情确认按钮禁用。
- `certification-revoke-student-20260909.txt`：另一条 `allocation` 合成认证已由同样网页操作撤销；学生通过真实邮箱 OTP 登录，看到认证“已撤销”和撤销原因；免测仍“已通过”。本人 student-progress 两类 recognizedSeconds 均 0，关闭后的新申请仍返回 409。教师与学生截图人工查看通过，私有截图保存在忽略目录。
- Portal typecheck 通过：`certification-revoke-typecheck-retest-20260909.txt`。
- 第 27 次 Docker 全量 97/97、25 suites、0 fail/skip，135.79 秒；218/218 启用成功、252/252 错误/权限、34 fail-closed，运行协议校验通过。既有认证 E2E 增加教师/学生结构化列表对 REVOKED 和公开原因的断言。见 `DOCKER-E2E-TWENTYSEVENTH-20260909.md`。
- 浏览器后端容器重建并 healthy，端口仍 3199；Portal 3300，学生 4274。没有改迁移数量或云端配置。

## 保留的失败

1. 初次 typecheck 检出旧正式类型没有 REVOKED；据此核查发现候选结构化列表同样缺枚举，同步修正，而非强制绕过类型检查。
2. 首次浏览器测试在默认“待审核”筛选下寻找已批准申请超时，截图确认；测试增加“全部申请”导航。
3. 第二次网页撤销已提交，刷新后恢复提示和历史正常，但测试按 placeholder 定位锁定输入框超时，尚未执行重放。该撤销事实保留；使用另一条已批准测试认证，以现有弹窗 textarea 定位完成全链及原键重放。未重置既有认证或添加人工撤销事实。

分别保留 `certification-revoke-typecheck-20260909.txt`、`certification-revoke-browser-20260909.txt`、`certification-revoke-browser-retest-20260909.txt`。

## 交接

`v81-certification-revoke-browser-probe.mjs` 默认读取 `closed-applications-replay.json`，可用 V81_CLOSED_APPS_RUN 选择独立轮次；已撤销轮次重跑仅查询，replayVerified 会为 false。学生脚本设置 V81_EXPECT_CERT_REVOKED=1、V81_CLOSED_APPS_RUN=allocation 验证撤销状态和零认可量。测试材料沿用上一轮直接合成 AVAILABLE 元数据，不证明真实图片上传/查看。

仍需完成：认可分钟调整接口及网页操作；结算/归档后认证旧事实更正；申请补材料和累计三图；关闭后名单/OCR、续传及完整关闭摘要。不能用本轮通过宣称所有三端业务完成。生产服务连接、真实模型与本校样本仍未验收；人工审核优先。本地存档，无推送或部署。
