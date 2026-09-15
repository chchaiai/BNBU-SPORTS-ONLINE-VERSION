# 品牌搜索展示优化及部署

2026-09-14 完成。采用品牌名加入口用途的标题，区分官网、学生端、教师管理端。

- 官网：BNBU Sports｜北师港浸大体育平台与使用指引。
- 学生端：BNBU Sports 学生端｜体育打卡与学时查询。
- 教师端：BNBU Sports 教师与管理端｜体育课程管理。

三个入口配置独立描述、canonical、Open Graph 站点名称和标题；官网及学生端加入 WebSite JSON-LD。官网增加 robots.txt 与 sitemap.xml。三个图标沿用现有标识，调整 SVG 画布至正方形。学生端隐私同意屏和政策正文块加入 data-nosnippet，供支持该属性的搜索引擎排除摘要；隐私阅读与同意流程保留。

## 验证及上线

学生 smoke 87/87；管理端完整 typecheck 和生产 build 通过。官网原发布流程 npm ci、typecheck、lint、静态 build 及发布后首页和全文件校验通过。线上三个入口标题、描述、canonical、方形图标，官网 JSON-LD/robots/sitemap，以及学生隐私摘要属性已核对。服务健康 HTTP 200。

应用代码提交 4e7afb262b69f95dc066d744a1f98dffadde9234，发布 /opt/bnbu-sports-production/releases/search-20260914，前一版本 course-targets-20260914。回滚：sudo python3 /home/ubuntu/bnbu-search-20260914/deploy.py --rollback。

官网源仓库 C:/Users/23328/Desktop/new_version-untracked-backup-20260810-15s。SEO 提交 35301c0；最终源码提交 041ca5c46903198aa8e94acd696b597f4d819ac3。通过指定 deploy.ps1 -Action Publish -Site sports 上线。当前正式版本 20260914T061507Z-041ca5c46903-65a894bb，状态 SUCCEEDED。前一版本 20260913T031113Z-8e939cc9ad46-b348a52f，备份 /var/backups/bnbu-sports-download/20260913T031113Z-8e939cc9ad46-b348a52f.tar.gz。官网回滚使用同仓库 deploy.ps1 -Action Rollback -Site sports -ReleaseId 20260913T031113Z-8e939cc9ad46-b348a52f。

## 部署中发现的既有文件差异

官网首次发布被 Release file inventory changed 校验拒绝，未切换。原因：线上 current 后加了 Android 1.1.1-build5、build6 的 APK、校验文件和下载页，共六个文件、约 74 MB，原清单内文件均未变更。为保留下载并恢复正式发布校验，将这六个文件完整复制至 /var/www/bnbu-sports-artifacts/android/，新增 /android/ 固定静态路由，逐文件 SHA-256 与公开 HTTPS 下载核验通过后，将旧副本移至私有备份。正式版本清单恢复一致后重新运行原发布流程并成功。

迁移备份：/var/backups/bnbu-search-artifacts-20260914/，含原 nginx.conf、原 android 文件及哈希记录。程序与持久配置在官网仓库 deploy/separate_android_artifacts.py、deploy/nginx-site.conf。下载原 URL 保留；最终官网上线后两个 APK HEAD 均为 200。后续 Android 发布需写入独立 artifacts 目录，不再直接写入官网 current。官网发布/回滚均不清理这些独立文件。迁移前配置不能在未恢复文件位置时单独恢复。

## 交接边界

本次是站点配置优化并完成部署，不代表 Bing/Google 搜索结果已即时更新。标题、摘要、站点名、图标最终展示由搜索引擎决定，重新抓取时间无保证。未通过站长平台提交索引请求，未承诺排名或站点子链接。未修改后端、接口或数据库；无数据库迁移。未执行回滚演练。

参考：Google 搜索摘要说明 https://developers.google.com/search/docs/appearance/snippet ，Bing 站长指南 https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a 。

证据：evidence/search-appearance-20260914/。两仓库均为本地提交，未推送 GitHub。
