# 申请真实上传与关闭后补充材料

2026-09-09。按学生业务 §9.3 和认证材料规则，修复学生网页申请接线，保留原表单、页面结构及布局。

## 修复

- 申请上传原来访问不存在的 `/exemption-applications/{id}/media-uploads`。改用已有 `/media-uploads`，传入本人 enrollmentId 与 EXEMPTION_APPLICATION，沿用真实对象 PUT、确认、处理状态及图片访问流程。
- 独立申请图片校验接受 JPEG/PNG/WebP；单张按现有后端 10485760 字节限制执行。运动凭证规则未改。
- 原来每次可选 20 张，改为首次与所有补充累计 3 张，已受理及本次图片去重计数；达到上限禁用添加，第四个选择不加入。
- 原草稿可以从已有卡片继续填写；选择类型时恢复同类型草稿，避免初次上传失败后重复创建申请。已有材料可继续关联，不要求重复上传已有图片。

## 真实本地验证

独立合成学生与课程只预置身份及课程，未预置任何申请材料。学生通过网页邮箱 OTP 登录，上传完整 PNG 与 WebP 字节，实际写入本地 MinIO，经 Docker 后端确认和处理后提交。教师经真实接口关闭课程、退回补材料。学生网页选择第三和第四个图片时只加入第三个，显示 3/3；补充提交保留原两个 mediaId。教师真实接口批准后，学生刷新看到已通过、审核意见和三张加载成功的缩略图。

初测因错误上传地址未进入 submit，保留 `application-real-upload-browser-first-20260909.txt`。修复后第二次实际完成上传、补充、批准及三张缩略图校验，最后因为审核意见同时显示两处而发生测试定位歧义，保留 `application-real-upload-browser-second-20260909.txt`。收窄定位后的只读回查通过，见 `application-real-upload-browser-readback-20260909.txt`；该日志明确 readbackOnly，不声称重新执行过上传。截图 `application-real-upload.png` 已目视检查。

专用图片规则与累计计数测试 2/2，通过边界为 10485760/10485761 字节。申请 form 与 transport 的 smoke 断言已按当前协议修正并通过。完整学生 smoke 仍有 8 项失败，涉及预览夹具 isApiMode、计时与阶段旧断言、帮助请求、旧成绩分页及会话冲突旧断言，输出完整保留于 `application-student-smoke-final-20260909.txt`，未记作全部通过。首次与中间 smoke 输出也保留。

本轮未修改后端源码、协议或迁移。最新完整 Docker E2E 仍为第 35 次 97/97，新增证据是上述浏览器对 Docker 后端的真实上传与补充。图片为明确合成像素，不是学校真实证明；腾讯 COS 和生产邮件未在本轮验证。

## 交接

本地夹具 `.local/v81-browser-state/closed-applications-real-materials.json` 保留最终申请与原材料标识，凭据留在忽略目录。后续检查学生 smoke 的 8 项失败，以及名单/OCR、通知精确定位、上传丢响应与更大材料边界等剩余项；三端总目标仍进行中。
