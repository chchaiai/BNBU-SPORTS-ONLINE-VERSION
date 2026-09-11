# 持续联调启动与媒体签名地址

本轮持续浏览器联调启动失败，未提供可用的三端浏览器环境。失败配置按用户要求保留，未修复或绕过。

## 已实现与已验证

后端新增可选 `MEDIA_STORAGE_PUBLIC_ENDPOINT`。签名上传/读取地址使用该地址；健康检查、对象元数据和私有对象读取继续使用 `MEDIA_STORAGE_ENDPOINT`。两端共用桶、区域及凭据配置，不通过替换已经签名的 URL 来改变 Host。未配置新变量时沿用原地址。

`docker-media-signing-origin-20260908.txt` 退出 0：52 迁移、构建、启动和基础账号验证通过。专项直接调用已构建的存储适配器，验证配置解析、真实 MinIO 签名上传/下载与私有读取、错误 Host 403、无签名 403及缺省地址行为。请求通过容器网络连接 MinIO，同时保留签名使用的公共 Host；没有启动真实浏览器代理，没有走完整学生上传业务。

没有修改前端、业务权威文档或冻结 contracts。本轮没有新增数据库迁移或业务操作路由。

## 未通过的持续启动

新增 `tools/local-integration/compose.v81-browser.yml` 和 `run-v81-browser-backend.mjs`，意图复用本地 PostgreSQL、MinIO、Mailpit，为持续联调提供独立 `v81_browser_test` 数据库、持久化本地密钥和合成账号、真实接口发布的规则与人工审核模式。预期状态目录为忽略路径 `.local/v81-browser-state`；其中账号和密钥不得提交或打印到日志。

执行命令：

```powershell
docker compose --env-file .local/v81-sql.env -f tools/local-integration/compose.v81-test.yml -f tools/local-integration/compose.v81-browser.yml up -d --build backend-browser
```

`docker-browser-startup-20260908.txt` 退出 1，原始错误：

```text
cannot extend service "backend-browser" ... service "backend-startup" not found
```

Compose 在启动前拒绝配置。没有重写继承配置、另起命令绕过失败或改动旧测试夹具。启动脚本仅通过 `node --check` 语法检查；数据库初始化、账号引导、持久化密钥、规则发布、重启恢复、端口映射和三端页面操作均未取得运行通过证据。

检查 `.local/v81-browser-state` 尚不存在。数据库存在性只读证据见 `browser-database-presence-20260908.txt`，`f` 表示此时没有该数据库。三个计划端口 3199、19000、18025 不是本轮已启动页面的交付地址。

## 下一步与保留事项

持续启动配置失败需要在允许修复后处理，随后才能继续真实三端浏览器联调。既有协议数组检查、偏好删除、名单行数及其他失败继续保持记录。媒体签名专项通过不消除这些失败，也不代替持续启动或完整业务验收。

学生当前运动选择使用页面已有选项，没有调用旧 `sport-catalog` 占位接口；本轮没有为消除占位数量而填入任意运动目录数据。其现行业务用途仍需按整体接口清单核对。

本轮专项结束后停止 PostgreSQL、MinIO、Mailpit，保留数据卷。详细全范围状态见 `ACCEPTANCE.md`。
