import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-contact-flow-'));
const {createTenant}=await import('../infra.mjs');
const {IntegrationHub}=await import('../integration.mjs');
const {contactRoutes,contactWorkflow,contactFlow}=await import('../contact-flow.mjs');

test('managed routes preserve unrelated flows and reject disabled, conflicting or unsafe contact routes',()=>{
 const other={id:'existing-sale',event:'sale.created',app:'n8n',operation:'events.send',enabled:true},initial=[other];
 const routes=contactRoutes(initial);assert.equal(routes.length,3);assert.deepEqual(initial,[other]);assert.deepEqual(contactRoutes(routes),routes);
 assert.throws(()=>contactRoutes([{id:'external-message',event:'contact.created',app:'waha',operation:'messages.send',enabled:true}]),/outro fluxo/);
 const managed=routes.find(r=>r.app==='erp');assert.throws(()=>contactRoutes([{...managed,enabled:false}]),/desativado/);
 assert.throws(()=>contactRoutes([{...managed,app:'chat',operation:'contacts.create'}]),/alterado/);
 assert.throws(()=>contactRoutes(Array.from({length:19},(_,i)=>({...other,id:'sale-'+i}))),/Limite/);
});

test('workflow requires header authentication and responds only after the acknowledgement node',()=>{
 const workflow=contactWorkflow(),webhook=workflow.nodes[0],ack=workflow.nodes[1];
 assert.equal(workflow.id,contactFlow.workflowId);assert.equal(webhook.parameters.authentication,'headerAuth');assert.equal(webhook.parameters.responseMode,'responseNode');
 assert.equal(webhook.credentials.httpHeaderAuth.id,contactFlow.credentialId);assert.equal(ack.type,'n8n-nodes-base.respondToWebhook');
 assert.match(ack.parameters.responseBody,/tenant: \$json.body.tenant/);assert.match(ack.parameters.responseBody,/eventId: \$json.body.id/);
 assert.equal(workflow.connections[webhook.name].main[0][0].node,ack.name);assert.equal(workflow.settings.saveDataSuccessExecution,'none');
 assert.ok(!JSON.stringify(workflow).includes('password'));assert.equal(workflow.nodes.length,2);
});

test('managed connector rejects a wrong acknowledgement and clears previous verification',async()=>{
 createTenant('acknowledge');let wrong=false;
 const hub=new IntegrationHub({transport:async(_url,options)=>({status:200,data:options.method==='POST'?{accepted:true,tenant:wrong?'other':options.body.tenant,eventId:options.body.id}:{}})});
 hub.configure('acknowledge',{connectors:{n8n:{enabled:true,token:'private-header-token',webhookPath:contactFlow.webhookPath,requireAck:true}}});
 assert.equal((await hub.invoke('acknowledge','n8n','check')).authentication,'webhook-nao-verificado');
 const response=await hub.invoke('acknowledge','n8n','events.send',{tenant:'spoofed',id:'spoofed'},'known-event');
 assert.equal(response.tenant,'acknowledge');assert.equal(response.eventId,'known-event');assert.equal((await hub.invoke('acknowledge','n8n','check')).authentication,'verified');
 wrong=true;await assert.rejects(()=>hub.invoke('acknowledge','n8n','events.send',{},'known-event'),{status:422});
 assert.equal((await hub.invoke('acknowledge','n8n','check')).authentication,'webhook-nao-verificado');
 assert.equal(hub.publicSettings('acknowledge').connectors.n8n.requireAck,true);assert.ok(!JSON.stringify(hub.publicSettings('acknowledge')).includes('private-header-token'));
});

test('custom n8n webhooks retain backwards compatibility and acknowledgement flags are validated',async()=>{
 createTenant('custom-webhook');const hub=new IntegrationHub({transport:async()=>({status:200,data:{custom:'accepted'}})});
 hub.configure('custom-webhook',{connectors:{n8n:{enabled:true,token:'secret',webhookPath:'custom'}}});
 assert.deepEqual(await hub.invoke('custom-webhook','n8n','events.send',{}),{custom:'accepted'});
 assert.throws(()=>hub.configure('custom-webhook',{connectors:{n8n:{requireAck:'true'}}}));
 assert.throws(()=>hub.configure('custom-webhook',{connectors:{chat:{requireAck:true}}}));
});

test('live rehearsal rejects modified published workflows before creating a test contact',async()=>{
 const {assertManagedContactWorkflow}=await import('../contact-flow.mjs');
 const published={...contactWorkflow(),active:true,activeVersionId:'published-version'};assert.doesNotThrow(()=>assertManagedContactWorkflow(published));
 for(const mutate of [p=>p.nodes.push({type:'n8n-nodes-base.httpRequest',parameters:{url:'https://external.invalid'}}),p=>p.active=false,p=>p.activeVersionId=null,p=>p.nodes[0].credentials.httpHeaderAuth.id='other',p=>p.connections={}]){
  const bad=structuredClone(published);mutate(bad);assert.throws(()=>assertManagedContactWorkflow(bad),/interrompido/);
 }
});
