import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {tenantPath,RUNTIME} from '../infra.mjs';
import {atomicJSON} from '../integration.mjs';
const id=process.argv[2]||'piloto',c=JSON.parse(fs.readFileSync(path.join(tenantPath(id),'portal-initial.private.json'))),origin=c.url.replace(/\/$/,''),checks=[];
if(origin!=='http://127.0.0.1:8100')throw Error('Teste restrito ao portal piloto local.');
let cookie;
async function check(name,fn){try{await fn();checks.push({name,ok:true});console.log(name+': OK');}catch(e){checks.push({name,ok:false,error:e.message});console.log(name+': FALHOU');}}
await check('Portal publico responde sem abrir dados do cliente',async()=>{const r=await fetch(origin);assert.equal(r.status,200);assert.ok((await r.text()).includes('CloudWorld'));assert.equal((await fetch(origin+'/api/me')).status,401);});
await check('Login exige origem correta',async()=>{assert.equal((await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://invalid.example'},body:'{}'})).status,403);});
await check('Login do cliente funciona com sessao protegida',async()=>{const r=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({tenant:id,username:c.username,password:c.password})});assert.equal(r.status,200);const header=r.headers.get('set-cookie');assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);cookie=header.split(';')[0];});
await check('Cliente ve somente sua empresa e quatro ferramentas comerciais',async()=>{assert.ok(cookie);const r=await fetch(origin+'/api/me',{headers:{Cookie:cookie}});assert.equal(r.status,200);const data=await r.json();assert.equal(data.company,id);assert.deepEqual(data.apps.map(a=>a.id).sort(),['chat','cloud','erp','postiz']);assert.ok(!JSON.stringify(data).includes('initialPassword'));});
await check('Portal nao oferece APIs de administracao',async()=>{for(const resource of ['/api/status','/api/action','/api/v1/tenants/'+id+'/keys'])assert.equal((await fetch(origin+resource,{headers:{Cookie:cookie}})).status,404);});
await check('Logout revoga a sessao no servidor',async()=>{assert.equal((await fetch(origin+'/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:origin}})).status,200);assert.equal((await fetch(origin+'/api/me',{headers:{Cookie:cookie}})).status,401);});
atomicJSON(path.join(RUNTIME,'reports','portal-live-test.json'),{at:new Date().toISOString(),checks,scope:'Portal local com conta inicial piloto; nenhuma senha registrada no relatorio'});if(checks.some(c=>!c.ok))process.exitCode=1;
