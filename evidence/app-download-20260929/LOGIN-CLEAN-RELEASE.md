# 登录页上方宣传卡片删除

已部署：https://www.student.bnbusports.cn/student/

版本：app-beta-login-clean-20260929

静态资源：7d9318cac3d130b1db94bdc8

仅修改登录页模块，删除上方卡片及导入。26 项相关测试通过，294 个资源校验及线上健康检查通过，容器未变更。

上次完整冒烟结果为 86 通过、1 项基线已有文案断言失败；本次没有重新运行全套冒烟。

回退：sudo python3 /home/ubuntu/app-beta-login-clean-20260929/deploy.py --rollback

前版保留于：/opt/bnbu-sports-production/releases/app-beta-final-20260929
