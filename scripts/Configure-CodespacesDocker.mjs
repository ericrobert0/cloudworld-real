// Only for the newly provisioned, empty development engine. Never migrates data.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {RUNTIME,writeJSON} from '../infra.mjs';
import {codespacesIdentity} from '../codespaces.mjs';
codespacesIdentity();
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:120000});
const info=JSON.parse(run('docker',['info','--format','{{json .}}']));
if(info.Driver==='overlay2'){console.log('Docker overlay2 ja configurado.');process.exit(0);}
for(const args of [['ps','-aq'],['image','ls','-q'],['volume','ls','-q']])if(run('docker',args).trim())throw Error('Engine possui dados. Nao trocar armazenamento automaticamente.');
const daemon='/etc/docker/daemon.json',config=fs.existsSync(daemon)?JSON.parse(fs.readFileSync(daemon)):{};
config.features={...config.features,'containerd-snapshotter':false};config['storage-driver']='overlay2';
const prepared=path.join(RUNTIME,'codespaces-daemon.private.json');writeJSON(prepared,config);
run('sudo',['install','-D','-m','0600',prepared,daemon]);
run('sudo',['pkill','-TERM','-x','dockerd']);
// Poll the old process before using the official Dev Containers initializer.
await new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{try{execFileSync('pgrep',['-x','dockerd'],{stdio:'ignore'});if(++n>100){clearInterval(timer);reject(Error('Docker nao encerrou; nao iniciar um segundo daemon.'));}}catch{clearInterval(timer);resolve();}},200);});
run('sudo',['/usr/local/share/docker-init.sh','true']);
const after=JSON.parse(run('docker',['info','--format','{{json .}}']));
if(after.Driver!=='overlay2')throw Error('Driver nao confirmado. Nao baixar aplicacoes.');
console.log('Docker overlay2 confirmado; engine vazio, sem migracao ou exclusao de volumes.');
