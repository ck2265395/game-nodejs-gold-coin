# 微信扫码续命实施计划

Goal: 实现真实 Native 0.01 元一次性续命，未配置时不影响小游戏。
Architecture: payment/wechat.js 处理微信签名验签与加解密；payment/store.js 处理 SQLite；payment/router.js 处理浏览器订单与回调；public/payment.js 处理二维码和恢复。
Tech Stack: Node.js 24、Express、node:crypto、node:sqlite、qrcode。
Spec: ../specs/2026-10-12-wechat-revive-design.md

约束：服务器价格1分；验签后确认到账；同一订单只能兑换一次；密钥不入库不入Git；原有游戏与gold-coin路径保留。
Review Focus: 错误金额/商户、伪签名、重复回调/兑换、服务重启、网络失败和页面刷新。

1. 编写支付密码学与订单状态测试，确认失败，再实现 WechatClient 与 PaymentStore。
2. 实现订单创建/查询/兑换/回调 router，测试未配置503、会话隔离、Origin、验签及数据库幂等。
3. 实现二维码与续命 UI，游戏快照接口；测试仅死亡时且正确死亡标识才恢复，重开清理状态。
4. 跑 npm test、语法检查和子路径 HTTP 验证。文档列出必要安全配置与未完成真实联调。自动提交并推送 work。
