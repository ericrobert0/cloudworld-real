import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {RUNTIME,tenantPath} from '../infra.mjs';
import {IntegrationHub,requestApp,atomicJSON} from '../integration.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
if(!t.local)throw Error('Teste de escrita restrito ao piloto local.');
const origin='http://127.0.0.1:8099',base=origin+'/api/v1/tenants/'+id,auth='Basic '+Buffer.from('admin:'+fs.readFileSync(path.join(RUNTIME,'panel-password.txt'),'utf8').trim()).toString('base64'),checks=[];
let key;
let ready=false;
for(let i=0;i<30;i++){try{const r=await fetch(origin,{signal:AbortSignal.timeout(2000)});if(r.status===401){ready=true;break;}}catch{}await delay(500);}
if(!ready)throw Error('Painel nao iniciou; nenhum teste de escrita executado.');
async function api(resource,method='GET',body,extra={}){
  const r=await fetch(base+'/'+resource,{method,headers:{Authorization:auth,Origin:origin,'Content-Type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
  const value=await r.json();if(!r.ok)throw Error(value.error||'HTTP '+r.status);return value;
}
async function check(name,fn){try{await fn();checks.push({name,ok:true});console.log(name+': OK');}catch(e){checks.push({name,ok:false,error:e.message});console.log(name+': FALHOU');}}
try{
  await check('Painel CloudWorld publicado',async()=>{const r=await fetch(origin,{headers:{Authorization:auth}});assert.equal(r.status,200);const text=await r.text();assert.ok(text.includes('CloudWorld'));assert.ok(text.includes('toggle-contact-sync'));});
  for(const app of ['auth','chat','erp','cloud','postiz','n8n','waha'])await check('API local '+app,async()=>{assert.equal((await api('connectors/'+app+'/check','POST',{})).ok,true);});
  await check('Criacao e isolamento de permissoes da chave',async()=>{
    key=await api('keys','POST',{name:'Teste temporario CloudWorld',scopes:['events:write','events:read']});
    const r=await fetch(base+'/integrations',{headers:{Authorization:'Bearer '+key.token}});assert.equal(r.status,403);
    assert.equal((await fetch(base+'/events',{headers:{Authorization:'Bearer invalid'}})).status,401);
  });
  await check('n8n chama API CloudWorld pela rede interna',async()=>{
    assert.ok(key);
    const script=`let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',async()=>{try{const d=JSON.parse(s);const r=await fetch('http://host.docker.internal:8099/api/v1/tenants/'+d.id+'/events',{headers:{Authorization:'Bearer '+d.token},signal:AbortSignal.timeout(5000)});console.log(r.status);process.exitCode=r.status===200?0:1;}catch{process.exitCode=1;}});`;
    await new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',t.project+'-n8n-1','node','-e',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});p.stdout.resume();p.stderr.resume();p.on('error',reject);p.on('close',c=>c===0?resolve():reject(Error('Callback interno indisponivel')));p.stdin.end(JSON.stringify({id,token:key.token}));});
  });
  await check('Pasta de teste no Nextcloud',async()=>{const r=await api('connectors/cloud/folders.create','POST',{folder:'CloudWorld - Teste de integracao'});assert.ok(r.created||r.existing);});
  const run=Date.now(),name='CloudWorld Teste '+run,email='cloudworld-'+run+'@example.invalid';
  let contactId,eventId;
  await check('Captura local e fluxos ERP + n8n ativos',async()=>{
    const settings=await api('integrations'),routes=settings.routes;
    for(const [app,operation] of [['erp','customers.upsert'],['n8n','events.send']])if(!routes.some(r=>r.id==='cloudworld-contact-'+app))routes.push({id:'cloudworld-contact-'+app,event:'contact.created',app,operation,enabled:true});
    await api('integrations','PUT',{routes,sources:{chatContacts:true}});const result=await api('sources/chat/scan','POST',{});assert.ok(result.chatContacts.initialized&&!result.chatContacts.error);
  });
  await check('Contato de teste criado na API Chatwoot',async()=>{const r=await api('connectors/chat/contacts.create','POST',{name,email},{'Idempotency-Key':crypto.randomUUID()});contactId=r.payload?.contact?.id||r.payload?.id||r.id;assert.ok(contactId,'Resposta sem ID de contato');});
  await check('Contato capturado e entregue ao ERP e n8n',async()=>{
    assert.ok(contactId,'Contato nao criado');await api('sources/chat/scan','POST',{});
    const started=Date.now();while(Date.now()-started<65000){
      const status=await api('contacts/'+contactId+'/delivery');assert.equal(status.contactId,String(contactId));const e=status.event;
      if(e?.state==='failed')throw Error(e.deliveries.filter(d=>d.error).map(d=>d.app+': '+d.error).join('; '));
      if(e?.state==='delivered'&&e.deliveries.some(d=>d.app==='erp')&&e.deliveries.some(d=>d.app==='n8n')){eventId=e.id;return;}
      await delay(2000);
    }throw Error('Entregas nao concluiram no prazo');
  });
  await check('ERP reconhece contato sem duplicar cliente',async()=>{assert.ok(contactId&&eventId);const r=await api('connectors/erp/customers.upsert','POST',{name,email,source:'chat',sourceId:String(contactId)});assert.equal(r.existing,true);});
  await check('Webhook n8n rejeita credencial incorreta',async()=>{const h=new IntegrationHub(),c=h.settings(id).connectors.n8n;const r=await requestApp(new URL('/webhook/'+c.webhookPath,t.urls.n8n).href,{method:'POST',headers:{'X-CloudWorld-Key':'incorrect-test-token','Content-Type':'application/json'},body:{test:true}});assert.ok([401,403].includes(r.status));});
  await check('Webhook n8n validado por entrega real',async()=>{const r=await api('connectors/n8n/check','POST',{});assert.equal(r.authentication,'verified');});
}finally{
  if(key)await check('Chave temporaria revogada',async()=>{await api('keys/'+key.id,'DELETE');assert.equal((await fetch(base+'/events',{headers:{Authorization:'Bearer '+key.token}})).status,401);});
  atomicJSON(path.join(RUNTIME,'reports','platform-live-test.json'),{at:new Date().toISOString(),client:id,checks,scope:'Dados ficticios locais no Chatwoot, ERP, Nextcloud e n8n; sem envio WhatsApp ou publicacao em redes sociais.'});
}
if(checks.some(c=>!c.ok))process.exitCode=1;
