import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-ops-'));
const {RUNTIME,createTenant}=await import('../infra.mjs');
const {atomicJSON}=await import('../integration.mjs');
const {AlertStore,readiness,saveJobHistory,loadJobHistory}=await import('../operations.mjs');
const {exportBackup,importBackup,loadBackupKey,verifyExport}=await import('../backup-store.mjs');
createTenant('alpha');

test('carga local exige ambos os perfis recentes e a mesma configuracao, sem aprovar capacidade comercial',()=>{
  const compose=path.join(RUNTIME,'tenants','alpha','compose.json'),hash=crypto.createHash('sha256').update(fs.readFileSync(compose)).digest('hex'),dir=path.join(RUNTIME,'reports'),record={at:new Date().toISOString(),finishedAt:new Date().toISOString(),tenant:'alpha',ok:true,phase:'complete',composeSha256:hash};
  const status=()=>readiness('alpha').items.find(i=>i.id==='local-load').ok;atomicJSON(path.join(dir,'load-local-1.json'),record);assert.equal(status(),false);atomicJSON(path.join(dir,'load-bursts-1.json'),{...record,ok:false});assert.equal(status(),false);atomicJSON(path.join(dir,'load-bursts-1.json'),record);assert.equal(status(),true);assert.equal(readiness('alpha').items.find(i=>i.id==='capacity').ok,false);fs.appendFileSync(compose,'\n');assert.equal(status(),false);
});

test('recuperacao funcional exige sucesso, retomada e o mesmo ultimo backup da empresa',()=>{
  const backup=path.join(RUNTIME,'backups','alpha','one'),result=path.join(RUNTIME,'functional-recovery','test','result.json');atomicJSON(path.join(backup,'manifest.json'),{client:'alpha',createdAt:'2026-10-31T12:00:00Z',hashes:{}});
  const state={ok:true,tenant:'alpha',backup,originalResumed:false,copyStopped:true};atomicJSON(result,state);const status=()=>readiness('alpha').items.find(i=>i.id==='functional-restore').ok;assert.equal(status(),false);
  atomicJSON(result,{...state,originalResumed:true});assert.equal(status(),true);
  atomicJSON(path.join(RUNTIME,'backups','alpha','two','manifest.json'),{client:'alpha',createdAt:'2026-10-31T13:00:00Z',hashes:{}});assert.equal(status(),false);
});
test('alertas persistem, exigem duas observacoes e registram recuperacao',()=>{
  const alerts=new AlertStore(),snapshot={at:'2026-10-31T10:00:00Z',tenants:[{id:'alpha',checks:[{name:'erp',state:'down'}],connectors:[],containers:[]}]};
  alerts.evaluate(snapshot);assert.equal(alerts.list('alpha').filter(a=>a.key==='probe:erp').length,0);
  alerts.evaluate({...snapshot,at:'2026-10-31T10:00:15Z'});assert.equal(new AlertStore().list('alpha').find(a=>a.key==='probe:erp').state,'open');
  alerts.evaluate({...snapshot,at:'2026-10-31T10:00:30Z',tenants:[{...snapshot.tenants[0],checks:[{name:'erp',state:'up'}]}]});assert.equal(alerts.list('alpha').find(a=>a.key==='probe:erp').state,'resolved');
  assert.equal(readiness('alpha').ready,false);assert.equal(readiness('alpha').items.find(i=>i.id==='external').ok,false);
});
test('historico persiste sem stdout ou segredos e sinaliza operacao interrompida',()=>{
  saveJobHistory([{time:'now',action:'backup',id:'alpha',state:'running',output:'secret-value'}]);const jobs=loadJobHistory();assert.equal(jobs[0].state,'error');assert.ok(!fs.readFileSync(path.join(RUNTIME,'job-history.json'),'utf8').includes('secret-value'));
});
test('manutencao planejada e retomada nao geram alerta de indisponibilidade',()=>{
  let now=Date.now();const alerts=new AlertStore({clock:()=>now}),lock=path.join(RUNTIME,'tenants','alpha','.operation.lock');fs.writeFileSync(lock,'');
  const snapshot={at:'first',tenants:[{id:'alpha',checks:[{name:'planned-test',state:'down'}],connectors:[],containers:[]}]};
  alerts.evaluate(snapshot);alerts.evaluate({...snapshot,at:'second'});fs.unlinkSync(lock);now+=1000;alerts.evaluate({...snapshot,at:'third'});assert.equal(alerts.list('alpha').filter(a=>a.key==='probe:planned-test').length,0);
  now+=301000;alerts.evaluate({...snapshot,at:'fourth'});alerts.evaluate({...snapshot,at:'fifth'});assert.equal(alerts.list('alpha').find(a=>a.key==='probe:planned-test').state,'open');
  fs.writeFileSync(lock,'');alerts.evaluate({...snapshot,at:'sixth'});fs.unlinkSync(lock);alerts.evaluate({...snapshot,at:'seventh',tenants:[{...snapshot.tenants[0],checks:[{name:'planned-test',state:'up'}]}]});assert.equal(alerts.list('alpha').find(a=>a.key==='probe:planned-test').state,'resolved');
});
test('backup AES-GCM faz ida e volta, rejeita adulteracao e chave incorreta sem publicar arquivo final',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cw-backup-')),source=path.join(root,'source');fs.mkdirSync(source);const data='dados-privados-123';fs.writeFileSync(path.join(source,'database.sql'),data);fs.writeFileSync(path.join(source,'empty.sql'),'');atomicJSON(path.join(source,'manifest.json'),{client:'alpha',createdAt:new Date().toISOString(),hashes:{'database.sql':crypto.createHash('sha256').update(data).digest('hex'),'empty.sql':crypto.createHash('sha256').update('').digest('hex')}});
  const key=loadBackupKey(path.join(root,'key.txt')),encrypted=path.join(root,'encrypted');await exportBackup(source,encrypted,key);assert.ok(!fs.readFileSync(path.join(encrypted,'database.sql.enc')).includes(Buffer.from(data)));
  assert.equal((await verifyExport(encrypted,key)).ok,true);await assert.rejects(()=>verifyExport(encrypted,crypto.randomBytes(32)));
  const restored=path.join(root,'restored');await importBackup(encrypted,restored,key);assert.equal(fs.readFileSync(path.join(restored,'database.sql'),'utf8'),data);assert.equal(fs.statSync(path.join(restored,'empty.sql')).size,0);
  const wrong=path.join(root,'wrong');await assert.rejects(()=>importBackup(encrypted,wrong,crypto.randomBytes(32)));assert.equal(fs.existsSync(path.join(wrong,'database.sql')),false);
  const file=path.join(encrypted,'database.sql.enc'),content=fs.readFileSync(file);content[20]^=1;fs.writeFileSync(file,content);await assert.rejects(()=>importBackup(encrypted,path.join(root,'corrupt'),key),/corrompida/);
});
