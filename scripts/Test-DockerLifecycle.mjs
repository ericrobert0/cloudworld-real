import path from 'node:path';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ContainerEvents,DockerEventStream} from '../docker-events.mjs';
import {containerPhase} from '../monitoring.mjs';
import {RUNTIME,writeJSON} from '../infra.mjs';
import {codespacesIdentity} from '../codespaces.mjs';
const run=promisify(execFile),token=randomUUID(),project='vw-monitor-test-'+token.slice(0,8),name=project+'-probe-1',checks=[];
const remote=process.env.CODESPACES==='true'?codespacesIdentity():null;
const panel=remote?async()=>{
  const password=fs.readFileSync(path.join(RUNTIME,'panel-password.txt'),'utf8').trim();
  const response=await fetch('http://127.0.0.1:8099/api/status',{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')},signal:AbortSignal.timeout(3000)});
  if(!response.ok)throw Error('Painel retornou HTTP '+response.status);return response.json();
}:null;
const tracker=new ContainerEvents(),watcher=new DockerEventStream({tracker});
const docker=args=>run('docker',args,{timeout:120000,maxBuffer:65536,windowsHide:true});
async function waitFor(predicate){const deadline=Date.now()+12000;while(!await predicate()){if(Date.now()>deadline)throw Error('Evento esperado nao foi observado em 12 segundos.');await new Promise(resolve=>setTimeout(resolve,100));}}
async function check(label,fn){try{await fn();checks.push({name:label,ok:true});console.log(label+': OK');}catch(error){checks.push({name:label,ok:false,error:error.message});throw error;}}
try{
  await docker(['info','--format','{{.ID}}']);watcher.start();
  await check('Container temporario isolado e evento inicial observado',async()=>{
    await docker(['run','-d','--name',name,'--label','com.docker.compose.project='+project,'--label','cloudworld.lifecycle-test='+token,'--network','none','--memory','32m','--cpus','0.1','--cap-drop','ALL','--security-opt','no-new-privileges:true','alpine:3.22','sh','-c','trap "sleep 6; exit 0" TERM; while :; do sleep 1 & wait $!; done']);
    // Pause/unpause only this disposable container to verify the reader is subscribed.
    await docker(['pause',name]);await docker(['unpause',name]);
    await waitFor(()=>tracker.recent.some(event=>event.name===name&&event.action==='unpause'));
    if(panel)await waitFor(async()=>(await panel()).engine.containers.some(row=>row.Names===name));
  });
  let stopped;
  await check('Evento SIGTERM mostra parando antes da parada',async()=>{
    stopped=docker(['stop','--timeout','10',name]);stopped.catch(()=>{});
    await waitFor(()=>tracker.stopping.has(name));
    if(containerPhase(tracker.decorate([{Names:name,Project:project,State:'running',Status:'Up'}])[0])!=='stopping')throw Error('Transicao stopping nao confirmada.');
    if(panel)await waitFor(async()=>(await panel()).engine.containers.some(row=>row.Names===name&&row.Phase==='stopping'));
  });
  await check('Parada confirmada e transicao temporaria removida',async()=>{
    await stopped;await waitFor(()=>tracker.recent.some(event=>event.name===name&&event.action==='stop'));
    const {stdout}=await docker(['inspect','--format','{{.State.Status}} {{.State.ExitCode}}',name]);
    if(stdout.trim()!=='exited 0'||tracker.stopping.has(name))throw Error('Parada limpa nao confirmada.');
  });
  if(panel)await check('API do operador registrou eventos sem misturar o projeto de teste com a empresa',async()=>{
    const snapshot=await panel();
    if(!snapshot.engine.events.recent.some(event=>event.name===name&&event.action==='kill'))throw Error('Historico do painel nao registrou encerramento.');
    const password=fs.readFileSync(path.join(RUNTIME,'panel-password.txt'),'utf8').trim();
    const response=await fetch('http://127.0.0.1:8099/api/v1/tenants/apresentacao/monitoring',{headers:{Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')},signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw Error('Consulta da empresa falhou.');const data=await response.json();
    if(data.events.some(event=>event.project===project)||data.containers.some(row=>row.name===name))throw Error('Projeto de teste misturado com a empresa.');
  });
}catch(error){console.error('Teste de ciclo de vida falhou: '+error.message);process.exitCode=1;
}finally{
  try{const owner=await docker(['inspect','--format','{{index .Config.Labels "cloudworld.lifecycle-test"}}',name]);if(owner.stdout.trim()===token)await docker(['rm','-f',name]);}catch{}
  watcher.close();
  writeJSON(path.join(RUNTIME,'reports','docker-lifecycle-live.json'),{at:new Date().toISOString(),ok:checks.length===(panel?4:3)&&checks.every(check=>check.ok),operatorPanelChecked:!!panel,checks,scope:'Container descartavel sem rede, volumes ou privilegios; nao interrompe servicos das empresas.'});
}
