import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {RUNTIME,tenantPath} from '../infra.mjs';
import {atomicJSON,IntegrationHub} from '../integration.mjs';
import {burstRound,Measurements} from '../load-test.mjs';
const id='piloto',dir=tenantPath(id),tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));assert.equal(tenant.local,true);
const exec=promisify(execFile),hub=new IntegrationHub(),lock=path.join(RUNTIME,'.load-test.lock'),fd=fs.openSync(lock,'wx'),report={at:new Date().toISOString(),tenant:id,phase:'preparing',composeSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'compose.json'))).digest('hex'),rounds:[],scope:'Rajadas locais de leituras autenticadas com uma conta de portal e chaves de integracao; ate dez requisicoes em voo. Nao corresponde a dez usuarios ou empresas.'},dest=path.join(RUNTIME,'reports','load-bursts-'+Date.now()+'.json');let cookie;
const states=async()=>{const {stdout:names}=await exec('docker',['ps','-aq','--filter','label=com.docker.compose.project='+tenant.project],{windowsHide:true,timeout:15000});const {stdout}=await exec('docker',['inspect',...names.trim().split(/\s+/)],{windowsHide:true,timeout:15000,maxBuffer:2097152});return JSON.parse(stdout).filter(c=>!['chat-init','erp-init','erp-config','temporal-init'].includes(c.Config.Labels['com.docker.compose.service'])).map(c=>({name:c.Name,status:c.State.Status,health:c.State.Health?.Status,oom:c.State.OOMKilled,restarts:c.RestartCount}));};
try{
  assert.ok(!fs.existsSync(path.join(dir,'.operation.lock'))&&!fs.existsSync(path.join(RUNTIME,'.backup-scheduler.lock')));assert.ok(os.freemem()>1200*1024*1024);const before=await states();assert.equal(before.length,28);assert.ok(before.every(c=>c.status==='running'&&!c.oom&&c.health!=='unhealthy'));report.before=before;
  const c=JSON.parse(fs.readFileSync(path.join(dir,'portal-initial.private.json'))),r=await fetch('http://127.0.0.1:8100/api/login',{method:'POST',headers:{Origin:'http://127.0.0.1:8100','Content-Type':'application/json'},body:JSON.stringify({tenant:id,username:c.username,password:c.password}),signal:AbortSignal.timeout(10000)});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];await r.arrayBuffer();
  const apps=['auth','chat','erp','cloud','postiz','n8n','waha','chat','erp','cloud'];
  for(const count of [1,3,6,10]){
    assert.ok(os.freemem()>800*1024*1024&&!fs.existsSync(path.join(dir,'.operation.lock')));const m=new Measurements(),entry={concurrency:count,bursts:[]};report.rounds.push(entry);report.phase='rajada '+count;atomicJSON(dest,report);
    for(let repetition=0;repetition<3;repetition++){
      for(const type of ['portal','applications']){const result=await burstRound({count,run:async i=>{const endpoint=type==='portal'?'portal':apps[i],start=performance.now();try{if(type==='portal'){const response=await fetch('http://127.0.0.1:8100/api/me',{headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)});const body=await response.json();assert.equal(response.status,200);assert.equal(body.company,id);}else await hub.invoke(id,endpoint,'check');m.add(endpoint,performance.now()-start,{ok:true,status:200});}catch(e){m.add(endpoint,performance.now()-start,{ok:false,status:e.status||'error'});throw Error('Falha em leitura da rajada');}}});entry.bursts.push({type,...result});assert.equal(result.errors,0);await delay(1500);}
    }entry.endpoints=m.summary();entry.hostFreeBytes=os.freemem();console.log('Rajadas '+count+': OK');atomicJSON(dest,report);
  }
  report.after=await states();assert.ok(report.after.length===before.length&&report.after.every(c=>c.status==='running'&&!c.oom&&c.health!=='unhealthy'&&c.restarts===before.find(b=>b.name===c.name)?.restarts));assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'compose.json'))).digest('hex'),report.composeSha256);report.ok=true;
}catch{report.ok=false;report.failure='Perfil interrompido por falha de leitura, protecao de recursos ou mudanca de estado';process.exitCode=1;}
finally{if(cookie)try{const r=await fetch('http://127.0.0.1:8100/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:8100','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});if(r.status!==200)throw Error();}catch{report.ok=false;report.sessionCleanup='Verificar encerramento da sessao de teste';process.exitCode=1;}report.phase='complete';report.finishedAt=new Date().toISOString();atomicJSON(dest,report);fs.closeSync(fd);fs.unlinkSync(lock);console.log('Rajadas: '+(report.ok?'concluidas':'revisar')+' — '+dest);}
