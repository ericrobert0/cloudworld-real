import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {ROOT,RUNTIME} from '../infra.mjs';
import {tenants} from '../service.mjs';
import {latestBackup} from '../operations.mjs';
import {atomicJSON} from '../integration.mjs';
import {loadBackupKey,exportBackup,verifyBackup,verifyExport} from '../backup-store.mjs';
const policyFile=path.join(RUNTIME,'backup-policy.private.json');
const policy=fs.existsSync(policyFile)?JSON.parse(fs.readFileSync(policyFile,'utf8').replace(/^\uFEFF/,'')):{};
if(!policy.enabled&&!process.argv.includes('--now'))throw Error('Rotina desativada');
fs.mkdirSync(RUNTIME,{recursive:true});let lock;
try{lock=fs.openSync(path.join(RUNTIME,'.backup-scheduler.lock'),'wx');}catch{throw Error('Outra rotina de backup está ativa');}
const requested=process.argv.find((s,i)=>i>1&&!s.startsWith('--'));
function run(id){return new Promise((resolve,reject)=>{const file=path.join(RUNTIME,'backup-jobs',id+'.private.log'),fd=fs.openSync(file,'a',0o600);let closed=false;const close=()=>{if(!closed){closed=true;fs.closeSync(fd);}};const p=spawn(process.execPath,[path.join(ROOT,'manage.mjs'),'backup',id],{windowsHide:true,stdio:['ignore',fd,fd]});p.on('error',e=>{close();reject(e);});p.on('close',code=>{close();code===0?resolve():reject(Error('Falha no backup; consulte o registro privado da rotina'));});});}
try{
  const selected=tenants().filter(t=>!requested||t.id===requested);if(!selected.length)throw Error('Nenhuma empresa encontrada');
  for(const t of selected){
    const state={at:new Date().toISOString(),state:'running'};atomicJSON(path.join(RUNTIME,'backup-jobs',t.id+'.json'),state);
    try{
      const previous=latestBackup(t.id);
      if(process.argv.includes('--now')||!previous||Date.now()-Date.parse(previous.manifest.createdAt)>20*3600000)await run(t.id);
      const latest=latestBackup(t.id);if(!latest)throw Error('Backup completo não encontrado');await verifyBackup(latest.dir);
      state.state='ok';state.backupAt=latest.manifest.createdAt;
      if(policy.externalDirectory){
        const key=loadBackupKey(path.join(RUNTIME,'backup-key.private.txt')),dest=path.join(policy.externalDirectory,t.id,path.basename(latest.dir));
        if(!fs.existsSync(path.join(dest,'index.json')))state.export=await exportBackup(latest.dir,dest,key);
        else state.export=await verifyExport(dest,key);
        state.export.targetId=crypto.createHash('sha256').update(path.resolve(policy.externalDirectory)).digest('hex');
      }else state.external='pending-destination';
    }catch(e){state.state='error';state.error=e.message;process.exitCode=1;}
    state.finishedAt=new Date().toISOString();atomicJSON(path.join(RUNTIME,'backup-jobs',t.id+'.json'),state);console.log(t.id+': '+state.state+(state.external?' · cópia externa pendente':''));
  }
}finally{fs.closeSync(lock);fs.unlinkSync(path.join(RUNTIME,'.backup-scheduler.lock'));}
