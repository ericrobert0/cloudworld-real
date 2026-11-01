import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {ROOT,RUNTIME,tenantPath,secret,writeJSON} from '../infra.mjs';
import {addMixpost} from '../mixpost.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),file=path.join(dir,'compose.json');
if(!fs.existsSync(path.join(RUNTIME,'docker-storage-confirmed.json')))throw Error('Disco D: precisa estar confirmado.');
const c=JSON.parse(fs.readFileSync(file)),t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json'))),secrets=JSON.parse(fs.readFileSync(path.join(dir,'secrets.json')));
if(!c.services.postiz||c.services.mixpost)throw Error('Migracao ja aplicada ou cliente sem Postiz.');
const lock=path.join(dir,'.operation.lock'),fd=fs.openSync(lock,'wx');
const archive=path.join(RUNTIME,'migrations',id,'postiz-'+Date.now());fs.mkdirSync(archive,{recursive:true});
function run(args,output){return new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';let stream;if(output)stream=pipeline(p.stdout,fs.createWriteStream(output));else p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',async code=>{try{if(stream)await stream;if(code)throw Error(err.slice(-1500));resolve(out.trim());}catch(e){reject(e);}});});}
const dc=(...args)=>run(['compose','--project-directory',dir,'-f',file,...args]);
try{
  for(const name of ['compose.json','tenant.json','secrets.json','Caddyfile','images.lock.json','images.requested.json','service.json'])if(fs.existsSync(path.join(dir,name)))fs.copyFileSync(path.join(dir,name),path.join(archive,name));
  const old=['postiz','temporal','postiz-db','postiz-redis','temporal-db'];
  console.log('Preservando configuracao e volumes do Postiz em '+archive);
  await dc('stop','--timeout','30',...old);
  const oldVolumes=['postiz-db','postiz-redis','postiz-config','postiz-uploads','temporal-db'];
  for(const name of oldVolumes){await run(['run','--rm','--network','none','-v',`${t.project}_${name}:/source:ro`,'alpine:3.22','tar','-C','/source','-czf','-','.'],path.join(archive,name+'.tgz'));}
  await dc('rm','-f',...old);
  for(const name of old)delete c.services[name];
  for(const name of oldVolumes)delete c.volumes[name];
  for(const name of ['postiz-db','temporal-db'])delete c.networks[name];
  for(const key of ['mixpost','mixpostRoot','mixpostKey','mixpostAdmin'])secrets[key]??=secret();
  const url=new URL(t.urls.postiz);url.hostname=url.hostname.replace(/^postiz\./,'mixpost.');
  delete t.urls.postiz;t.urls.mixpost=url.origin;t.serviceVersion='2026-10-31.2';
  fs.copyFileSync(path.join(ROOT,'upstream','mixpost-start.sh'),path.join(dir,'mixpost-start.sh'));
  addMixpost(c,{id,url:url.origin,secrets});
  if(t.sharedIngress)c.services.mixpost.networks={'mixpost-data':{},proxy:{aliases:[`${id}-mixpost`]}};
  for(const name of ['mixpost-db','mixpost-redis','mixpost']){const image=c.services[name].image;await run(['pull',image]);const info=JSON.parse(await run(['image','inspect',image]))[0];c.services[name].image=info.RepoDigests[0];}
  const requested=JSON.parse(fs.readFileSync(path.join(dir,'images.requested.json')));for(const name of old)delete requested[name];Object.assign(requested,{'mixpost-db':'mariadb:11.8','mixpost-redis':'redis:7.2-alpine',mixpost:'inovector/mixpost:v2.6.0'});
  writeJSON(file,c);writeJSON(path.join(dir,'tenant.json'),t);writeJSON(path.join(dir,'secrets.json'),secrets);writeJSON(path.join(dir,'images.requested.json'),requested);writeJSON(path.join(dir,'images.lock.json'),Object.fromEntries(Object.entries(c.services).map(([n,s])=>[n,s.image])));
  const oldHost=`postiz.${t.domain}`,newHost=`mixpost.${t.domain}`;
  const caddy=fs.readFileSync(path.join(dir,'Caddyfile'),'utf8').replaceAll(oldHost,newHost).replaceAll('reverse_proxy postiz:5000','reverse_proxy mixpost:80');fs.writeFileSync(path.join(dir,'Caddyfile'),caddy);
  writeJSON(path.join(archive,'migration.json'),{client:id,newUrl:url.origin,at:new Date().toISOString(),legacyVolumesPreserved:oldVolumes.map(v=>`${t.project}_${v}`),status:'configured'});
  console.log('Iniciando Mixpost e banco exclusivo.');await dc('up','-d','--wait','--wait-timeout','1200','mixpost');
  const {configureMixpostAdmin}=await import('./mixpost-admin.mjs');await configureMixpostAdmin(id);
  await dc('exec','-T','ingress','caddy','reload','--config','/etc/caddy/Caddyfile');
  console.log('Mixpost iniciado. Arquivos anteriores preservados em '+archive);
}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
