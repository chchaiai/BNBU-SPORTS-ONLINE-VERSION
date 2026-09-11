# 学生邀请流程刷新宽限按钮删除与验收

2026-09-11 13:19（北京时间）。用户授权删除按钮、重新部署并验收。

## 根因及修复

`join.js` 的 `disabledGraceButton()` 将不可用的动作渲染为禁用按钮，扫码、手动邀请码和课程确认页重复引用；`dashboard.js` 未入班首页也复制了同一按钮。删除函数、三处调用和首页按钮，共删除 8 行。保留服务端邀请有效期与宽限说明，未更改数据库或入班规则。现行依据：`docs/business/10-student-flow.md` 第 145 行，一次宽限不得刷新续期。

## 本地与线上验证

执行 `tools/local-integration/join-grace-button-browser.mjs`，本地连接真实 Docker 后端，线上连接腾讯云 API。责任测试教师登录后为现有隔离测试课程生成 6 分钟邀请（201）；学生通过扫码页的手动输入入口查询真实邀请（200），进入“确认课程信息”。两端均确认扫码页、确认页没有刷新宽限按钮，仍显示服务端剩余有效期、身份填写表单和提交入口。手机尺寸 390 × 844 截图见 `evidence/join-grace-20260911/local.png` 和 `cloud.png`。本次验证覆盖邀请解析后的页面，没有重复拍摄扫描物理二维码或提交新学生注册。

源码检索确认两个模块不再存在该按钮及辅助函数；`git diff --check` 通过。截图验收禁用过渡动画，人工核对线上课程卡片中已无按钮。

## 部署与回滚

源代码提交：`08656e203636995f8497886a60225a7576743be1`。

当前发布目录：`/opt/bnbu-sports-production/releases/08656e203636-join-ui`。
前一发布目录（回滚目标）：`/opt/bnbu-sports-production/releases/26fc80e2423a-exemption`。

运行 `tools/production/deploy-join-grace-button.py`，从前一版本复制完整发布目录，仅替换 `join.js`、`dashboard.js`，校验运行配置逐字一致，原子切换 current。两个公网模块均返回 200 且 SHA256 与已提交源代码一致，摘要见 validation.json。发布失败脚本自动切回前一版本。Backend 与 Portal 容器均 healthy。

## 交接及剩余依赖

仅使用隔离测试课程。复测完成后两名测试账号再次停用，tokenVersion 增加；原有 1 条测试运动记录保留。测试邀请设置 6 分钟自然到期，未公开邀请凭据；未为真实学生办理入班。本项没有待用户处理的依赖。

本地精确路径提交存档，未推送。上一轮免测与免打卡验收见 `EXEMPTION-ACCEPTANCE-20260911.md`。
