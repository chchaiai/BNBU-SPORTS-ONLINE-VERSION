# 名单导入页面边界验证

页面沿用已有文件选择、字段映射和预检流程。提示已与当前实现对齐：最多 500 行、当前网页上限 10 MB；真实上传支持 CSV/XLSX，旧 XLS 提示另存为 XLSX。原件上传提示不再称为规范化 CSV，相关英文文案同步。

`browser-roster-boundaries-final-20260908.txt`：本地 Edge 登录真实 Docker 后端，进入教师名单对齐，验证 501 行拒绝、500 行可预检、旧 XLS 拒绝，整个测试无名单写请求。测试使用合成文件；不代表真实名单提交、确认或成员核对闭环通过，也未验证 100 MB 上传。

`roster-browser-hints-typecheck-final-20260908.txt`：Portal TypeScript 退出 0。首次从仓库根目录调用 npx 未找到项目 TypeScript，失败记录保留于 `roster-browser-hints-typecheck-20260908.txt`；随后改用 Portal 已安装编译器通过。

下一步补充真实名单写入/确认的浏览器验证。管理员反馈页面还沿用旧只读分支，虽然反馈后端已有处理接口，需要接线并验证；正式结算和学期切换仍未实现。
