# 无效后重新实际运动：本地网页验证

2026-09-09。使用新注册测试学生及已发布课程，Edge合成相机、真实本地Docker API、PostgreSQL、对象存储、Mailpit。当前学生首次注册来自 NEW-STUDENT-REGISTRATION-WEB-20260909.md。

## 通过证据

[第五轮](invalid-repeat-browser-fifth-20260909.txt)：管理员网页按课程开启人工审核；学生真实邮箱验证码登录；教师把第一条真实网页提交的短时相机记录判为INVALID；学生刷新后再次开始运动、拍照、结束并提交；新的sessionId及recordId均不同；教师把第二条判为VALID；学生刷新后前后两条记录都可见。

第一条会话、拍照、上传、提交在[第四轮](invalid-repeat-browser-fourth-20260909.txt)完成；该轮停在教师定位步骤，因此第五轮使用忽略目录保存的精确记录ID继续审核，没有伪造第一条成功或重复创建它。两条都是短时运动，creditedDurationSeconds=0；不把合成相机或本测试称为真人运动、正学时或日周配额已耗尽测试。此前35分钟真实服务器计时及后端日周/达标规则证据继续独立保留。

## 修复与原始失败

- [第一轮](invalid-repeat-browser-first-20260909.txt)：管理员切换课程后，状态加载前填写原因，回读清空输入，使保存按钮持续禁用。产品修复：当前课程状态未加载时禁用人工开关及原因输入；课程选择仍可操作，页面布局不变。
- [第二轮](invalid-repeat-browser-second-20260909.txt)：脚本把“当前状态: …”当成已加载，Playwright对原本勾选但禁用的checkbox.check提前返回，最终保存关闭。脚本改为等待明确开启/关闭状态。
- [第三轮](invalid-repeat-browser-third-20260909.txt)：首次登录后运动指引导致底部导航重绘；按既有用户流程刷新并完成指引后操作。
- [第四轮](invalid-repeat-browser-fourth-20260909.txt)：首次运动提交成功；教师审核表仅显示姓名，学号在详情内，按学号找行超时。测试定位有记录的Synthetic Join Student并核验精确recordId，第五轮完成同一条审核。
- 测试另按已核实控制器把finish、submit的成功状态断言设为200，V8.1审核为201。

第五轮对manual-mode读取注入1秒延迟但保留真实后端响应，确认加载期间输入禁用，加载后保存正文enabled=true，回读开启。[Portal类型检查](manual-loading-typecheck-20260909.txt)通过。产品变更仅两个disabled属性；后端未改，未重复宣称新一轮全量Docker回归。

## 交接

精确会话/记录恢复信息位于忽略目录.local/v81-browser-state/invalid-repeat.json；不归档登录令牌、OTP或邀请token。该合成课程保持人工审核开启，符合当前手工审核测试范围；历史记录保留。

全新课程发布仍等待原课程弹窗参数输入的最小调整授权，见 NEW-STUDENT-JOIN-FINDING-20260909.md。此项通过不覆盖该阻断，也不覆盖暂缓的学生游泳专用步骤。
