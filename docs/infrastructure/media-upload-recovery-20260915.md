# 凭证上传占位与失败重试修复 · 2026-09-15

## 结果

已于北京时间约 21:28 部署至 https://www.student.bnbusports.cn/student/ 。

- 当前发布：`/opt/bnbu-sports-production/releases/media-upload-recovery-20260915-r2`。
- 上一版本：`/opt/bnbu-sports-production/releases/iphone-video-20260915-r2`。
- 后端镜像：`sha256:73de609da5e40e11a9bd808c27a84af0bf4b282b123751450ed1a78570315fa3`。
- 发布范围：后端 `modules/media/application/media.service.js` 与 source map；学生端 `js/api.js`。
- 无数据库迁移；没有代替真实学生上传、删除或提交记录。未执行 Git 提交或推送。

## 诊断与修复

截图诊断编号 `01a0a51e-735f-7583-81d1-ad204afaffc4` 对应 20:50:31 的 `POST /api/v1/media-uploads`，返回 422 / `MEDIA_COUNT_LIMIT_EXCEEDED`。

20:49:37 已预留一个视频上传名额但没有完成确认，20:49:53 再次申请被限制。后续复用首次失败的幂等键，使旧错误持续重放；21:01:44 仍被拒绝，已经超过原上传许可有效期。最初对象上传失败的具体原因没有足够日志证明。

1. 在已有权限、运动状态和上传窗口检查之后，只复用当前学生、当前运动、未确认且未过期的 `PENDING_UPLOAD`。内容 SHA256、大小、类型、时长和采集来源均须相同，排除冻结材料；不同素材仍按 6 图、1 视频限制处理。
2. 重签上传地址的有效期受原许可剩余时间约束。过期预留继续通过原有事务释放，保留历史和审计记录。
3. 前端遇到超限错误时最多用新幂等键重新申请一次，避免旧失败持续重放。真实超限仍报错，下次用户操作使用新的请求标识；网络结果不明时保留原请求标识。
4. 普通未确认素材的许可已到期时，在 PUT 前重新申请。已锁定游泳材料继续遵守原材料约束。

## 验证与边界

- 前端 17 项测试通过：旧失败恢复、真实限额下有界重试、过期许可、网络结果不明、原有上传重试与游泳锁定。
- 本地真实 HTTP + PostgreSQL 6 项通过：并发重试仅一个视频名额、不同素材及声明仍受限、过期名额释放、旧键重放与新键恢复、恢复后图片确认/绑定/Worker 验证、视频确认、跨运动和已提交记录保护。对象存储为测试内存适配器，未冒充真实 COS 验收。
- 后端相关单元测试 27 项通过；TypeScript typecheck、ESLint、Nest 编译及本次已跟踪文件 diff whitespace 检查通过。
- 线上正式入口、教师站、官网和 readiness 均 200；后端模块及学生端脚本 SHA256 与包内一致，学生脚本响应 `Cache-Control: no-store`。
- 上线后短窗口 35 个已记录 HTTP 请求均 200，后端 healthy。该窗口不是容量或长期稳定性验证，也未完成用户手机视频重试的真机验收。
- 截图对应记录在发布前的 **21:11:48 已为 SUBMITTED**；该成功不能归因于本次修复，也无需重复提交。

首次部署校验误用了未配置 DNS 的 `student.bnbusports.cn`，触发自动回滚。核对旧镜像及 healthy 后，改用正式 `www.student.bnbusports.cn` 重新发布成功；两次发布目录均保留。

## 回滚

确认当前仍是本次发布后：

```bash
sudo python3 /home/ubuntu/bnbu-media-upload-recovery-20260915-r2/deploy.py --rollback
```

脚本拒绝覆盖后续发布，回切保留版本并等待后端健康。无需数据库恢复或 Nginx 配置变更。首次发布的自动回滚已实际执行并核对旧镜像与健康。

证据：`evidence/media-upload-recovery-20260915/` 下的 `baseline.json`、测试日志、`bundle-r2/validation.json`、`deployment.json`、`postdeploy.json`、`affected-record.json`。
