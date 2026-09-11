# 教师材料预览与通知修复验收 2026-09-11

## 根因与修复
- 打卡列表、相册和免测材料缩略图原先只绘制图标与装饰渐变；真实文件仅在详情加载。新增共用 TeacherMediaThumbnail，复用现有媒体元数据与私有签名访问接口，按可见区域加载真实图片或静音视频首帧。保留原详情入口，加载失败显示中性提示并尝试刷新一次访问链接。
- 删除内部成绩册两处“向学生披露换算分、等级或排名”禁用按钮。
- 通知原先直接放入通用账号弹窗，缺少内容间距、滚动和完整空状态。补充弹窗尺寸、滚动区、未读卡片、时间、筛选状态、空状态和手机布局。

## 本地验证
- 真实 Docker 后端、数据库与对象存储，Edge 浏览器通过真实教师登录加载已有测试凭证。
- 列表及相册均验证图片 naturalWidth > 0、视频 readyState >= 2 且 videoWidth > 0；免测图片实际解码；装饰伪元素移除；成绩披露按钮不存在。
- 通知有数据状态、未读筛选及 390px 窄屏通过，截图人工检查通过。
- TypeScript、新增组件 ESLint 与 Linux portal 生产构建通过。

## 腾讯云验证与部署
- 源码提交 bcafdd612bc5f31ef51b2afe83fa5956319c29f7。
- 版本 /opt/bnbu-sports-production/releases/teacher-preview-20260911。
- Portal 镜像 bnbu-portal-production:teacher-preview-20260911，ID sha256:51ab0ab5bcb5dfb2902688808c7aeb9873c5389056f6f9510f70912c701e771b。
- 仅更新 portal；后端、数据库与运行设置保留，服务健康及公网 HTTP 检查通过。
- www.teacher.bnbusports.cn 真实登录、真实 COS 图片和视频首帧、免测材料、按钮删除、通知空状态/筛选/窄屏全部 PASS。
- 验收素材为隔离测试账号此前经真实上传流程保存的合成测试材料；截图中的绿色时钟和灰度图为这些文件的真实内容。
- 仅临时启用 BNBU-TEST-LONG 隔离教师；验收后已停用并递增 tokenVersion。

## 剩余依赖与交接
- 本次四项修复无发布阻塞。浏览器验收覆盖桌面 Edge 及窄屏布局，不代表所有实体手机机型验证。
- 此前安卓录像兼容与学生记录相关工作区变更另行保留，不计入本次 portal 发布结论。
- 回滚：使用前版 /opt/bnbu-sports-production/releases/c33f037b-teacher-cascade 的 compose 仅重新启动 portal 并恢复 current 链接；无数据库回滚。
- 自动验收脚本 tools/local-integration/teacher-previews-browser.mjs；证据见 evidence/teacher-preview-20260911。
