// Bounded, read-only sampling: never starts Docker or changes host/idle policies.
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {RUNTIME,writeJSON} from '../infra.mjs';
const run=promisify(execFile);
const seconds=Number(process.argv[2]||900);
if(!Number.isInteger(seconds)||seconds<30||seconds>1800)throw Error('Duracao deve ser entre 30 e 1800 segundos.');
const report={startedAt:new Date().toISOString(),requestedSeconds:seconds,ok:false,completed:false,samples:[],scope:'Consulta Docker info; nao reinicia servicos, altera suspensao ou gera atividade artificial em aplicacoes.'};
const dest=path.join(RUNTIME,'reports','docker-host-stability.json');
fs.mkdirSync(path.dirname(dest),{recursive:true});
const deadline=Date.now()+seconds*1000;
let identity,processIdentity;
async function sample(){
  const entry={at:new Date().toISOString(),up:false};
  try{
    const {stdout}=await run('docker',['info','--format','{{json .}}'],{timeout:8000,maxBuffer:1024*1024,windowsHide:true});
    const data=JSON.parse(stdout);identity??=data.ID;
    entry.up=!!data.ID&&data.ID===identity;
    if(process.platform==='linux'){
      const pids=(await run('pgrep',['-x','dockerd'],{timeout:3000,maxBuffer:4096})).stdout.trim().split(/\s+/);
      if(pids.length!==1||!/^\d+$/.test(pids[0]))throw Error('Daemon unico nao confirmado.');
      const stat=fs.readFileSync('/proc/'+pids[0]+'/stat','utf8');
      const current=pids[0]+':'+stat.slice(stat.lastIndexOf(')')+2).split(/\s+/)[19];
      processIdentity??=current;entry.pid=Number(pids[0]);
      if(current!==processIdentity){entry.up=false;entry.error='Processo Docker reiniciado durante a observacao.';}
    }
    entry.driver=data.Driver;entry.containers=data.Containers;entry.running=data.ContainersRunning;
    if(!entry.up)entry.error??='Identidade do Docker alterada ou ausente.';
  }catch{entry.error='Docker nao respondeu dentro do limite.';}
  report.samples.push(entry);writeJSON(dest,report);
  console.log(entry.at+' Docker '+(entry.up?'OK':'INDISPONIVEL'));
  return entry.up;
}
while(await sample()){
  if(Date.now()>=deadline){report.completed=true;report.ok=true;break;}
  await new Promise(resolve=>setTimeout(resolve,Math.min(15000,deadline-Date.now())));
}
report.finishedAt=new Date().toISOString();writeJSON(dest,report);
console.log('Resultado: '+(report.ok?'janela observada sem falhas':'falha detectada')+'. Relatorio: '+dest);
if(!report.ok)process.exitCode=1;
