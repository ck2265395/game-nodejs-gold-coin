const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
class PaymentStore {
  constructor(file) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(file);
    if (file !== ':memory:') fs.chmodSync(file, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, session TEXT NOT NULL, death TEXT NOT NULL, snapshot TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', code_url TEXT, transaction_id TEXT UNIQUE,
        created INTEGER NOT NULL, expires INTEGER NOT NULL, last_query INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session, death));`);
  }
  session(id) {
    if (id && /^[a-f0-9]{64}$/.test(id) && this.db.prepare('SELECT id FROM sessions WHERE id=?').get(id)) return id;
    id = crypto.randomBytes(32).toString('hex');
    this.db.prepare('INSERT INTO sessions VALUES (?,?)').run(id, Date.now()); return id;
  }
  create(session, death, snapshot) {
    const existing = this.db.prepare('SELECT * FROM orders WHERE session=? AND death=?').get(session, death);
    if (existing) return this.format(existing);
    const now = Date.now();
    if (this.db.prepare('SELECT id FROM orders WHERE session=? AND created>?').get(session, now - 3000)) throw new Error('操作频繁，请稍后再试');
    const id = 'GC' + crypto.randomBytes(14).toString('hex');
    this.db.prepare('INSERT INTO orders (id,session,death,snapshot,created,expires) VALUES (?,?,?,?,?,?)').run(id,session,death,JSON.stringify(snapshot),now,now+600000);
    return this.get(id, session);
  }
  format(row) { return row ? { ...row, snapshot: JSON.parse(row.snapshot) } : undefined; }
  get(id, session) { return this.format(this.db.prepare('SELECT * FROM orders WHERE id=? AND session=?').get(id, session)); }
  setCode(id, code) { this.db.prepare('UPDATE orders SET code_url=? WHERE id=? AND state=?').run(code,id,'pending'); }
  closeOrder(id) { this.db.prepare("UPDATE orders SET state='closed' WHERE id=? AND state='pending'").run(id); }
  claimQuery(id) { return this.db.prepare('UPDATE orders SET last_query=? WHERE id=? AND last_query<?').run(Date.now(),id,Date.now()-2500).changes > 0; }
  markPaid(data, config) {
    if (data.mchid !== config.mchid || data.appid !== config.appid || data.trade_state !== 'SUCCESS'
      || data.amount?.total !== 1 || data.amount?.currency !== 'CNY' || !data.transaction_id) throw new Error('支付商户、金额或状态不匹配');
    const order = this.db.prepare('SELECT * FROM orders WHERE id=?').get(data.out_trade_no);
    if (!order) throw new Error('未知订单');
    if (order.transaction_id && order.transaction_id !== data.transaction_id) throw new Error('交易号不匹配');
    this.db.prepare("UPDATE orders SET state='paid',transaction_id=? WHERE id=? AND state IN ('pending','closed')").run(data.transaction_id,data.out_trade_no);
  }
  redeem(id, session) {
    this.db.prepare("UPDATE orders SET state='redeemed' WHERE id=? AND session=? AND state='paid'").run(id,session);
    const order = this.get(id,session);
    if (!order || order.state !== 'redeemed') throw new Error('订单尚未支付，不能续命');
    return order; // 幂等返回同一收据；不会再增加新的可兑换次数。
  }
  close() { this.db.close(); }
}
module.exports = { PaymentStore };
