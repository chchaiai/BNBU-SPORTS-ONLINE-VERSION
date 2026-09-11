# 学生邮箱换绑浏览器闭环（2026-09-08 22:55）

依据 docs/business/10-student-flow.md 5.3：已验证邮箱换绑必须同时验证当前邮箱和新邮箱。现有页面与后端接口均已存在。

实际缺陷：binding.field 只更新内存，不更新发送/确认按钮 disabled 状态。有效邮箱填完仍无法发送，验证码填完仍无法确认。新增 syncBindingControls，在输入后同步按钮状态，涵盖邮箱格式、双验证码、挑战存在/过期、冷却和进行中请求。保留输入焦点，没有修改渲染结构、CSS 或布局。

真实 Edge + 本地 Docker 后端 + Mailpit 邮件验证：
- student-email-browser：未处理首次运动指引导致设置前超时，无邮箱修改。
- student-email-browser-retest：必填标签精确匹配导致定位超时，无邮箱修改。
- student-email-browser-fields-retest：改用输入 ID 后，确认发送按钮一直 disabled，emailRequests 为空，复现产品缺陷。
- student-email-browser-controls-retest：修复后双邮箱验证码提交 200，随后测试错误等待完整邮箱；页面合法显示 primaryEmailMasked。
- student-email-browser-restore：以新的 synthetic 邮箱登录，通过双 OTP 恢复原邮箱并核对脱敏显示，PASS。
- student-email-browser-verified：完整重新执行原邮箱登录→换绑临时邮箱→双 OTP 恢复原邮箱→刷新，全部通过。测试账号已恢复，未修改 .local 账号配置。
- node --check binding.js 通过。后端源码未改变，本轮不重复第十四次后端全量测试。

脚本提供 V81_EMAIL_RECOVERY_FROM，仅用于同一本地 synthetic 账号意外中断后的恢复；测试不输出验证码或令牌。先前日志中的临时邮箱为本地 .invalid 合成数据。

ACCEPTANCE.md 更新已验证的 Docker/协议/进度/成绩与用户暂缓删除决定，其余旧行明确标为历史待复核。剩余：首次绑定真实网页、换绑错误验证码/过期/冲突/响应丢失、通知偏好和退出等其余三端动作继续。客户端错误上报路由缺失仍待处理。整体目标未完成。
