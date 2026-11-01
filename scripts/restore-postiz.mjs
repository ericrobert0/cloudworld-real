import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {RUNTIME,tenantPath,writeJSON} from '../infra.mjs';
import {addPostiz} from '../postiz.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),file=path.join(dir,'compose.json');
const c=JSON.parse(fs.readFileSync(file)),t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json'))),s=JSON.parse(fs.readFileSync(path.join(dir,'secrets.json')));
if(c.services.postiz)throw Error('Postiz ja esta configurado; nao sobrescrevo.');
if(!s.postiz||!s.temporal)throw Error('Credenciais antigas nao encontradas.');
const lock=path.join(dir,'.operation.lock'),fd=fs.openSync(lock,'wx');
function run(args,capture=false){return new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,stdio:['ignore',capture?'pipe':'inherit','pipe']});let out='',err='';if(capture)p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>{err+=d;if(!capture)process.stderr.write(d);});p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(Error(err.slice(-2000))));});}
try{
 const archive=path.join(RUNTIME,'migrations',id,'before-postiz-fix-'+Date.now());fs.mkdirSync(archive,{recursive:true});
 for(const name of ['compose.json','tenant.json','secrets.json','Caddyfile','images.lock.json','images.requested.json','service.json','mixpost-start.sh','mixpost-admin.private.json'])if(fs.existsSync(path.join(dir,name)))fs.copyFileSync(path.join(dir,name),path.join(archive,name));
 const url=`https://postiz.${t.domain}${t.port===443||t.sharedIngress?'':':'+t.port}`;
 addPostiz(c,{id,url,secrets:s});
 const requested=JSON.parse(fs.readFileSync(path.join(dir,'images.requested.json')));
 for(const name of ['postiz-db','postiz-redis','temporal-db','temporal','temporal-init','postiz']){const ref=c.services[name].image;requested[name]=ref;const info=JSON.parse(await run(['image','inspect',ref],true))[0];c.services[name].image=info.RepoDigests[0];}
 t.urls.postiz=url;t.serviceVersion='2026-10-31.3';writeJSON(file,c);writeJSON(path.join(dir,'tenant.json'),t);writeJSON(path.join(dir,'images.requested.json'),requested);writeJSON(path.join(dir,'images.lock.json'),Object.fromEntries(Object.entries(c.services).map(([n,s])=>[n,s.image])));
 fs.appendFileSync(path.join(dir,'Caddyfile'),`\npostiz.${t.domain} {\n ${t.local?'tls internal\n ':''}reverse_proxy postiz:5000\n}\n`);
 await run(['compose','--project-directory',dir,'-f',file,'up','-d','--wait','--wait-timeout','1200','postiz']);
 await run(['exec',`${t.project}-ingress-1`,'caddy','reload','--config','/etc/caddy/Caddyfile']);
 console.log('Postiz corrigido iniciado; Mixpost continua ativo ate a validacao final.');
}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
