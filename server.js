const express = require('express');
const path = require('node:path');

const app = express();
const port = Number(process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT 必须是 1 到 65535 之间的整数。');
  process.exit(1);
}

// 服务端只负责把 public 中的文件发送给浏览器。
app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(port, () => {
  console.log(`接金币第一步：http://localhost:${port}`);
  console.log('按 Ctrl+C 停止服务。');
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已被占用，请停止已有服务或修改 PORT。`
    : `服务启动失败：${error.message}`);
  process.exit(1);
});
