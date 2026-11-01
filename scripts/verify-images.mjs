import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT,tenantPath,writeJSON} from '../infra.mjs';
const client=process.argv[2]||'piloto';
const c=JSON.parse(fs.readFileSync(path.join(tenantPath(client),'compose.json')));
const images=[...new Set(Object.values(c.services).map(s=>s.image))];
const results=[];
const verify=image=>new Promise(resolve=>{
  const p=spawn('docker',['manifest','inspect','--verbose',image],{windowsHide:true});let out='',err='';
  const timer=setTimeout(()=>p.kill(),90000);p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
  p.on('error',e=>{clearTimeout(timer);resolve({image,ok:false,error:e.message});});
  p.on('close',code=>{clearTimeout(timer);let result={image,ok:code===0};try{const m=JSON.parse(out);const list=Array.isArray(m)?m:[m];result.linuxAmd64=list.some(x=>x.Descriptor?.platform?.os==='linux'&&x.Descriptor?.platform?.architecture==='amd64');if(!result.linuxAmd64)result.ok=false;}catch{result.ok=false;}if(!result.ok)result.error=err.slice(-1200)||'Manifesto ou plataforma indisponivel';resolve(result);});
});
for(let i=0;i<images.length;i+=3){const batch=await Promise.all(images.slice(i,i+3).map(verify));results.push(...batch);for(const r of batch)console.log(`${r.ok?'OK':'FALHOU'} ${r.image}`);}
writeJSON(path.join(ROOT,'reports','image-manifests.json'),{at:new Date().toISOString(),results});
if(results.some(r=>!r.ok))process.exitCode=1;
