# 真实部署有界压测复测

此目录保存 2026-09-11 香港部署测试工具。默认固定目标是该次核验的 `43.129.193.7`，不是通用公网压测器。运行前重新核对主机、镜像、业务范围、可用内存和监控。

## 新一轮准备

1. 创建新的测试批次路径，并一致替换脚本中的 `bnbu-performance-20260911`、本地 `.local/performance-20260911` 和 evidence 路径。原批次账号完成后会停用；不要重新启用旧账号复测。
2. 服务器使用固定 Backend image ID、现有 runtime JSON/CA/mail.env，复用仅含 INSERT 夹具的 production-smoke-helpers.mjs。`remote-helper.py` 为独立 helper 设置 256 MiB 内存、0.5 CPU、只读根文件系统与最小容器权限。
3. `remote-helper.py seed` 创建新合成组织与 200 个学生；`history` 添加 2,000 条合成历史记录；`refresh` 更新测试访问令牌；`activate` 可通过真实 API 为前 60 个合成学生开始运动。`inspect` 输出匿名统计。历史 fixture 不是运动材料真实性验收。
4. 在独立 SSH 会话运行 `sudo -n python3 <本轮目录>/remote-helper.py monitor`。该监控有一小时硬截止；可在本轮 private 目录写 `stop` 文件提前退出。
5. 将本轮 `load-private.json` 用 SCP 复制到对应 `.local/` 路径；仅私密文件保存令牌，不得输出或提交。正常令牌有效期为 900 秒，stairs 会在需要时刷新。

## 执行

从仓库根目录运行；每次首先完成 smoke，再依次测试，出现停止条件后查明原因并检查恢复。

```powershell
node tools/performance/load.mjs smoke 1 20 5000
node tools/performance/stairs.mjs 1,5,10,20,40,80,120,160,200 60 5000
node tools/performance/stairs.mjs 5,10,20,40,80,120,160,200 30 0
node tools/performance/load.mjs stage 200 300 3333
node tools/performance/load.mjs write 1 20 5000
node tools/performance/load.mjs write 5 20 5000
node tools/performance/load.mjs write 10 20 5000
node tools/performance/load.mjs write 20 20 5000
```

命令中的 200 人稳定档必须替换为本轮已经通过的档位；以上命令是分步复测示例，不要一次性无条件串行升压。write 使用前面的学生账号，须在 activate 之前执行，避免合法的已有会话冲突。write 的人数为同一轮业务操作用户数，每人依序 start/pause/resume/cancel。

默认单个用户循环的开始间隔约 5 秒；`thinkMs=0` 为持续请求突发模型。每个 VU 同一时刻最多一个在途请求。150 RPS 限制位于发压端；队列等待不计入 HTTP 延迟，因此到达该上限且未劣化只能报告容量下界。低档次数较少时 p95 包含首次 TLS 建连成本。

## 恢复、归档与比较

先停止客户端发压；执行 `remote-helper.py close` 通过真实 API 取消本轮尚未结束的合成运动，再停用本轮两个组织的账号并增加 tokenVersion。使用 inspect 确认 active_users=0、open_sessions=0。保留合成事实，不删除数据库数据或 COS 对象。

停止本轮数据库观察容器，核对 Backend/Portal image、startedAt、restartCount、OOM、health 与发布目录；核验学生站、教师站、分发站和 readiness。主机可用内存、数据库等待/错误应恢复。

```powershell
python tools/performance/summarize.py
python tools/performance/plot.py
git diff --check
```

优化复测必须保留相同数据规模、请求比重、发压机与网络、思考时间、时长和停止阈值。先重复旧稳定档，再探索上一个停止档；每次只改变一个配置，比较 p95/p99、吞吐、错误、CPU、内存、连接及网络曲线。源码优化先本地验证，部署由对应发布流程管理。
