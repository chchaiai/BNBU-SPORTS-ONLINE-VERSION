# 帮助内容渲染验证（2026-09-08）

本轮只新增测试，产品代码未修改。通过管理员页面向本地 Docker 后端保存并发布包含 script、img onerror、svg onload、javascript/data 链接和合法 HTTPS 链接的合成文章。

`help-content-safety-browser-20260908.txt` 与 `help-content-safety-published-browser-20260908.txt` 均退出 0。断言管理员编辑预览、保存后和发布后无 script/img/svg/iframe/事件属性节点，原始 HTML 作为文本显示，执行标记未设置。合法 HTTPS 链接保留，预览链接带 noreferrer noopener；危险协议未成为链接。创建丢响应重试、发布/下线/重新上线及编辑回读回归通过。

同轮在学生本地网页加载实际 `/student/js/help-content.js` 模块，将同一输入渲染为 DOM；断言危险节点为零、HTML 文本保留、仅合法 HTTPS 链接及安全 rel 属性。此项验证学生实际渲染器，不是学生登录后通过帮助页面获取该文章的全链路；学生认证及组织隔离有此前独立证据。不能据此声明所有内容攻击方式均已排除。

保留截图 `help-content-safety-20260908.png` 和 `help-content-safety-published-20260908.png`，截图时已完成普通编辑，安全结论来自运行时 DOM 断言。

剩余：学生帮助完整页面联动、多账号/异常存储、移动视口及三端全量验收继续。所有写入仅为本地合成数据，未执行云端操作。
