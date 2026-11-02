import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ContainerEvents,DockerEventStream} from '../docker-events.mjs';
import {containerPhase} from '../monitoring.mjs';
import {RUNTIME,writeJSON} from '../infra.mjs';
const run=promisify(execFile),name='vw-monitor-check-'+randomUUID().slice(0,8),checks=[];
const tracker=new ContainerEvents(),watcher=new DockerEventStream({tracker});
const docker=args=>run('docker',args,{timeout:120000,maxBuffer:65536,windowsHide:true});
async function waitFor(predicate){const deadline=Date.now()+12000;while(!predicate()){if(Date.now()>deadline)throw Error('Evento esperado nao foi observado em 12 segundos.');await new Promise(resolve=>setTimeout(resolve,50));}}
async function check(label,fn){try{await fn();checks.push({name:label,ok:true});console.log(label+': OK');}catch(error){checks.push({name:label,ok:false,error:error.message});throw error;}}
try{
  await docker(['info','--format','{{.ID}}']);watcher.start();
  await check('Container temporario isolado e evento inicial observado',async()=>{
    await docker(['run','-d','--name',name,'--label','com.docker.compose.project=vw-monitor','--network','none','--memory','32m','--cpus','0.1','--cap-drop','ALL','--security-opt','no-new-privileges:true','alpine:3.22','sh','-c','trap "sleep 3; exit 0" TERM; while :; do sleep 1 & wait $!; done']);
    // Pause/unpause only this disposable container to verify the reader is subscribed.
    await docker(['pause',name]);await docker(['unpause',name]);
    await waitFor(()=>tracker.recent.some(event=>event.name===name&&event.action==='unpause'));
  });
  let stopped;
  await check('Evento SIGTERM mostra parando antes da parada',async()=>{
    stopped=docker(['stop','--timeout','10',name]);stopped.catch(()=>{});
    await waitFor(()=>tracker.stopping.has(name));
    if(containerPhase(tracker.decorate([{Names:name,Project:'vw-monitor',State:'running',Status:'Up'}])[0])!=='stopping')throw Error('Transicao stopping nao confirmada.');
  });
  await check('Parada confirmada e transicao temporaria removida',async()=>{
    await stopped;await waitFor(()=>tracker.recent.some(event=>event.name===name&&event.action==='stop'));
    const {stdout}=await docker(['inspect','--format','{{.State.Status}} {{.State.ExitCode}}',name]);
    if(stdout.trim()!=='exited 0'||tracker.stopping.has(name))throw Error('Parada limpa nao confirmada.');
  });
}catch(error){console.error('Teste de ciclo de vida falhou: '+error.message);process.exitCode=1;
}finally{
  try{await docker(['rm','-f',name]);}catch{}
  watcher.close();
  writeJSON(path.join(RUNTIME,'reports','docker-lifecycle-live.json'),{at:new Date().toISOString(),ok:checks.length===3&&checks.every(check=>check.ok),checks,scope:'Container descartavel sem rede, volumes ou privilegios; nao interrompe servicos das empresas.'});
}
