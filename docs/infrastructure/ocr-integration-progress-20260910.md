# 腾讯云 OCR 接入进展 · 2026-09-10

状态：进行中，未完成真实云端完整链路验收。

已核实当前代码基线 625fa0a6、初始工作区干净。用户确认沿用现有权限：总管理员配置 OCR；责任教师在教师／管理员平台上传名单或体测表格，核对识别草稿后确认，学生只读已确认事实。

## 当前实际外部状态

- 用户于本轮明确回复“同意”后，2026-09-10 13:15:25 已接受 OCR 条款并开通服务。控制台确认后付费关闭。
- 已创建 BNBUSportsHKTableOCR（285903017），13:19:09 关联 BNBUSportsHKCVMRole（4611686018448989343）；仅允许 RecognizeTableAccurateOCR。既有 COS 与 SES 策略仍有关联。
- 生产 CVM 两容器 healthy。部署变量仍是 OCR_PROVIDER=DISABLED、OCR_WORKER_ENABLED=false、OCR_TIMEOUT_MS=20000。
- 控制台已显示“表格识别-1k次免费资源包”，调用前总量/余量 1000；截至月末有效。此次只执行两次合成图片真实调用，统计有延迟，不能把调用前余量视为调用后余额。
- 总管理员通过正式管理页面保存配置版本 1：TENCENT_TABLE_V3 / ap-guangzhou / 20000ms / enabled=false；页面显示“保存成功”。暂不对业务启用。
- 新发现 COS 现行策略 285832458 仅覆盖 media/* 和 roster-sources/*，未覆盖源码现用 v81/ocr/*。待用户确认独立策略 tools/production/ocr-cos-role-policy.json，仅限同一香港桶该目录的读写、分片上传及失败清理删除。尚未提交此权限。

## 已完成的代码准备

复用现有 TencentOcrProvider、V81OcrWorker、OCR 批次/草稿 API、总管理员服务治理和 OcrImportPanel。无需新增前端密钥、数据库迁移或改变教师核对规则。

- Backend 为腾讯云 AuthFailure/UnauthorizedOperation、RequestLimitExceeded、LimitExceeded/ResourceInsufficient 分别保留安全的鉴权、限流、额度错误分类；不透传上游原始消息。
- Worker 允许持久化上述安全错误，避免归为无区分的执行失败。
- 教师界面增加鉴权、额度、限流、无表格、空表格、任务失败提示。
- Provider 定向测试 7/7，通过禁用配置、原始字节与摘要绑定、超时/服务错误、安全错误分类、WebP 无损准备、无效与超限图片等测试。这里使用注入的模拟 provider，不能作为腾讯云真实成功证据。
- Backend typecheck 与 Portal 完整 typecheck（含现有 Contract binding 检查）均通过。
- 续行构建验证：Portal `npm run build` 通过；Backend 使用与既有 Dockerfile 相同的仅构建占位 MIGRATION_DATABASE_URL 后 `npm run build` 通过，生成物没有引入 Git 差异。首次未设该变量时 Prisma 明确拒绝加载配置；未连接或迁移生产数据库。
- 本机 Docker 引擎未就绪，改为把已构建的 dist 上传 CVM，以现有已验证 Linux 镜像作为基础追加应用构建产物；没有复制 Windows 原生依赖，没有变更依赖版本。两个镜像已成功构建，Backend readiness 与 Portal HTTP 预检均 200。

已创建策略 BNBUSportsHKTableOCR，内容见 `tools/production/ocr-role-policy.json`，只含 `name/ocr:RecognizeTableAccurateOCR`、resource *。真实 Provider 调用已验证 CVM metadata 临时凭据可用，无静态 SecretId/SecretKey。

## 真实 Provider 验证与部署准备

- 首次探测在镜像内渲染合成表格，出现 Fontconfig 错误且预期学号断言失败。该失败保留在 `ocr-provider-evidence-20260910.json`。改由有字体的构建主机生成 PNG，并人工视觉检查后重试。
- 13:28:27（北京时间）真实调用 PASS：requestId `88ccba24-797c-4919-bd77-dac758ea364d`，1 表格 / 9 单元格，合成学号匹配，requiresTeacherConfirmation=true。证明 Provider 调用和真实响应解析；尚不证明页面完整链路。
- 新 Backend 镜像 `bnbu-backend-production:ocr-88deef17`：sha256:239033eca0be9288478490ca7ecfbc671c1aa1096aa8a938cfd48a98e50c0c06。
- 新 Portal 镜像 `bnbu-portal-production:ocr-88deef17`：sha256:3ca034ef401baafe6b39f9289cfb5f2571ad5f8d3eebba84886143b7a8b1560e。
- 构建来源 88deef17aaced2cb93f04757a40bbb0c03ad324a；上传包 SHA256 8c48571143ebfca0cca4c3575b681eec2ee725d215b33acfeee453f9981930be。Dockerfile 见 tools/production/Dockerfile.ocr-*-layer；构建上下文为各自 dist/。
- tools/production/nginx.conf 已准备 OCR 两个上传路由专用 101 MiB 请求上限（100 MiB 文件加 multipart 开销），关闭请求缓冲；Backend 已自行流式限制文件字节。Nginx 独立语法检查通过。该配置尚未安装到正式服务，普通 API 仍为 2 MiB。
- 当前正式 release 仍为 /opt/bnbu-sports-production/releases/f0f628ae-scanner1，未切换新镜像，未执行数据库 Migration。
- 13:30 已停止并移除本次两个临时预检容器以释放内存，镜像保留；正式两个容器仍 healthy，正式 HTTPS readiness 返回 UP。
- 回滚准备：保留上述旧 release 和不可变旧镜像；切换时应备份实际 Nginx 与 release 指向，恢复旧 compose/env、Nginx 后检查 readiness 和两端 HTTPS。OCR 组织配置通过追加 disabled 修订暂停，不删除识别证据。

## 待完成

1. 待用户确认 OCR 专用 COS 目录权限，再创建并关联独立最小权限策略；现有 OCR 单接口授权已完成，不需重复确认。
2. 安装已验证的上传配置及新镜像，部署 OCR worker 配置并通过管理界面启用；Provider 返回格式和 ap-guangzhou 已真实验证。
3. 用合成名单和体测图片从页面上传，验证 Backend → COS → 腾讯云 OCR → 持久化草稿 → 页面显示和人工核对。
4. 完成页面可观察的正常识别、无法识别/无效图片、服务故障、权限/配置异常与恢复；保留真实调用与故障注入的证据区别。
5. 最终部署、回滚说明、完整交接和本地存档；当前生产服务未切换 OCR。

参考：[表格 V3 接口](https://cloud.tencent.com/document/api/866/86721)、[公共错误码](https://cloud.tencent.cn/document/api/866/33528)、[免费额度](https://cloud.tencent.com/document/product/866/35945)、[服务条款](https://cloud.tencent.com/document/product/866/37103)。
