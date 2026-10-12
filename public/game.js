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

// 金币的 x、y 是圆心坐标；从画布顶部外侧开始下落。
const coin = {
  radius: 12,
  x: canvas.width / 2,
  y: -12,
  speed: 180, // 每秒下落 180 个画布像素。
};

const scoreDisplay = document.querySelector('#score');
const livesDisplay = document.querySelector('#lives');
const gameOverPanel = document.querySelector('#game-over');
const finalScoreDisplay = document.querySelector('#final-score');
const restartButton = document.querySelector('#restart');
let score = 0;
let lives = 3;
let gameOver = false;
let started = false;
let paused = true;
const playButton = document.querySelector('#play');
const statusDisplay = document.querySelector('#status');
livesDisplay.textContent = String(lives);
scoreDisplay.textContent = String(score);

function resetCoin() {
  coin.y = -coin.radius;
  coin.x = coin.radius + Math.random() * (canvas.width - coin.radius * 2);
}

function updateCoin(deltaTime) {
  if (gameOver) return;
  const previousBottom = coin.y + coin.radius;
  coin.y += coin.speed * deltaTime;

  // 用金币的包围盒检查横向重叠；底边必须从上方跨过篮子上沿。
  // 比较前后两帧，避免金币跨过上沿时漏判，也避免从侧面移入时误计分。
  const overlapsBasket = coin.x + coin.radius >= basket.x
    && coin.x - coin.radius <= basket.x + basket.width;
  const reachesBasket = previousBottom <= basket.y
    && coin.y + coin.radius >= basket.y;

  if (overlapsBasket && reachesBasket) {
    score += 1;
    scoreDisplay.textContent = String(score);
    resetCoin();
  } else if (coin.y - coin.radius > canvas.height) {
    lives -= 1;
    livesDisplay.textContent = String(lives);
    if (lives === 0) {
      gameOver = true;
      pressedKeys.clear();
      activePointers.clear();
      finalScoreDisplay.textContent = String(score);
      gameOverPanel.hidden = false;
      updatePlayControls();
    } else {
      resetCoin();
    }
  }
}

// 记录哪些键正在按住，而不是每次按键事件只移动一次。
const pressedKeys = new Set();
// 指针和键盘分开记录，释放触控不会清掉仍按住的键。
const activePointers = new Map();
const movementKeys = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD']);

function updateBasket(deltaTime) {
  const left = pressedKeys.has('ArrowLeft') || pressedKeys.has('KeyA')
    || [...activePointers.values()].includes(-1);
  const right = pressedKeys.has('ArrowRight') || pressedKeys.has('KeyD')
    || [...activePointers.values()].includes(1);
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
  if (!gameOver && !paused) {
    updateBasket(deltaTime);
    updateCoin(deltaTime);
  }
  drawScene();
  requestAnimationFrame(gameLoop);
}

function drawScene() {
  // 每次绘制都先覆盖背景，以后加入动画时也会用到这一步。
  context.fillStyle = '#dceefa';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // arc 的圆心、半径和起止角度决定金币形状。
  context.beginPath();
  context.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
  context.fillStyle = '#f5c542';
  context.fill();
  context.strokeStyle = '#b87916';
  context.lineWidth = 2;
  context.stroke();

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

function restartGame() {
  score = 0;
  lives = 3;
  gameOver = false;
  started = true;
  paused = false;
  updatePlayControls();
  scoreDisplay.textContent = String(score);
  livesDisplay.textContent = String(lives);
  finalScoreDisplay.textContent = '';
  gameOverPanel.hidden = true;
  basket.x = (canvas.width - basket.width) / 2;
  pressedKeys.clear();
  activePointers.clear();
  lastTime = null;
  resetCoin();
  drawScene();
  // 原有动画循环继续运行，重开时不再创建第二条循环。
}

function bindMovementButton(selector, direction) {
  const button = document.querySelector(selector);
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || gameOver || paused) return;
    event.preventDefault();
    // 捕获指针，手指移出按钮后松开也能收到事件。
    button.setPointerCapture(event.pointerId);
    activePointers.set(event.pointerId, direction);
  });
  const release = (event) => activePointers.delete(event.pointerId);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}

function updatePlayControls() {
  playButton.disabled = gameOver;
  playButton.textContent = !started ? '开始游戏' : paused ? '继续游戏' : '暂停游戏';
  statusDisplay.textContent = gameOver ? '游戏结束，点击重新开始再玩一局。'
    : !started ? '准备好后点击开始游戏。' : paused ? '已暂停，点击继续游戏。' : '游戏进行中';
}

function pauseGame() {
  pressedKeys.clear();
  activePointers.clear();
  lastTime = null;
  if (started && !gameOver) paused = true;
  updatePlayControls();
}

function togglePlay() {
  if (gameOver) return;
  if (paused) {
    started = true;
    paused = false;
    pressedKeys.clear();
    activePointers.clear();
    lastTime = null;
    updatePlayControls();
  } else {
    pauseGame();
  }
}

if (context) {
  playButton.addEventListener('click', togglePlay);
  updatePlayControls();
  bindMovementButton('#move-left', -1);
  bindMovementButton('#move-right', 1);
  restartButton.addEventListener('click', restartGame);
  window.addEventListener('keydown', (event) => {
    if (!movementKeys.has(event.code)) return;
    event.preventDefault(); // 方向键控制游戏时不滚动页面。
    if (!gameOver && !paused) pressedKeys.add(event.code);
  });

  window.addEventListener('keyup', (event) => {
    if (!movementKeys.has(event.code)) return;
    event.preventDefault();
    pressedKeys.delete(event.code);
  });

  window.addEventListener('blur', pauseGame);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseGame();
  });

  drawScene();
  requestAnimationFrame(gameLoop);
} else {
  const message = document.querySelector('#game-error');
  message.textContent = '无法使用 Canvas 2D，请换用支持 Canvas 的浏览器。';
  message.hidden = false;
}
