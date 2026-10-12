const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

// 执行真实浏览器脚本；这里只提供 Canvas 和动画调度的最小接口。
function loadGame(autoStart = true) {
  const circles = [];
  const rectangles = [];
  const events = {};
  const documentEvents = {};
  let nextFrame;
  const context = {
    fillRect(...args) { rectangles.push(args); },
    beginPath() {}, arc(x, y, radius) { circles.push({ x, y, radius }); },
    fill() {}, stroke() {},
  };
  const score = { textContent: '0' };
  const elements = {
    '#status': { textContent: '' },
    '#score': score, '#lives': { textContent: '3' },
    '#game-over': { hidden: true }, '#final-score': { textContent: '' },
    '#restart': { addEventListener(name, handler) { this[name] = handler; } },
  };
  for (const id of ['#move-left', '#move-right', '#play']) {
    elements[id] = {
      addEventListener(name, handler) { this[name] = handler; },
      setPointerCapture() {},
    };
  }
  const sandbox = vm.createContext({
    document: { addEventListener(name, handler) { documentEvents[name] = handler; }, querySelector: (selector) => elements[selector] || ({ width: 480, height: 640, getContext: () => context }) },
    window: { addEventListener(name, handler) { events[name] = handler; } },
    requestAnimationFrame(callback) { nextFrame = callback; },
  });
  vm.runInContext(fs.readFileSync('public/game.js', 'utf8'), sandbox);
  if (autoStart && elements['#play'].click) elements['#play'].click();
  return {
    score, elements,
    run(code) { return vm.runInContext(code, sandbox); },
    frame(time) { circles.length = 0; rectangles.length = 0; nextFrame(time); return circles[0]; },
    events, rectangles, documentEvents,
  };
}

test('金币随动画帧下落，水平位置不变', () => {
  const game = loadGame();
  const first = game.frame(0);
  assert.ok(first, '应绘制金币');
  const second = game.frame(50);
  assert.ok(second.y > first.y);
  assert.equal(second.x, first.x);
  assert.equal(second.radius, first.radius);
});

test('金币完全离开底部后从顶部重生，横向位置在画布内', () => {
  const game = loadGame();
  game.run('coin.x = 30'); // 避开篮子，验证漏接重生。
  let previous = game.frame(0);
  assert.ok(previous, '应绘制金币');
  let respawned = false;
  for (let time = 50; time <= 10000; time += 50) {
    const current = game.frame(time);
    if (current.y < previous.y) {
      assert.ok(previous.y + current.radius >= 640);
      assert.equal(current.y, -current.radius);
      assert.ok(current.x >= current.radius && current.x <= 480 - current.radius);
      respawned = true;
      break;
    }
    previous = current;
  }
  assert.ok(respawned, '应在合理时间内重生');
});

test('原有篮子按键移动并在松开后停止', () => {
  const game = loadGame();
  game.frame(0);
  const initial = game.rectangles[2][0];
  game.events.keydown({ code: 'ArrowRight', preventDefault() {} });
  game.frame(50);
  const moved = game.rectangles[2][0];
  assert.ok(moved > initial);
  game.events.keyup({ code: 'ArrowRight', preventDefault() {} });
  game.frame(100);
  assert.equal(game.rectangles[2][0], moved);
});


test('金币到达篮子上沿时加一分并重生，只计一次', () => {
  const game = loadGame();
  game.frame(0);
  game.run('coin.x = basket.x + basket.width / 2; coin.y = basket.y - coin.radius - 1');
  assert.equal(game.score.textContent, '0');
  const current = game.frame(50);
  assert.equal(game.score.textContent, '1');
  assert.equal(current.y, -current.radius);
  game.frame(100);
  assert.equal(game.score.textContent, '1');
});

test('金币漏接后重生，不加分', () => {
  const game = loadGame();
  game.frame(0);
  game.run('coin.x = 30; coin.y = canvas.height + coin.radius - 1');
  const current = game.frame(50);
  assert.equal(current.y, -current.radius);
  assert.equal(game.score.textContent, '0');
});

for (const [name, offset, caught] of [
  ['左边缘相切', -12, true],
  ['左侧差一个像素', -13, false],
  ['右边缘相切', 112, true],
  ['右侧差一个像素', 113, false],
]) {
  test(`接住边界：${name}`, () => {
    const game = loadGame();
    game.frame(0);
    game.run(`coin.x = basket.x + ${offset}; coin.y = basket.y - coin.radius - 1`);
    game.frame(50);
    assert.equal(game.score.textContent, caught ? '1' : '0');
  });
}

test('金币已在篮子上沿下方时，不从侧面误计分', () => {
  const game = loadGame();
  game.frame(0);
  game.run('coin.x = basket.x + 50; coin.y = basket.y + 20');
  game.frame(50);
  assert.equal(game.score.textContent, '0');
});


test('每次漏接扣一条生命，第三次漏接结束并显示最终得分', () => {
  const game = loadGame();
  game.frame(0);
  game.run('coin.x = basket.x + 50; coin.y = basket.y - coin.radius - 1');
  game.frame(50);
  for (let i = 1; i <= 3; i++) {
    game.run('coin.x = 30; coin.y = 660');
    game.frame(50 + i * 50);
    assert.equal(game.elements['#lives'].textContent, String(3 - i));
    assert.equal(game.elements['#game-over'].hidden, i !== 3);
  }
  assert.equal(game.elements['#final-score'].textContent, '1');
});

test('游戏结束后金币和篮子停止，生命与得分不再变化', () => {
  const game = loadGame();
  game.frame(0);
  for (let i = 1; i <= 3; i++) {
    game.run('coin.x = 30; coin.y = 660');
    game.frame(i * 50);
  }
  const position = game.run('[coin.y, basket.x].join()');
  game.events.keydown({ code: 'ArrowRight', preventDefault() {} });
  game.frame(200);
  assert.equal(game.run('[coin.y, basket.x].join()'), position);
  assert.equal(game.elements['#lives'].textContent, '0');
  assert.equal(game.score.textContent, '0');
});

