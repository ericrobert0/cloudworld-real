import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {RUNTIME,tenantPath} from '../infra.mjs';
import {atomicJSON,requestApp,IntegrationHub} from '../integration.mjs';
import {pacedStage,Measurements} from '../load-test.mjs';
const exec=promisify(execFile),id='piloto',dir=tenantPath(id),tenant=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json'))),hub=new IntegrationHub();assert.equal(tenant.local,true);
const lock=path.join(RUNTIME,'.load-test.lock'),fd=fs.openSync(lock,'wx'),report={at:new Date().toISOString(),tenant:id,phase:'preflight',stages:[],samples:[],limits:{maxConcurrency:10,maxCyclesPerSecond:3,minHostFreeBytes:800*1024*1024},scope:'Carga local de consultas autenticadas, uma conta do portal e sete APIs. Concorrencia de requisicoes nao representa quantidade de pessoas, empresas, vendas ou execucoes de automacao.'};
report.composeSha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'compose.json'))).digest('hex');
const dest=path.join(RUNTIME,'reports','load-local-'+Date.now()+'.json'),save=()=>atomicJSON(dest,report);let cookie,stop=false,monitor,monitoring=false,baseline=[],lowMemory=0,lastPostiz=0;
const docker=async args=>(await exec('docker',args,{windowsHide:true,timeout:15000,maxBuffer:2097152})).stdout;
async function states(){const names=(await docker(['ps','-aq','--filter','label=com.docker.compose.project='+tenant.project])).trim().split(/\s+/).filter(Boolean);if(!names.length)throw Error('Docker indisponivel');const rows=JSON.parse(await docker(['inspect',...names]));return rows.filter(c=>!['chat-init','erp-init','erp-config','temporal-init'].includes(c.Config.Labels['com.docker.compose.service'])).map(c=>({name:c.Name.slice(1),status:c.State.Status,oom:c.State.OOMKilled,restarts:c.RestartCount,health:c.State.Health?.Status||null}));}
async function sample(){if(monitoring)return;monitoring=true;try{const free=os.freemem(),rows=await states();lowMemory=free<report.limits.minHostFreeBytes?lowMemory+1:0;const point={at:new Date().toISOString(),hostFreeBytes:free,containers:rows};if(report.samples.length%2===0){const text=await docker(['stats','--no-stream','--format','{{json .}}',...rows.map(r=>r.name)]);point.resources=text.trim().split('\n').filter(Boolean).map(s=>{const r=JSON.parse(s);return {name:r.Name,cpu:r.CPUPerc,memory:r.MemUsage,pids:r.PIDs};});}report.samples.push(point);if(lowMemory>=2||rows.some(c=>c.oom||c.status!=='running'||c.health==='unhealthy'||c.restarts!==baseline.find(b=>b.name===c.name)?.restarts)){stop=true;report.stopReason='Memoria baixa ou mudanca de estado/reinicio de container';}save();}catch{stop=true;report.stopReason='Monitoramento indisponivel durante o ensaio';}finally{monitoring=false;}}
async function application(app){const c=hub.settings(id).connectors[app];
  if(app==='erp'){const r=await requestApp(new URL('/api/resource/Customer?limit_page_length=5',tenant.urls.erp),{headers:{Authorization:'token '+c.apiKey+':'+c.apiSecret}});assert.equal(r.status,200);assert.ok(Array.isArray(r.data.data));return;}
  if(app==='chat'){const r=await hub.invoke(id,'chat','contacts.list',{page:1});assert.ok(Array.isArray(r.payload));return;}
  await hub.invoke(id,app,'check');
}
try{
  if(fs.existsSync(path.join(dir,'.operation.lock'))||fs.existsSync(path.join(RUNTIME,'.backup-scheduler.lock')))throw Error('Manutencao ou backup em andamento');
  baseline=await states();assert.equal(baseline.length,28);assert.ok(baseline.every(c=>c.status==='running'&&!c.oom&&c.health!=='unhealthy'));if(os.freemem()<1200*1024*1024)throw Error('Memoria livre insuficiente para iniciar');
  report.baseline=baseline;report.host={memoryBytes:os.totalmem(),cpus:os.cpus().length};report.docker=JSON.parse(await docker(['info','--format','{{json .}}']));report.docker={cpus:report.docker.NCPU,memoryBytes:report.docker.MemTotal};
  const credentials=JSON.parse(fs.readFileSync(path.join(dir,'portal-initial.private.json'))),login=await fetch('http://127.0.0.1:8100/api/login',{method:'POST',headers:{Origin:'http://127.0.0.1:8100','Content-Type':'application/json'},body:JSON.stringify({tenant:id,username:credentials.username,password:credentials.password}),signal:AbortSignal.timeout(10000)});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];await login.arrayBuffer();
  for(const app of ['auth','chat','erp','cloud','postiz','n8n','waha'])await application(app);
  monitor=setInterval(()=>sample(),10000);monitor.unref();await sample();
  for(const stage of [{concurrency:1,rate:.5,durationMs:30000},{concurrency:3,rate:1,durationMs:45000},{concurrency:6,rate:2,durationMs:60000},{concurrency:10,rate:3,durationMs:60000}]){
    if(stop)break;report.phase='carga '+stage.concurrency;const measured=new Measurements(),st={...stage,at:new Date().toISOString()};report.stages.push(st);save();console.log('Etapa: ate '+stage.concurrency+' requisicoes simultaneas, '+stage.rate+' ciclos/s');let errors=0;
    const apps=['auth','chat','erp','cloud','postiz','n8n','waha'];
    const measuredCall=async(endpoint,fn)=>{const start=performance.now();try{await fn();measured.add(endpoint,performance.now()-start,{ok:true,status:200});}catch(e){measured.add(endpoint,performance.now()-start,{ok:false,status:e.status||'error'});if(++errors>=3){stop=true;report.stopReason='Tres falhas na etapa; revisar antes de aumentar a carga';}}};
    st.run=await pacedStage({...stage,shouldStop:()=>stop,run:async ticket=>{
      if(fs.existsSync(path.join(dir,'.operation.lock'))){stop=true;report.stopReason='Operacao de manutencao iniciada';return;}
      await measuredCall('portal',async()=>{const r=await fetch('http://127.0.0.1:8100/api/me',{headers:{Cookie:cookie},signal:AbortSignal.timeout(10000)}),data=await r.json();assert.equal(r.status,200);assert.equal(data.company,id);});if(stop)return;
      let app=apps[ticket%apps.length];if(app==='postiz'){if(Date.now()-lastPostiz<3500)app='n8n';else lastPostiz=Date.now();}await measuredCall(app,()=>application(app));
    }});st.endpoints=measured.summary();st.finishedAt=new Date().toISOString();await sample();save();
  }
  if(!stop){report.phase='estabilidade';save();console.log('Observando estabilidade por 60 segundos sem carga adicional.');for(let i=0;i<6&&!stop;i++){await delay(10000);await sample();}}
  if(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'compose.json'))).digest('hex')!==report.composeSha256){stop=true;report.stopReason='Configuracao alterada durante o ensaio';}
  report.ok=!stop&&report.stages.length===4&&report.stages.every(s=>s.endpoints?.every(e=>e.errors===0));
}catch(e){report.ok=false;report.failure=e.code||e.name||'preflight';console.log('Ensaio interrompido; motivo registrado sem dados privados.');process.exitCode=1;}
finally{
  if(monitor)clearInterval(monitor);while(monitoring)await delay(100);if(cookie)try{const r=await fetch('http://127.0.0.1:8100/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:'http://127.0.0.1:8100','Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});if(r.status!==200)throw Error();}catch{report.ok=false;report.sessionCleanup='Verificar encerramento da sessao de teste';}
  report.phase='complete';report.finishedAt=new Date().toISOString();report.interpretation='Resultado do perfil local observado; nao define limite comercial nem capacidade de clientes. Leituras cloud/auth/Postiz e saude n8n/WAHA, sem uploads, documentos ERP, execucoes de workflows ou mensagens.';save();fs.closeSync(fd);fs.unlinkSync(lock);console.log('Carga local: '+(report.ok?'perfil concluido sem falhas':'revisar')+' — '+dest);if(!report.ok)process.exitCode=1;
}
