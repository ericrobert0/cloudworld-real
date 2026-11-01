import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
process.env.VW_RUNTIME_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'cw-portal-'));
const {createTenant}=await import('../infra.mjs');
const {PortalAccounts,createPortal}=await import('../portal.mjs');
createTenant('alpha');createTenant('bravo','bravo.localhost',8453);
test('portal isola empresas, guarda hash, bloqueia n8n e revoga sessoes ao suspender ou redefinir conta',async()=>{
  const a=new PortalAccounts(),u=await a.save('alpha',{username:'responsavel',name:'Responsavel',apps:['cloud']}),b=await a.save('bravo',{username:'responsavel',name:'Outro',apps:['chat']});
  assert.ok(u.initialPassword);assert.ok(!JSON.stringify(a.list('alpha')).includes(u.initialPassword));assert.ok(!fs.readFileSync(a.file('alpha','portal-users.private.json'),'utf8').includes(u.initialPassword));
  await assert.rejects(()=>a.save('alpha',{username:'blocked',name:'Blocked',apps:['n8n']}));
  await assert.rejects(()=>a.login('bravo','responsavel',u.initialPassword),{status:401});
  const token=await a.login('alpha','responsavel',u.initialPassword);assert.equal(a.authenticate(token).tenant,'alpha');
  assert.ok(!fs.readFileSync(a.file('alpha','portal-sessions.private.json'),'utf8').includes(token));
  await a.save('alpha',{id:u.id,enabled:false});assert.throws(()=>a.authenticate(token),{status:401});
  const reset=await a.save('alpha',{id:u.id,enabled:true,resetPassword:true});await assert.rejects(()=>a.login('alpha','responsavel',u.initialPassword),{status:401});
  assert.ok(a.authenticate(await a.login('alpha','responsavel',reset.initialPassword)));
  for(let i=0;i<10;i++)await a.login('alpha','missing','wrong','limit-test').catch(()=>{});
  await assert.rejects(()=>a.login('alpha','missing','wrong','limit-test'),{status:429});
});
test('HTTP do portal exige sessao e origem, serve apenas apps permitidas e nao oferece administracao',async()=>{
  const accounts=new PortalAccounts(),u=await accounts.save('alpha',{username:'cliente-http',name:'Cliente HTTP',apps:['cloud']}),origin='http://127.0.0.1:18201',portal=createPortal({accounts,origin});
  await new Promise(r=>portal.server.listen(18201,'127.0.0.1',r));
  try{
    assert.equal((await fetch(origin+'/api/me')).status,401);
    const body=JSON.stringify({tenant:'alpha',username:u.username,password:u.initialPassword});
    assert.equal((await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://evil.invalid'},body})).status,403);
    const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body});assert.equal(login.status,200);const setCookie=login.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);const cookie=setCookie.split(';')[0];
    const me=await (await fetch(origin+'/api/me',{headers:{Cookie:cookie}})).json();assert.equal(me.company,'alpha');assert.deepEqual(me.apps.map(a=>a.id),['cloud']);assert.ok(!JSON.stringify(me).includes('bravo'));
    for(const url of ['/api/status','/api/action','/api/v1/tenants/bravo/events','/runtime/portal-users.private.json'])assert.equal((await fetch(origin+url,{headers:{Cookie:cookie}})).status,404);
    const css=await fetch(origin+'/portal.css');assert.equal(css.status,200);assert.match(css.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    assert.equal((await fetch(origin+'/api/logout',{method:'POST',headers:{Cookie:cookie,Origin:origin}})).status,200);assert.equal((await fetch(origin+'/api/me',{headers:{Cookie:cookie}})).status,401);
  }finally{await new Promise(r=>portal.server.close(r));}
});
test('publicacao externa exige HTTPS e gera cookie Secure sem confiar em X-Forwarded-Proto',async()=>{
  assert.throws(()=>createPortal({origin:'http://public.example.com'}),/HTTPS/);
  assert.throws(()=>createPortal({origin:'https://public.example.com/path'}),/origem/);
  const accounts=new PortalAccounts(),u=await accounts.save('alpha',{username:'secure-test',name:'Secure'}),portal=createPortal({accounts,origin:'https://clientes.example.com'});
  await new Promise(r=>portal.server.listen(18202,'127.0.0.1',r));
  try{
    const cookie=await new Promise((resolve,reject)=>{const body=JSON.stringify({tenant:'alpha',username:u.username,password:u.initialPassword});const req=http.request({hostname:'127.0.0.1',port:18202,path:'/api/login',method:'POST',headers:{Host:'clientes.example.com',Origin:'https://clientes.example.com','Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{res.resume();res.on('end',()=>resolve(res.headers['set-cookie'][0]));});req.on('error',reject);req.end(body);});assert.match(cookie,/; Secure/);
  }finally{await new Promise(r=>portal.server.close(r));}
});
test('portal limita verificacoes de senha simultaneas para conter consumo de memoria',async()=>{
  const a=new PortalAccounts(),u=await a.save('alpha',{username:'concurrent',name:'Concurrent'});
  const results=await Promise.allSettled(Array.from({length:10},()=>a.login('alpha',u.username,u.initialPassword)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,4);assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.status===429));assert.equal(a.activeLogins,0);
});
