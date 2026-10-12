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

// 每枚金币保存圆心和半径；关卡决定统一的下落速度和生成间隔。
const coins = [{ x: canvas.width / 2, y: -12, radius: 12 }];
let spawnElapsed = 0;
let level = 1;
const levelDisplay = document.querySelector('#level');
levelDisplay.textContent = String(level);

function getDifficulty() {
  const step = Math.min(level - 1, 9);
  return { speed: 180 + step * 25, interval: Math.max(0.4, 1.5 - step * 0.15) };
}

function spawnCoin() {
  const radius = 12;
  coins.push({ radius, y: -radius, x: radius + Math.random() * (canvas.width - radius * 2) });
}

const scoreDisplay = document.querySelector('#score');
const livesDisplay = document.querySelector('#lives');
const gameOverPanel = document.querySelector('#game-over');
const finalScoreDisplay = document.querySelector('#final-score');
const restartButton = document.querySelector('#restart');
let score = 0;
let lives = 3;
let gameOver = false;
let deathId = null;
const redeemedOrders = new Set();
let started = false;
let paused = true;
const playButton = document.querySelector('#play');
const statusDisplay = document.querySelector('#status');
livesDisplay.textContent = String(lives);
scoreDisplay.textContent = String(score);

function updateCoins(deltaTime) {
  if (gameOver || paused) return;
  const speed = getDifficulty().speed;
  for (let index = coins.length - 1; index >= 0; index--) {
    const coin = coins[index];
    const previousBottom = coin.y + coin.radius;
    coin.y += speed * deltaTime;
    // 底边从上方跨过篮子上沿，且包围盒横向重叠时算接住。
    const overlapsBasket = coin.x + coin.radius >= basket.x
      && coin.x - coin.radius <= basket.x + basket.width;
    const reachesBasket = previousBottom <= basket.y && coin.y + coin.radius >= basket.y;
    if (overlapsBasket && reachesBasket) {
      coins.splice(index, 1);
      score += 1;
      level = Math.floor(score / 10) + 1;
      scoreDisplay.textContent = String(score);
      levelDisplay.textContent = String(level);
    } else if (coin.y - coin.radius > canvas.height) {
      coins.splice(index, 1);
      lives -= 1;
      livesDisplay.textContent = String(lives);
      if (lives === 0) {
        gameOver = true;
        deathId = createDeathId();
        pressedKeys.clear();
        activePointers.clear();
        finalScoreDisplay.textContent = String(score);
        gameOverPanel.hidden = false;
        updatePlayControls();
        window.paymentUI?.onDeath(window.coinGame.snapshot());
        return; // 同帧后续金币不再扣血，生命不会变成负数。
      }
    }
  }
  // 只累计实际游戏时间，暂停和结束时不生成，也不补发金币。
  spawnElapsed += deltaTime;
  const interval = getDifficulty().interval;
  while (spawnElapsed >= interval) {
    spawnElapsed -= interval;
    spawnCoin();
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
    updateCoins(deltaTime);
  }
  drawScene();
  requestAnimationFrame(gameLoop);
}

function drawScene() {
  // 每次绘制都先覆盖背景，以后加入动画时也会用到这一步。
  context.fillStyle = '#dceefa';
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const coin of coins) {
    context.beginPath();
    context.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
    context.fillStyle = '#f5c542';
    context.fill();
    context.strokeStyle = '#b87916';
    context.lineWidth = 2;
    context.stroke();
  }

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
  if (window.paymentUI?.onRestart() === false) return;
  deathId = null;
  score = 0;
  level = 1;
  levelDisplay.textContent = String(level);
  spawnElapsed = 0;
  coins.length = 0;
  spawnCoin();
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

function createDeathId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // getRandomValues 在普通 HTTP 上也可用，未开支付时不影响小游戏。
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function gameSnapshot() {
  return { score, level, lives, gameOver, deathId };
}

function restoreGame(saved) {
  if (!saved || !Number.isSafeInteger(saved.score) || saved.score < 0 || saved.score > 10000000
    || saved.level !== Math.floor(saved.score / 10) + 1 || !Number.isInteger(saved.lives)
    || saved.lives < 0 || saved.lives > 3 || typeof saved.gameOver !== 'boolean'
    || (saved.gameOver && (saved.lives !== 0 || typeof saved.deathId !== 'string'))
    || (!saved.gameOver && saved.lives === 0)) return false;
  score = saved.score; level = saved.level; lives = saved.lives;
  gameOver = saved.gameOver; deathId = saved.gameOver ? saved.deathId : null;
  started = true; paused = true;
  scoreDisplay.textContent = String(score); levelDisplay.textContent = String(level);
  livesDisplay.textContent = String(lives); finalScoreDisplay.textContent = gameOver ? String(score) : '';
  gameOverPanel.hidden = !gameOver;
  coins.length = 0; spawnElapsed = 0;
  if (!gameOver) spawnCoin();
  basket.x = (canvas.width - basket.width) / 2;
  pressedKeys.clear(); activePointers.clear(); lastTime = null;
  updatePlayControls(); drawScene();
  return true;
}

function reviveGame(receipt) {
  if (!gameOver || !deathId || receipt?.deathId !== deathId || !receipt.id || redeemedOrders.has(receipt.id)) return false;
  if (receipt.snapshot?.score !== score || receipt.snapshot?.level !== level) return false;
  const revived = restoreGame({ score, level, lives: 1, gameOver: false, deathId: null });
  if (revived) redeemedOrders.add(receipt.id);
  return revived;
}

window.coinGame = { snapshot: gameSnapshot, restore: restoreGame, revive: reviveGame };

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
