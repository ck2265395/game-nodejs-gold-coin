const test=require('node:test'); const assert=require('node:assert/strict');const express=require('express');const {once}=require('node:events');
const {createPaymentRouter}=require('../payment/router');const {PaymentStore}=require('../payment/store');
async function serve(options,fn){const app=express();app.use('/api/pay',createPaymentRouter(options));const server=app.listen(0,'127.0.0.1');await once(server,'listening');try{await fn(`http://127.0.0.1:${server.address().port}/api/pay`);}finally{await new Promise(r=>server.close(r));options.store?.close();}}
test('未配置支付返回禁用状态，创建订单503',async()=>{
 await serve({},async base=>{assert.equal((await (await fetch(base+'/config')).json()).enabled,false);assert.equal((await fetch(base+'/orders',{method:'POST'})).status,503);});
});
test('跨站拒绝、固定价格、同死亡订单复用、会话隔离及只在到账后兑换',async()=>{
 const store=new PaymentStore(':memory:');const config={mchid:'M',appid:'A',origin:'https://game.example'};let paid=false;let created=0;
 const provider={create:async()=>{created++;return {code_url:'weixin://wxpay/bizpayurl?pr=test'}},query:async id=>paid?{out_trade_no:id,mchid:'M',appid:'A',trade_state:'SUCCESS',transaction_id:'T',amount:{total:1,currency:'CNY'}}:{trade_state:'NOTPAY'}};
 await serve({store,config,provider},async base=>{
  const body=JSON.stringify({deathId:'11111111-1111-4111-8111-111111111111',score:20});
  assert.equal((await fetch(base+'/orders',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body})).status,403);
  let response=await fetch(base+'/orders',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body});
  assert.equal(response.status,200);const cookie=response.headers.get('set-cookie').split(';')[0];const order=await response.json();assert.equal(order.amount,1);assert.match(order.qr,/^data:image\/png;base64,/);
  const headers={Origin:config.origin,'Content-Type':'application/json',Cookie:cookie};
  assert.equal((await fetch(base+'/orders/'+order.id)).status,404);
  assert.equal((await fetch(base+'/orders/'+order.id+'/redeem',{method:'POST',headers})).status,409);
  const same=await (await fetch(base+'/orders',{method:'POST',headers,body})).json();assert.equal(same.id,order.id);assert.equal(created,1);
  paid=true;store.db.prepare('UPDATE orders SET last_query=0').run();
  const status=await (await fetch(base+'/orders/'+order.id,{headers:{Cookie:cookie}})).json();assert.equal(status.state,'paid');
  const redeemed=await (await fetch(base+'/orders/'+order.id+'/redeem',{method:'POST',headers})).json();assert.equal(redeemed.snapshot.score,20);assert.equal(redeemed.snapshot.level,3);
  assert.equal((await (await fetch(base+'/orders/'+order.id+'/redeem',{method:'POST',headers})).json()).id,order.id);
 });
});

test('关单与付款竞态保留已付款权益，重复回调不重复兑换',async()=>{
 const store=new PaymentStore(':memory:');const config={mchid:'M',appid:'A',origin:'https://game.example'};
 let queries=0;let orderId;
 const success=()=>({out_trade_no:orderId,mchid:'M',appid:'A',trade_state:'SUCCESS',transaction_id:'raceTx',amount:{total:1,currency:'CNY'}});
 const provider={create:async()=>({code_url:'weixin://wxpay/bizpayurl?pr=test'}),query:async()=>++queries===1?{trade_state:'NOTPAY'}:success(),close:async()=>{throw new Error('ORDERPAID')},notification:(headers,raw)=>{if(headers['wechatpay-signature']!=='verified')throw new Error('invalid');return JSON.parse(raw);}};
 await serve({store,config,provider},async base=>{
  const response=await fetch(base+'/orders',{method:'POST',headers:{Origin:config.origin,'Content-Type':'application/json'},body:JSON.stringify({deathId:'22222222-2222-4222-8222-222222222222',score:9})});
  const cookie=response.headers.get('set-cookie').split(';')[0];orderId=(await response.json()).id;
  const headers={Origin:config.origin,'Content-Type':'application/json',Cookie:cookie};
  assert.equal((await (await fetch(base+'/orders/'+orderId+'/cancel',{method:'POST',headers})).json()).state,'paid');
  assert.equal((await fetch(base+'/notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(success())})).status,400);
  for(let i=0;i<2;i++)assert.equal((await fetch(base+'/notify',{method:'POST',headers:{'Content-Type':'application/json','Wechatpay-Signature':'verified'},body:JSON.stringify(success())})).status,200);
  const redeemed=await (await fetch(base+'/orders/'+orderId+'/redeem',{method:'POST',headers})).json();assert.equal(redeemed.state,'redeemed');
 });
});

test('已过期且微信确认不存在的订单可关闭，不让玩家永久卡住',async()=>{
 const store=new PaymentStore(':memory:');const session=store.session();const order=store.create(session,'expired-death',{score:0,level:1});
 store.db.prepare('UPDATE orders SET expires=0 WHERE id=?').run(order.id);
 const config={mchid:'M',appid:'A',origin:'https://game.example'};
 const absent=Object.assign(new Error('不存在'),{wechatCode:'ORDER_NOT_EXIST'});
 const provider={query:async()=>{throw absent;}};
 await serve({store,config,provider},async base=>{
  const response=await fetch(base+'/orders/'+order.id+'/cancel',{method:'POST',headers:{Cookie:'coin_session='+session,Origin:config.origin}});
  assert.equal(response.status,200);assert.equal((await response.json()).state,'closed');
 });
});

test('关单响应丢失后，查单CLOSED能恢复本地关闭状态',async()=>{
 const store=new PaymentStore(':memory:');const session=store.session();const order=store.create(session,'close-lost',{score:0,level:1});
 const config={mchid:'M',appid:'A',origin:'https://game.example'};let queries=0;
 const closed={out_trade_no:order.id,mchid:'M',appid:'A',trade_state:'CLOSED'};
 const provider={query:async()=>++queries===1?{trade_state:'NOTPAY'}:closed,close:async()=>{throw new Error('response lost');}};
 await serve({store,config,provider},async base=>{
  const response=await fetch(base+'/orders/'+order.id+'/cancel',{method:'POST',headers:{Cookie:'coin_session='+session,Origin:config.origin}});
  assert.equal(response.status,200);assert.equal((await response.json()).state,'closed');
 });
});
