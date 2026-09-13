# 暂停与继续参考

原 Web 函数摘录，仅供移植状态处理；依赖 Web 上下文，不能单独运行。

```javascript
async function transitionLiveSession(app, command) {
  const ui = checkinState(app);
  const local = loadSession(accountId(app));
  if (!local?.serverId || ui.sessionTransitioning) return;
  ui.sessionTransitioning = true;
  // Immediate display feedback; the server still decides credited duration.
  persist(app, command === 'pause' ? pauseSession(local) : resumeSession(local));
  app.render();
  try {
    const transition = command === 'pause' ? pauseServerSession : resumeServerSession;
    let result;
    try {
      result = await transition(local.serverId, local.serverVersion);
    } catch (error) {
      if (error.status !== 409) throw error;
      const current = await getServerSession(local.serverId);
      reconcileAuthoritativeSession(local, current);
      const target = command === 'pause' ? 'PAUSED' : 'IN_PROGRESS';
      result = current.status === target ? current : await transition(current.id, current.version);
    }
    if (loadSession(accountId(app))?.serverId !== local.serverId)
      throw sessionReconciliationError('Local session changed during transition');
    persist(app, reconcileAuthoritativeSession(local, result));
    app.state.workspace.activeServerSession = result;
  } catch (error) {
    if (loadSession(accountId(app))?.serverId === local.serverId) persist(app, local);
    apiFailureDialog(app, error, command === 'pause' ? tx('暂停失败', 'Pause failed') : tx('继续失败', 'Resume failed'));
  } finally {
    ui.sessionTransitioning = false;
    app.render();
  }
}
```
