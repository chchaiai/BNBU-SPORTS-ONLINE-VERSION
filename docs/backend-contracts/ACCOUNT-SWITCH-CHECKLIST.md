# Codex 账号切换检查清单

本清单用于把阶段 12 从旧 Codex 账号交给新账号。所有状态均须用 Git/Bundle 命令复核，不能依赖聊天记录或 Memory。

## 旧账号结束前

- [ ] 根仓库 `git status` clean。
- [ ] 当前分支为 `chore/stage12-account-handoff`。
- [ ] `backup/stage12-complete-b472ffc` 存在并精确指向 `b472ffc28b1fb6fbd7557090a15f45c4c0206272`。
- [ ] 根 Bundle 已创建并通过 `git bundle verify`。
- [ ] Android Bundle 已创建并通过 `git bundle verify`。
- [ ] Web Bundle 已创建并通过 `git bundle verify`。
- [ ] 三个 Bundle 的外部路径、字节数和 SHA-256 已写入 `stage12-handoff-manifest.json`。
- [ ] `AGENTS.md` 已提交。
- [ ] `CURRENT-HANDOFF.md` 已提交。
- [ ] `NEXT-CODEX-PROMPT.md` 已提交。
- [ ] 本检查清单与 SHA-256 manifest 已提交。
- [ ] 没有 `.env`、Secret、Token、数据库文件、rootfs tar、真实名单或临时验收脚本进入 Git。
- [ ] 没有业务源码、Prisma schema、OpenAPI 或 Migration 变化。
- [ ] Android/Web gitlink 未变化，两个子模块工作树 clean。
- [ ] 已运行阶段 12H 要求的轻量检查并记录真实结果。
- [ ] 没有 push，没有 Pull Request，没有 merge/rebase。

## 切换账号后

1. 不创建新空项目，不执行 `git init`。
2. 在 Codex 中打开原目录：`C:\Users\23328\Desktop\new_version`。
3. 在写文件前执行：

   ```powershell
   git status
   git branch --show-current
   git rev-parse HEAD
   git log --oneline -10
   git submodule status
   git rev-parse backup/stage12-complete-b472ffc
   git merge-base --is-ancestor b472ffc28b1fb6fbd7557090a15f45c4c0206272 HEAD
   ```

4. 确认工作树 clean、当前分支为 `chore/stage12-account-handoff`、固定备份分支正确、业务基线是当前 HEAD 的祖先、两个 gitlink 精确匹配交接文件。
5. 完整阅读：

   - `AGENTS.md`
   - `docs/backend-contracts/CURRENT-HANDOFF.md`
   - `docs/backend-contracts/NEXT-CODEX-PROMPT.md`
   - `docs/backend-contracts/stage12-handoff-manifest.json`

6. 将 `NEXT-CODEX-PROMPT.md` 中“提示词开始”到“提示词结束”的完整内容发送给新账号 Codex。
7. 新账号完成 Git、checksum 和完整阶段 12 基线复验前，不写业务代码。
8. 阶段 13 必须从最终交接 HEAD 创建 `backend/official-roster-alignment`；如果同名分支意外已存在，不使用 `-f`，先报告并停止。
9. 不删除旧账号产生的分支、提交或备份，不改写 0001–0003。

## 离线恢复：根仓库

外部根 Bundle：

```text
C:\Users\23328\Desktop\new_version-stage12-handoff-backup\new_version-root-stage12.bundle
```

先验证，再克隆到一个新的、明确的恢复目录；不要覆盖原仓库：

```powershell
git bundle verify 'C:\Users\23328\Desktop\new_version-stage12-handoff-backup\new_version-root-stage12.bundle'
git clone 'C:\Users\23328\Desktop\new_version-stage12-handoff-backup\new_version-root-stage12.bundle' 'C:\Users\23328\Desktop\new_version-stage12-restored'
git -C 'C:\Users\23328\Desktop\new_version-stage12-restored' branch --all
git -C 'C:\Users\23328\Desktop\new_version-stage12-restored' rev-parse backup/stage12-complete-b472ffc
```

根 Bundle 保存根仓库 Git 对象和 refs；它只保留子模块 gitlink，不自动包含 Android/Web Git 对象。恢复后仍必须使用下方两个独立 Bundle。

## 离线恢复：Android 子模块

```powershell
git bundle verify 'C:\Users\23328\Desktop\new_version-stage12-handoff-backup\android-stage12.bundle'
git clone 'C:\Users\23328\Desktop\new_version-stage12-handoff-backup\android-stage12.bundle' 'C:\Users\23328\Desktop\new_version-stage12-restored\BNBU-Sports-Android-master'
git -C 'C:\Users\23328\Desktop\new_version-stage12-restored\BNBU-Sports-Android-master' checkout --detach e4cd2e5a623261cd19cddbd59d5cda7627bf7e98
```

如果恢复目录中已存在该路径，先停止并核对，不直接覆盖或删除。

## 离线恢复：Web 子模块

```powershell
git bundle verify 'C:\Users\23328\Desktop\new_version-stage12-handoff-backup\web-stage12.bundle'
git clone 'C:\Users\23328\Desktop\new_version-stage12-handoff-backup\web-stage12.bundle' 'C:\Users\23328\Desktop\new_version-stage12-restored\BNBU-Sports-Web-new'
git -C 'C:\Users\23328\Desktop\new_version-stage12-restored\BNBU-Sports-Web-new' checkout --detach a602280b4aa46d3e944671d341a7bf12bacb17cb
```

最后回到恢复后的根仓库执行 `git submodule status`，确认 gitlink 与两个 checkout HEAD 一致。

## 备份边界

- Git Bundle 不是 PostgreSQL 数据库备份。
- Git Bundle 不包含 MinIO 对象或 Docker Volume。
- 根 Bundle 不自动包含子模块对象；三个 Bundle 必须分别保留和验证。
- Bundle 不包含本地 `.env`、Secret 或生产凭据，也不应依赖这些临时文件才能读取 Git 历史。
- 阶段 12 的 Docker restart/persistence 证据不等于 production 备份恢复、RPO/RTO 或灾备演练。
