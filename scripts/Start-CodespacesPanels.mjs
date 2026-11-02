import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn,execFileSync,spawnSync} from 'node:child_process';
import {ROOT,RUNTIME,writeJSON} from '../infra.mjs';
import {codespacesIdentity} from '../codespaces.mjs';
import {assertHostStorage} from '../host-policy.mjs';
const remote=codespacesIdentity();
const tenants=path.join(RUNTIME,'tenants');
if(!fs.existsSync(tenants)||!fs.readdirSync(tenants).some(id=>fs.existsSync(path.join(tenants,id,'tenant.json')))){
  console.log('Instale a empresa de apresentacao antes de iniciar os paineis.');process.exit(0);
}
const dockerInfo=()=>JSON.parse(execFileSync('docker',['info','--format','{{json .}}'],{encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']}));
let engine;
try{engine=dockerInfo();}catch{
  if(spawnSync('pgrep',['-x','dockerd'],{stdio:'ignore'}).status!==0){
    console.log('Inicializando o Docker deste Codespace.');
    execFileSync('sudo',['/usr/local/share/docker-init.sh','true'],{stdio:'inherit',timeout:120000});
  }
  for(let i=0;i<10;i++){try{engine=dockerInfo();break;}catch{await new Promise(resolve=>setTimeout(resolve,500));}}
  if(!engine)throw Error('Docker nao respondeu. Nenhum segundo daemon foi iniciado enquanto outro processo estava ativo.');
}
const marker=JSON.parse(fs.readFileSync(path.join(RUNTIME,'codespaces-storage-confirmed.json')));
assertHostStorage({platform:process.platform,info:engine,codespaceName:remote.name,codespacesConfirmation:marker});
const probe=port=>new Promise(resolve=>{
  const q=http.get({hostname:'127.0.0.1',port,headers:{Host:new URL(remote.url(port)).host},timeout:1500},r=>{r.resume();resolve(port===8099?r.statusCode===401:r.statusCode===200);});
  q.on('timeout',()=>q.destroy());q.on('error',()=>resolve(false));
});
const before=await Promise.all([probe(8099),probe(8100)]);
if(before.every(Boolean)){console.log('Os dois paineis ja estao ativos.');process.exit(0);}
if(before.some(Boolean))throw Error('Apenas um painel respondeu. Verifique o processo existente antes de iniciar outro.');
fs.mkdirSync(RUNTIME,{recursive:true});
const log=fs.openSync(path.join(RUNTIME,'codespaces-panels.log'),'a',0o600);
const child=spawn(process.execPath,[path.join(ROOT,'scripts','Serve-Codespaces.mjs')],{cwd:ROOT,env:process.env,detached:true,stdio:['ignore',log,log]});
child.on('error',()=>{process.exitCode=1;});
child.unref();fs.closeSync(log);
writeJSON(path.join(RUNTIME,'codespaces-panels.pid.json'),{pid:child.pid,at:new Date().toISOString()});
let ready=false;
for(let i=0;i<30;i++){if((await Promise.all([probe(8099),probe(8100)])).every(Boolean)){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}
if(!ready)throw Error('Paineis nao iniciaram. Confira runtime/codespaces-panels.log.');
console.log('Painel da operacao e portal da empresa ativos, com acesso privado.');
