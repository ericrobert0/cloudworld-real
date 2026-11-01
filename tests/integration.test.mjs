import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cloudworld-hub-'));
const {createTenant,tenantPath}=await import('../infra.mjs');
const {IntegrationHub,requestApp}=await import('../integration.mjs');
const {createControlAPI,normalizeWebhook}=await import('../api.mjs');
const {probe,containerPhase,configureMonitoring}=await import('../monitoring.mjs');
createTenant('alpha');createTenant('bravo','bravo.localhost',8453);
const route={id:'contato-erp',event:'contact.created',app:'erp',operation:'customers.upsert',enabled:true};

test('credenciais nao saem na API, chaves sao isoladas por empresa, possuem escopo e podem ser revogadas',()=>{
  const h=new IntegrationHub();h.configure('alpha',{connectors:{erp:{enabled:true,apiKey:'segredo-a',apiSecret:'segredo-b'}}});
  assert.ok(!JSON.stringify(h.publicSettings('alpha')).includes('segredo'));
  const key=h.issueKey('alpha',{scopes:['events:write']});
  assert.doesNotThrow(()=>h.authorize('alpha','Bearer '+key.token,'events:write'));
  assert.throws(()=>h.authorize('bravo','Bearer '+key.token,'events:write'),{status:401});
  assert.throws(()=>h.authorize('alpha','Bearer '+key.token,'events:read'),{status:403});
  assert.ok(!fs.readFileSync(h.file('alpha','integrations.private.json'),'utf8').includes(key.token));
  h.revokeKey('alpha',key.id);assert.throws(()=>h.authorize('alpha','Bearer '+key.token,'events:write'),{status:401});
});
test('fila persiste apos reinicio, deduplica e preserva eventos inseridos durante entrega',async()=>{
  let release,entered;const blocked=new Promise(r=>release=r),started=new Promise(r=>entered=r);
  const h=new IntegrationHub({transport:async(u,o)=>{if(o.method==='POST'){entered();await blocked;}return {status:200,data:o.method==='POST'?{data:{name:'cliente'}}:{data:u.includes('/Customer?')?[]:[{name:'Default'}]}};}});
  h.configure('alpha',{routes:[route]});const e=h.enqueue('alpha',{type:'contact.created',payload:{name:'Ana'}},'contato-1');
  assert.equal(h.enqueue('alpha',{type:'contact.created',payload:{name:'Ana'}},'contato-1').id,e.id);
  assert.throws(()=>h.enqueue('alpha',{type:'contact.created',payload:{name:'Outro'}},'contato-1'),{status:409});
  const work=h.drain(['alpha']);await started;
  h.enqueue('alpha',{type:'contact.created',payload:{name:'Bia'}},'contato-2');release();await work;
  const restarted=new IntegrationHub();assert.equal(restarted.queue('alpha').length,2);assert.equal(restarted.events('alpha').find(v=>v.id===e.id).state,'delivered');
});
test('falha temporaria tem backoff e limite; falha permanente exige revisao; manutencao pausa entregas',async()=>{
  let time=100000,calls=0;const h=new IntegrationHub({clock:()=>time,transport:async()=>{calls++;return {status:503,data:'SECRET upstream body'};}});
  h.configure('bravo',{connectors:{n8n:{enabled:true,webhookPath:'cloudworld',token:'secret'}},routes:[{...route,id:'para-n8n',app:'n8n',operation:'events.send'}]});
  const event=h.enqueue('bravo',{type:'contact.created',payload:{name:'Ana'}},'retry-1');
  fs.writeFileSync(h.file('bravo','.operation.lock'),'');await h.drain(['bravo']);assert.equal(calls,0);fs.unlinkSync(h.file('bravo','.operation.lock'));
  for(let i=0;i<5;i++){await h.drain(['bravo']);await h.drain(['bravo']);time+=400000;}
  assert.equal(calls,5);const final=h.events('bravo').find(e=>e.id===event.id);assert.equal(final.state,'failed');assert.ok(!JSON.stringify(final).includes('SECRET'));
  h.retry('bravo',event.id);assert.equal(h.events('bravo')[0].deliveries[0].attempts,0);
  h.transport=async()=>({status:401,data:{token:'SECRET'}});await h.drain(['bravo']);assert.equal(h.events('bravo')[0].state,'failed');
});
test('conectores usam endpoints e autenticacao especificos, sem aceitar URLs de destino no payload',async()=>{
  const calls=[],h=new IntegrationHub({transport:async(u,o)=>{calls.push({u,...o});return {status:o.method==='MKCOL'?201:200,data:u.includes('get_logged_user')?{message:'api-user'}:u.includes('/ocs/')?{ocs:{meta:{statuscode:200},data:{id:'api-user'}}}:{data:[]}};}});
  h.configure('alpha',{connectors:{auth:{enabled:true,token:'auth-key'},chat:{enabled:true,token:'chat-key',accountId:'1'},cloud:{enabled:true,username:'api-user',password:'app-pass'},postiz:{enabled:true,token:'postiz-key'},waha:{enabled:true,token:'waha-key'},n8n:{enabled:true,token:'n8n-key',webhookPath:'cloudworld'}}});
  for(const app of ['auth','chat','cloud','postiz','waha','erp'])assert.equal((await h.invoke('alpha',app,'check')).ok,true);
  assert.equal(calls.find(c=>c.u.includes('get_logged_user')).headers.Authorization,'token segredo-a:segredo-b');
  await h.invoke('alpha','cloud','folders.create',{folder:'Clientes'},'folder-event');assert.equal(calls.at(-1).method,'MKCOL');
  await h.invoke('alpha','n8n','events.send',{url:'http://evil.invalid',tenant:'bravo'},'event-id');assert.equal(calls.at(-1).body.tenant,'alpha');assert.ok(calls.at(-1).u.startsWith('https://n8n.alpha.localhost:8443/webhook/'));
  await assert.rejects(()=>h.invoke('alpha','cloud','folders.create',{folder:'../../etc'}));
  await assert.rejects(()=>h.invoke('alpha','waha','messages.send',{chatId:'invalid',text:'teste'}));
});
test('webhooks normalizam contatos e mensagens e rejeitam mensagens de saida para evitar loops',()=>{
  assert.equal(normalizeWebhook('chat',{event:'contact_created',id:7,name:'Ana'}).payload.name,'Ana');
  assert.equal(normalizeWebhook('waha',{event:'message',payload:{id:'m1',body:'Oi',from:'5511999999999@c.us',fromMe:false}}).type,'message.received');
  assert.throws(()=>normalizeWebhook('waha',{event:'message',payload:{fromMe:true}}),{status:422});
});
test('captura Chatwoot faz baseline, detecta novo contato e nao duplica o evento',async()=>{
  createTenant('capture','capture.localhost',8473);let list=[{id:1,name:'Existente',email:'existing@example.invalid'}];
  const h=new IntegrationHub({transport:async()=>({status:200,data:{meta:{count:list.length},payload:list}})});
  h.configure('capture',{connectors:{chat:{enabled:true,token:'secret',accountId:'1'}},sources:{chatContacts:true},routes:[{...route}]});
  await h.pollSources(['capture']);assert.equal(h.queue('capture').length,0);
  list.push({id:2,name:'Novo',email:'new@example.invalid'});await h.pollSources(['capture']);await h.pollSources(['capture']);
  assert.equal(h.queue('capture').length,1);assert.equal(h.queue('capture')[0].payload.sourceId,'2');
  h.configure('capture',{sources:{chatContacts:false}});list.push({id:3,name:'Desativado'});await h.pollSources(['capture']);assert.equal(h.queue('capture').length,1);
});
test('sondas distinguem rede indisponivel, ferramenta ausente e inicializacao OCI',async()=>{
  assert.equal(containerPhase({State:'running',Status:'Up (health: starting)'}),'starting');
  assert.equal(containerPhase({State:'running',Status:'Up (unhealthy)'}),'failed');
  assert.equal(containerPhase({State:'exited',Status:'Exited (0)'}),'stopped');
  assert.equal((await probe({type:'dns',host:'app.alpha.localhost'})).state,'local');
  assert.equal((await probe({type:'dns',host:'example.com'},{lookup:async()=>[{address:'192.0.2.1'}]})).state,'up');
  assert.equal((await probe({type:'ping',host:'192.0.2.1'},{command:async()=>{throw Object.assign(Error(),{code:'ENOENT'});}})).state,'unsupported');
  if(process.platform==='win32')assert.equal((await probe({type:'ping',host:'192.0.2.1'},{command:async()=>({stdout:'Host de destino inacessivel'})})).state,'down');
  assert.equal((await probe({type:'http',url:'http://127.0.0.1'},{transport:async()=>({status:503})})).state,'down');
  assert.equal((await probe({type:'snmp'},{snmpLoader:async()=>{throw Error();}})).state,'unsupported');
  assert.throws(()=>configureMonitoring('alpha',[{id:'evil',type:'ping',host:'-bad;command'}]));
});
test('HTTP real: API rejeita acesso anonimo, CSRF e acesso cruzado; processa webhook e revogacao',async()=>{
  const h=new IntegrationHub();const key=h.issueKey('alpha',{scopes:['events:write','events:read']});
  let api,origin;const server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,req.headers.authorization==='Basic operator')){res.writeHead(404);res.end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
  api=createControlAPI({listTenants:()=>[],engine:()=>({containers:[]}),origin,hub:h});
  try{
    const base=origin+'/api/v1/tenants/alpha/',headers={Authorization:'Bearer '+key.token,'Content-Type':'application/json','Idempotency-Key':'http-1'};
    assert.equal((await fetch(base+'events')).status,401);
    assert.equal((await fetch(origin+'/api/v1/tenants/bravo/events',{headers})).status,401);
    assert.equal((await fetch(base+'keys',{method:'POST',headers:{Authorization:'Basic operator','Content-Type':'application/json'},body:'{}'})).status,403);
    const r=await fetch(base+'events',{method:'POST',headers,body:JSON.stringify({type:'sale.created',payload:{name:'Pedido'}})});assert.equal(r.status,202);assert.equal((await r.json()).state,'unrouted');
    assert.equal((await fetch(base+'integrations',{method:'PUT',headers,body:'{}'})).status,403);
    assert.equal((await fetch(base+'portal/sso',{headers})).status,403);
    const contactEvent=h.enqueue('alpha',{type:'contact.created',payload:{name:'Privado',email:'private@example.invalid',source:'chat',sourceId:'42'}},'chat:contact_created:42');
    assert.equal((await fetch(base+'contacts/42/delivery',{headers})).status,403);
    const delivery=await fetch(base+'contacts/42/delivery',{headers:{Authorization:'Basic operator'}});assert.equal(delivery.status,200);const details=await delivery.json();assert.equal(details.event.id,contactEvent.id);assert.ok(!JSON.stringify(details).includes('private@example.invalid'));
    const other=await fetch(origin+'/api/v1/tenants/bravo/contacts/42/delivery',{headers:{Authorization:'Basic operator'}});assert.equal((await other.json()).event,null);
    assert.equal((await fetch(base+'portal/sso',{method:'PUT',headers,body:JSON.stringify({requireSso:false})})).status,403);
    const sso=await fetch(base+'portal/sso',{headers:{Authorization:'Basic operator'}});assert.equal(sso.status,200);assert.deepEqual(await sso.json(),{enabled:false,requireSso:false,linkedUsers:0});
    assert.equal((await fetch(base+'webhooks/waha',{method:'POST',headers,body:JSON.stringify({event:'message',payload:{id:'waha-1',body:'Oi',fromMe:false}})})).status,202);
    h.revokeKey('alpha',key.id);assert.equal((await fetch(base+'events',{headers})).status,401);
  }finally{api.close();await new Promise(r=>server.close(r));}
});
test('transporte HTTP respeita limite de resposta e nao segue redirecionamentos com credenciais',async()=>{
  const server=http.createServer((_q,res)=>{res.writeHead(302,{Location:'http://evil.invalid'});res.end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    assert.equal((await requestApp('http://127.0.0.1:'+server.address().port)).status,302);
    assert.equal((await requestApp('http://test.alpha.localhost:'+server.address().port)).status,302);
  }finally{await new Promise(r=>server.close(r));}
});
test('corpo HTTP Unicode chega completo com Content-Length correto',async()=>{
  const server=http.createServer((req,res)=>{const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({body:JSON.parse(Buffer.concat(chunks).toString()),length:Number(req.headers['content-length']),bytes:Buffer.concat(chunks).length}));});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const body={name:'José — 日本語'},r=await requestApp('http://127.0.0.1:'+server.address().port,{method:'POST',headers:{'Content-Type':'application/json'},body});assert.deepEqual(r.data.body,body);assert.equal(r.data.length,r.data.bytes);assert.ok(r.data.length>JSON.stringify(body).length);}finally{await new Promise(r=>server.close(r));}
});
