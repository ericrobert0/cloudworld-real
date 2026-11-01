import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-notify-'));
const {RUNTIME}=await import('../infra.mjs');
const {atomicJSON}=await import('../integration.mjs');
const {NotificationDelivery,configureNotifications,notificationSettings}=await import('../notifications.mjs');
test('notificacoes exigem configuracao, omitem segredo e respeitam destino HTTPS',()=>{
  assert.equal(notificationSettings().enabled,false);assert.throws(()=>configureNotifications({enabled:true,url:'http://external.example.com'}));
  configureNotifications({enabled:false,url:'https://example.com/webhook-secret',token:'token-secret'});assert.ok(!JSON.stringify(notificationSettings()).includes('secret'));
});
test('entrega HTTP real tenta novamente apos falha e nao duplica apos reinicio',async()=>{
  let requests=0,time=Date.now(),last;const server=http.createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{last=JSON.parse(body);requests++;res.writeHead(requests===1?503:200);res.end();});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    configureNotifications({enabled:true,url:'http://127.0.0.1:'+server.address().port,token:'private-token'});
    atomicJSON(path.join(RUNTIME,'alerts.json'),[{id:'incident-1',tenant:'alpha',key:'api:erp',label:'API ERP',state:'open',openedAt:new Date().toISOString()}]);
    const n=new NotificationDelivery({clock:()=>time});await n.tick();await n.tick();assert.equal(requests,1);time+=10000;await n.tick();assert.equal(requests,2);assert.equal(last.incident.company,'alpha');
    await new NotificationDelivery({clock:()=>time}).tick();assert.equal(requests,2);assert.ok(!JSON.stringify(last).includes('private-token'));
  }finally{await new Promise(r=>server.close(r));}
});
test('trocar destino remove token anterior e exige uma nova confirmacao',async()=>{
  configureNotifications({enabled:true,url:'https://alerts.example.test/first',token:'first-token'});
  await new NotificationDelivery({transport:async()=>({status:200})}).test();assert.ok(notificationSettings().lastConfirmedAt);
  configureNotifications({enabled:true,url:'https://alerts.example.test/second',token:''});assert.equal(notificationSettings().lastConfirmedAt,null);assert.equal(JSON.parse(fs.readFileSync(path.join(RUNTIME,'notification.private.json'),'utf8')).token,undefined);
});
