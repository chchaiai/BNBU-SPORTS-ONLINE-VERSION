# 学生端浏览器准入（2026-09-20）

## 最终规则

按用户最终要求，允许 Chrome、Microsoft Edge、Safari、Firefox 进入学生端；其他可识别浏览器和微信/QQ等内置浏览器显示阻断页。既有手机/平板设备条件继续生效。

启动和每次渲染均检查浏览器标识，拦截发生在登录、恢复会话及邀请链接消费前。阻断页没有继续进入入口，提供 Edge/Chrome 官方下载和复制当前完整页面链接；复制失败时选中文本供手动复制。当前链接保留邀请码及片段，不附加到外部下载地址，下载链接使用 noreferrer。

UA/Client Hints 只是浏览器身份声明，无法阻止伪装标识或识别与 Chrome 完全相同标识的第三方产品。本规则属于网页兼容性准入，不是服务端认证边界。学生的旧浏览器本机材料不会随切换自动迁移，提示页已说明。

官方链接：https://www.microsoft.com/edge/download 、https://www.google.com/chrome/ 。

## 验证

- 最终生产候选包 100 项测试通过、87 项烟测通过。
- 8 种移动 UA 的真实浏览器自动化：微信与 Samsung 拒绝；Safari、Firefox、Android Chrome/Edge、iPhone Chrome/Edge 允许。拒绝场景无学生业务 API 请求，已有登录状态触发重新渲染仍被拦截，完整链接复制通过。允许场景进入正常启动流程。
- 合成浏览器测试中 API 返回受控 503，用于证明是否启动，不代表真实登录或物理手机验收。
- 阻断页 390px 截图目视检查通过，页面异常 0。
- git diff --check 通过，只有 Windows 行尾提示。

## 发布

最终当前发布 `/opt/bnbu-sports-production/releases/browser-access-four-20260920`。

首次 Chrome/Edge 门禁版本 `/opt/bnbu-sports-production/releases/browser-gate-20260920` 覆盖线上基线的 app.js 和 student-device.js。用户随后追加 Safari/Firefox，最终发布仅覆盖 student-device.js；前一版作回滚点，扩大范围前版本不作为最终规则。

公开普通 URL 与带参数 URL 摘要匹配，Cache-Control 为 no-store；学生及教师 readiness 正常。后端和教师容器未重启，数据库迁移 0、真实学生业务写入 0。本地并发改动未纳入生产覆盖；无 Git 提交/推送。

证据：`evidence/browser-gate-20260920/`，以 `validation-four.json`、`deployment-four.json` 及最终 tests/smoke/browser 文件为准。

回滚仅在 current 仍为本次版本时：

```text
sudo python3 /home/ubuntu/bnbu-browser-access-four-20260920/deploy.py --rollback
```

注意该回滚点会恢复仅 Chrome/Edge 策略。如需完全取消浏览器门禁，应按固定版本发布流程评估恢复至 media-errors-20260920 的学生端两个模块。
