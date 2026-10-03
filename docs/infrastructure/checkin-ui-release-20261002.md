# 2026-10-02 三端前端检查与发布

北京时间 2026-10-02 21:04 完成三端发布，随后补发首页已结束运动的文案修正，最终版本为 `checkin-ui-final-20261002`。学生端更新打卡布局、连续动效、滑动结束与确认、结束奖励、凭证上传队列、状态标记、原线条运动图标动画和 BNBU SPORTS 发光标志。教师端与管理端共用门户，已重新构建并发布。

## 检查与修复

- 学生单元测试最终 202/202；学生冒烟 88/88；本地凭证存储测试 5/5；预览运行配置检查通过。
- 门户完整类型检查、生产构建通过；扩大到全部测试文件后为 184/187。以下 3 项失败与线上对应的 `access-performance-20260930` 基线一致，没有新增失败：
  - `teacher workspace exposes invalid records and direct correction wording`：旧的 AI 审核提示文字断言。
  - `keeps teacher overview metrics single-sourced and separate from status filters`：旧断言读取 `records`，现有实现使用按班级过滤的 `scopedRecords`。
  - `uses one portal-backed AppSelect instead of native browser selects`：旧断言固定原生选择器为 2 个，现有班级／AI 筛选已增加选择器。
- 管理端课程目录补充兼容处理：接口遗漏新字段时显示“暂未提供”，显式 null 显示“未发布”，合法 0 保留为 0。覆盖缺失、null、零、正常值与非有限值。
- 收尾发现并修复：首页曾把所有已结束运动显示为“记录待提交”，导致未达最低时长的运动被误标。现在显示“已结束 · 返回查看”；增加短时长、正常时长及未知时长的回归测试。
- 本地浏览器验证：教师课程列表、打卡审核列表和记录详情；管理端课程目录和详情；学生开始运动、暂停、返回后重进、最低时长结束拦截、结束奖励、空白说明拦截、填写与提交示例。
- 线上浏览器验证：学生登录页正常；已有管理员会话的系统概览正常，课程目录读取 44 个课程卡片；两站没有浏览器脚本错误。课程目录的新四项运动要求字段当前服务端未提供，显示“暂未提供”。

本地提交使用明确标注的示例场景。没有提交真实运动、上传真实凭证或执行真实教师审核；真机拍摄与正式账号的完整运动审核闭环不在本轮验收证据内。系统概览显示既有业务事件计数 78261，页面已注明这是未消费或失败事件数量、不是管理员待办；本轮没有操作业务事件。

## 发布范围与证据

- 旧版本：`/opt/bnbu-sports-production/releases/access-performance-20260930`
- 新版本：`/opt/bnbu-sports-production/releases/checkin-ui-20261002`
- 门户镜像：`sha256:b0747c27891913e4a968c176e3d15b8839c72fd7cce115a8714c4e07e0d51a85`
- 学生资源版本：`acaaf575da1f3d744253ddb6`
- 上传发布包 SHA-256：`31ffa2586c018a1a9999f06071c0e343d8a97d9ae004514a65fc19da6989ea9c`
- 学生 34 项资源新增或变化；18 项本地第三方文件字节差异按线上原版本保留。
- 共校验 559 项不可变资源：学生 321、候选门户 31、旧门户 207。保留旧资源供已打开页面继续使用。
- 门户先预热，确认可渲染，再切换；Nginx 配置最终与发布前一致。
- 后端容器、镜像与启动时间保持一致；数据库迁移 0、业务数据写入 0。
- 源站两站首页和 readiness 均为 200；本机通过公网域名再次检查两站首页为 200，readiness 为 READY/UP。
- 学生正式 HTML 使用新版本资源；新标志的稳定地址同时提供，兼容其现有绝对路径。

发布脚本：`tools/production/deploy-checkin-ui-20261002.py`。
打包门禁：`tools/production/package-checkin-ui-20261002.py`。
部署结果及截图：`evidence/web-release-20261002/`。
原始测试、发布日志及现场文件：`.local/web-release-20261002/`。

## 回滚

上一个 release、门户镜像、Nginx 原配置与静态资源均已保留。部署脚本会检查当前版本与预期状态，发生切换失败时自动恢复；此次发布成功，没有主动切回旧版。

最终文案修正使用学生资源版本 `f594bce1706141fef2c44006`，只变更 `js/checkin-experience.js` 及引用它的入口版本。再次验证 321 项资源，两个应用容器保持一致。结果见 `evidence/web-release-20261002/final-deployment.json`。最终包 SHA-256 为 `7753bd60e029afa68dbf9f976ccb1d1c9a70b78b455b0ac2eef9682ec7d50db5`。

仅撤回最后一处文案修正：

```sh
sudo python3 /home/ubuntu/checkin-ui-return-20261002/deploy.py --rollback
```

若需撤回本次全部前端发布，先执行上面的回滚，再执行：

```sh
sudo python3 /home/ubuntu/checkin-ui-20261002/deploy.py --rollback
```

教师／管理端：<https://www.teacher.bnbusports.cn/>。
学生端：<https://www.student.bnbusports.cn/student/>。
