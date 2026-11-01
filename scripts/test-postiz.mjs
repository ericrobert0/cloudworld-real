import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import assert from 'node:assert/strict';
import {RUNTIME,tenantPath,secret,writeJSON} from '../infra.mjs';
const lab=process.argv[2]==='lab',dir=lab?path.join(RUNTIME,'postiz-lab'):tenantPath(process.argv[2]||'piloto');
const url=new URL(lab?'https://postiz-lab.piloto.localhost:8443':JSON.parse(fs.readFileSync(path.join(dir,'tenant.json'))).urls.postiz);
if(!url.hostname.endsWith('.localhost'))throw Error('Teste preparado para o piloto local.');
const caFile=fs.existsSync(path.join(dir,'local-ca.crt'))?path.join(dir,'local-ca.crt'):path.join(RUNTIME,'local-ca.crt');
const credentialsFile=path.join(dir,'postiz-admin.private.json');
if(!fs.existsSync(credentialsFile)){const previous=path.join(RUNTIME,'postiz-lab','postiz-admin.private.json');writeJSON(credentialsFile,!lab&&fs.existsSync(previous)?JSON.parse(fs.readFileSync(previous)):{email:'admin@piloto.localhost',password:secret(),url:url.origin});}
const credentials=JSON.parse(fs.readFileSync(credentialsFile)),cookies=new Map(),checks=[];
if(credentials.url!==url.origin){credentials.url=url.origin;writeJSON(credentialsFile,credentials);}
function request(method,route,data,html=false){return new Promise((resolve,reject)=>{const body=data?JSON.stringify(data):'';const req=https.request({hostname:'127.0.0.1',port:url.port||443,servername:url.hostname,ca:fs.readFileSync(caFile),path:route,method,headers:{Host:url.host,Origin:url.origin,Referer:url.origin+'/',Accept:html?'text/html':'application/json',Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),...(data?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}:{})}},res=>{for(const raw of res.headers['set-cookie']??[]){const first=raw.split(';')[0],i=first.indexOf('=');if(!first.slice(i+1)||/max-age=0/i.test(raw))cookies.delete(first.slice(0,i));else cookies.set(first.slice(0,i),first.slice(i+1));}let body='';res.on('data',d=>body+=d);res.on('end',()=>resolve({status:res.statusCode,body,headers:res.headers}));});req.on('error',reject);req.setTimeout(45000,()=>req.destroy(Error('Timeout')));req.end(body);});}
const check=async(name,fn)=>{try{await fn();checks.push({name,ok:true});}catch(e){checks.push({name,ok:false,error:e.message});throw e;}};
try{
 await check('Backend responde sem erro',async()=>{const r=await request('GET','/api/auth/can-register');assert.equal(r.status,200);assert.equal(typeof JSON.parse(r.body).register,'boolean');});
 await check('Dados privados bloqueados sem login',async()=>{const r=await request('GET','/api/user/self');assert.equal(r.status,401);});
 await check('Tela real de login responde',async()=>{const r=await request('GET','/auth/login',null,true);assert.equal(r.status,200);assert.ok(!r.body.includes('fetch failed'));});
 if(process.argv.includes('--register')){let login=await request('POST','/api/auth/login',{provider:'LOCAL',email:credentials.email,password:credentials.password});if(login.status!==200){await check('Cadastro local sem envio de email',async()=>{const r=await request('POST','/api/auth/register',{provider:'LOCAL',email:credentials.email,password:credentials.password,company:'CloudWorld Piloto'});assert.equal(r.status,200,'Cadastro recusado: '+r.body.slice(0,200));assert.ok(JSON.parse(r.body).register);});}}
 cookies.clear();
 await check('Senha incorreta recusada',async()=>{const r=await request('POST','/api/auth/login',{provider:'LOCAL',email:credentials.email,password:'senha-incorreta-de-teste'});assert.ok([400,401].includes(r.status));assert.ok(!cookies.has('auth'));});
 await check('Login com credencial privada',async()=>{const r=await request('POST','/api/auth/login',{provider:'LOCAL',email:credentials.email,password:credentials.password});assert.equal(r.status,200);assert.ok(JSON.parse(r.body).login);assert.ok(cookies.has('auth'));});
 await check('Perfil autenticado acessivel',async()=>{const r=await request('GET','/api/user/self');assert.equal(r.status,200);assert.ok(r.body.includes(credentials.email));});
 await check('Integracoes acessiveis com Instagram e TikTok',async()=>{const r=await request('GET','/api/integrations');assert.equal(r.status,200);assert.match(r.body,/instagram/i);assert.match(r.body,/tiktok/i);});
 await check('Interface autenticada acessivel',async()=>{let r=await request('GET','/',null,true);for(let i=0;i<5&&[301,302,303,307,308].includes(r.status);i++){const next=new URL(r.headers.location,url);assert.equal(next.origin,url.origin,'Redirecionamento fora do ambiente');assert.ok(!next.pathname.startsWith('/auth'),'Sessao nao aceita pela interface');r=await request('GET',next.pathname+next.search,null,true);}assert.equal(r.status,200);assert.ok(!r.body.includes('fetch failed'));});
}finally{writeJSON(path.join(dir,'postiz-test.json'),{at:new Date().toISOString(),url:url.origin,checks,scope:'Backend, login e areas autenticadas. Sem conectar redes sociais ou publicar conteudo.'});console.log(JSON.stringify(checks,null,2));}
