import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {RUNTIME,writeJSON} from '../infra.mjs';
const archive=path.join(RUNTIME,'migrations','piloto','postiz-1793453564886'),dir=path.join(RUNTIME,'postiz-lab');
const original=JSON.parse(fs.readFileSync(path.join(archive,'compose.json')));
const names=['postiz-db','postiz-redis','temporal-db','temporal','postiz'];
const c={name:'vw-postiz-lab',services:Object.fromEntries(names.map(n=>[n,original.services[n]])),networks:{'postiz-db':{},'temporal-db':{},proxy:{external:true,name:'vw-piloto_proxy'}},volumes:{}};
for(const [n,s] of Object.entries(c.services)){for(const v of s.volumes??[])c.volumes[v.split(':')[0]]={};s.healthcheck&&(s.healthcheck.start_period='600s');}
c.services.postiz.networks={'postiz-db':{},proxy:{aliases:['postiz-lab']}};
c.services.postiz.mem_limit='2560m';
c.services.temporal.environment.SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES='true';
c.services.temporal.environment.BIND_ON_IP='0.0.0.0';
const url='https://postiz-lab.piloto.localhost:8443';
Object.assign(c.services.postiz.environment,{MAIN_URL:url,FRONTEND_URL:url,NEXT_PUBLIC_BACKEND_URL:url+'/api',DISABLE_REGISTRATION:'false'});
c.services.postiz.ports=['127.0.0.1:8500:5000'];
c.services.postiz.healthcheck={test:['CMD','node','-e',"require('http').get('http://127.0.0.1:3000/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"],interval:'15s',timeout:'10s',start_period:'600s',retries:20};
fs.mkdirSync(dir,{recursive:true});
function run(args,input){return new Promise((resolve,reject)=>{const p=spawn('docker',args,{windowsHide:true,stdio:[input?'pipe':'ignore','inherit','inherit']});const stream=input?pipeline(fs.createReadStream(input),p.stdin):null;p.on('error',reject);p.on('close',async code=>{try{if(stream)await stream;if(code)throw Error('Docker falhou: '+args[0]);resolve();}catch(e){reject(e);}});});}
if(!fs.existsSync(path.join(dir,'cloned.json'))){
  for(const volume of Object.keys(c.volumes)){
    const name='vw-postiz-lab_'+volume;
    await run(['volume','create',name]);
    await run(['run','--rm','--network','none','-i','-v',name+':/restore','alpine:3.22','tar','-xzf','-','-C','/restore'],path.join(archive,volume+'.tgz'));
  }
  writeJSON(path.join(dir,'cloned.json'),{at:new Date().toISOString(),archive});
}
writeJSON(path.join(dir,'compose.json'),c);
await run(['compose','--project-directory',dir,'-f',path.join(dir,'compose.json'),'up','-d']);
console.log('Laboratorio iniciado com volumes copiados. Mixpost e dados originais preservados.');
