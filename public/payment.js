// 支付状态以服务器查单为准；浏览器仅显示二维码和申请兑换。
(() => {
  const game = window.coinGame;
  const button = document.querySelector('#revive');
  const panel = document.querySelector('#pay-panel');
  const image = document.querySelector('#pay-qr');
  const message = document.querySelector('#pay-message');
  const redeem = document.querySelector('#pay-redeem');
  const checkButton = document.querySelector('#pay-check');
  const cancelButton = document.querySelector('#pay-cancel');
  const key = 'coin-wechat-recovery-v1';
  const base = new URL('./api/pay/', location.href);
  let enabled = false, order = null, timer = null, busy = false;
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch { /* 禁用存储时仍可正常玩。 */ }
  function persist(snapshot = game.snapshot()) {
    saved = { game: snapshot, order };
    try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* 不把存储失败当作到账。 */ }
  }
  function stopPoll() { clearTimeout(timer); timer = null; }
  async function api(path, data) {
    const response = await fetch(new URL(path, base).href, {
      credentials: 'same-origin', cache: 'no-store',
      ...(data !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || '支付服务暂不可用，请稍后再试');
      error.orderId = result.id;
      throw error;
    }
    return result;
  }
  function refreshButton() { button.hidden = !enabled || !game.snapshot().gameOver; }
  function displayOrder(result) {
    order = { ...order, ...result };
    persist();
    redeem.hidden = !['paid', 'redeemed'].includes(order.state);
    cancelButton.hidden = ['paid', 'redeemed', 'closed'].includes(order.state);
    if (!redeem.hidden) {
      image.hidden = true;
      message.textContent = '已确认支付 0.01 元，点击领取续命，恢复 1 条生命。';
      stopPoll();
    } else if (order.state === 'closed') {
      image.hidden = true; message.textContent = '订单已关闭，可重新开始游戏。'; stopPoll();
    } else if (order.expires && Date.now() >= order.expires) {
      image.hidden = true; message.textContent = '二维码已过期。如已付款请检查支付结果；未付款可关闭订单。';
    } else {
      message.textContent = '使用微信扫码支付 0.01 元。支付后由服务器确认，请勿重复付款。';
      if (typeof order.qr === 'string' && order.qr.startsWith('data:image/png;base64,')) { image.src = order.qr; image.hidden = false; }
    }
  }
  async function check() {
    if (!order?.id || busy) return;
    busy = true;
    try { displayOrder(await api('orders/' + encodeURIComponent(order.id))); }
    catch (error) { message.textContent = error.message; }
    finally { busy = false; }
    if (order?.state === 'pending' && !panel.hidden) { stopPoll(); timer = setTimeout(check, 3000); }
  }
  button.addEventListener('click', async () => {
    if (!enabled || !game.snapshot().gameOver || busy) return;
    panel.hidden = false; image.hidden = true; redeem.hidden = true;
    message.textContent = '正在创建 0.01 元续命订单…'; busy = true;
    try {
      const snapshot = game.snapshot();
      displayOrder(await api('orders', { deathId: snapshot.deathId, score: snapshot.score }));
    } catch (error) {
      if (error.orderId) {
        order = { id: error.orderId, state: 'pending' };
        persist();
        cancelButton.hidden = false;
      }
      message.textContent = error.message;
    }
    finally { busy = false; }
    if (order?.state === 'pending') { stopPoll(); timer = setTimeout(check, 3000); }
  });
  checkButton.addEventListener('click', check);
  redeem.addEventListener('click', async () => {
    if (!order?.id || busy || !['paid', 'redeemed'].includes(order.state)) return;
    busy = true; redeem.disabled = true;
    try {
      const receipt = await api('orders/' + encodeURIComponent(order.id) + '/redeem', {});
      if (receipt.state !== 'redeemed' || !game.revive(receipt)) throw new Error('续命记录与当前游戏不一致，请保留订单号并联系商户。');
      order = null; persist(); stopPoll(); panel.hidden = true; refreshButton();
    } catch (error) { message.textContent = error.message; }
    finally { busy = false; redeem.disabled = false; }
  });
  document.querySelector('#pay-close').addEventListener('click', () => { panel.hidden = true; stopPoll(); });
  cancelButton.addEventListener('click', async () => {
    if (!order?.id || busy) return;
    busy = true;
    try { displayOrder(await api('orders/' + encodeURIComponent(order.id) + '/cancel', {})); }
    catch (error) { message.textContent = error.message; }
    finally { busy = false; }
  });
  window.paymentUI = {
    onDeath(snapshot) { order = null; stopPoll(); persist(snapshot); refreshButton(); panel.hidden = true; },
    onRestart() {
      if (busy || (order && ['pending', 'paid', 'redeemed'].includes(order.state))) {
        panel.hidden = false; message.textContent = '请先检查支付结果或关闭未付款订单，再重新开始，避免丢失续命。';
        return false;
      }
      order = null; saved = null; stopPoll(); panel.hidden = true; button.hidden = true;
      try { localStorage.removeItem(key); } catch { /* 可用性不依赖浏览器存储。 */ }
      return true;
    },
  };
  // 先恢复本地状态，再查询配置；断网不应抹掉已支付订单。
  if (saved?.game && game.restore(saved.game)) {
    order = saved.order || null;
    if (order?.id) {
      panel.hidden = false;
      message.textContent = '发现未完成的续命订单，正在检查支付状态。';
    }
  }
  (async () => {
    try {
      const config = await api('config'); enabled = config.enabled === true;
      if (order?.id) await check();
      refreshButton();
    } catch {
      enabled = false; button.hidden = true;
      if (order?.id) message.textContent = '支付服务暂不可用，订单已保留。恢复网络后点击检查支付结果。';
    }
  })();
  // 续命后保留最新分数；死亡会立即保存，刷新恢复为暂停状态。
  setInterval(() => { if (saved && !game.snapshot().gameOver) persist(); }, 2000);
})();
