import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-event-archive-'));
const {createTenant,tenantPath}=await import('../infra.mjs');
const {IntegrationHub,atomicJSON}=await import('../integration.mjs');
const {EventArchive,archiveDirectory,writeArchiveBundle,restoreArchiveBundle}=await import('../integration-archive.mjs');
const {createControlAPI}=await import('../api.mjs');
const {exportBackup,importBackup}=await import('../backup-store.mjs');
const route={id:'to-n8n',event:'contact.created',app:'n8n',operation:'events.send',enabled:true};
const input={type:'contact.created',payload:{name:'Ana',email:'ana@example.invalid'}};
function setup(id){createTenant(id);const h=new IntegrationHub();h.configure(id,{routes:[route]});return h;}
function deliver(h,id,ids){const all=h.queue(id);for(const e of all)if(ids.includes(e.id))for(const d of e.deliveries){d.state='delivered';d.deliveredAt=new Date().toISOString();}atomicJSON(h.file(id,'integration-events.private.json'),all);}

test('archive preserves failures, pending and unrouted events, and deduplicates across restarts',()=>{
 const id='archived',h=setup(id),old=h.enqueue(id,input,'old-key'),recent=h.enqueue(id,input,'recent-key');
 const pending=h.enqueue(id,input,'pending-key'),failed=h.enqueue(id,input,'failed-key');
 h.configure(id,{routes:[]});const unrouted=h.enqueue(id,input,'unrouted-key');
 deliver(h,id,[old.id,recent.id]);const all=h.queue(id);all.find(e=>e.id===failed.id).deliveries[0].state='failed';atomicJSON(h.file(id,'integration-events.private.json'),all);
 assert.equal(h.compact(id,{keepDelivered:1}).archived,1);
 assert.deepEqual(h.queue(id).map(e=>e.id),[recent.id,pending.id,failed.id,unrouted.id]);
 const restarted=new IntegrationHub(),duplicate=restarted.enqueue(id,input,'old-key');assert.equal(duplicate.id,old.id);assert.equal(duplicate.archived,true);
 assert.equal(restarted.queue(id).length,4);
 assert.throws(()=>restarted.enqueue(id,{...input,payload:{name:'Outra'}},'old-key'),{status:409});
 const stats=h.queueStats(id);assert.deepEqual(stats.states,{pending:1,failed:1,delivered:1,unrouted:1});assert.equal(stats.archived,1);assert.ok(!JSON.stringify(stats).includes('ana@'));
});

test('automatic compaction frees capacity, while a genuinely full pending queue rejects new work',()=>{
 const id='capacity',h=setup(id),seed=h.enqueue(id,input,'seed');deliver(h,id,[seed.id]);const event=h.queue(id)[0];
 const all=Array.from({length:10000},(_,i)=>({...structuredClone(event),id:crypto.randomUUID(),key:'key-'+i,deliveries:[{...event.deliveries[0],state:i===0?'delivered':'pending'}]}));
 atomicJSON(h.file(id,'integration-events.private.json'),all);
 const added=h.enqueue(id,input,'new-key');assert.equal(added.state,'pending');assert.equal(h.queue(id).length,10000);assert.equal(h.archive(id).names().length,1);
 assert.equal(h.enqueue(id,input,'key-0').id,all[0].id);
 assert.throws(()=>h.enqueue(id,input,'full-key'),{status:503});assert.equal(h.queue(id).length,10000);
});

test('partial archive failure leaves the original queue intact and safely resumes',()=>{
 const id='archive-fault',h=setup(id),a=h.enqueue(id,input,'a'),b=h.enqueue(id,input,'b');deliver(h,id,[a.id,b.id]);
 const archive=h.archive(id),store=archive.store.bind(archive);let calls=0;
 h.archive=()=>archive;archive.store=(...args)=>{if(++calls===2)throw Error('disk full');return store(...args);};
 assert.throws(()=>h.compact(id,{keepDelivered:0}),/disk full/);assert.equal(h.queue(id).length,2);assert.equal(archive.names().length,1);
 archive.store=store;assert.equal(h.compact(id,{keepDelivered:0}).archived,2);assert.equal(h.queue(id).length,0);assert.equal(archive.names().length,2);
 assert.equal(h.enqueue(id,input,'a').id,a.id);
});

test('compaction during delivery preserves in-flight and newly received events; maintenance blocks writes',async()=>{
 const id='in-flight',h=setup(id),old=h.enqueue(id,input,'old'),current=h.enqueue(id,input,'current');deliver(h,id,[old.id]);
 let entered,release;const started=new Promise(r=>entered=r),blocked=new Promise(r=>release=r);h.invoke=async()=>{entered();await blocked;};
 const work=h.drain([id]);await started;h.compact(id,{keepDelivered:0});const added=h.enqueue(id,input,'added');release();await work;
 assert.equal(h.events(id).find(e=>e.id===current.id).state,'delivered');assert.ok(h.queue(id).some(e=>e.id===added.id));
 fs.writeFileSync(h.file(id,'.operation.lock'),'');
 assert.throws(()=>h.compact(id),{status:409});assert.throws(()=>h.enqueue(id,input,'during-backup'),{status:503});fs.unlinkSync(h.file(id,'.operation.lock'));
});

