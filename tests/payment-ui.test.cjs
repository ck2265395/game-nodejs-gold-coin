const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function load(enabled, options={}){
 const elements={};for(const id of ['revive','pay-panel','pay-qr','pay-message','pay-check','pay-redeem','pay-close','pay-cancel'])elements[id]={hidden:true,disabled:false,textContent:'',addEventListener(name,fn){this[name]=fn;}};
 let snapshot={score:20,level:3,lives:0,gameOver:true,deathId:'death1'}, revived=0;const storage=new Map();if(options.saved)storage.set('coin-wechat-recovery-v1',JSON.stringify(options.saved));const calls=[];
 const context={URL,location:{href:'https://game.example/gold-coin/'},document:{querySelector:s=>elements[s.slice(1)]},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,
 fetch:async(url,request)=>{calls.push([url,request]);if(options.failConfig && url.endsWith('/config'))throw new Error('断网');if(options.failCreate && url.endsWith('/orders'))return {ok:false,json:async()=>({id:'ORDER',error:'下单超时，请查单'})};let result={enabled};if(url.includes('/orders')) result=url.endsWith('/redeem')?{id:'ORDER',deathId:'death1',state:'redeemed',snapshot:{score:20,level:3}}:request?.method==='POST'?{id:'ORDER',state:'pending',expires:Date.now()+600000,qr:'data:image/png;base64,AA=='}:{id:'ORDER',state:'paid'};return {ok:true,json:async()=>result};},
 window:{coinGame:{snapshot:()=>snapshot,restore:s=>{snapshot=s;return true;},revive:r=>{if(r.deathId!==snapshot.deathId)return false;revived++;snapshot={score:20,level:3,lives:1,gameOver:false,deathId:null};return true;}}}};
 vm.runInNewContext(fs.readFileSync('public/payment.js','utf8'),context);await new Promise(setImmediate);
 return {elements,context,calls,revived:()=>revived};
}
test('支付配置关闭时隐藏续命入口',async()=>{const app=await load(false);assert.equal(app.elements.revive.hidden,true);});
test('扫码支付查询到账后才允许兑换，兑换后保留游戏快照',async()=>{
 const app=await load(true);app.context.window.paymentUI.onDeath(app.context.window.coinGame.snapshot());
 await app.elements.revive.click();assert.equal(app.elements['pay-qr'].src,'data:image/png;base64,AA==');assert.equal(app.revived(),0);
 await app.elements['pay-check'].click();assert.equal(app.elements['pay-redeem'].hidden,false);
 await app.elements['pay-redeem'].click();assert.equal(app.revived(),1);
 assert.ok(app.calls.some(([url])=>url==='https://game.example/gold-coin/api/pay/orders/ORDER/redeem'));
 assert.equal(app.context.window.coinGame.snapshot().lives,1);
});


test('下单响应失败仍保存订单号，阻止误重开并允许查单',async()=>{
 const app=await load(true,{failCreate:true});
 await app.elements.revive.click();
 assert.equal(app.context.window.paymentUI.onRestart(),false);
 await app.elements['pay-check'].click();
 assert.equal(app.elements['pay-redeem'].hidden,false);
});

test('刷新恢复死亡状态与未完成订单，继续查单并兑换',async()=>{
 const app=await load(true,{saved:{game:{score:20,level:3,lives:0,gameOver:true,deathId:'death1'},order:{id:'ORDER',state:'pending'}}});
 assert.equal(app.elements['pay-panel'].hidden,false);
 assert.equal(app.elements['pay-redeem'].hidden,false);
 await app.elements['pay-redeem'].click();assert.equal(app.revived(),1);
 assert.equal(app.context.window.paymentUI.onRestart(),true);
});


test('刷新时配置查询断网仍恢复并保护已有付费订单',async()=>{
 const app=await load(true,{failConfig:true,saved:{game:{score:20,level:3,lives:0,gameOver:true,deathId:'death1'},order:{id:'ORDER',state:'paid'}}});
 assert.equal(app.context.window.paymentUI.onRestart(),false);
 assert.equal(app.elements['pay-panel'].hidden,false);
 assert.equal(app.context.window.coinGame.snapshot().deathId,'death1');
 await app.elements['pay-check'].click();
 await app.elements['pay-redeem'].click();
 assert.equal(app.revived(),1);
});
