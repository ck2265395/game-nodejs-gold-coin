// 这段代码在浏览器里执行，不是在 Node.js 中执行。
const canvas = document.querySelector('#game');
const context = canvas.getContext('2d');

// x、y 表示篮子左上角的位置，单位是画布内部的像素。
const basket = {
  width: 100,
  height: 36,
  x: (canvas.width - 100) / 2,
  y: canvas.height - 80,
  color: '#e6a34b',
  speed: 300, // 每秒移动 300 个画布像素。
};

// 记录哪些键正在按住，而不是每次按键事件只移动一次。
const pressedKeys = new Set();
const movementKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD']);

function updateBasket(deltaTime) {
  const left = pressedKeys.has('ArrowLeft') || pressedKeys.has('KeyA');
  const right = pressedKeys.has('ArrowRight') || pressedKeys.has('KeyD');
  const direction = Number(right) - Number(left);

  basket.x += direction * basket.speed * deltaTime;

  // 上沿比篮子左右各多出 4 像素，也要留在画布内。
  basket.x = Math.max(4, Math.min(canvas.width - basket.width - 4, basket.x));
}

let lastTime = null;

function gameLoop(currentTime) {
  // requestAnimationFrame 的时间单位是毫秒，这里转换为秒。
  // 切换窗口后限制时间差，避免恢复时篮子突然跳很远。
  const deltaTime = lastTime === null ? 0 : Math.min((currentTime - lastTime) / 1000, 0.05);
  lastTime = currentTime;
  updateBasket(deltaTime);
  drawScene();
  requestAnimationFrame(gameLoop);
}

function drawScene() {
  // 每次绘制都先覆盖背景，以后加入动画时也会用到这一步。
  context.fillStyle = '#dceefa';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = '#bfd8b8';
  context.fillRect(0, canvas.height - 32, canvas.width, 32);

  // fillRect(x, y, width, height)：绘制一个实心矩形。
  context.fillStyle = basket.color;
  context.fillRect(basket.x, basket.y, basket.width, basket.height);

  // 篮子上沿和竖条，让简单的矩形更像一个篮子。
  context.fillStyle = '#b87931';
  context.fillRect(basket.x - 4, basket.y, basket.width + 8, 6);
  for (let offset = 18; offset < basket.width; offset += 20) {
    context.fillRect(basket.x + offset, basket.y + 10, 3, basket.height - 16);
  }
}

if (context) {
  window.addEventListener('keydown', (event) => {
    if (!movementKeys.has(event.code)) return;
    event.preventDefault(); // 方向键控制游戏时不滚动页面。
    pressedKeys.add(event.code);
  });

  window.addEventListener('keyup', (event) => {
    if (!movementKeys.has(event.code)) return;
    event.preventDefault();
    pressedKeys.delete(event.code);
  });

  // 切换到其他窗口时清空输入，避免错过 keyup 导致一直移动。
  window.addEventListener('blur', () => {
    pressedKeys.clear();
    lastTime = null;
  });

  drawScene();
  requestAnimationFrame(gameLoop);
} else {
  const message = document.querySelector('#game-error');
  message.textContent = '无法使用 Canvas 2D，请换用支持 Canvas 的浏览器。';
  message.hidden = false;
}