test('archive bundle survives encrypted backup and recovery without losing deduplication',async()=>{
 const id='bundle-source',h=setup(id),event=h.enqueue(id,input,'backup-key');deliver(h,id,[event.id]);h.compact(id,{keepDelivered:0});
 const source=fs.mkdtempSync(path.join(os.tmpdir(),'cw-archive-backup-')),bundle=path.join(source,'integration-archive.private.jsonl');
 assert.equal(await writeArchiveBundle(tenantPath(id),bundle),1);
 const hash=crypto.createHash('sha256').update(fs.readFileSync(bundle)).digest('hex');
 atomicJSON(path.join(source,'manifest.json'),{client:id,createdAt:new Date().toISOString(),hashes:{'integration-archive.private.jsonl':hash}});
 const key=crypto.randomBytes(32),encrypted=source+'-encrypted',restored=source+'-restored';await exportBackup(source,encrypted,key);await importBackup(encrypted,restored,key);
 const clone=path.join(source,'clone','tenants',id);fs.mkdirSync(clone,{recursive:true});fs.copyFileSync(path.join(tenantPath(id),'tenant.json'),path.join(clone,'tenant.json'));
 await restoreArchiveBundle(path.join(restored,'integration-archive.private.jsonl'),clone);
 const restarted=new IntegrationHub();restarted.dir=company=>{assert.equal(company,id);return clone;};
 const result=restarted.enqueue(id,input,'backup-key');assert.equal(result.id,event.id);assert.equal(result.archived,true);assert.equal(restarted.queue(id).length,0);
 await assert.rejects(()=>restoreArchiveBundle(bundle,clone),/existe/);
 createTenant('wrong-company');await assert.rejects(()=>restoreArchiveBundle(bundle,tenantPath('wrong-company')),/outra empresa/);
 assert.equal(fs.existsSync(archiveDirectory(tenantPath('wrong-company'))),false);
});

test('tampered archives and malformed recovery bundles fail closed without a published directory',async()=>{
 const id='bad-bundle',h=setup(id),event=h.enqueue(id,input,'key');deliver(h,id,[event.id]);h.compact(id,{keepDelivered:0});
 const archive=h.archive(id),file=path.join(archive.directory,archive.names()[0]),record=JSON.parse(fs.readFileSync(file));record.event.payload.name='tampered';atomicJSON(file,record);
 assert.throws(()=>h.enqueue(id,input,'key'),/divergente/);
 const bundle=path.join(tenantPath(id),'bad.jsonl');fs.writeFileSync(bundle,'{invalid}\n');createTenant('bad-restore');
 await assert.rejects(()=>restoreArchiveBundle(bundle,tenantPath('bad-restore')));assert.equal(fs.existsSync(archiveDirectory(tenantPath('bad-restore'))),false);
 assert.deepEqual(fs.readdirSync(tenantPath('bad-restore')).filter(n=>n.startsWith('.archive-restore-')),[]);
 assert.throws(()=>h.compact(id,{maxEvents:501}));assert.throws(()=>h.compact(id,{keepDelivered:-1}));
});

test('archive API is operator-only, requires same-origin mutations and never exposes payloads',async()=>{
 const id='archive-api',h=setup(id),e=h.enqueue(id,input,'api-key');deliver(h,id,[e.id]);
 const key=h.issueKey(id,{scopes:['events:read','events:write']}),server=http.createServer(async(req,res)=>{if(!await api.handle(req,res,req.headers.authorization==='Basic operator')){res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,api=createControlAPI({listTenants:()=>[],engine:()=>({}),origin,hub:h}),url=origin+'/api/v1/tenants/'+id+'/events';
 try{
  assert.equal((await fetch(url+'/stats',{headers:{Authorization:'Bearer '+key.token}})).status,403);
  const post={method:'POST',headers:{Authorization:'Basic operator',Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({keepDelivered:0})};
  assert.equal((await fetch(url+'/archive',{...post,headers:{...post.headers,Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await fetch(url+'/archive',{...post,headers:{...post.headers,Authorization:'Bearer '+key.token}})).status,403);
  const result=await fetch(url+'/archive',post);assert.equal(result.status,200);assert.equal((await result.json()).archived,1);
  const stats=await (await fetch(url+'/stats',{headers:{Authorization:'Basic operator'}})).json();assert.equal(stats.archived,1);assert.equal(stats.active,0);assert.ok(!JSON.stringify(stats).includes('ana@'));
 }finally{api.close();await new Promise(r=>server.close(r));}
});
