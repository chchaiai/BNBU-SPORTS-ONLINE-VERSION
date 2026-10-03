# 手机定位实验页

状态：2026-09-25 已按用户要求删除服务器部署，包括网站配置、网页与 APK、专用 HTTPS 证书及服务器上传文件。本地源码保留；DNS 记录未修改。以下部署与验证记录为删除前的历史记录。

原线上入口：https://verify.verityai.cn/（已下线）

原 Android 测试安装包：https://verify.verityai.cn/location-lab.apk（已删除）

## 使用

1. 在 Android 手机上下载安装包，打开“手机定位”。需要 Android 8.0 或以上。
2. 开启 Wi-Fi 和系统位置服务，点击“获取定位与 Wi-Fi”，允许精确位置和附近设备权限。
3. 页面显示经纬度、精度、来源、定位时间、当前连接 BSSID，以及附近 AP 的 BSSID 和 RSSI。
4. 在每个需要识别的地点填写名称，扫描后保存；每处至少 3 次独立采样，建议间隔 30 秒。保存至少 2 个地点，每次至少 3 个有效 AP，再扫描并点击“识别当前位置”。

普通浏览器只能获取系统定位。Android 安装包打开同一套本地网页，通过原生桥接读取传感器；它不把采集结果传到服务器，也不会同步到另一台设备的浏览器。指纹只保存在当前应用本机存储，卸载或清除应用数据会丢失。

## 实现与边界

- 原生：LocationManager GPS / network providers；WifiManager 扫描广播后读取新结果，过滤旧时间戳，30 秒主动扫描间隔，20 秒扫描超时，30 秒定位截止，退到后台即停止。
- 原生桥接只允许 APK 内打包的四个静态资源，禁止跳转、外部请求、文件访问和明文流量；应用未申请 INTERNET 权限。网页没有上传接口或第三方脚本。
- 指纹：同名位置保存最近 20 次有效采样，使用各 AP RSSI 中位数；至少 3 个共同 AP、交并集覆盖率至少 60%、RSSI 均方根差不超过 12 dBm，排名差不足 3 时拒绝区分。阈值为实验启发式，尚未经过现场标定，不能承诺米级精度。
- API 回报 GPS 时才标为 GPS；网络和浏览器定位明确标注。设备可能屏蔽当前连接 BSSID，此时显示未提供。
- Android 系统会限制扫描频率，授权并不保证每次扫描成功。参考：[Android Wi-Fi scanning](https://developer.android.com/develop/connectivity/wifi/wifi-scan)。
- 当前提供开发测试签名 APK，不是应用商店发行包。

## 构建与验证

Android：JDK 17、Gradle 8.13、Android SDK 36、AGP 8.13.0，运行 `gradle assembleDebug`。必要时使用本机 SDK 的 aapt2 覆盖 Maven aapt2。APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`，构建完成后复制为 `web/location-lab.apk`。

算法测试：`node --test tools/location-lab/fingerprint.test.cjs`。

浏览器验证：`node tools/location-lab/browser-check.cjs`。复用仓库 `.local/browser-test` 中的 Playwright；设置 `LOCATION_LAB_URL=https://verify.verityai.cn/` 可验证线上。测试使用模拟坐标和模拟 AP，截图在忽略的 `qa/` 目录。

## 部署

独立 Nginx 站点 `/etc/nginx/sites-available/verify.verityai.cn.conf`，静态发布目录 `/var/www/verityai-verify/releases/20260925-081506`，`current` 指向该版本。证书到期 2026-12-24，certbot.timer 已开启。

首次部署脚本 `deploy.py` 只接受新目录和新站点；重复运行会主动停止，后续升级应创建新发布目录、核对文件摘要，再原子切换 current。首次上线的即时 TLS 探测碰到 Nginx reload 交接阶段，自动撤销了站点启用；检查证书与配置后重新启用，公网与服务器证书验证均成功。脚本已增加有限重试。

回滚本次新增站点（保留发布文件与证书）：

```sh
sudo unlink /etc/nginx/sites-enabled/verify.verityai.cn.conf
sudo nginx -t && sudo systemctl reload nginx
```

已验证：5 项算法测试、桌面与 390px 浏览器布局、定位成功/拒绝、模拟原生数据显示、指纹保存/匹配/持久化/重复及过期拒绝、APK 构建和签名、公网五个文件 SHA256 一致、HTTPS 200、HTTP 308、现有业务 readiness UP。Android 模拟器成功安装、页面加载、原生权限弹窗；注入模拟 GPS 后，原生页面显示 22.3500000 / 113.5300000、GPS 来源、模拟器 BSSID 及 1 个 AP。真实 Android 手机采集、多 AP 环境和现场室内匹配精度尚未验收。
