const crypto = require('node:crypto');
const fs = require('node:fs');

function loadConfig(env = process.env) {
  const names = ['WX_MCH_ID', 'WX_APP_ID', 'WX_MERCHANT_SERIAL', 'WX_PRIVATE_KEY_PATH', 'WX_PAY_PUBLIC_KEY_PATH', 'WX_PAY_PUBLIC_KEY_ID', 'WX_API_V3_KEY_PATH', 'PUBLIC_BASE_URL'];
  const missing = names.filter(name => !env[name]);
  if (missing.length) return { missing };
  const base = new URL(env.PUBLIC_BASE_URL);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) throw new Error('PUBLIC_BASE_URL 必须是公开 HTTPS 游戏地址');
  const apiKey = fs.readFileSync(env.WX_API_V3_KEY_PATH, 'utf8').trim();
  if (Buffer.byteLength(apiKey) !== 32) throw new Error('API v3 密钥必须为32字节');
  return { config: { mchid: env.WX_MCH_ID, appid: env.WX_APP_ID, serial: env.WX_MERCHANT_SERIAL,
    privateKey: crypto.createPrivateKey(fs.readFileSync(env.WX_PRIVATE_KEY_PATH)),
    publicKey: crypto.createPublicKey(fs.readFileSync(env.WX_PAY_PUBLIC_KEY_PATH)),
    publicKeyId: env.WX_PAY_PUBLIC_KEY_ID, apiKey, origin: base.origin,
    notifyUrl: env.PUBLIC_BASE_URL.replace(/\/$/, '') + '/api/pay/notify' } };
}

class WechatClient {
  constructor(config, request = fetch) { this.config = config; this.request = request; }
  verify(headers, body) {
    const get = name => typeof headers.get === 'function' ? headers.get(name) : headers[name];
    const timestamp = get('wechatpay-timestamp'), nonce = get('wechatpay-nonce'), signature = get('wechatpay-signature');
    if (!timestamp || !/^\d+$/.test(timestamp) || !nonce || !signature || get('wechatpay-serial') !== this.config.publicKeyId
      || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new Error('微信支付签名或时间无效');
    if (!crypto.verify('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), this.config.publicKey, Buffer.from(signature, 'base64'))) throw new Error('微信支付签名校验失败');
  }
  async call(method, path, data) {
    const body = data ? JSON.stringify(data) : '';
    const timestamp = String(Math.floor(Date.now() / 1000)), nonce = crypto.randomBytes(16).toString('hex');
    const signature = crypto.sign('RSA-SHA256', Buffer.from(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`), this.config.privateKey).toString('base64');
    const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${this.config.mchid}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${this.config.serial}"`;
    const response = await this.request('https://api.mch.weixin.qq.com' + path, {
      method, headers: { Authorization: authorization, Accept: 'application/json', 'Content-Type': 'application/json', 'Wechatpay-Serial': this.config.publicKeyId },
      ...(body ? { body } : {}), signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    const text = await response.text();
    // 不信任未验签的成功响应，也不把微信错误正文/密钥写进浏览器。
    if (!response.ok) {
      const error = new Error('微信支付请求失败，请稍后检查订单');
      try {
        this.verify(response.headers, text);
        error.wechatCode = JSON.parse(text).code;
      } catch { /* 未验签错误只能重试，不得据此关闭订单。 */ }
      throw error;
    }
    this.verify(response.headers, text);
    return text ? JSON.parse(text) : {};
  }
  create(id, expires) {
    return this.call('POST', '/v3/pay/transactions/native', {
      appid: this.config.appid, mchid: this.config.mchid, description: '接金币：续命1次', out_trade_no: id,
      notify_url: this.config.notifyUrl, amount: { total: 1, currency: 'CNY' },
      ...(expires ? { time_expire: new Date(expires).toISOString().replace(/\.\d{3}Z$/, '+00:00') } : {}),
    });
  }
  close(id) { return this.call('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(id)}/close`, { mchid: this.config.mchid }); }
  query(id) { return this.call('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(id)}?mchid=${encodeURIComponent(this.config.mchid)}`); }
  notification(headers, raw) {
    this.verify(headers, raw);
    const { resource } = JSON.parse(raw);
    if (resource?.algorithm !== 'AEAD_AES_256_GCM') throw new Error('不支持的回调加密算法');
    const encrypted = Buffer.from(resource.ciphertext, 'base64');
    if (encrypted.length < 16) throw new Error('无效密文');
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(this.config.apiKey), Buffer.from(resource.nonce));
    decipher.setAuthTag(encrypted.subarray(-16));
    decipher.setAAD(Buffer.from(resource.associated_data || ''));
    return JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString('utf8'));
  }
}
module.exports = { loadConfig, WechatClient };
