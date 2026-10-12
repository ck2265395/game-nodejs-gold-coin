const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WechatClient } = require('../payment/wechat');
const { PaymentStore } = require('../payment/store');
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = { mchid: 'merchant', appid: 'app', serial: 'merchantSerial', privateKey: keys.privateKey,
  publicKey: keys.publicKey, publicKeyId: 'PUB_KEY_ID_TEST', apiKey: 'a'.repeat(32), notifyUrl: 'https://example.com/gold-coin/api/pay/notify' };
function signed(body) {
 const timestamp = String(Math.floor(Date.now()/1000)), nonce = 'nonce';
 const signature = crypto.sign('RSA-SHA256', Buffer.from(`${timestamp}\n${nonce}\n${body}\n`), keys.privateKey).toString('base64');
 return { 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': nonce, 'wechatpay-signature': signature, 'wechatpay-serial': config.publicKeyId };
}
test('微信验签拒绝伪签名、篡改正文、错误公钥ID与过期响应', () => {
 const client = new WechatClient(config); const body = '{"trade_state":"SUCCESS"}';
 const headers = signed(body); client.verify(headers,body);
 assert.throws(()=>client.verify(headers,body+' '));
 assert.throws(()=>client.verify({...headers,'wechatpay-serial':'OTHER'},body));
 assert.throws(()=>client.verify({...headers,'wechatpay-timestamp':'1'},body));
});
test('请求签名覆盖method/path/body，金额固定为1分，并验签返回二维码', async()=>{
 const client = new WechatClient(config, async(url,options)=>{
  assert.equal(url,'https://api.mch.weixin.qq.com/v3/pay/transactions/native');
  const fields = Object.fromEntries([...options.headers.Authorization.matchAll(/(\w+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  assert.ok(crypto.verify('RSA-SHA256',Buffer.from(`POST\n/v3/pay/transactions/native\n${fields.timestamp}\n${fields.nonce_str}\n${options.body}\n`),keys.publicKey,Buffer.from(fields.signature,'base64')));
  assert.equal(JSON.parse(options.body).amount.total,1);
  const body=JSON.stringify({code_url:'weixin://wxpay/bizpayurl?pr=test'});
  return new Response(body,{status:200,headers:signed(body)});
 });
 assert.match((await client.create('ORDER123')).code_url,/^weixin:/);
});
test('回调验签并AES-GCM解密，拒绝篡改密文', ()=>{
 const client = new WechatClient(config);
 const data={trade_state:'SUCCESS',mchid:'merchant',appid:'app',out_trade_no:'ORDER123',transaction_id:'TX',amount:{total:1,currency:'CNY'}};
 const cipher=crypto.createCipheriv('aes-256-gcm',Buffer.from(config.apiKey),Buffer.from('123456789012'));
 cipher.setAAD(Buffer.from('transaction'));
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final(),cipher.getAuthTag()]).toString('base64');
 const body=JSON.stringify({resource:{algorithm:'AEAD_AES_256_GCM',nonce:'123456789012',associated_data:'transaction',ciphertext}});
 assert.deepEqual(client.notification(signed(body),body),data);
 assert.throws(()=>client.notification(signed(body),body.replace(ciphertext,ciphertext.slice(0,-4)+'AAAA')));
});
test('订单持久化、会话隔离、验金额及一次性兑换',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'coin-pay-'));const file=path.join(dir,'orders.sqlite');
 let store=new PaymentStore(file);
 const order=store.create('sessionA','deathA',{score:20,level:3});
 assert.equal(store.create('sessionA','deathA',{score:20,level:3}).id,order.id);
 assert.equal(store.get(order.id,'sessionB'),undefined);
 const good={mchid:'merchant',appid:'app',out_trade_no:order.id,trade_state:'SUCCESS',transaction_id:'TX',amount:{total:1,currency:'CNY'}};
 assert.throws(()=>store.markPaid({...good,amount:{total:100,currency:'CNY'}},config));
 assert.throws(()=>store.redeem(order.id,'sessionA'));
 store.markPaid(good,config);store.markPaid(good,config);
 const first=store.redeem(order.id,'sessionA');assert.equal(first.snapshot.score,20);assert.equal(first.snapshot.level,3);
 store.close();store=new PaymentStore(file);
 assert.equal(store.get(order.id,'sessionA').state,'redeemed');
 assert.equal(store.redeem(order.id,'sessionA').id,first.id);
 store.close();fs.rmSync(dir,{recursive:true,force:true});
});

test('即使此前关单，本地记录仍以验签后的到账凭据为准',()=>{
 const store=new PaymentStore(':memory:');const order=store.create('S','D',{score:0,level:1});
 store.closeOrder(order.id);
 store.markPaid({mchid:'merchant',appid:'app',out_trade_no:order.id,trade_state:'SUCCESS',transaction_id:'lateTX',amount:{total:1,currency:'CNY'}},config);
 assert.equal(store.get(order.id,'S').state,'paid');store.close();
});

test('仅验签后的错误码可用于处理微信确认不存在的订单',async()=>{
 const body=JSON.stringify({code:'ORDER_NOT_EXIST',message:'不存在'});
 const verified=new WechatClient(config,async()=>new Response(body,{status:404,headers:signed(body)}));
 await assert.rejects(verified.query('absent'),error=>error.wechatCode==='ORDER_NOT_EXIST');
 const unsigned=new WechatClient(config,async()=>new Response(body,{status:404}));
 await assert.rejects(unsigned.query('absent'),error=>!error.wechatCode);
});
