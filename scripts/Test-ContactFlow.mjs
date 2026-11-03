import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {RUNTIME,tenantPath} from '../infra.mjs';
import {IntegrationHub,requestApp,atomicJSON} from '../integration.mjs';
import {contactFlow,contactRoutes,assertManagedContactWorkflow} from '../contact-flow.mjs';
import {containerCommand} from '../container-runtime.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
if(!tenant.local||process.argv.length>3)throw Error('Ensaio restrito a uma empresa local');
const hub=new IntegrationHub(),settings=hub.settings(id),connector=settings.connectors.n8n;
contactRoutes(settings.routes);
if(connector?.webhookPath!==contactFlow.webhookPath||connector.requireAck!==true)throw Error('Use somente o workflow gerenciado de confirmacao, sem efeitos externos');
for(const app of ['chat','erp','n8n'])if(!settings.connectors[app]?.enabled)throw Error('Conector desativado: '+app);
if(!settings.routes.some(r=>r.id==='cloudworld-contact-erp'&&r.enabled)||!settings.routes.some(r=>r.id==='cloudworld-contact-n8n'&&r.enabled))throw Error('Prepare as duas rotas antes do ensaio');
const query=`SELECT json_build_object('id',w.id,'active',w.active,'activeVersionId',w."activeVersionId",'nodes',v.nodes,'connections',v.connections) FROM workflow_entity w JOIN workflow_history v ON v."versionId"=w."activeVersionId" AND v."workflowId"=w.id WHERE w.id='${contactFlow.workflowId}';`;
const cli=containerCommand(['exec','-i',tenant.project+'-n8n-db-1','sh','-c','exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA']);
let published;
try{published=JSON.parse(execFileSync(cli.command,cli.args,{env:cli.env,input:query,encoding:'utf8',timeout:15000,maxBuffer:1048576,stdio:['pipe','pipe','pipe']}).trim());}catch{throw Error('Nao foi possivel conferir a versao publicada do workflow; nenhum contato criado');}
assertManagedContactWorkflow(published);
const origin='http://127.0.0.1:8099',base=origin+'/api/v1/tenants/'+id;
const auth='Basic '+Buffer.from('admin:'+fs.readFileSync(path.join(RUNTIME,'panel-password.txt'),'utf8').trim()).toString('base64');
async function api(resource,method='GET',body,extra={}){
 const response=await fetch(base+'/'+resource,{method,headers:{Authorization:auth,Origin:origin,'Content-Type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'HTTP '+response.status);return result;
}
const report={at:new Date().toISOString(),tenant:id,checks:[],scope:'Contato identificado no Chatwoot, cliente ERP e confirmacao n8n; sem mensagens ou publicacoes externas'};
const save=()=>atomicJSON(path.join(RUNTIME,'reports','contact-flow-live.json'),report);
async function check(name,fn){await fn();report.checks.push({name,ok:true});console.log(name+': OK');save();}
let temporaryKey;
try{
 for(const app of ['chat','erp','n8n'])await check('API autenticada '+app,async()=>assert.equal((await api('connectors/'+app+'/check','POST',{})).ok,true));
 await check('Captura de contatos inicializada',async()=>{const sources=await api('sources/chat/scan','POST',{});assert.ok(sources.chatContacts.enabled&&sources.chatContacts.initialized&&!sources.chatContacts.error);});
 const marker='CW-FLOW-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'),email=marker.toLowerCase()+'@example.invalid';let contactId,event;
 await check('Contato de teste criado no Chatwoot',async()=>{
  const result=await api('connectors/chat/contacts.create','POST',{name:marker,email},{'Idempotency-Key':crypto.randomUUID()});
  contactId=result.payload?.contact?.id||result.payload?.id||result.id;assert.ok(contactId);report.contactId=String(contactId);report.testMarker=marker;
 });
 await check('Evento entregue ao ERP e confirmado pelo workflow n8n',async()=>{
  await api('sources/chat/scan','POST',{});const start=Date.now();
  while(Date.now()-start<65000){
   const status=await api('contacts/'+contactId+'/delivery');event=status.event;
   if(event?.state==='failed')throw Error(event.deliveries.filter(d=>d.error).map(d=>d.app+': '+d.error).join('; '));
   if(event?.state==='delivered'&&event.deliveries.some(d=>d.app==='erp')&&event.deliveries.some(d=>d.app==='n8n')){report.eventId=event.id;return;}
   await delay(1500);
  }
  throw Error('Entregas nao concluiram no prazo');
 });
 await check('ERP reconhece o mesmo contato sem criar outro cliente',async()=>{
  const result=await api('connectors/erp/customers.upsert','POST',{name:marker,email,source:'chat',sourceId:String(contactId)});assert.equal(result.existing,true);report.customerId=result.name;
 });
 await check('Reenvio do evento preserva o mesmo ID e as tentativas de entrega',async()=>{
  temporaryKey=await api('keys','POST',{name:'Ensaio temporario de contatos',scopes:['events:write','events:read']});
  const original=hub.queue(id).find(e=>e.id===event.id);assert.ok(original);
  const response=await fetch(base+'/events',{method:'POST',headers:{Authorization:'Bearer '+temporaryKey.token,'Content-Type':'application/json','Idempotency-Key':original.key},body:JSON.stringify({type:original.type,payload:original.payload})});
  assert.equal(response.status,202);const replay=await response.json();assert.equal(replay.id,event.id);assert.deepEqual(replay.deliveries,event.deliveries);
 });
 await check('Webhook n8n recusa uma chave incorreta',async()=>{
  const response=await requestApp(tenant.urls.n8n+'/webhook/'+contactFlow.webhookPath,{method:'POST',headers:{'Content-Type':'application/json','X-CloudWorld-Key':'invalid-test-key'},body:{id:'invalid-auth-test',tenant:id}});
  assert.ok([401,403].includes(response.status));
 });
 await check('Conector n8n registra confirmacao real do evento',async()=>assert.equal((await api('connectors/n8n/check','POST',{})).authentication,'verified'));
 report.ok=true;
}catch(error){report.ok=false;report.error=error.message;process.exitCode=1;console.error('Ensaio precisa de revisao: '+error.message);}
finally{
 if(temporaryKey){try{await api('keys/'+temporaryKey.id,'DELETE');const revoked=await fetch(base+'/events',{headers:{Authorization:'Bearer '+temporaryKey.token}});assert.equal(revoked.status,401);report.temporaryKeyRevoked=true;}catch{report.ok=false;report.temporaryKeyRevoked=false;process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();save();
}
