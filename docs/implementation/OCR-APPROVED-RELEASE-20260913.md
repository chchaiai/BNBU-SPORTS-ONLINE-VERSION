# 已批准生产变更与官网图标

用户于本轮明确批准 A、B，并要求网页标签和安卓应用使用 https://bnbusports.cn/ 的 BNBU Sports 图标。

## 已发布

- A：仅教师域名两个 OCR 上传路径调整为 101 MiB 请求上限、关闭代理请求缓冲、65 秒读取超时；沿用 access_log off。真实站点备份在 `/opt/bnbu-sports-production/backups/nginx-before-ocr-entry-20260913.conf`。nginx -t、reload、三个公开入口均通过。
- B：ab02e8f4 的 10 个运行时模块叠加到 submit-atomic 镜像，保留此前修复；门户与学生 api.js 同步发布，无数据库迁移。
- 官网 favicon.svg 原样用于学生、教师、管理员页面。三个文件 SHA-256 一致：`f19f7a9af964d138d6a1dc93d414844ab3c67fe453eec5c34775c26e39126f7b`。
- 安卓使用官网 sports-logo.png 原件，白底自适应图标，Manifest 的 icon/roundIcon 均绑定该资源。调试包构建及 aapt 资源绑定验证通过；随后用户明确删除原生客户端，此调试包仅作为历史验证记录，停止分发。

最终 current：`/opt/bnbu-sports-production/releases/invite-ui-final-20260913`。

- backend：`bnbu-backend-production:invite-brand-20260913`，`sha256:c676a33218fc069cc6c57a14d36a96420bfeb8bb36facb84939cff8826b68055`
- portal：`bnbu-portal-production:invite-ui-final-20260913`，`sha256:69c42e30e571a3af217b1b733d258be611a841744b254e0d454a2ea34f546e10`
- 变更链：portal-feedback-labels → ocr-entry-approved → invite-brand → invite-ui-final。每一发布目录保留前一版本，部署脚本含失败回滚分支。
- 最近数据库备份与隔离恢复证据仍见 `isolated-postgres-restore.json`；本轮没有恢复或改写生产数据库时钟。

## 验证

- 门户构建及 43/43 定向检查，后端编译、单测 282/282、协议检查 35/35 及邀请单测 3/3，安卓 assembleDebug 通过。
- 51/51 三角色线上读取与权限拒绝回归见 `invite-brand-cloud-read-regression.json`。最终门户修正后已重新执行 51/51；不等同全量业务验收。
- 两个 OCR 路径各上传约 2.2 MB 合成 PNG，HTTP 201，COS 回读原件 SHA 一致。102 MiB 请求头被两入口拒绝为 413，其他 API 的 3 MiB 请求仍为 413。超限验证未发送正文，不并发、不压测；本轮没有额外请求 OCR 识别。见 `ocr-large-entry-regression.json`。
- 真实默认 30 分钟、120 分钟成功，4/121/5.5 返回 422；最后邀请已撤销，前一个自动轮换失效。见 `invite-duration-boundaries.json`。
- 5 分钟邀请于 02:55:40.931Z 自然到期，02:55:44Z 之前登记重放一致、新登记拒绝、预览失效、宽限入班及入班重放通过。03:06:04Z 固定宽限结束后返回 410/AUTH_JOIN_CAPABILITY_EXPIRED；两个不同登记的截止时间均为 03:05:40.931Z，见 `invite-natural-expiry.json`。

## 首次失败与修正

- 门户框架在 icons 元数据对象下出现服务端渲染错误，43 项中 1 项失败。改用标准 head/link 图标标签后 43 项全部通过。
- 浏览器检查发现邀请数字输入框仍为旧 max=1440，提交逻辑已限制 120。修正 max=120、step=1，并把中英文说明明确为到期前已登记流程的固定 10 分钟截止时间；重新构建、43 项检查及生产发布通过。
- 工具准备阶段发生相对工作目录复制错误、Windows Python 引号错误及未复制的生成 JSON 路径错误，均在构建/部署门禁之前修复。自然到期测试曾提前调用，被时间断言阻止，未执行到期操作；到期后重新执行通过。宽限结束测试最初错误地只接受 401，实际合同错误为 410/AUTH_JOIN_CAPABILITY_EXPIRED；修正测试断言后确认拒绝生效。

## 剩余事项

安卓模拟器图标显示与固定宽限截止均已补证。用户随后明确删除两端客户端及官网入口，原生端不再交付；剩余邮箱接口、最终合成数据清理及总体交接仍未完成。新增合成学生 9900000011 及两批大文件 OCR 原件纳入最终清理。9900000012 仅登记，宽限结束入班已被拒绝。
