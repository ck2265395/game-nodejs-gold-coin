const express = require('express');
const QRCode = require('qrcode');
function createPaymentRouter({ config, provider, store } = {}) {
  const router = express.Router();
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/config', (req,res)=>res.json({ enabled: Boolean(config && provider && store), amount: 1, currency: 'CNY' }));
  router.use((req,res,next)=>{
    if (!config || !provider || !store) return res.status(503).json({error:'微信支付尚未配置，暂不能续命'});
    next();
  });
  router.post('/notify',express.raw({type:'application/json',limit:'32kb'}),(req,res)=>{
    try {
      if (!Buffer.isBuffer(req.body)) throw new Error('回调正文无效');
      const data=provider.notification(req.headers,req.body.toString('utf8'));
      store.markPaid(data,config);
      res.status(200).json({code:'SUCCESS',message:'成功'});
    } catch {
      res.status(400).json({code:'FAIL',message:'回调验证失败'});
    }
  });
  router.use((req,res,next)=>{
    if (req.method==='POST' && req.get('origin')!==config.origin) return res.status(403).json({error:'请求来源无效'});
    const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('coin_session='));
    const supplied=cookie?.slice('coin_session='.length);
    req.paySession=store.session(supplied);
    if(supplied!==req.paySession) res.cookie('coin_session',req.paySession,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:30*86400000});
    next();
  });
  router.use(express.json({limit:'2kb'}));
  const publicOrder = order => ({ id:order.id, deathId:order.death, amount:1, currency:'CNY', state:order.state, expires:order.expires,
    ...(order.state==='redeemed'?{snapshot:order.snapshot}:{}) });
  function applyTrade(result, id) {
    if (!['SUCCESS','CLOSED'].includes(result.trade_state)) return false;
    if (result.out_trade_no !== id || result.mchid !== config.mchid || result.appid !== config.appid) throw new Error('订单或商户不匹配');
    if (result.trade_state === 'SUCCESS') store.markPaid(result,config);
    else store.closeOrder(id);
    return true;
  }
  router.post('/orders',async(req,res)=>{
    const {deathId,score}=req.body||{};
    if(typeof deathId!=='string'||! /^[a-f0-9-]{36}$/i.test(deathId)||!Number.isSafeInteger(score)||score<0||score>10000000) return res.status(400).json({error:'死亡标识或分数无效'});
    let order;
    try { order=store.create(req.paySession,deathId,{score,level:Math.floor(score/10)+1}); }
    catch { return res.status(429).json({error:'操作频繁，请稍后重试'}); }
    try {
      if(order.state==='pending' && !order.code_url && Date.now()<order.expires){
        const result=await provider.create(order.id,order.expires);
        if(typeof result.code_url!=='string'||!result.code_url.startsWith('weixin://')) throw new Error('二维码无效');
        store.setCode(order.id,result.code_url);order=store.get(order.id,req.paySession);
      }
      const payload=publicOrder(order);
      if(order.state==='pending' && order.code_url && Date.now()<order.expires) payload.qr=await QRCode.toDataURL(order.code_url,{width:256,margin:2});
      res.json(payload);
    } catch { res.status(502).json({error:'微信下单失败，请稍后检查同一订单再重试',id:order.id}); }
  });
  router.get('/orders/:id',async(req,res)=>{
    let order=store.get(req.params.id,req.paySession);
    if(!order) return res.status(404).json({error:'订单不存在'});
    try {
      if(order.state==='pending' && store.claimQuery(order.id)){
        const result=await provider.query(order.id);
        applyTrade(result,order.id);
        order=store.get(order.id,req.paySession);
      }
      res.json(publicOrder(order));
    }catch{res.status(502).json({error:'微信查单暂不可用，请稍后重试'});}
  });
  router.post('/orders/:id/cancel',async(req,res)=>{
    let order=store.get(req.params.id,req.paySession);
    if(!order)return res.status(404).json({error:'订单不存在'});
    try{
      if(order.state==='pending'){
        let result;
        try { result=await provider.query(order.id); }
        catch(error) {
          if(error.wechatCode!=='ORDER_NOT_EXIST') throw error;
          store.closeOrder(order.id);
          return res.json(publicOrder(store.get(order.id,req.paySession)));
        }
        if (!applyTrade(result,order.id)) {
          try { await provider.close(order.id); store.closeOrder(order.id); }
          catch {
            // 关单与付款同时发生时，再查一次，绝不丢弃已支付权益。
            const latest=await provider.query(order.id);
            if (!applyTrade(latest,order.id)) throw new Error('订单未关闭');
          }
        }
      }
      res.json(publicOrder(store.get(order.id,req.paySession)));
    }catch{res.status(502).json({error:'关闭订单暂未确认，请检查支付结果后重试'});}
  });
  router.post('/orders/:id/redeem',(req,res)=>{
    if(!store.get(req.params.id,req.paySession))return res.status(404).json({error:'订单不存在'});
    try{res.json(publicOrder(store.redeem(req.params.id,req.paySession)));}
    catch{res.status(409).json({error:'尚未确认到账，不能续命'});}
  });
  router.use((error,req,res,next)=>res.status(400).json({error:'请求正文无效'}));
  return router;
}
module.exports={createPaymentRouter};
