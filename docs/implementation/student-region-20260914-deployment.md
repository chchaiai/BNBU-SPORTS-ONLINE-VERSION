# 管理端学生地域名称修复与部署

日期：2026-09-14。源代码本地提交：c931d34520fb8290175a701203a496c903f96658。

## 修改内容

根因是管理端列表和详情直接拼接 regionCode 与 otherRegionName，没有应用学生登记端既有名称映射。
从 student-regions.js 提取纯地域字典 region-catalog.js，学生登记端与管理端共用。列表、详情按当前语言显示名称，搜索同时支持地域名称和原编码。CN-44 显示广东、CN-23 显示黑龙江、CN-37 显示山东、CN-34 显示安徽。OTHER 优先显示自填名称；未填写显示破折号；未知编码保留原值，避免丢失信息。

API、数据库字段和权限无变更，无数据库迁移。部署管理端构建，以及学生端字典和引用模块。

## 验证

- 地域回归测试 2/2：覆盖上述四省、港澳台、中英文、自填地域、未填写、未知编码及过期自填值。
- 管理端 targeted ESLint、完整 typecheck 和生产 build 通过。
- 学生端 smoke 87/87 通过，git diff --check 通过。
- 本地真实 API 管理端页面加载通过，38 条测试学生记录；本地未有广东记录，故未将此浏览器检查记为地域名称搜索命中验收。
- 隔离生产候选容器 healthy，入口文件哈希一致。
- 发布后管理端、学生端、API ready 与下载站返回 HTTP 200。
- 线上管理端包含地域映射的 JS 与本地构建 SHA-256 一致；学生端两个模块公开 URL 的 SHA-256 与发布包一致。

## 发布及回滚

香港 CVM：43.129.193.7。
当前版本：/opt/bnbu-sports-production/releases/student-region-20260914。
回滚版本：/opt/bnbu-sports-production/releases/login-admin-d34e3e38-20260914。
发布程序：tools/production/deploy-student-region.py；服务器路径 /home/ubuntu/bnbu-region-20260914/deploy.py。
需要回滚时在服务器执行 sudo python3 /home/ubuntu/bnbu-region-20260914/deploy.py --rollback。
部署异常自动恢复前一版本；本次未触发或演练回滚。
线上地址：https://www.teacher.bnbusports.cn/ 。

## 剩余风险及交接

生产真实管理员登录后的学生列表尚未通过浏览器复验；未使用真实学生数据做写入测试。已通过线上镜像、公开资源哈希及服务健康核验发布结果。现有浏览器标签需刷新加载新资源。未知地域编码会继续展示原值以便排查。
构建存在既有大 chunk、punycode 和路由静态分类提示，未阻断构建。
证据：evidence/student-region-20260914/deployment.json 与 public-assets.json。
全部提交仅本地存档，未推送 GitHub。
