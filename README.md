# 接金币：第二步

已完成背景、地面和篮子，并加入键盘移动。按住左右方向键或 A、D 移动，松开停止；尚未加入金币。

## 启动

在项目目录打开终端，安装依赖并启动（需要 Node.js 和 npm）：

```powershell
npm install
npm start
```

打开 http://localhost:3000 。按 Ctrl+C 停止服务。依赖安装后也可以直接执行 `node server.js`。

当前 Codex 环境没有 PATH 中的 npm，首次依赖已使用环境自带的 pnpm 安装；你现在可以直接运行 `node server.js`。在有 npm 的普通 Node.js 开发环境中，使用上面的标准命令即可。

如果 3000 已被占用，在 PowerShell 中设置 `$env:PORT = '3001'`，再启动并访问 http://localhost:3001 。

## 按什么顺序读代码

1. `server.js`：Express 把 public 目录里的文件发送给浏览器。
2. `public/index.html`：创建 480 × 640 的画布，加载 CSS 和 JavaScript。
3. `public/game.js`：浏览器取得 2D 绘图上下文，再执行 drawScene()。
4. `public/style.css`：让画布适应屏幕宽度，高度按比例缩放。

Node.js 执行 server.js；浏览器执行 game.js。修改 game.js 后刷新页面即可看到变化，修改 server.js 后需要重启服务。

## Canvas 的坐标

原点 (0, 0) 在左上角，x 向右增加，y 向下增加。画布内部始终使用 480 × 640 的坐标，手机上只是缩小显示。

`context.fillStyle` 设置接下来使用的颜色。
`context.fillRect(x, y, width, height)` 在指定左上角位置绘制一个实心矩形。

篮子宽 100，因此居中的 x 是 `(480 - 100) / 2 = 190`。y 是 `640 - 80 = 560`。

绘制顺序为背景 → 地面 → 篮子 → 篮子装饰。后画的图形会盖在先画的图形上。

## 你的练习

打开 public/game.js，每次只改一处，然后刷新：

1. 把 basket.color 改为 '#5b8def'，观察篮子颜色。
2. 把 basket.x 改为 50，观察篮子向左移动。
3. 把 basket.y 改为 400，观察篮子向上移动。
4. 将 x 和 y 恢复原值，解释为什么减小 y 会向上移动。

## 第二步：键盘与动画循环

`keydown` 把按下的键加入 pressedKeys，`keyup` 将它移除。Set 是不重复的集合，按住键时收到重复事件也不会重复添加。

`requestAnimationFrame(gameLoop)` 请求浏览器在下一帧调用 gameLoop。每一帧先更新篮子的位置，再绘制整个场景，最后预约下一帧。

`deltaTime` 表示距离上一帧经过的秒数。移动距离 = 方向 × 每秒速度 × 经过的秒数。例如速度 300，经过 0.02 秒，就移动 6 像素。这样不同屏幕刷新率下移动速度基本一致。

左方向为 -1，右方向为 1，不按或同时按左右则为 0。篮子的上沿左右各突出 4 像素，所以 x 限制在 4 到 376 之间。窗口失去焦点时清空按键，避免篮子持续移动。

练习：将 basket.speed 从 300 改为 150，刷新后感受速度变化；再改为 450，比较区别。修改浏览器代码只需要刷新页面。

下一步：让一枚金币从上方落下。
