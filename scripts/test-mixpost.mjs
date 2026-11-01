import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {RUNTIME,tenantPath,writeJSON} from '../infra.mjs';
const id=process.argv[2]||'piloto',dir=tenantPath(id),t=JSON.parse(fs.readFileSync(path.join(dir,'tenant.json'))),credentials=JSON.parse(fs.readFileSync(path.join(dir,'mixpost-admin.private.json'))),url=new URL(t.urls.mixpost);
if(!t.local)throw Error('Este teste de login foi preparado somente para o piloto local.');
const cookies=new Map(),checks=[];
function request(method,route,body){return new Promise((resolve,reject)=>{
  const payload=body?new URLSearchParams(body).toString():'';
  const req=https.request({hostname:'127.0.0.1',port:url.port||443,servername:url.hostname,rejectUnauthorized:false,method,path:route,headers:{Host:url.host,Accept:'text/html',Origin:url.origin,Referer:url.origin+'/mixpost/login',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(body?{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(payload)}:{}),...(cookies.has('XSRF-TOKEN')?{'X-XSRF-TOKEN':decodeURIComponent(cookies.get('XSRF-TOKEN'))}:{})}},res=>{for(const value of res.headers['set-cookie']??[]){const cookie=value.split(';')[0],equal=cookie.indexOf('=');cookies.set(cookie.slice(0,equal),cookie.slice(equal+1));}let html='';res.on('data',d=>html+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,html}));});req.on('error',reject);req.setTimeout(30000,()=>req.destroy(Error('Timeout')));req.end(payload);
});}
const check=async(name,fn)=>{try{await fn();checks.push({name,ok:true});}catch(e){checks.push({name,ok:false,error:e.message});throw e;}};
try{
  let login;
  await check('Pagina real de login',async()=>{login=await request('GET','/mixpost/login');assert.equal(login.status,200);assert.match(login.html,/login/i);});
  const token=()=>login.html.match(/name="csrf-token" content="([^"]+)"/)?.[1]||'';
  await check('Senha padrao recusada',async()=>{await request('POST','/mixpost/login',{email:credentials.email,password:'changeme',_token:token()});const r=await request('GET','/mixpost');assert.equal(r.status,302);assert.match(r.headers.location,/login/);});
  await check('Login administrativo com senha privada',async()=>{login=await request('GET','/mixpost/login');const r=await request('POST','/mixpost/login',{email:credentials.email,password:credentials.password,_token:token()});assert.ok([302,303].includes(r.status));const dashboard=await request('GET','/mixpost');assert.equal(dashboard.status,200);assert.match(dashboard.html,/Dashboard/);assert.ok(dashboard.html.includes(credentials.email));});
  for(const route of ['posts','calendar','media','accounts'])await check('Area autenticada: '+route,async()=>{const r=await request('GET','/mixpost/'+route);assert.equal(r.status,200);});
}finally{writeJSON(path.join(RUNTIME,'tenants',id,'mixpost-test.json'),{at:new Date().toISOString(),checks,scope:'Login, senha padrao recusada e paginas autenticadas. Publicacao em redes sociais depende de contas/API externas.'});console.log(JSON.stringify(checks,null,2));}
