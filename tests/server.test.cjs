const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const net = require('node:net');

test('根路径和 gold-coin 子路径均返回页面和正确的相对资源', async () => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stopped = once(child, 'exit');
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('启动超时')), 5000);
      child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('服务提前退出')); });
      child.once('error', reject);
    });
    for (const prefix of ['/', '/gold-coin/']) {
      const pageUrl = `http://127.0.0.1:${port}${prefix}`;
      const response = await fetch(pageUrl);
      assert.equal(response.status, 200);
      const html = await response.text();
      for (const file of ['game.js', 'style.css', 'payment.js']) {
        const match = html.match(new RegExp(`(?:src|href)="([^"]*${file})"`));
        assert.ok(match);
        const url = new URL(match[1], pageUrl);
        assert.equal(url.pathname, prefix + file);
        const resource = await fetch(url);
        assert.equal(resource.status, 200);
        assert.equal(await resource.text(), await fs.readFile('public/' + file, 'utf8'));
      }
      assert.equal((await fetch(pageUrl + 'missing-resource')).status, 404);
    }
    const redirect = await fetch(`http://127.0.0.1:${port}/gold-coin`, { redirect: 'manual' });
    assert.ok([301, 302, 308].includes(redirect.status));
    assert.equal(redirect.headers.get('location'), '/gold-coin/');
  } finally {
    child.kill();
    await stopped;
  }
});
