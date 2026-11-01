import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {RUNTIME,tenantPath} from '../infra.mjs';
import {atomicJSON,IntegrationHub} from '../integration.mjs';
import {economyProfile,memoryBytes,median,expectedWorkerTotal} from '../resource-profile.mjs';
const exec=promisify(execFile),id='piloto',dir=tenantPath(id),file=path.join(dir,'compose.json'),tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));if(!tenant.local)throw Error('Ajuste restrito ao piloto local');
if(fs.existsSync(path.join(RUNTIME,'.load-test.lock'))||fs.existsSync(path.join(RUNTIME,'.backup-scheduler.lock')))throw Error('Aguarde o teste ou backup atual');
const lock=path.join(dir,'.operation.lock'),fd=fs.openSync(lock,'wx'),work=path.join(RUNTIME,'deployments','economy-'+Date.now()),hub=new IntegrationHub(),targets=['auth','chat','chat-worker'],report={at:new Date().toISOString(),tenant:id,profile:'economia-local',ok:false,services:targets,method:'Tres amostras por periodo; soma do uso informado pelo Docker. Observacao local sem carga pesada; nao garante reducao fixa ou capacidade comercial.'};let changed=false,original;
const docker=async args=>(await exec('docker',args,{windowsHide:true,timeout:420000,maxBuffer:2097152})).stdout;
const dc=(...args)=>docker(['compose','--project-directory',dir,'-f',file,...args]);
async function samples(){const values=[];for(let i=0;i<3;i++){const raw=await docker(['stats','--no-stream','--format','{{json .}}']),rows=raw.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)).filter(r=>r.Name.startsWith(tenant.project+'-'));values.push({at:new Date().toISOString(),hostFreeBytes:os.freemem(),totalBytes:rows.reduce((n,r)=>n+memoryBytes(r.MemUsage.split('/')[0].trim()),0),services:rows.map(r=>({name:r.Name,memoryBytes:memoryBytes(r.MemUsage.split('/')[0].trim())}))});if(i<2)await delay(10000);}return values;}
async function check(app){let last;for(let i=0;i<30;i++)try{await hub.invoke(id,app,'check');return;}catch(e){last=e;await delay(2000);}throw last;}
async function worker(){const hostname=(await docker(['inspect','--format','{{.Config.Hostname}}',tenant.project+'-chat-worker-1'])).trim(),keys=(await docker(['exec',tenant.project+'-chat-redis-1','redis-cli','--raw','SMEMBERS','processes'])).trim().split('\n').filter(Boolean);for(const key of keys){const raw=await docker(['exec',tenant.project+'-chat-redis-1','redis-cli','--raw','HGET',key,'info']);try{const info=JSON.parse(raw);if(info.hostname===hostname&&Number(info.concurrency)===expectedWorkerTotal()){report.workerTotalConcurrency=info.concurrency;return true;}}catch{}}return false;}
try{
  fs.mkdirSync(work,{recursive:true});original=JSON.parse(fs.readFileSync(file));report.before=await samples();fs.copyFileSync(file,path.join(work,'compose.before.private.json'));
  const candidate=economyProfile(original);atomicJSON(file,candidate);changed=true;await dc('config','--quiet');
  for(const service of targets){console.log('Ajustando apenas '+service+'...');await dc('up','-d','--no-deps','--wait','--wait-timeout','300',service);if(service!=='chat-worker')await check(service==='auth'?'auth':'chat');}
  let ready=false;for(let i=0;i<30;i++){if(await worker()){ready=true;break;}await delay(2000);}if(!ready)throw Error('Worker Chatwoot nao confirmou concorrencia ajustada');
  await delay(20000);report.after=await samples();report.beforeMedianBytes=median(report.before.map(s=>s.totalBytes));report.afterMedianBytes=median(report.after.map(s=>s.totalBytes));report.observedDifferenceBytes=report.beforeMedianBytes-report.afterMedianBytes;report.composeSha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');report.ok=true;
  atomicJSON(path.join(dir,'resource-profile.json'),{profile:report.profile,at:new Date().toISOString(),composeSha256:report.composeSha256,settings:'Authentik web: 1 processo / 4 threads. Chatwoot web: 1 processo simples / ate 3 threads. Sidekiq: 3 tarefas normais e 2 internas de monitoramento.',report:path.join(work,'result.json')});
}catch(e){report.failure='Ajuste nao confirmado; verificar diagnostico privado';fs.writeFileSync(path.join(work,'diagnostic.private.log'),e.stack||String(e),{mode:0o600});if(changed){atomicJSON(file,original);try{for(const service of targets)await dc('up','-d','--no-deps','--wait','--wait-timeout','300',service);report.rolledBack=true;}catch{report.rolledBack=false;}}process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();atomicJSON(path.join(work,'result.json'),report);fs.closeSync(fd);fs.unlinkSync(lock);console.log('Perfil economico: '+(report.ok?'aplicado e verificado':'revisar')+' — '+path.join(work,'result.json'));}
