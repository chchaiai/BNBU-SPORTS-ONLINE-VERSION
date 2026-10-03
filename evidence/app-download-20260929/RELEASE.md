# APP 内测入口与安装指南发布记录

日期：2026-09-29。两个站点均已发布。

## 学生网页端

- 地址：https://www.student.bnbusports.cn/student/
- 最终发布目录：`/opt/bnbu-sports-production/releases/app-beta-final-20260929`
- 静态资源版本：`2f5502be211eda3121f375b2`
- 本次更新前基线：`/opt/bnbu-sports-production/releases/course-list-20260928`，仍完整保留。
- 中间发布目录：`/opt/bnbu-sports-production/releases/app-beta-20260929`，用于最终登录页布局修正的直接回退。
- 发布以已验证的线上 288 个资源为基线，仅覆盖本次 APP 宣传与安装指引。其他本地业务修改未打包。
- 最终 294 个静态资源逐一通过源站 HTTPS 哈希和 immutable 缓存校验；公网入口、关键模块、二维码及安装页哈希通过。
- 学生/教师页面与 readiness 检查通过；Backend、Portal 容器 ID、镜像、启动时间及健康状态保持一致。
- 26 项相关测试通过；冒烟 86 项通过，1 项课程文案断言与发布前基线相同，没有新增测试失败。
- 生产构建本地检查：弹窗、收起动画、下载跳转、打卡页隐藏、无新增控制台错误。
- 线上检查：弹窗、收起后登录页预留空间、指引链接。未使用真实学生账号提交打卡或验证 APP 真机安装。
- 回退到直接前版：`sudo python3 /home/ubuntu/app-beta-final-20260929/deploy.py --rollback`。
- 如需完整撤销本次宣传更新，在上一命令成功后执行：`sudo python3 /home/ubuntu/app-beta-20260929/deploy.py --rollback`，回到 course-list 基线。
- 机器可读证据：`student-final-deployment.json`。

## 下载站

- 地址：https://www.bnbusports.cn/ ，正常跳转至 https://bnbusports.cn/ 。
- 提交：`13c9abedfb7c432ac479149cdb102c1554215e9e`，仅本次 4 个源码文件与 2 张二维码图片；没有推送 Git。
- 发布 ID：`20260929T135519Z-13c9abedfb7c-f64588f2`，状态 `SUCCEEDED`。
- 发布入口：`deploy.ps1 -Action Publish -Site sports`。
- 生产构建、类型检查、lint 通过；发布引擎校验首页与全部文件、私有路径不可访问、域名跳转、源站及公网 HTTPS 通过。
- 浏览器确认 iOS、Android、华为/鸿蒙指引及测试群入口显示正常；未见控制台错误。
- 安卓 APK HEAD 返回 200，大小 38,370,784 字节；TestFlight 邀请页返回 200。页面可达不代表真机安装验收。
- 上一版 ID：`20260914T061507Z-041ca5c46903-65a894bb`。
- 上一版备份：`/var/backups/bnbu-sports-download/20260914T061507Z-041ca5c46903-65a894bb.tar.gz`。
- 回退：在下载站父仓库执行 `./deploy.ps1 -Action Rollback -Site sports -ReleaseId 20260914T061507Z-041ca5c46903-65a894bb`。
- 首次尝试 ID `20260929T135114Z-13c9abedfb7c-5f752f09` 在切换前被拦截：旧发布目录存在 3 个不属于清单的 Android 1.1.2 文件。确认实际 Nginx 已从独立 artifacts 目录提供完全相同文件后，将旧目录残留移动到 `/var/backups/bnbu-sports-download/unmanaged-android-20260929`，保留全部内容并恢复原清单完整性，再由正式入口发布。
- 机器可读证据：`download-final-deployment.json`。

群二维码使用用户提供的原图，图片标注 10 月 6 日前有效；两站均提示过期后获取新的入群方式。
