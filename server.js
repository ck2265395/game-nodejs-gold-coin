const express = require('express');
const path = require('node:path');

const app = express();
const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT 必须是 1 到 65535 之间的整数。');
  process.exit(1);
}

// 服务端只负责把 public 中的文件发送给浏览器。
const publicDirectory = path.join(__dirname, 'public');
// 保留根路径开发入口，同时支持现有网站下的独立游戏路径。
app.get('/gold-coin', (req, res, next) => {
  if (req.path === '/gold-coin') return res.redirect(308, '/gold-coin/');
  next();
});
app.use('/gold-coin', express.static(publicDirectory));
app.use(express.static(publicDirectory));

const server = app.listen(port, () => {
  console.log(`接金币：http://localhost:${port}`);
  console.log('按 Ctrl+C 停止服务。');
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已被占用，请停止已有服务或修改 PORT。`
    : `服务启动失败：${error.message}`);
  process.exit(1);
});
