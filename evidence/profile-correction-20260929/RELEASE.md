# 要求重新完善按钮修复

## 原因与修改

线上点击后，原表单插入账号页面顶部；复现时表单 top=-476px、bottom=-336px，完全在当前视口之外。按钮已响应，但管理员看不到填写原因的界面。

`admin-users.tsx` 改为使用现有 AdminDialog，居中显示原因表单；空白原因不可保存，提交期间防止重复点击；失败信息显示在弹窗内并保留原因供重试。PATCH 路径、expectedVersion 和 profileUpdateReason 的业务含义保持一致。

## 验证

- TypeScript 检查和生产构建通过。
- 回归测试 143/146 通过，3 项失败与原 course-list 发布基线一致，没有新增失败。
- 本地独立交互夹具直接渲染修改后的 AdminUsers，使用虚构学生和本地请求替身，不连接生产 API。
- 列表第十行打开弹窗后位于可见区域；手机 390×844 弹窗完整可见。
- 空原因禁止保存；模拟失败时错误显示在弹窗内；修改原因后重试成功关闭；请求携带正确学生 ID、expectedVersion=7 和去除首尾空格的原因。取消正常关闭。
- 线上重新加载后，点击要求重新完善显示包含原因输入、取消和禁用保存按钮的对话框，并自动聚焦关闭按钮。随后取消，没有提交真实学生资料修改。
- 线上该用户标签的截图/DOM定位接口在后续核验时超时，因此提供的是本地虚构数据截图 `local-dialog.png`；线上对话框通过浏览器可访问性树确认。

## 发布与回退

- URL：https://www.teacher.bnbusports.cn/#admin/accounts
- 发布：`/opt/bnbu-sports-production/releases/profile-correction-20260929`
- 前版：`/opt/bnbu-sports-production/releases/app-beta-login-clean-20260929`
- Portal 镜像：`sha256:78d6158fa0a4aa49b8399550c33279204a4a75b093dd55c9ee58f5f3752d9902`
- 通过临时健康实例切换 Portal，源站校验 171 个新旧静态资源，旧缓存资源保留。
- 学生、教师首页与 readiness 均返回 200。Backend 未重启，学生网页版本保留，没有数据库迁移或业务数据写入。
- 回退：`sudo python3 /home/ubuntu/profile-correction-20260929/deploy.py --rollback`
- 机器可读证据：`deployment.json` 和 `validation.json`。
