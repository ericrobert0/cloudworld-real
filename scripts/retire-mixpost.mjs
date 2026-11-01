import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {RUNTIME,tenantPath,writeJSON} from '../infra.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),file=path.join(dir,'compose.json');
const c=JSON.parse(fs.readFileSync(file)),t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json')));
if(!c.services.mixpost||!c.services.postiz)throw Error('Esperado piloto com Postiz e Mixpost.');
const lock=path.join(dir,'.operation.lock'),fd=fs.openSync(lock,'wx');
const archive=path.join(RUNTIME,'migrations',id,'mixpost-retired-'+Date.now());
const names=['mixpost','mixpost-db','mixpost-redis'];
function run(args){return new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,stdio:['ignore','inherit','inherit']});p.on('error',reject);p.on('close',n=>n===0?resolve():reject(Error('Comando Docker falhou.')));});}
const dc=(...args)=>run(['compose','--project-directory',dir,'-f',file,...args]);
try{
 fs.mkdirSync(archive,{recursive:true});
 for(const f of ['compose.json','tenant.json','Caddyfile','secrets.json','images.requested.json','images.lock.json','service.json','mixpost-start.sh','mixpost-admin.private.json'])if(fs.existsSync(path.join(dir,f)))fs.copyFileSync(path.join(dir,f),path.join(archive,f));
 await dc('stop','--timeout','30',...names);
 // Containers can be recreated from the saved Compose. No volume/image is removed.
 await dc('rm','-f',...names);
 for(const name of names)delete c.services[name];
 const preserved=['mixpost-db','mixpost-redis','mixpost-storage','mixpost-logs'];
 for(const name of preserved)delete c.volumes[name];
 delete c.networks['mixpost-data'];delete t.urls.mixpost;
 writeJSON(file,c);writeJSON(path.join(dir,'tenant.json'),t);
 for(const f of ['images.requested.json','images.lock.json']){const data=JSON.parse(fs.readFileSync(path.join(dir,f)));for(const name of names)delete data[name];writeJSON(path.join(dir,f),data);}
 const profileFile=path.join(dir,'service.json'),profile=JSON.parse(fs.readFileSync(profileFile));profile.applications=profile.applications.filter(n=>n!=='mixpost');writeJSON(profileFile,profile);
 const caddy=path.join(dir,'Caddyfile'),host='mixpost.'+t.domain;
 const text=fs.readFileSync(caddy,'utf8');
 const start=text.indexOf(host+' {');
 if(start<0)throw Error('Rota Mixpost nao encontrada.');
 const end=text.indexOf('}',start);if(end<0)throw Error('Bloco Caddy invalido.');
 fs.writeFileSync(caddy,text.slice(0,start)+'\n\n'+text.slice(end+1));
 await run(['exec',t.project+'-ingress-1','caddy','validate','--config','/etc/caddy/Caddyfile']);
 await run(['exec',t.project+'-ingress-1','caddy','reload','--config','/etc/caddy/Caddyfile']);
 writeJSON(path.join(archive,'retirement.json'),{at:new Date().toISOString(),client:id,volumesPreserved:preserved.map(n=>t.project+'_'+n),status:'retired-data-preserved'});
 console.log('Mixpost retirado. Configuracoes e dados preservados: '+archive);
}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
