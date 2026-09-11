# 运动材料端到端测试（2026-09-08）

独立 Docker/PostgreSQL 构建后运行 media-evidence.e2e.test.ts，原 runtime-conformance-hook 开启，4/4 通过、退出 0。证据 `docker-media-e2e-current-first-20260908.txt`。

完整 E2E 首轮此前在 PNG 确认返回 422（保留于 docker-backend-e2e-full-first-20260908.txt）。旧 png() 只拼接文件头与结束标志，缺少有效像素数据；当前 media-validator 使用 sharp 完整解码和 stats 校验，不能把这类伪文件作为成功 fixture。改为 sharp 生成真实 2×3 PNG，声明长度与 SHA-256 仍按真实字节计算。教师补已改密账号安全记录，仅在本测试套件建立，不改共享 fixture。

通过范围：上传能力同键重放、对象字节确认、同一会话绑定、工作器处理、学生私有原图访问、教师只读元信息及原图拒绝、状态/审计/outbox 计数，伪 MIME 拒绝不产生部分验证事实，跨会话绑定拒绝，记录提交后禁止新增或绑定材料。另有既有合成 WebM 元数据路径通过；此结果不证明完整视频播放或实际音频解码。

本套件使用 MemoryMediaStorage 替身承接对象字节，HTTP 与 PostgreSQL 真实运行；不能作为 COS/MinIO 网络传输验收。相关真实 MinIO 专项应继续单独保留。没有修改产品校验、相机来源限制或前端 UI。

其他 E2E 套件与三端完整业务验收继续，本专项不改变此前完整套件结果。
