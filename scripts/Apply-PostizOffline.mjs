import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {RUNTIME,tenantPath} from '../infra.mjs';
import {atomicJSON,IntegrationHub} from '../integration.mjs';
import {postizOfflineStartup} from '../postiz.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),file=path.join(dir,'compose.json'),t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
if(!t.local)throw Error('Aplicacao automatica restrita ao piloto local');
const lock=path.join(dir,'.operation.lock'),fd=fs.openSync(lock,'wx'),backup=path.join(RUNTIME,'deployments','postiz-offline-'+Date.now());
const result={at:new Date().toISOString(),tenant:id,sourceBackup:backup,ok:false};
try{
  fs.mkdirSync(backup,{recursive:true});
  const c=JSON.parse(fs.readFileSync(file));if(!c.services.postiz.image.includes('@sha256:'))throw Error('Imagem do Postiz nao fixada');fs.copyFileSync(file,path.join(backup,'compose.json'));
  c.services.postiz.command=postizOfflineStartup;atomicJSON(file,c);
  console.log('Aplicando inicializacao local do Postiz; dados e imagem preservados.');
  await new Promise((resolve,reject)=>{const log=fs.openSync(path.join(backup,'startup.private.log'),'a',0o600),p=spawn('docker',['compose','--project-directory',dir,'-f',file,'up','-d','--no-deps','--wait','--wait-timeout','600','postiz'],{windowsHide:true,timeout:720000,stdio:['ignore',log,log]});p.on('error',reject);p.on('close',code=>{fs.closeSync(log);code===0?resolve():reject(Error('Postiz precisa de revisao; diagnostico privado preservado'));});});
  await new IntegrationHub().invoke(id,'postiz','check');result.ok=true;console.log('Postiz iniciou e autenticou pela API com o comando corrigido.');
}catch(e){result.error=e.message;process.exitCode=1;console.log(e.message);}
finally{result.finishedAt=new Date().toISOString();atomicJSON(path.join(RUNTIME,'reports','postiz-offline-start.json'),result);fs.closeSync(fd);fs.unlinkSync(lock);}