test('重新开始恢复生命和得分、清空按键、居中篮子并恢复动画', () => {
  const game = loadGame();
  game.frame(0);
  game.run('coin.x = basket.x + 50; coin.y = basket.y - coin.radius - 1');
  game.frame(50);
  game.events.keydown({ code: 'ArrowRight', preventDefault() {} });
  for (let i = 1; i <= 3; i++) {
    game.run('coin.x = 30; coin.y = 660');
    game.frame(50 + i * 50);
  }
  assert.equal(typeof game.elements['#restart'].click, 'function');
  game.elements['#restart'].click();
  assert.equal(game.score.textContent, '0');
  assert.equal(game.elements['#lives'].textContent, '3');
  assert.equal(game.elements['#game-over'].hidden, true);
  assert.equal(game.run('basket.x'), 190);
  const first = game.frame(10000);
  assert.equal(first.y, -first.radius);
  const second = game.frame(10050);
  assert.ok(second.y > first.y);
  assert.equal(game.run('basket.x'), 190);
});


function pointer(id = 1) { return { pointerId: id, button: 0, preventDefault() {} }; }

for (const [selector, direction] of [['#move-left', -1], ['#move-right', 1]]) {
  test(`触控 ${selector} 按住移动，松开停止`, () => {
    const game = loadGame();
    game.frame(0);
    const button = game.elements[selector];
    assert.equal(typeof button.pointerdown, 'function');
    button.pointerdown(pointer());
    game.frame(50);
    const moved = game.run('basket.x');
    assert.ok(direction * (moved - 190) > 0);
    button.pointerup(pointer());
    game.frame(100);
    assert.equal(game.run('basket.x'), moved);
  });
}

for (const event of ['pointercancel', 'lostpointercapture']) {
  test(`${event} 清除触控移动`, () => {
    const game = loadGame();
    game.frame(0);
    const button = game.elements['#move-right'];
    assert.equal(typeof button.pointerdown, 'function');
    button.pointerdown(pointer());
    game.frame(50);
    const moved = game.run('basket.x');
    button[event](pointer());
    game.frame(100);
    assert.equal(game.run('basket.x'), moved);
  });
}

test('双指相反方向抵消，松开一个后按剩余方向移动', () => {
  const game = loadGame();
  game.frame(0);
  const left = game.elements['#move-left'];
  const right = game.elements['#move-right'];
  assert.equal(typeof left.pointerdown, 'function');
  left.pointerdown(pointer(1)); right.pointerdown(pointer(2));
  game.frame(50);
  assert.equal(game.run('basket.x'), 190);
  left.pointerup(pointer(1));
  game.frame(100);
  assert.ok(game.run('basket.x') > 190);
});

test('触控释放不会清除同方向的键盘输入', () => {
  const game = loadGame();
  game.frame(0);
  const button = game.elements['#move-right'];
  assert.equal(typeof button.pointerdown, 'function');
  game.events.keydown({ code: 'ArrowRight', preventDefault() {} });
  button.pointerdown(pointer()); button.pointerup(pointer());
  game.frame(50);
  assert.ok(game.run('basket.x') > 190);
});

test('切换窗口与重新开始都会清空触控状态', () => {
  const game = loadGame();
  game.frame(0);
  const button = game.elements['#move-right'];
  assert.equal(typeof button.pointerdown, 'function');
  button.pointerdown(pointer()); game.events.blur();
  game.frame(50); game.frame(100);
  assert.equal(game.run('basket.x'), 190);
  button.pointerdown(pointer()); game.elements['#restart'].click();
  game.frame(150); game.frame(200);
  assert.equal(game.run('basket.x'), 190);
});


test('进入页面等待开始，点击开始后金币才下落', () => {
  const game = loadGame(false);
  const first = game.frame(0);
  assert.equal(game.frame(50).y, first.y);
  assert.equal(typeof game.elements['#play'].click, 'function');
  game.elements['#play'].click();
  game.frame(100);
  assert.ok(game.frame(150).y > first.y);
});

test('暂停冻结位置，继续时清空按键且不补算暂停时间', () => {
  const game = loadGame();
  game.frame(0);
  game.events.keydown({ code: 'ArrowRight', preventDefault() {} });
  game.frame(50);
  assert.equal(typeof game.elements['#play'].click, 'function');
  game.elements['#play'].click();
  const position = game.run('[coin.y, basket.x].join()');
  game.frame(10000);
  assert.equal(game.run('[coin.y, basket.x].join()'), position);
  game.elements['#play'].click();
  game.frame(20000);
  assert.equal(game.run('[coin.y, basket.x].join()'), position);
  game.frame(20050);
  assert.ok(game.run('coin.y') > Number(position.split(',')[0]));
  assert.equal(game.run('basket.x'), Number(position.split(',')[1]));
});

test('失去焦点会暂停，恢复焦点后需要手动继续', () => {
  const game = loadGame();
  game.frame(0);
  game.events.blur();
  const y = game.run('coin.y');
  game.frame(50); game.frame(100);
  assert.equal(game.run('coin.y'), y);
  assert.equal(game.elements['#play'].textContent, '继续游戏');
});


test('页面进入后台时暂停', () => {
  const game = loadGame();
  game.frame(0);
  game.run('document.hidden = true');
  game.documentEvents.visibilitychange();
  const first = game.frame(50);
  assert.equal(game.frame(100).y, first.y);
  assert.equal(game.elements['#play'].textContent, '继续游戏');
});
